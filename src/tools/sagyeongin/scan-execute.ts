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
 * composite_score = max(−(gap_to_fair ?? 0), 0) × SRIM_GAP_WEIGHT + capex.opportunity_score - cashflow.concern_score (ADR-0029, spec §7.1).
 *   gap_to_fair = 괴리율 (쌀수록 음수) → max(−gap,0) = 저평가 폭만 양수 가점.
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
  isMarketMatch,
  isIndustryMatch,
  splitUniverseByCacheAndFilter,
  estimateApiCalls,
  calculateDailyLimitUsagePct,
  SCAN_SCALE_GATE_CALLS,
  shuffleWithSeed,
  DAILY_LIMIT,
  type ListedCompany,
  type FilterConfig,
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
import { loadUserPreference } from "./_lib/user-preference-store.js";
import { mergeIndustries } from "./_lib/industry-merge.js";
import { classifySkipReason } from "./_lib/skip-reason.js";
import { buildFilterSummary, type FilterSummary } from "./scan-preview.js";

/** daily limit 80% — ADR-0012 checkpoint 저장 임계. */
const CHECKPOINT_THRESHOLD = Math.floor(DAILY_LIMIT * 0.8); // 16,000

/** composite_score 산식에서 srim 갭(7부 D)에 부여하는 가중치.
 * 잠정값 — field-test 갭 분포 후 조정. 근거: ADR-0029. */
export const SRIM_GAP_WEIGHT = 1.5;

export class DailyLimitPreCheckError extends Error {
  readonly estimated_calls: number;
  readonly daily_limit: number;
  readonly usage_pct: number;
  readonly universe_count: number;

  constructor(info: {
    estimated_calls: number;
    daily_limit: number;
    usage_pct: number;
    universe_count: number;
  }) {
    super(
      `scan_execute pre-check failed — estimated calls (${info.estimated_calls}) ` +
        `exceed daily limit (${info.daily_limit}, usage ${info.usage_pct}%); ` +
        `current universe: ${info.universe_count} (after name + cache-hit induty filter). ` +
        `Cache-miss companies counted with conservative pass assumption. ` +
        `Run corp_meta_refresh first to apply induty filter to cache-miss companies in the estimate.`,
    );
    this.name = "DailyLimitPreCheckError";
    this.estimated_calls = info.estimated_calls;
    this.daily_limit = info.daily_limit;
    this.usage_pct = info.usage_pct;
    this.universe_count = info.universe_count;
  }
}

const InputSchema = z.object({
  preset: z.string().optional(),
  markets: z
    .array(z.enum(["KOSPI", "KOSDAQ"]))
    .optional()
    .describe("스캔 universe. 미지정 시 전체(KOSPI+KOSDAQ)."),
  included_industries: z
    .array(z.string())
    .optional()
    .describe("포함 KSIC 코드 prefix."),
  excluded_industries: z
    .array(z.string())
    .optional()
    .describe("제외 KSIC 코드 prefix."),
  excluded_name_patterns: z.array(z.string()).optional(),
  min_opportunity_score: z
    .number()
    .default(0)
    .describe(
      "capex 기회 가점(7부 C) 최소 임계. capex 공시는 희소해 대부분 종목 0 — " +
        "값을 올리면 후보 전멸 위험. score 조정은 scan 후 대화 단계에서. 미요청 시 0 유지.",
    ),
  limit: z.number().default(10).describe("composite DESC 상위 N개 반환."),
  random_seed: z.number().int().optional(),
  resume_from: z.string().optional(),
  allow_over_daily_limit: z.boolean().optional(),
  scope_confirmed: z
    .boolean()
    .optional()
    .describe(
      "사용자가 스캔 범위를 확인하고 진행을 택했음. 한도 초과 시 견적 반환(대화 루트) 대신 고지 후 완주(자동 루트). " +
        "ADR-0030: 이 신호는 사용자 결정의 대리이며 client 임의 주입 시 7부 책임은 client. " +
        "allow_over_daily_limit(한도 한 건 수용, 하위)과 구분 — scope_confirmed는 범위 전반 확인(상위).",
    ),
  choice: z
    .enum(["all", "selected", "list_only"])
    .optional()
    .describe(
      "awaiting_choice 멈춤 후 재호출 시 — all: 전부 srim / selected: 고른 것만 / list_only: srim 생략 killer 명단",
    ),
  selected_corp_codes: z
    .array(z.string())
    .optional()
    .describe("choice=selected 시 srim 돌릴 corp_code 목록"),
  ignore_preference_whitelist: z.boolean().optional()
    .describe("true면 취향 whitelist(관심 업종 한정)를 무시하고 전체 업종 스캔. blacklist(제외)는 유지. 사용자가 '전수조사/전부'를 원할 때."),
});

