/**
 * sagyeongin_scan_preview — 8단계 도구.
 *
 * 배치 Phase 1 — 스캔 범위 확정 (API 호출 영역 0).
 *
 * spec §10.7 (v0.5) + ADR-0010 옵션 D:
 * - corp_code 덤프 단독 활용 (corp_cls + induty_code 분기는 11단계 영역)
 * - estimated_universe = name filter 후 over-estimate
 * - estimated_api_calls.stage1_company_resolution 영역에서 분기 비용 합산 노출
 *
 * 사용자 의사결정 본질:
 * - "이 입력으로 universe N개, daily limit M%" 사전 확정 → Phase 2 진입 결정
 * - Phase 1 (scan_preview) = 사람 결정, Phase 2 (scan_execute, 11단계) = 도구 실행
 * - philosophy 5부 "시간을 들이지 않는 것이 최선" — 사람 결정 영역 사전 분리
 *
 * Ref: spec §10.7 (v0.5), §6.4, §7.1, ADR-0010, philosophy 5부, 7부 F
 */

import { z } from "zod";
import { defineTool } from "../_helpers.js";
import { loadConfig, type ScanPreset } from "./_lib/config-store.js";
import {
  loadListedCompanies,
  filterUniverse,
  estimateApiCalls,
  calculateDailyLimitUsagePct,
  type ListedCompany,
  type FilterConfig,
} from "./_lib/scan-helpers.js";

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

    // 3. name pattern 필터 적용 (markets + KSIC 분기는 11단계 영역 — ADR-0010 옵션 D)
    const filterConfig: FilterConfig = {
      excluded_name_patterns: merged.excluded_name_patterns,
    };
    const filtered = filterUniverse(allListed, filterConfig);
    const estimatedUniverse = filtered.length;

    // 4. estimated_api_calls 산출
    const apiCalls = estimateApiCalls(estimatedUniverse);

    // 5. daily_limit_usage_pct 산출
    const usagePct = calculateDailyLimitUsagePct(apiCalls.total);

    // 6. sample_companies — stock_code ASC 영역 (loadListedCompanies가 이미 정렬)
    const sampleCompanies = filtered.slice(0, 10).map((r) => ({
      corp_code: r.corp_code,
      corp_name: r.corp_name,
    }));

    // 7. filter_summary 영역
    const filterSummary = {
      markets: merged.markets ?? [],
      included_industries: merged.included_industries ?? null,
      excluded_industries_count: (merged.excluded_industries ?? []).length,
      excluded_name_patterns: merged.excluded_name_patterns ?? [],
    };

    return {
      preset_used: presetName,
      filter_summary: filterSummary,
      estimated_universe: estimatedUniverse,
      estimated_api_calls: apiCalls,
      daily_limit_usage_pct: usagePct,
      sample_companies: sampleCompanies,
    };
  },
});
