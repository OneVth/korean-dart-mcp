/**
 * sagyeongin_scan_execute — 사경인 7부 시장 스캔 (배치 Phase 2).
 *
 * 묶음 2B: Stage 1~3 + checkpoint 진입/재개. Stage 4~6 + composite_score는 묶음 3.
 *
 * 파이프라인 (사경인 7부 + spec §7):
 * - Stage 1: 정적 필터 — corp_code 덤프 + name pattern + company.json (corp_cls + induty_code)
 *   + markets/industries 매칭
 * - Stage 2: killer (4단계) — EXCLUDE 자동 탈락 (5부 그물 — 망할 회사 제거)
 * - Stage 3: srim (3단계) — BUY/BUY_FAIR만 통과 (4부 좋은 기업 ≠ 좋은 주식 — 비싼 주식 제거)
 *   ADR-0013 verdict null = 자동 탈락 (시장 스캔이므로 사람 결정 영역에 넘기지 않음)
 * - Stage 4~6: 묶음 3에서 추가 — cashflow/capex/insider/dividend 태그
 *   (5부 사람 결정 영역 분리 — Stage 4~6은 탈락 X, 태그만)
 *
 * 분할 실행 (ADR-0012):
 * - daily limit 80% (16,000 호출) 도달 시 checkpoint 저장 + 정상 종료
 * - DartRateLimitError 발생 시 (wrapper retry 후에도 020) checkpoint 저장 + 정상 종료
 * - resume_from 입력 시: pending corp들에 대해 Stage 1 다시 호출 (단순화 1)
 *
 * β-i 격리: src/lib/dart-client.ts 변경 0. ctx.client을 RateLimitedDartClient로 교체.
 *   타입 어설션은 RateLimitedDartClient가 DartClientLike 만족 + 6 도구가 getJson/getZip만
 *   호출하므로 안전.
 *
 * Ref: spec §10.8, §7, philosophy 5부 + 4부 + 8부, ADR-0009/0012/0013/0014
 */

import { z } from "zod";
import { defineTool, type ToolCtx } from "../_helpers.js";
import {
  RateLimitedDartClient,
  DartRateLimitError,
} from "./_lib/dart-rate-limit.js";
import {
  loadListedCompanies,
  filterUniverse,
  DAILY_LIMIT,
  type ListedCompany,
} from "./_lib/scan-helpers.js";
import {
  generateScanId,
  saveCheckpoint,
  loadCheckpoint,
  type ScanCheckpointState,
} from "./_lib/scan-checkpoint.js";
import { killerCheckTool } from "./killer-check.js";
import { srimTool } from "./srim.js";
import { loadConfig } from "./_lib/config-store.js";

/** daily limit 80% — ADR-0012 checkpoint 저장 임계. */
const CHECKPOINT_THRESHOLD = Math.floor(DAILY_LIMIT * 0.8); // 16,000

const InputSchema = z.object({
  preset: z.string().optional(),
  markets: z.array(z.enum(["KOSPI", "KOSDAQ"])).optional(),
  included_industries: z.array(z.string()).optional(),
  excluded_industries: z.array(z.string()).optional(),
  excluded_name_patterns: z.array(z.string()).optional(),
  min_opportunity_score: z.number().default(0),
  limit: z.number().default(10),
  resume_from: z.string().optional(),
});

interface ResolvedInput {
  markets?: Array<"KOSPI" | "KOSDAQ">;
  included_industries?: string[];
  excluded_industries?: string[];
  excluded_name_patterns?: string[];
  min_opportunity_score: number;
  limit: number;
}

interface CompanyMeta {
  corp_cls: string;
  induty_code: string;
}

interface ListedWithMeta extends ListedCompany {
  corp_cls: string;
  induty_code: string;
}

/** Stage 3까지 통과한 corp의 부분 결과. Stage 4~6은 묶음 3에서 추가. */
interface PartialCandidate {
  corp_code: string;
  corp_name: string;
  corp_cls: string;
  induty_code: string;
  killer: { verdict: "PASS"; triggered_rules: unknown[] };
  srim: {
    verdict: "BUY" | "BUY_FAIR";
    prices: unknown;
    gap_to_fair: number | null;
  };
}

interface SkippedCorp {
  corp_code: string;
  corp_name: string;
  stage: "stage1" | "stage2" | "stage3";
  reason: string;
}

/** company.json에서 corp_cls + induty_code 추출. inline 헬퍼 — scan-execute 단일 사용. */
async function extractCompanyMeta(
  corp_code: string,
  ctx: ToolCtx,
): Promise<CompanyMeta> {
  const raw = await ctx.client.getJson<{
    status: string;
    message?: string;
    corp_cls?: string;
    induty_code?: string;
  }>("company.json", { corp_code });
  if (raw.status !== "000") {
    throw new Error(
      `company.json 응답 오류 [${raw.status}]: ${raw.message ?? ""}`,
    );
  }
  return {
    corp_cls: (raw.corp_cls ?? "").trim(),
    induty_code: (raw.induty_code ?? "").trim(),
  };
}