export interface ResolvedInput {
  preset_used: string;
  markets?: Array<"KOSPI" | "KOSDAQ">;
  included_industries?: string[];
  excluded_industries?: string[];
  excluded_name_patterns?: string[];
  min_opportunity_score: number;
  limit: number;
  random_seed?: number;
  allow_over_daily_limit: boolean;
  scope_confirmed?: boolean;
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
    avg_roe: number | null;           // % (예: 12.5), srim inputs.avg_roe
    required_return_K: number | null; // 분수 (예: 0.0742), srim inputs.required_return_K
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
    avg_roe: number | null;           // % (예: 12.5), srim inputs.avg_roe
    required_return_K: number | null; // 분수 (예: 0.0742), srim inputs.required_return_K
  };
  cashflow: {
    verdict: string;
    concern_score: number;
    top_flags: string[];
    // 19단계 학습 31 — 7부 B 시계열 노출 (CF 사실 + 영업이익 + 비율)
    yearly_data: Array<{
      year: string;
      op_profit: number | null;
      op_cf: number;
      inv_cf: number;
      fin_cf: number;
      oi_cf_ratio: number | null;
    }>;
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
  // 19단계 학습 28 — 7부 E 배당주 진입 인터페이스 (metrics + series + notes)
  dividend: {
    grade: string;
    metrics: {
      avg_payout_ratio: number;
      avg_dividend_yield: number;
      payout_stddev: number;
      years_of_dividend: number;
      recent_cut: boolean;
    };
    series: Array<{
      year: string;
      payout_ratio: number;
      dividend_yield: number;
      net_income: number;
      dividend_total: number;
    }>;
    interpretation_notes: string[];
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

export async function resolveInput(
  args: z.infer<typeof InputSchema>,
): Promise<ResolvedInput> {
  const config = await loadConfig();
  const presetName = args.preset ?? config.active_preset;
  const preset = config.scan_presets[presetName];
  if (!preset) {
    throw new Error(`scan_preset not found: "${presetName}"`);
  }
  const pref = await loadUserPreference();
  return {
    preset_used: presetName,
    markets: args.markets ?? preset.markets,
    included_industries:
      args.included_industries
      ?? (args.ignore_preference_whitelist
            ? mergeIndustries(preset.included_industries, [], "override")
            : mergeIndustries(preset.included_industries, pref.induty_whitelist, "override")),
    excluded_industries:
      args.excluded_industries
      ?? mergeIndustries(preset.excluded_industries, pref.induty_blacklist, "union"),
    excluded_name_patterns:
      args.excluded_name_patterns ?? preset.excluded_name_patterns,
    min_opportunity_score: args.min_opportunity_score,
    limit: args.limit,
    random_seed: args.random_seed,
    allow_over_daily_limit:
      args.allow_over_daily_limit ?? preset.allow_over_daily_limit ?? false,
    scope_confirmed: args.scope_confirmed,
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
        // 19단계 학습 31 — yearly_data 전파
        yearly_data: Array<{
          year: string;
          op_profit: number | null;
          op_cf: number;
          inv_cf: number;
          fin_cf: number;
          oi_cf_ratio: number | null;
        }>;
      };
      cashflowStage = {
        verdict: r.verdict,
        concern_score: r.concern_score,
        top_flags: r.flags.slice(0, 3).map((f) => f.flag),
        yearly_data: r.yearly_data,
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
        // 19단계 학습 28 — 배당 진입 인터페이스 전파
        metrics: {
          avg_payout_ratio: number;
          avg_dividend_yield: number;
          payout_stddev: number;
          years_of_dividend: number;
          recent_cut: boolean;
        };
        series: Array<{
          year: string;
          payout_ratio: number;
          dividend_yield: number;
          net_income: number;
          dividend_total: number;
        }>;
        interpretation_notes: string[];
      };
      dividendStage = {
        grade: r.sustainability_grade,
        metrics: r.metrics,
        series: r.series,
        interpretation_notes: r.interpretation_notes,
      };
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
    // gap_to_fair = 괴리율 (현재가-적정가)/적정가 — 저평가일수록 음수 (srim-calc.ts:180).
    // 저평가 폭 = max(−gap, 0): 음수 괴리(저평가)만 양수 가점, 양수 괴리(고평가)는 0 기여.
    const discount = Math.max(-(c.srim.gap_to_fair ?? 0), 0);  // 7부 D 핵심
    const opp = c.capex?.opportunity_score ?? 0;               // 7부 C tie-breaker
    const con = c.cashflow?.concern_score ?? 0;
    c.composite_score = discount * SRIM_GAP_WEIGHT + opp - con;
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

export function buildPreviewResponse(args: {
  estimate: { total: number };
  usagePct: number;
  split: { matched_cached_count: number; cache_miss_count: number };
  universeAfterCacheFilter: number;
  resolved: ResolvedInput;
}) {
  return {
    mode: "preview" as const,
    daily_limit_exceeded: true,
    estimate: {
      estimated_calls: args.estimate.total,
      daily_limit: DAILY_LIMIT,
      usage_pct: args.usagePct,
      universe_count: args.universeAfterCacheFilter,
      cache_hit: args.split.matched_cached_count,
      cache_miss: args.split.cache_miss_count,
    },
    options: [
      {
        action: "narrow_scope",
        label: "범위 좁히기",
        effect: "included_industries/markets로 universe 축소 → 호출 감소",
        recall_args_hint: { included_industries: ["<업종>"] } as Record<string, unknown>,
      },
      {
        action: "accept_limit",
        label: "한도 감수하고 완주",
        effect: "한도 초과를 수용하고 자동 완주. 실행 중 80% 도달 시 checkpoint 후 partial(ADR-0012).",
        recall_args_hint: { scope_confirmed: true } as Record<string, unknown>,
      },
      {
        action: "warm_cache",
        label: "캐시 보강 후 재추정",
        effect: "cache_miss 큰 경우 corp_meta_refresh 선행 → induty 필터 정밀화로 견적 하향 가능(ADR-0028).",
        recall_args_hint: null as Record<string, unknown> | null,
      },
    ],
    guidance:
      "한도 초과로 자동 실행을 멈추고 견적을 반환했습니다(ADR-0030 대화 루트). " +
      "위 options 중 하나를 사용자에게 제시하고 선택을 받아 재호출하세요. " +
      "scope_confirmed=true는 사용자가 명시적으로 완주를 택한 경우에만 — 임의 주입 금지(7부).",
  };
}

export function buildKillerStopResponse(args: {
  killerPassedCodes: string[];
  universe: Array<{ corp_code: string; corp_name: string }>;
  state: ScanCheckpointState;
  resolved: ResolvedInput;
}) {
  const n = args.killerPassedCodes.length;
  const nameMap = new Map(args.universe.map((c) => [c.corp_code, c.corp_name]));
  return {
    mode: "killer_stop" as const,
    scan_id: args.state.scan_id,
    killer_passed: {
      count: n,
      list:
        n <= 10
          ? args.killerPassedCodes.map((code) => ({
              corp_code: code,
              corp_name: nameMap.get(code) ?? code,
            }))
          : null,
    },
    options: [
      {
        action: "all",
        label: "전부 srim 분석",
        effect: `killer 통과 ${n}개 전체를 srim으로 평가`,
        recall_args_hint: { resume_from: args.state.scan_id, choice: "all" },
      },
      {
        action: "selected",
        label: "골라서 srim 분석",
        effect: "관심 종목만 선택해 srim으로 평가",
        recall_args_hint: {
          resume_from: args.state.scan_id,
          choice: "selected",
          selected_corp_codes: ["<종목코드>"],
        },
      },
      {
        action: "list_only",
        label: "명단으로 충분",
        effect: "srim 없이 killer 통과 명단만 결과로 받기",
        recall_args_hint: {
          resume_from: args.state.scan_id,
          choice: "list_only",
        },
      },
    ],
    pipeline_stats: {
      initial_universe: args.state.initial_universe ?? null,
      after_static_filter: args.state.after_static_filter ?? null,
      after_killer_check: n,
      after_srim_filter: null,
      returned_candidates: null,
    },
    guidance: `killer 검사 완료(통과 ${n}개). srim 분석 진행 여부를 선택하세요.`,
  };
}

export function buildListOnlyResponse(args: {
  state: ScanCheckpointState;
  nameMap: Map<string, string>;
}) {
  const passedCodes = args.state.killer_passed_corp_codes ?? [];
  const list = passedCodes
    .map((code) => ({
      corp_code: code,
      corp_name: args.nameMap.get(code) ?? code,
    }))
    .sort((a, b) => a.corp_name.localeCompare(b.corp_name, "ko"));
  return {
    mode: "list_only" as const,
    scan_id: args.state.scan_id,
    killer_list: list,
    pipeline_stats: {
      initial_universe: args.state.initial_universe ?? null,
      after_static_filter: args.state.after_static_filter ?? null,
      after_killer_check: passedCodes.length,
      after_srim_filter: null,
      returned_candidates: null,
    },
    guidance: `killer 통과 ${passedCodes.length}개 명단(가나다순). srim 분석 없이 종료합니다.`,
  };
}

export interface BuildResponseArgs {
  state: ScanCheckpointState;
  candidates: EnrichedCandidate[];
  skipped: SkippedCorp[];
  srimPassedCount: number;
  returnedCount: number | null;
  hasCheckpoint: boolean;
  overrideApplied?: boolean;
  scopeConfirmed?: boolean;
  preset_used: string;
  filter_summary: FilterSummary;
  // [16(b) 측정] retry 흡수 총량 측정 영역 — ADR-0015 효과 측정.
  externalCallStats: {
    dart: number;
    naver: number;
    kis: number;
  };
}

export function buildResponse(args: BuildResponseArgs) {
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
  const interpretationNotes: string[] = [];
  if (args.overrideApplied) {
    interpretationNotes.push(
      "allow_over_daily_limit 적용 — 사전 차단 무력화. 실행 중 한도 80% 도달 시 checkpoint 저장 후 partial 반환(ADR-0012), resume_from으로 재개.",
    );
  }
  if (args.scopeConfirmed) {
    interpretationNotes.push(
      "scope_confirmed 적용 — 한도 초과 고지 완주. 실행 중 한도 80% 도달 시 checkpoint 저장 후 partial 반환(ADR-0012), resume_from으로 재개.",
    );
  }
  return {
    scan_id: args.state.scan_id,
    preset_used: args.preset_used,
    filter_summary: args.filter_summary,
    pipeline_stats: {
      initial_universe: args.state.initial_universe ?? null,
      after_static_filter: args.state.after_static_filter ?? null,
      after_killer_check: args.state.killer_passed_cumulative ?? 0,
      after_srim_filter: args.srimPassedCount,
      returned_candidates: args.returnedCount,
      override_applied: args.overrideApplied ?? false,
    },
    external_call_stats: {
      dart_call_count: args.externalCallStats.dart,
      naver_call_count: args.externalCallStats.naver,
      kis_call_count: args.externalCallStats.kis,
    },
    candidates: args.candidates,
    skipped_corps: args.skipped,
    checkpoint: args.hasCheckpoint ? args.state.scan_id : null,
    interpretation_notes: interpretationNotes,
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
  resolved: ResolvedInput,
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
    preset_used: resolved.preset_used,
    filter_summary: buildFilterSummary(resolved),
    externalCallStats: {
      dart: callCount,
      naver: naverLimited.callCount,
      kis: kisLimited.callCount,
    },
  });
}

// Phase 2b에서 srim 패스 루프가 재사용할 함수 (ADR-0032).
type SrimForCorpResult =
  | { type: "pass"; candidate: PartialCandidate }
  | { type: "skip"; skipped: SkippedCorp }
  | { type: "rate_limit" };

async function handleSrimForCorp(
  corp: ListedWithMeta,
  limitedCtx: ToolCtx,
): Promise<SrimForCorpResult> {
  try {
    const r = (await srimTool.handler(
      { corp_code: corp.corp_code },
      limitedCtx,
    )) as {
      inputs: { avg_roe: number | null; required_return_K: number | null };
      prices: unknown;
      verdict: string | null;
      gap_to_fair: number | null;
      note: string;
    };
    if (r.verdict !== "BUY" && r.verdict !== "BUY_FAIR") {
      return {
        type: "skip",
        skipped: {
          corp_code: corp.corp_code,
          corp_name: corp.corp_name,
          stage: "stage3",
          reason: `srim verdict=${r.verdict ?? "null"}`,
        },
      };
    }
    return {
      type: "pass",
      candidate: {
        corp_code: corp.corp_code,
        corp_name: corp.corp_name,
        corp_cls: corp.corp_cls,
        induty_code: corp.induty_code,
        killer: { verdict: "PASS", triggered_rules: [] },
        srim: {
          verdict: r.verdict as "BUY" | "BUY_FAIR",
          prices: r.prices,
          gap_to_fair: r.gap_to_fair,
          avg_roe: r.inputs.avg_roe,
          required_return_K: r.inputs.required_return_K,
        },
      },
    };
  } catch (e) {
    if (e instanceof DartRateLimitError) {
      return { type: "rate_limit" };
    }
    return {
      type: "skip",
      skipped: {
        corp_code: corp.corp_code,
        corp_name: corp.corp_name,
        stage: "stage3",
        reason: `srim 호출 실패: ${(e as Error).message}`,
        reason_code: classifySkipReason(e as Error),
      },
    };
  }
}

export const scanExecuteTool = defineTool({
  name: "sagyeongin_scan_execute",
  description:
    "사경인 7부 시장 스캔 (배치 Phase 2). Stage 1~6 통합 — composite_score 정렬 candidates 반환. " +
    "min_opportunity_score 등 score 임계는 미요청 시 기본값 유지 — scan 후 대화로 조정. " +
    "결과 반환 시 filter_summary의 excluded_industries(제외 업종)와 markets(검색 시장)를 사용자에게 자연어로 설명 — 어떤 업종을 빼고 어느 시장에서 찾았는지 알려야 함. 사용자 blacklist 설정분이 합쳐졌으면 그 사실도 전달.",
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
    let srimPassOnly = false;
    let srimPassTargets: ListedWithMeta[] = [];

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

      if (state.phase === "awaiting_choice") {
        if (!args.choice) {
          // choice 미지정 → 멈춤 재안내 (ADR-0032 Phase 2b)
          return buildKillerStopResponse({
            killerPassedCodes: state.killer_passed_corp_codes ?? [],
            universe: [],
            state,
            resolved,
          });
        }
        if (args.choice === "list_only") {
          const allListedForNames = loadListedCompanies();
          const nameMap = new Map(
            allListedForNames.map((c) => [c.corp_code, c.corp_name]),
          );
          return buildListOnlyResponse({ state, nameMap });
        }
        // all or selected
        const passedCodes = state.killer_passed_corp_codes ?? [];
        const passedSet = new Set(passedCodes);
        const chosenCodes =
          args.choice === "all"
            ? passedCodes
            : (args.selected_corp_codes ?? []).filter((c) => passedSet.has(c));
        const allListed = loadListedCompanies();
        const codeMap = new Map(allListed.map((c) => [c.corp_code, c]));
        srimPassTargets = chosenCodes
          .map((code) => {
            const corp = codeMap.get(code);
            const m = meta[code];
            if (!corp || !m) return null;
            return { ...corp, corp_cls: m.corp_cls, induty_code: m.induty_code };
          })
          .filter((c): c is ListedWithMeta => c !== null);
        universe = [];
        srimPassOnly = true;

      } else if (state.phase === "srim") {
        // srim 패스 중단 재개
        const allListed = loadListedCompanies();
        const codeMap = new Map(allListed.map((c) => [c.corp_code, c]));
        srimPassTargets = state.pending_corp_codes
          .map((code) => {
            const corp = codeMap.get(code);
            const m = meta[code];
            if (!corp || !m) return null;
            return { ...corp, corp_cls: m.corp_cls, induty_code: m.induty_code };
          })
          .filter((c): c is ListedWithMeta => c !== null);
        universe = [];
        srimPassOnly = true;

      } else {
        // phase="killer" 또는 미설정 → 기존 흐름
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
      }
    } else {
      // 신규 scan
      resolved = await resolveInput(args);

      // ADR-0019 + ADR-0028 B1: daily limit 사전 가드 (cache 기반 2-phase 추정)
      const filterConfig: FilterConfig = {
        excluded_name_patterns: resolved.excluded_name_patterns,
      };
      const allListed = loadListedCompanies();
      const filtered = filterUniverse(allListed, filterConfig);
      const split = splitUniverseByCacheAndFilter(filtered, {
        markets: resolved.markets,
        included: resolved.included_industries,
        excluded: resolved.excluded_industries,
      });
      const universeAfterCacheFilter =
        split.matched_cached_count + split.cache_miss_count;
      const estimate = estimateApiCalls(universeAfterCacheFilter, {
        cacheHitCount: split.matched_cached_count,
      });
      const usagePct = calculateDailyLimitUsagePct(estimate.total);
      if (estimate.total > SCAN_SCALE_GATE_CALLS) {
        const signaled = resolved.allow_over_daily_limit || resolved.scope_confirmed;
        if (!signaled) {
          // 대화 루트 — 견적·분기 구조화 응답 반환, 사용자 턴 (ADR-0030)
          return buildPreviewResponse({
            estimate,
            usagePct,
            split,
            universeAfterCacheFilter,
            resolved,
          });
        }
        // signaled === true → 고지 후 완주 (자동 루트). 아래 stage1로 진행.
      }

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
          preset_used: resolved.preset_used,
          filter_summary: buildFilterSummary(resolved),
          externalCallStats: {
            dart: limited.callCount,
            naver: naverLimited.callCount,
            kis: kisLimited.callCount,
          },
        });
      }
    }

    // Stage 2: killer-only 패스 (ADR-0032 Phase 2a)
    const partial: PartialCandidate[] = [
      ...(state.partial_candidates as PartialCandidate[]),
    ];
    const killerPassedCodes: string[] = [
      ...(state.killer_passed_corp_codes ?? []),
    ];
    const killerSkipped: SkippedCorp[] = [];

    for (let i = 0; i < universe.length; i++) {
      const corp = universe[i];

      if (limited.callCount >= CHECKPOINT_THRESHOLD) {
        state.phase = "killer";
        state.killer_passed_corp_codes = killerPassedCodes;
        return saveAndReturnPartial(
          state,
          universe,
          i,
          partial,
          [...stage1Skipped, ...killerSkipped],
          limited.callCount,
          resolved,
        );
      }

      // Stage 2: killer
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
          killerSkipped.push({
            corp_code: corp.corp_code,
            corp_name: r.corp_name,
            stage: "stage2",
            reason: "killer EXCLUDE",
          });
          continue;
        }
        killerPassedCodes.push(corp.corp_code);
        state.killer_passed_cumulative =
          (state.killer_passed_cumulative ?? 0) + 1;
      } catch (e) {
        if (e instanceof DartRateLimitError) {
          state.phase = "killer";
          state.killer_passed_corp_codes = killerPassedCodes;
          return saveAndReturnPartial(
            state,
            universe,
            i,
            partial,
            [...stage1Skipped, ...killerSkipped],
            limited.callCount,
            resolved,
          );
        }
        killerSkipped.push({
          corp_code: corp.corp_code,
          corp_name: corp.corp_name,
          stage: "stage2",
          reason: `killer 호출 실패: ${(e as Error).message}`,
          reason_code: classifySkipReason(e as Error),
        });
        continue;
      }
    }

    if (!srimPassOnly) {
      // killer 패스 완료 — awaiting_choice 멈춤 (ADR-0032 Phase 2a)
      state.phase = "awaiting_choice";
      state.killer_passed_corp_codes = killerPassedCodes;
      state.processed_corp_codes = [
        ...state.processed_corp_codes,
        ...universe.map((c) => c.corp_code),
      ];
      state.pending_corp_codes = [];
      state.partial_candidates = partial;
      state.call_count = limited.callCount;
      state.updated_at = new Date().toISOString();
      saveCheckpoint(state);

      return buildKillerStopResponse({
        killerPassedCodes,
        universe,
        state,
        resolved,
      });
    }

    // srim 패스2 — choice=all/selected 또는 phase="srim" 재개 (ADR-0032 Phase 2b)
    const srimSkipped: SkippedCorp[] = [];

    for (let i = 0; i < srimPassTargets.length; i++) {
      const corp = srimPassTargets[i];

      if (limited.callCount >= CHECKPOINT_THRESHOLD) {
        state.phase = "srim";
        state.pending_corp_codes = srimPassTargets.slice(i).map((c) => c.corp_code);
        state.processed_corp_codes = [
          ...state.processed_corp_codes,
          ...srimPassTargets.slice(0, i).map((c) => c.corp_code),
        ];
        state.partial_candidates = partial;
        state.call_count = limited.callCount;
        state.updated_at = new Date().toISOString();
        saveCheckpoint(state);
        return buildResponse({
          state,
          candidates: [],
          skipped: [...stage1Skipped, ...killerSkipped, ...srimSkipped],
          srimPassedCount: partial.length,
          returnedCount: null,
          hasCheckpoint: true,
          preset_used: resolved.preset_used,
          filter_summary: buildFilterSummary(resolved),
          externalCallStats: {
            dart: limited.callCount,
            naver: naverLimited.callCount,
            kis: kisLimited.callCount,
          },
        });
      }

      const r = await handleSrimForCorp(corp, limitedCtx);
      if (r.type === "rate_limit") {
        state.phase = "srim";
        state.pending_corp_codes = srimPassTargets.slice(i).map((c) => c.corp_code);
        state.processed_corp_codes = [
          ...state.processed_corp_codes,
          ...srimPassTargets.slice(0, i).map((c) => c.corp_code),
        ];
        state.partial_candidates = partial;
        state.call_count = limited.callCount;
        state.updated_at = new Date().toISOString();
        saveCheckpoint(state);
        return buildResponse({
          state,
          candidates: [],
          skipped: [...stage1Skipped, ...killerSkipped, ...srimSkipped],
          srimPassedCount: partial.length,
          returnedCount: null,
          hasCheckpoint: true,
          preset_used: resolved.preset_used,
          filter_summary: buildFilterSummary(resolved),
          externalCallStats: {
            dart: limited.callCount,
            naver: naverLimited.callCount,
            kis: kisLimited.callCount,
          },
        });
      } else if (r.type === "pass") {
        partial.push(r.candidate);
      } else {
        srimSkipped.push(r.skipped);
      }
    }

    // srim 패스 완료 — Stage 4~6 진입
    state.processed_corp_codes = [
      ...state.processed_corp_codes,
      ...srimPassTargets.map((c) => c.corp_code),
    ];
    state.pending_corp_codes = [];
    state.partial_candidates = partial;
    state.call_count = limited.callCount;
    state.updated_at = new Date().toISOString();

    // Stage 4~6 enrichment (resume 시에도 다시 호출 — 단순화 4)
    const enrichResult = await enrichCandidates(partial, limitedCtx, limited);

    if (enrichResult.limitReachedDuringEnrich) {
      saveCheckpoint(state);
      return buildResponse({
        state,
        candidates: [],
        skipped: [...stage1Skipped, ...killerSkipped, ...srimSkipped],
        srimPassedCount: partial.length,
        returnedCount: null,
        hasCheckpoint: true,
        preset_used: resolved.preset_used,
        filter_summary: buildFilterSummary(resolved),
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
      skipped: [...stage1Skipped, ...killerSkipped, ...srimSkipped],
      srimPassedCount: partial.length,
      returnedCount: finalCandidates.length,
      hasCheckpoint: false,
      overrideApplied: resolved.allow_over_daily_limit,
      scopeConfirmed: resolved.scope_confirmed,
      preset_used: resolved.preset_used,
      filter_summary: buildFilterSummary(resolved),
      externalCallStats: {
        dart: limited.callCount,
        naver: naverLimited.callCount,
        kis: kisLimited.callCount,
      },
    });
  },
});
