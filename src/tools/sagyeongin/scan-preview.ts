/**
 * sagyeongin_scan_preview — 8단계 도구.
 *
 * 배치 Phase 1 — 스캔 범위 확정 (API 호출 영역 0).
 *
 * spec §10.7 (ADR-0028 결선):
 * - corp_code 덤프 + corp_meta cache (ADR-0016) 단독 활용
 * - estimated_universe = name-filter 후 U (의미 불변 = backward-safe)
 * - estimated_universe_after_cache_filter = H'+M (추정·차단 실 기준, additive 신 필드)
 * - cache_coverage = H/U (additive 신 필드)
 * - cache cold 시 (M/U > 50%) interpretation_notes에 warm 권고 (ADR-0028 B2)
 *
 * 사용자 의사결정 본질:
 * - "이 입력으로 universe N개, daily limit M%" 사전 확정 → Phase 2 진입 결정
 * - Phase 1 (scan_preview) = 사람 결정, Phase 2 (scan_execute, 11단계) = 도구 실행
 * - philosophy 5부 "시간을 들이지 않는 것이 최선" — 사람 결정 영역 사전 분리
 *
 * Ref: spec §10.7, §6.4, §7.1, ADR-0028, ADR-0016, ADR-0010 (개정 section), philosophy 5부, 7부 F
 */

import { z } from "zod";
import { defineTool } from "../_helpers.js";
import { loadConfig, type ScanPreset } from "./_lib/config-store.js";
import {
  loadListedCompanies,
  filterUniverse,
  splitUniverseByCacheAndFilter,
  estimateApiCalls,
  calculateDailyLimitUsagePct,
  CACHE_COVERAGE_WARM_THRESHOLD_PCT,
  SCAN_SCALE_GATE_CALLS,
  DAILY_LIMIT,
  type ListedCompany,
  type FilterConfig,
} from "./_lib/scan-helpers.js";

export type FilterSummary = {
  markets: Array<"KOSPI" | "KOSDAQ">;
  included_industries: string[] | null;
  excluded_industries: string[];
  excluded_industries_count: number;
  excluded_name_patterns: string[];
};

export function buildFilterSummary(merged: ScanPreset): FilterSummary {
  const excluded = merged.excluded_industries ?? [];
  return {
    markets: merged.markets ?? [],
    included_industries: merged.included_industries ?? null,
    excluded_industries: excluded,
    excluded_industries_count: excluded.length,
    excluded_name_patterns: merged.excluded_name_patterns ?? [],
  };
}

export function buildLimitNotes(args: {
  usage_pct: number;
  total_calls: number;
  estimated_universe_after_cache_filter: number;
  cache_miss_count: number;
  estimated_universe: number;
}): string[] {
  const notes: string[] = [];

  // (a) 스캔 규모 초과 진술 — execute 게이트와 동일 임계(ADR-0030 재개정)
  if (args.total_calls > SCAN_SCALE_GATE_CALLS) {
    notes.push(
      `스캔 규모 초과 — 추정 호출 ${args.total_calls}건이 스캔 상한(${SCAN_SCALE_GATE_CALLS})을 초과 (한도(${DAILY_LIMIT})의 ${args.usage_pct}%). ` +
        `현 universe ${args.estimated_universe_after_cache_filter} (name + cache-hit induty 필터 적용 후). ` +
        `이 입력은 scan_execute에서 사전 차단됨.`,
    );
  }

  // (b) warm 권고 진술 (ADR-0028 B2 — cache miss ratio > 임계)
  if (args.estimated_universe > 0) {
    const missRatio = (args.cache_miss_count / args.estimated_universe) * 100;
    if (missRatio > CACHE_COVERAGE_WARM_THRESHOLD_PCT) {
      const missPct = Math.round(missRatio * 10) / 10;
      notes.push(
        `cache miss ratio ${missPct}% — corp_meta_refresh 선행(1회 ~3,963 호출, 한도 내)으로 ` +
          `추정에 induty 필터 반영.`,
      );
    }
  }

  return notes;
}

const Input = z.object({
  preset: z.string().optional(),
  markets: z.array(z.enum(["KOSPI", "KOSDAQ"])).optional(),
  included_industries: z.array(z.string()).optional(),
  excluded_industries: z.array(z.string()).optional(),
  excluded_name_patterns: z.array(z.string()).optional(),
});

