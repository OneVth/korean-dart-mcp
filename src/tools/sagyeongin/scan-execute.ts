/**
 * sagyeongin_scan_execute — 사경인 7부 시장 스캔 (배치 Phase 2).
 *
 * 묶음 3B: Stage 4~6 (cashflow/capex/insider/dividend) 추가 + composite_score 정렬 + 도구 등록.
 *
 * 파이프라인 (사경인 7부 + spec §7):
 * - Stage 1 정적 필터 — corp_code 덤프 + name pattern + company.json (corp_cls + induty_code)
 *   + markets/industries 매칭. 결과 메타는 state.universe_meta에 보존(resume 활용).
 * - Stage 2 killer (4단계) — EXCLUDE 자동 탈락. 통과 누적은 state.killer_passed_cumulative.
 * - Stage 3 srim (3단계) — BUY/BUY_FAIR만 통과 (ADR-0013 verdict null = 자동 탈락).
 * - Stage 4 cashflow (5단계) — concern_score + top_flags 태그 (탈락 X).
 * - Stage 5 capex (6단계) — opportunity_score + top_signals 태그 (탈락 X).
 *   insider (9단계) — signal + cluster_quarter 태그.
 * - Stage 6 dividend (7단계) — sustainability_grade 태그.
 *
 * Stage 4~6은 5부 사람 결정 영역 분리 — 탈락 X, 태그만. 사용자가 candidates 보고 직접 결정.
 *
 * composite_score = capex.opportunity_score - cashflow.concern_score (MVP 단순, spec §7.1).
 *  - 호출 실패(stages.X = null) 시 0 가정
 *  - min_opportunity_score 필터 + composite DESC 정렬 + limit 적용 + rank 1부터 부여
 *
 * 분할 실행 (ADR-0012):
 * - daily limit 80% (16,000 호출) 도달 또는 DartRateLimitError → checkpoint 저장 + 정상 종료
 * - resume_from: state.universe_meta로 Stage 1 호출 0. partial_candidates 그대로 보존되며
 *   resume 시 Stage 4~6 다시 호출(enriched 미보존, 단순화 4 — 묶음 3B에서 합의).
 *
 * β-i 격리: src/lib/dart-client.ts 변경 0. ctx.client을 RateLimitedDartClient로 교체.
 * ADR-0015 B1: stage1 진입 시 universe 호출 순서 무작위화 (resolved.random_seed로 시드 옵션).
 *
 * Ref: spec §10.8, §7, philosophy 5부 + 4부 + 7부 F + 8부, ADR-0009/0012/0013/0014/0015
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
  shuffleWithSeed,
  DAILY_LIMIT,
  type ListedCompany,
} from "./_lib/scan-helpers.js";
import {
  generateScanId,
  saveCheckpoint,
  loadCheckpoint,
  type ScanCheckpointState,
} from "./_lib/scan-checkpoint.js";
import {
  extractCompanyMeta,
  type CompanyMeta,
} from "./_lib/company-meta-extractor.js";
import { killerCheckTool } from "./killer-check.js";
// [16(b) 측정] callCount 노출 — ADR-0015 효과 측정 영역.
import { srimTool, naverLimited } from "./srim.js";
import { cashflowCheckTool } from "./cashflow-check.js";
import { capexSignalTool } from "./capex-signal.js";
import { kisLimited } from "./required-return.js";
import { sagyeonginInsiderSignalTool } from "./insider-signal.js";
import { dividendCheckTool } from "./dividend-check.js";
import { loadConfig } from "./_lib/config-store.js";
import { classifySkipReason } from "./_lib/skip-reason.js";

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
  random_seed: z.number().int().optional(),
  resume_from: z.string().optional(),
});

export interface ResolvedInput {
  markets?: Array<"KOSPI" | "KOSDAQ">;
  included_industries?: string[];
  excluded_industries?: string[];
  excluded_name_patterns?: string[];
  min_opportunity_score: number;
  limit: number;
  random_seed?: number;
}

interface ListedWithMeta extends ListedCompany {
  corp_cls: string;
  induty_code: string;
}

/** Stage 3까지 통과한 corp의 부분 결과 — Stage 4~6은 enrichCandidates에서 추가. */
export interface PartialCandidate {
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

/** Stage 1~6 완료 + composite_score + rank 부여된 최종 후보. */
export interface EnrichedCandidate {
  rank: number;
  corp_code: string;
  corp_name: string;
  corp_cls: string;
  induty_code: string;
  composite_score: number;
  killer: { verdict: "PASS"; triggered_rules: unknown[] };
  srim: {
    verdict: "BUY" | "BUY_FAIR";
    prices: unknown;
    gap_to_fair: number | null;
  };
  cashflow: {
    verdict: string;
    concern_score: number;
    top_flags: string[];
  } | null;
  capex: {
    verdict: string;
    opportunity_score: number;
    top_signals: string[];
  } | null;
  insider: {
    signal: string;
    cluster_quarter: string | null;
  } | null;
  dividend: {
    grade: string;
  } | null;
  stage_notes: string[];
  quick_summary: string;
}

export interface SkippedCorp {
  corp_code: string;
  corp_name: string;
  stage: "stage1" | "stage2" | "stage3";
  reason: string;
  /** 호출 실패 분류 키 (verdict-기반 skip은 부재). 분류 본문: `_lib/skip-reason.ts`. */
  reason_code?: string;
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
    random_seed: args.random_seed,
  };
}

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

  // [ADR-0015 B1] corp_code 호출 순서 무작위화 — burst 임계 영역 분산
  // resolved.random_seed 미지정 시 매 실행 다른 결과 (디폴트 정합)
  // resolved.random_seed 지정 시 결정론 (resume + 디버깅 정합)
  const shuffled = shuffleWithSeed(namePatterned, resolved.random_seed);

  const universe: ListedWithMeta[] = [];
  const universeMeta: Record<string, CompanyMeta> = {};
  const skipped: SkippedCorp[] = [];

  for (const corp of shuffled) {
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
        reason_code: classifySkipReason(e as Error),
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

/**
 * Stage 4~6 enrichment — partial_candidates에 대해 cashflow/capex/insider/dividend handler 호출.
 *
 * 매핑은 watchlist-check.ts 패턴 일치:
 *  - cashflow.flags → top_flags (slice 3)
 *  - capex.signals → top_signals (slice 3)
 *  - insider.summary → signal + cluster_quarter
 *  - dividend.sustainability_grade → grade
 *
 * 도중 limit 도달 시 limitReachedDuringEnrich=true 반환 (호출자가 checkpoint 저장).
 * 5부 사람 결정 영역 분리 — 도구 호출 실패 시 stages.X = null + stage_notes 누적, 탈락 X.
 */
/**
 * Stage 4~6 enrichment 의존성 — 4 도구 핸들러를 인자로 받음 (단테 mock 가능).
 * default는 module-level 4 도구.
 */
export interface EnrichDeps {
  cashflow: { handler: (input: unknown, ctx: ToolCtx) => Promise<unknown> };
  capex: { handler: (input: unknown, ctx: ToolCtx) => Promise<unknown> };
  insider: { handler: (input: unknown, ctx: ToolCtx) => Promise<unknown> };
  dividend: { handler: (input: unknown, ctx: ToolCtx) => Promise<unknown> };
}

const DEFAULT_ENRICH_DEPS: EnrichDeps = {
  cashflow: cashflowCheckTool as EnrichDeps["cashflow"],
  capex: capexSignalTool as EnrichDeps["capex"],
  insider: sagyeonginInsiderSignalTool as EnrichDeps["insider"],
  dividend: dividendCheckTool as EnrichDeps["dividend"],
};

export async function enrichCandidates(
  partial: PartialCandidate[],
  ctx: ToolCtx,
  limited: RateLimitedDartClient,
  deps: EnrichDeps = DEFAULT_ENRICH_DEPS,
): Promise<{
  enriched: EnrichedCandidate[];
  limitReachedDuringEnrich: boolean;
}> {
  const enriched: EnrichedCandidate[] = [];
  for (const p of partial) {
    if (limited.callCount >= CHECKPOINT_THRESHOLD) {
      return { enriched, limitReachedDuringEnrich: true };
    }
    const stageNotes: string[] = [];
    let cashflowStage: EnrichedCandidate["cashflow"] = null;
    let capexStage: EnrichedCandidate["capex"] = null;
    let insiderStage: EnrichedCandidate["insider"] = null;
    let dividendStage: EnrichedCandidate["dividend"] = null;

    // cashflow
    try {
      const r = (await deps.cashflow.handler(
        { corp_code: p.corp_code },
        ctx,
      )) as {
        verdict: string;
        concern_score: number;
        flags: Array<{ flag: string }>;
      };
      cashflowStage = {
        verdict: r.verdict,
        concern_score: r.concern_score,
        top_flags: r.flags.slice(0, 3).map((f) => f.flag),
      };
    } catch (e) {
      if (e instanceof DartRateLimitError) {
        return { enriched, limitReachedDuringEnrich: true };
      }
      stageNotes.push(`cashflow 호출 실패: ${(e as Error).message}`);
    }

    // capex
    try {
      const r = (await deps.capex.handler(
        { corp_code: p.corp_code },
        ctx,
      )) as {
        verdict: string;
        opportunity_score: number;
        signals: Array<{ signal: string }>;
      };
      capexStage = {
        verdict: r.verdict,
        opportunity_score: r.opportunity_score,
        top_signals: r.signals.slice(0, 3).map((s) => s.signal),
      };
    } catch (e) {
      if (e instanceof DartRateLimitError) {
        return { enriched, limitReachedDuringEnrich: true };
      }
      stageNotes.push(`capex 호출 실패: ${(e as Error).message}`);
    }

    // insider — 입력 필드명 corp (다른 5개와 다름)
    try {
      const r = (await deps.insider.handler(
        { corp: p.corp_code },
        ctx,
      )) as {
        summary: { signal: string; strongest_quarter: string | null };
      };
      insiderStage = {
        signal: r.summary.signal,
        cluster_quarter: r.summary.strongest_quarter,
      };
    } catch (e) {
      if (e instanceof DartRateLimitError) {
        return { enriched, limitReachedDuringEnrich: true };
      }
      stageNotes.push(`insider 호출 실패: ${(e as Error).message}`);
    }

    // dividend
    try {
      const r = (await deps.dividend.handler(
        { corp_code: p.corp_code },
        ctx,
      )) as {
        sustainability_grade: string;
      };
      dividendStage = { grade: r.sustainability_grade };
    } catch (e) {
      if (e instanceof DartRateLimitError) {
        return { enriched, limitReachedDuringEnrich: true };
      }
      stageNotes.push(`dividend 호출 실패: ${(e as Error).message}`);
    }

    enriched.push({
      rank: 0, // finalize에서 부여
      corp_code: p.corp_code,
      corp_name: p.corp_name,
      corp_cls: p.corp_cls,
      induty_code: p.induty_code,
      composite_score: 0, // finalize에서 계산
      killer: p.killer,
      srim: p.srim,
      cashflow: cashflowStage,
      capex: capexStage,
      insider: insiderStage,
      dividend: dividendStage,
      stage_notes: stageNotes,
      quick_summary: "", // finalize에서 부여
    });
  }
  return { enriched, limitReachedDuringEnrich: false };
}

/**
 * composite_score 산출 + min_opportunity_score 필터 + DESC 정렬 + limit + rank 부여.
 */
export function finalizeCandidates(
  enriched: EnrichedCandidate[],
  resolved: ResolvedInput,
): EnrichedCandidate[] {
  for (const c of enriched) {
    const opp = c.capex?.opportunity_score ?? 0;
    const con = c.cashflow?.concern_score ?? 0;
    c.composite_score = opp - con;
    c.quick_summary = buildQuickSummary(c);
  }
  const filtered = enriched.filter(
    (c) =>
      (c.capex?.opportunity_score ?? 0) >= resolved.min_opportunity_score,
  );
  filtered.sort((a, b) => b.composite_score - a.composite_score);
  const trimmed = filtered.slice(0, resolved.limit);
  trimmed.forEach((c, i) => {
    c.rank = i + 1;
  });
  return trimmed;
}

export function buildQuickSummary(c: EnrichedCandidate): string {
  const parts: string[] = [`srim ${c.srim.verdict}`];
  if (c.srim.gap_to_fair != null) {
    parts.push(`gap ${c.srim.gap_to_fair.toFixed(1)}`);
  }
  if (c.cashflow) {
    if (c.cashflow.verdict === "REVIEW_REQUIRED") {
      parts.push(`cashflow REVIEW(${c.cashflow.concern_score})`);
    }
  } else {
    parts.push("cashflow N/A");
  }
  if (c.capex && c.capex.opportunity_score > 0) {
    parts.push(`capex ${c.capex.opportunity_score}`);
  }
  if (
    c.insider &&
    c.insider.signal !== "NORMAL" &&
    c.insider.signal !== "NONE"
  ) {
    parts.push(`insider ${c.insider.signal}`);
  }
  if (c.dividend && c.dividend.grade !== "N/A") {
    parts.push(`dividend ${c.dividend.grade}`);
  }
  return parts.join(", ");
}

interface BuildResponseArgs {
  state: ScanCheckpointState;
  candidates: EnrichedCandidate[];
  skipped: SkippedCorp[];
  srimPassedCount: number;
  returnedCount: number | null;
  hasCheckpoint: boolean;
  // [16(b) 측정] retry 흡수 총량 측정 영역 — ADR-0015 효과 측정.
  externalCallStats: {
    dart: number;
    naver: number;
    kis: number;
  };
}

function buildResponse(args: BuildResponseArgs) {
  const candCount = args.candidates.length;
  let nextActions: string[];
  if (args.hasCheckpoint) {
    nextActions = [
      `daily limit 80% 도달. 24시간 후 \`resume_from: "${args.state.scan_id}"\`로 재개.`,
    ];
  } else if (candCount === 0) {
    nextActions = [
      "candidates 0개 — universe가 좁거나 srim BUY/BUY_FAIR 통과 corp 없음. " +
        "universe 확장(included_industries 또는 markets) 또는 min_opportunity_score 낮춤 검토.",
    ];
  } else {
    nextActions = [
      `${candCount}개 후보 발견. 사용자 검토 후 sagyeongin_update_watchlist로 watchlist 추가 권장.`,
      "이후 분기마다 sagyeongin_watchlist_check로 점검 (7부 F).",
    ];
  }
  return {
    scan_id: args.state.scan_id,
    pipeline_stats: {
      initial_universe: args.state.initial_universe ?? null,
      after_static_filter: args.state.after_static_filter ?? null,
      after_killer_check: args.state.killer_passed_cumulative ?? 0,
      after_srim_filter: args.srimPassedCount,
      returned_candidates: args.returnedCount,
    },
    external_call_stats: {
      dart_call_count: args.externalCallStats.dart,
      naver_call_count: args.externalCallStats.naver,
      kis_call_count: args.externalCallStats.kis,
    },
    candidates: args.candidates,
    skipped_corps: args.skipped,
    checkpoint: args.hasCheckpoint ? args.state.scan_id : null,
    next_actions_suggested: nextActions,
  };
}

function saveAndReturnPartial(
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
    candidates: [],
    skipped,
    srimPassedCount: partial.length,
    returnedCount: null,
    hasCheckpoint: true,
    externalCallStats: {
      dart: callCount,
      naver: naverLimited.callCount,
      kis: kisLimited.callCount,
    },
  });
}