/** markets 매칭 — corp_cls "Y"=KOSPI / "K"=KOSDAQ. 미지정 시 통과. */
function isMarketMatch(
  corp_cls: string,
  markets: Array<"KOSPI" | "KOSDAQ"> | undefined,
): boolean {
  if (!markets || markets.length === 0) return true;
  if (markets.includes("KOSPI") && corp_cls === "Y") return true;
  if (markets.includes("KOSDAQ") && corp_cls === "K") return true;
  return false;
}

/**
 * industries 매칭 — KSIC prefix.
 * - excluded: 매칭 시 제외
 * - included: 매칭 시 포함 (미지정 시 모두 포함)
 */
function isIndustryMatch(
  induty_code: string,
  included: string[] | undefined,
  excluded: string[] | undefined,
): boolean {
  if (excluded && excluded.length > 0) {
    if (excluded.some((p) => induty_code.startsWith(p))) return false;
  }
  if (included && included.length > 0) {
    return included.some((p) => induty_code.startsWith(p));
  }
  return true;
}

/** preset 머지 — args가 preset을 오버라이드. preset 미지정 시 active_preset 사용. */
async function resolveInput(
  args: z.infer<typeof InputSchema>,
): Promise<ResolvedInput> {
  const config = await loadConfig();
  const presetName = args.preset ?? config.active_preset;
  const preset = config.scan_presets[presetName];
  if (!preset) {
    throw new Error(`scan_preset not found: "${presetName}"`);
  }
  return {
    markets: args.markets ?? preset.markets,
    included_industries: args.included_industries ?? preset.included_industries,
    excluded_industries: args.excluded_industries ?? preset.excluded_industries,
    excluded_name_patterns:
      args.excluded_name_patterns ?? preset.excluded_name_patterns,
    min_opportunity_score: args.min_opportunity_score,
    limit: args.limit,
  };
}

/**
 * Stage 1 정적 필터.
 * - 상장사 로드 → name pattern 제외 → company.json 호출 → markets/industries 필터
 * - company.json 호출 도중 limit 도달 시 limitReached=true (호출자가 checkpoint 저장)
 */
async function stage1StaticFilter(
  ctx: ToolCtx,
  resolved: ResolvedInput,
  limited: RateLimitedDartClient,
): Promise<{
  universe: ListedWithMeta[];
  initialUniverse: number;
  afterStaticFilter: number;
  skipped: SkippedCorp[];
  limitReached: boolean;
}> {
  const listed = loadListedCompanies();
  const initialUniverse = listed.length;
  const namePatterned = filterUniverse(listed, {
    excluded_name_patterns: resolved.excluded_name_patterns,
  });

  const universe: ListedWithMeta[] = [];
  const skipped: SkippedCorp[] = [];

  for (const corp of namePatterned) {
    if (limited.callCount >= CHECKPOINT_THRESHOLD) {
      return {
        universe,
        initialUniverse,
        afterStaticFilter: universe.length,
        skipped,
        limitReached: true,
      };
    }
    let meta: CompanyMeta;
    try {
      meta = await extractCompanyMeta(corp.corp_code, ctx);
    } catch (e) {
      if (e instanceof DartRateLimitError) {
        return {
          universe,
          initialUniverse,
          afterStaticFilter: universe.length,
          skipped,
          limitReached: true,
        };
      }
      skipped.push({
        corp_code: corp.corp_code,
        corp_name: corp.corp_name,
        stage: "stage1",
        reason: `company.json 실패: ${(e as Error).message}`,
      });
      continue;
    }
    if (!isMarketMatch(meta.corp_cls, resolved.markets)) continue;
    if (
      !isIndustryMatch(
        meta.induty_code,
        resolved.included_industries,
        resolved.excluded_industries,
      )
    ) {
      continue;
    }
    universe.push({
      ...corp,
      corp_cls: meta.corp_cls,
      induty_code: meta.induty_code,
    });
  }

  return {
    universe,
    initialUniverse,
    afterStaticFilter: universe.length,
    skipped,
    limitReached: false,
  };
}

interface BuildResponseArgs {
  state: ScanCheckpointState;
  partial: PartialCandidate[];
  skipped: SkippedCorp[];
  killerPassedCount: number | null;
  srimPassedCount: number;
  hasCheckpoint: boolean;
}