export const scanPreviewTool = defineTool({
  name: "sagyeongin_scan_preview",
  description:
    "스캔 범위 확정 (배치 Phase 1, API 호출 영역 0). " +
    "corp_code 덤프 단독 활용 — markets + KSIC 분기는 11단계 영역 (estimated_api_calls.stage1_company_resolution 비용 노출). " +
    "preset 우선 — 직접 지정 입력은 preset 위에 override. " +
    "반환된 filter_summary는 사용자에게 자연어로 설명 — 제외 업종·검색 시장 명시. " +
    "Ref: spec §10.7 (v0.5), ADR-0010",
  input: Input,
  handler: async (_ctx, args) => {
    // 1. preset 로딩 + override 영역
    const config = await loadConfig();
    let presetName: string | null = null;
    let presetConfig: ScanPreset = {};

    if (args.preset !== undefined) {
      if (config.scan_presets[args.preset] === undefined) {
        throw new Error(`존재하지 않는 프리셋: ${args.preset}`);
      }
      presetName = args.preset;
      presetConfig = { ...config.scan_presets[args.preset] };
    } else if (
      args.markets === undefined &&
      args.included_industries === undefined &&
      args.excluded_industries === undefined &&
      args.excluded_name_patterns === undefined
    ) {
      // 입력 영역 0 → active_preset fallback
      presetName = config.active_preset;
      presetConfig = { ...(config.scan_presets[config.active_preset] ?? {}) };
    }

    // override 영역 — 직접 지정 입력 우선
    const merged: ScanPreset = {
      markets: args.markets ?? presetConfig.markets,
      included_industries:
        args.included_industries ?? presetConfig.included_industries,
      excluded_industries:
        args.excluded_industries ?? presetConfig.excluded_industries,
      excluded_name_patterns:
        args.excluded_name_patterns ?? presetConfig.excluded_name_patterns,
    };

    // 2. corp_code 덤프 영역에서 상장사 누적
    const allListed: ListedCompany[] = loadListedCompanies();

    // 3. name pattern 필터 적용
    const filterConfig: FilterConfig = {
      excluded_name_patterns: merged.excluded_name_patterns,
    };
    const filtered = filterUniverse(allListed, filterConfig);
    const estimatedUniverse = filtered.length;

    // 4. ADR-0028 B1 — cache 기반 induty 사전 필터 (2-phase 추정)
    const split = splitUniverseByCacheAndFilter(filtered, {
      markets: merged.markets,
      included: merged.included_industries,
      excluded: merged.excluded_industries,
    });
    const estimatedUniverseAfterCacheFilter =
      split.matched_cached_count + split.cache_miss_count;
    // cache_coverage = H/U = (U − M)/U (0~100, 소수 1자리)
    const cacheCoverage =
      estimatedUniverse > 0
        ? Math.round(
            ((estimatedUniverse - split.cache_miss_count) /
              estimatedUniverse) *
              1000,
          ) / 10
        : 0;

    // 5. estimated_api_calls 산출 (H'+M 기준, cacheHitCount=H')
    const apiCalls = estimateApiCalls(estimatedUniverseAfterCacheFilter, {
      cacheHitCount: split.matched_cached_count,
    });

    // 6. daily_limit_usage_pct 산출 (기준 = estimated_universe_after_cache_filter)
    const usagePct = calculateDailyLimitUsagePct(apiCalls.total);

    // 7. sample_companies — stock_code ASC 영역 (loadListedCompanies가 이미 정렬)
    const sampleCompanies = filtered.slice(0, 10).map((r) => ({
      corp_code: r.corp_code,
      corp_name: r.corp_name,
    }));

    // 8. filter_summary + interpretation_notes
    const filterSummary = buildFilterSummary(merged);
    const interpretationNotes = buildLimitNotes({
      usage_pct: usagePct,
      total_calls: apiCalls.total,
      estimated_universe_after_cache_filter: estimatedUniverseAfterCacheFilter,
      cache_miss_count: split.cache_miss_count,
      estimated_universe: estimatedUniverse,
    });

    return {
      preset_used: presetName,
      filter_summary: filterSummary,
      estimated_universe: estimatedUniverse,
      estimated_universe_after_cache_filter: estimatedUniverseAfterCacheFilter,
      cache_coverage: cacheCoverage,
      estimated_api_calls: apiCalls,
      daily_limit_usage_pct: usagePct,
      sample_companies: sampleCompanies,
      interpretation_notes: interpretationNotes,
    };
  },
});