export const scanExecuteTool = defineTool({
  name: "sagyeongin_scan_execute",
  description:
    "사경인 7부 시장 스캔 (배치 Phase 2). Stage 1~6 통합 — composite_score 정렬 candidates 반환.",
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
    let resolved: ResolvedInput;

    if (args.resume_from) {
      // resume — universe_meta 활용 + resolved를 input_args에서 복원
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
      resolved = state.input_args as unknown as ResolvedInput;
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
      resolved = await resolveInput(args);
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
          candidates: [],
          skipped: stage1Skipped,
          srimPassedCount: 0,
          returnedCount: null,
          hasCheckpoint: true,
          externalCallStats: {
            dart: limited.callCount,
            naver: naverLimited.callCount,
            kis: kisLimited.callCount,
          },
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
        return saveAndReturnPartial(
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
        state.killer_passed_cumulative =
          (state.killer_passed_cumulative ?? 0) + 1;
      } catch (e) {
        if (e instanceof DartRateLimitError) {
          return saveAndReturnPartial(
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
          reason_code: classifySkipReason(e as Error),
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
          return saveAndReturnPartial(
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
          reason_code: classifySkipReason(e as Error),
        });
        continue;
      }
    }

    // Stage 1~3 완료 — partial 보존 + Stage 4~6 진입
    state.processed_corp_codes = [
      ...state.processed_corp_codes,
      ...universe.map((c) => c.corp_code),
    ];
    state.pending_corp_codes = [];
    state.partial_candidates = partial;
    state.call_count = limited.callCount;
    state.updated_at = new Date().toISOString();

    // Stage 4~6 enrichment (resume 시에도 다시 호출 — 단순화 4)
    const enrichResult = await enrichCandidates(partial, limitedCtx, limited);

    if (enrichResult.limitReachedDuringEnrich) {
      // partial 그대로 보존, candidates 미완성
      saveCheckpoint(state);
      return buildResponse({
        state,
        candidates: [],
        skipped: [...stage1Skipped, ...stage23Skipped],
        srimPassedCount: partial.length,
        returnedCount: null,
        hasCheckpoint: true,
        externalCallStats: {
          dart: limited.callCount,
          naver: naverLimited.callCount,
          kis: kisLimited.callCount,
        },
      });
    }

    // composite_score + 정렬 + limit + rank
    const finalCandidates = finalizeCandidates(enrichResult.enriched, resolved);

    return buildResponse({
      state,
      candidates: finalCandidates,
      skipped: [...stage1Skipped, ...stage23Skipped],
      srimPassedCount: partial.length,
      returnedCount: finalCandidates.length,
      hasCheckpoint: false,
      externalCallStats: {
        dart: limited.callCount,
        naver: naverLimited.callCount,
        kis: kisLimited.callCount,
      },
    });
  },
});
