/**
 * sagyeongin_scan_execute — 사경인 7부 시장 스캔 (배치 Phase 2).
 *
 * 묶음 3A: 단순화 1·2·3 정정 — universe_meta 보존 + 정식 필드 + killer 누적.
 *
 * 파이프라인 (사경인 7부 + spec §7):
 * - Stage 1 정적 필터 — corp_code 덤프 + name pattern + company.json (corp_cls + induty_code)
 *   + markets/industries 매칭. 결과 메타는 state.universe_meta에 보존(resume 활용).
 * - Stage 2 killer (4단계) — EXCLUDE 자동 탈락. 통과 누적은 state.killer_passed_cumulative.
 * - Stage 3 srim (3단계) — BUY/BUY_FAIR만 통과 (ADR-0013 verdict null = 자동 탈락).
 * - Stage 4~6: 묶음 3B에서 추가.
 *
 * 분할 실행 (ADR-0012):
 * - daily limit 80% (16,000 호출) 도달 또는 DartRateLimitError → checkpoint 저장 + 정상 종료
 * - resume_from: state.universe_meta에서 corp_cls/induty_code 복원 → Stage 1 다시 호출 0
 *   (묶음 2B 단순화 1 정정)
 *
 * 묶음 2B 호환성: universe_meta 미보존 checkpoint는 묶음 3A에서 throw (사용자 정리 안내).
 *
 * β-i 격리: src/lib/dart-client.ts 변경 0. ctx.client을 RateLimitedDartClient로 교체.
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

function isMarketMatch(
  corp_cls: string,
  markets: Array<"KOSPI" | "KOSDAQ"> | undefined,
): boolean {
  if (!markets || markets.length === 0) return true;
  if (markets.includes("KOSPI") && corp_cls === "Y") return true;
  if (markets.includes("KOSDAQ") && corp_cls === "K") return true;
  return false;
}

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
 * 결과의 universe + universeMeta(corp_code → meta) 둘 다 반환 — state.universe_meta에 그대로 저장.
 */
async function stage1StaticFilter(
  ctx: ToolCtx,
  resolved: ResolvedInput,
  limited: RateLimitedDartClient,
): Promise<{
  universe: ListedWithMeta[];
  universeMeta: Record<string, CompanyMeta>;
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
  const universeMeta: Record<string, CompanyMeta> = {};
  const skipped: SkippedCorp[] = [];

  for (const corp of namePatterned) {
    if (limited.callCount >= CHECKPOINT_THRESHOLD) {
      return {
        universe,
        universeMeta,
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
          universeMeta,
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
    universeMeta[corp.corp_code] = meta;
  }

  return {
    universe,
    universeMeta,
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
  srimPassedCount: number;
  hasCheckpoint: boolean;
}

function buildResponse(args: BuildResponseArgs) {
  return {
    scan_id: args.state.scan_id,
    pipeline_stats: {
      initial_universe: args.state.initial_universe ?? null,
      after_static_filter: args.state.after_static_filter ?? null,
      after_killer_check: args.state.killer_passed_cumulative ?? 0,
      after_srim_filter: args.srimPassedCount,
      returned_candidates: null,
    },
    partial_candidates: args.partial,
    skipped_corps: args.skipped,
    checkpoint: args.hasCheckpoint ? args.state.scan_id : null,
    next_actions_suggested: args.hasCheckpoint
      ? [
          `daily limit 80% 도달. 24시간 후 \`resume_from: "${args.state.scan_id}"\`로 재개.`,
          "묶음 3A는 Stage 1~3까지만 — Stage 4~6 + composite_score는 묶음 3B에서 추가.",
        ]
      : [
          "묶음 3A 완료 (Stage 1~3까지). 묶음 3B에서 Stage 4~6 + composite_score 정렬 추가 예정.",
        ],
  };
}

function saveAndReturn(
  state: ScanCheckpointState,
  universe: ListedWithMeta[],
  i: number,
  partial: PartialCandidate[],
  skipped: SkippedCorp[],
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
    srimPassedCount: partial.length,
    hasCheckpoint: true,
  });
}

export const scanExecuteTool = defineTool({
  name: "sagyeongin_scan_execute",
  description:
    "사경인 7부 시장 스캔 (배치 Phase 2). Stage 1~6 파이프라인 — 묶음 3A는 Stage 1~3까지.",
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

    if (args.resume_from) {
      // resume — universe_meta 활용 (단순화 1 정정)
      const loaded = loadCheckpoint(args.resume_from);
      if (!loaded) {
        throw new Error(
          `체크포인트를 찾을 수 없습니다: "${args.resume_from}". listCheckpoints로 확인하세요.`,
        );
      }
      state = loaded;
      const meta = state.universe_meta;
      if (!meta) {
        throw new Error(
          `호환되지 않는 체크포인트: "${args.resume_from}" (universe_meta 미보존). ` +
            `묶음 2B 이전 버전에서 생성됐습니다. ` +
            `deleteCheckpoint로 정리 후 새로 시작하세요.`,
        );
      }
      const allListed = loadListedCompanies();
      const codeMap = new Map(allListed.map((c) => [c.corp_code, c]));
      universe = state.pending_corp_codes
        .map((code) => {
          const corp = codeMap.get(code);
          const m = meta[code];
          if (!corp || !m) return null;
          return {
            ...corp,
            corp_cls: m.corp_cls,
            induty_code: m.induty_code,
          };
        })
        .filter((c): c is ListedWithMeta => c !== null);
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
        input_args: { ...resolved },
        processed_corp_codes: [],
        pending_corp_codes: universe.map((c) => c.corp_code),
        partial_candidates: [],
        call_count: limited.callCount,
        // 묶음 3A 정정 — 정식 필드 사용
        universe_meta: stage1.universeMeta,
        initial_universe: stage1.initialUniverse,
        after_static_filter: stage1.afterStaticFilter,
        killer_passed_cumulative: 0,
      };

      if (stage1.limitReached) {
        state.call_count = limited.callCount;
        saveCheckpoint(state);
        return buildResponse({
          state,
          partial: [],
          skipped: stage1Skipped,
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
        // 묶음 3A — 누적 카운트 정정 (단순화 3)
        state.killer_passed_cumulative =
          (state.killer_passed_cumulative ?? 0) + 1;
      } catch (e) {
        if (e instanceof DartRateLimitError) {
          return saveAndReturn(
            state,
            universe,
            i,
            partial,
            [...stage1Skipped, ...stage23Skipped],
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

    // 정상 종료
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
      srimPassedCount: partial.length,
      hasCheckpoint: false,
    });
  },
});