function buildResponse(args: BuildResponseArgs) {
  const inputArgs = args.state.input_args as {
    _initial_universe?: number;
    _after_static_filter?: number;
  };
  return {
    scan_id: args.state.scan_id,
    pipeline_stats: {
      initial_universe: inputArgs._initial_universe ?? null,
      after_static_filter: inputArgs._after_static_filter ?? null,
      after_killer_check: args.killerPassedCount,
      after_srim_filter: args.srimPassedCount,
      returned_candidates: null,
    },
    partial_candidates: args.partial,
    skipped_corps: args.skipped,
    checkpoint: args.hasCheckpoint ? args.state.scan_id : null,
    next_actions_suggested: args.hasCheckpoint
      ? [
          `daily limit 80% 도달. 24시간 후 \`resume_from: "${args.state.scan_id}"\`로 재개.`,
          "묶음 2B는 Stage 1~3까지만 — Stage 4~6 + composite_score는 묶음 3에서 추가.",
        ]
      : [
          "묶음 2B 완료 (Stage 1~3까지). 묶음 3에서 Stage 4~6 + composite_score 정렬 추가 예정.",
        ],
  };
}

/**
 * checkpoint 저장 + buildResponse 호출 헬퍼. Stage 2~3 루프 안 5군데에서 활용.
 */
function saveAndReturn(
  state: ScanCheckpointState,
  universe: ListedWithMeta[],
  i: number,
  partial: PartialCandidate[],
  skipped: SkippedCorp[],
  killerPassedCount: number | null,
  callCount: number,
) {
  state.pending_corp_codes = universe.slice(i).map((c) => c.corp_code);
  state.processed_corp_codes = [
    ...state.processed_corp_codes,
    ...universe.slice(0, i).map((c) => c.corp_code),
  ];
  state.partial_candidates = partial;
  state.call_count = callCount;
  state.updated_at = new Date().toISOString();
  saveCheckpoint(state);
  return buildResponse({
    state,
    partial,
    skipped,
    killerPassedCount,
    srimPassedCount: partial.length,
    hasCheckpoint: true,
  });
}

export const scanExecuteTool = defineTool({
  name: "sagyeongin_scan_execute",
  description:
    "사경인 7부 시장 스캔 (배치 Phase 2). Stage 1~6 파이프라인 — 묶음 2B는 Stage 1~3까지.",
  input: InputSchema,
  handler: async (ctx, args) => {
    const limited = new RateLimitedDartClient(ctx.client);
    const limitedCtx: ToolCtx = {
      ...ctx,
      client: limited as unknown as ToolCtx["client"],
    };

    let state: ScanCheckpointState;
    let universe: ListedWithMeta[];
    let stage1Skipped: SkippedCorp[] = [];
    const isFreshScan = !args.resume_from;
    let freshKillerPassed = 0;

    if (args.resume_from) {
      // resume — checkpoint 로드 + Stage 1 다시 호출 (단순화 1)
      const loaded = loadCheckpoint(args.resume_from);
      if (!loaded) {
        throw new Error(
          `체크포인트를 찾을 수 없습니다: "${args.resume_from}". listCheckpoints로 확인하세요.`,
        );
      }
      state = loaded;
      const allListed = loadListedCompanies();
      const codeMap = new Map(allListed.map((c) => [c.corp_code, c]));
      const pendingListed = state.pending_corp_codes
        .map((code) => codeMap.get(code))
        .filter((c): c is ListedCompany => c !== undefined);
      universe = [];
      for (const corp of pendingListed) {
        if (limited.callCount >= CHECKPOINT_THRESHOLD) {
          state.call_count = limited.callCount;
          state.updated_at = new Date().toISOString();
          saveCheckpoint(state);
          return buildResponse({
            state,
            partial: state.partial_candidates as PartialCandidate[],
            skipped: stage1Skipped,
            killerPassedCount: null,
            srimPassedCount: (state.partial_candidates as PartialCandidate[])
              .length,
            hasCheckpoint: true,
          });
        }
        try {
          const meta = await extractCompanyMeta(corp.corp_code, limitedCtx);
          universe.push({
            ...corp,
            corp_cls: meta.corp_cls,
            induty_code: meta.induty_code,
          });
        } catch (e) {
          if (e instanceof DartRateLimitError) {
            state.call_count = limited.callCount;
            state.updated_at = new Date().toISOString();
            saveCheckpoint(state);
            return buildResponse({
              state,
              partial: state.partial_candidates as PartialCandidate[],
              skipped: stage1Skipped,
              killerPassedCount: null,
              srimPassedCount: (state.partial_candidates as PartialCandidate[])
                .length,
              hasCheckpoint: true,
            });
          }
          stage1Skipped.push({
            corp_code: corp.corp_code,
            corp_name: corp.corp_name,
            stage: "stage1",
            reason: `(resume) company.json 실패: ${(e as Error).message}`,
          });
        }
      }
    } else {
      // 신규 scan
      const resolved = await resolveInput(args);
      const stage1 = await stage1StaticFilter(limitedCtx, resolved, limited);
      universe = stage1.universe;
      stage1Skipped = stage1.skipped;

      state = {
        scan_id: generateScanId(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        input_args: {
          ...resolved,
          _initial_universe: stage1.initialUniverse,
          _after_static_filter: stage1.afterStaticFilter,
        },
        processed_corp_codes: [],
        pending_corp_codes: universe.map((c) => c.corp_code),
        partial_candidates: [],
        call_count: limited.callCount,
      };

      if (stage1.limitReached) {
        state.call_count = limited.callCount;
        saveCheckpoint(state);
        return buildResponse({
          state,
          partial: [],
          skipped: stage1Skipped,
          killerPassedCount: null,
          srimPassedCount: 0,
          hasCheckpoint: true,
        });
      }
    }

    // Stage 2~3 처리
    const partial: PartialCandidate[] = [
      ...(state.partial_candidates as PartialCandidate[]),
    ];
    const stage23Skipped: SkippedCorp[] = [];

    for (let i = 0; i < universe.length; i++) {
      const corp = universe[i];

      if (limited.callCount >= CHECKPOINT_THRESHOLD) {
        return saveAndReturn(
          state,
          universe,
          i,
          partial,
          [...stage1Skipped, ...stage23Skipped],
          isFreshScan ? freshKillerPassed : null,
          limited.callCount,
        );
      }

      // Stage 2: killer
      let killerPass = false;
      try {
        const r = (await killerCheckTool.handler(
          { corp_code: corp.corp_code },
          limitedCtx,
        )) as {
          corp_name: string;
          verdict: "EXCLUDE" | "PASS";
          triggered_rules: unknown[];
        };
        if (r.verdict === "EXCLUDE") {
          stage23Skipped.push({
            corp_code: corp.corp_code,
            corp_name: r.corp_name,
            stage: "stage2",
            reason: "killer EXCLUDE",
          });
          continue;
        }
        killerPass = true;
        freshKillerPassed++;
      } catch (e) {
        if (e instanceof DartRateLimitError) {
          return saveAndReturn(
            state,
            universe,
            i,
            partial,
            [...stage1Skipped, ...stage23Skipped],
            isFreshScan ? freshKillerPassed : null,
            limited.callCount,
          );
        }
        stage23Skipped.push({
          corp_code: corp.corp_code,
          corp_name: corp.corp_name,
          stage: "stage2",
          reason: `killer 호출 실패: ${(e as Error).message}`,
        });
        continue;
      }
      if (!killerPass) continue;

      // Stage 3: srim
      try {
        const r = (await srimTool.handler(
          { corp_code: corp.corp_code },
          limitedCtx,
        )) as {
          prices: unknown;
          verdict: string | null;
          gap_to_fair: number | null;
          note: string;
        };
        if (r.verdict !== "BUY" && r.verdict !== "BUY_FAIR") {
          stage23Skipped.push({
            corp_code: corp.corp_code,
            corp_name: corp.corp_name,
            stage: "stage3",
            reason: `srim verdict=${r.verdict ?? "null"}`,
          });
          continue;
        }
        partial.push({
          corp_code: corp.corp_code,
          corp_name: corp.corp_name,
          corp_cls: corp.corp_cls,
          induty_code: corp.induty_code,
          killer: { verdict: "PASS", triggered_rules: [] },
          srim: {
            verdict: r.verdict,
            prices: r.prices,
            gap_to_fair: r.gap_to_fair,
          },
        });
      } catch (e) {
        if (e instanceof DartRateLimitError) {
          return saveAndReturn(
            state,
            universe,
            i,
            partial,
            [...stage1Skipped, ...stage23Skipped],
            isFreshScan ? freshKillerPassed : null,
            limited.callCount,
          );
        }
        stage23Skipped.push({
          corp_code: corp.corp_code,
          corp_name: corp.corp_name,
          stage: "stage3",
          reason: `srim 호출 실패: ${(e as Error).message}`,
        });
        continue;
      }
    }

    // 정상 종료 — Stage 4~6은 묶음 3
    state.processed_corp_codes = [
      ...state.processed_corp_codes,
      ...universe.map((c) => c.corp_code),
    ];
    state.pending_corp_codes = [];
    state.partial_candidates = partial;
    state.call_count = limited.callCount;
    state.updated_at = new Date().toISOString();
    return buildResponse({
      state,
      partial,
      skipped: [...stage1Skipped, ...stage23Skipped],
      killerPassedCount: isFreshScan ? freshKillerPassed : null,
      srimPassedCount: partial.length,
      hasCheckpoint: false,
    });
  },
});
