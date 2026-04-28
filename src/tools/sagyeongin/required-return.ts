/**
 * sagyeongin_required_return — S-RIM K값(주주의 요구수익률) 자동 조회.
 *
 * spec §10.5. 한국신용평가 BBB- 5Y 채권 수익률 스크래핑 + 24시간 캐시.
 * spec §10.5 4단계 Fallback 정확 구현.
 *
 * ADR-0007 호출자 패턴: load → mutate → save. 캐시 신선/스크래핑 실패 시
 * save 0 (read-only 부작용 없음).
 *
 * `fetchRequiredReturnK` 함수 export — srim 도구가 직접 호출 (도구 간
 * 직접 import 패턴, ToolCtx에 callTool 메서드 부재).
 *
 * Ref: spec §10.5, ADR-0007, ADR-0008
 */

import { z } from "zod";
import { defineTool, type ToolCtx, type ToolDef } from "../_helpers.js";
import { loadConfig, saveConfig } from "./_lib/config-store.js";
import { fetchKisRatingBbbMinus5Y } from "./_lib/kis-rating-scraper.js";

export type RequiredReturnResult = {
  value: number;                        // 분수
  fetched_at: string;                   // ISO 8601
  source: "kisrating.com BBB- 5Y";
  from_cache: boolean;
  cache_age_hours: number | null;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 정확히 86,400,000 ms

function cacheToOutput(cached: {
  last_fetched_at: string | null;
  value: number | null;
  source: string;
}): RequiredReturnResult {
  const ageHours = Math.floor(
    (Date.now() - new Date(cached.last_fetched_at!).getTime()) / (1000 * 60 * 60),
  );
  return {
    value: cached.value!,
    fetched_at: cached.last_fetched_at!,
    source: "kisrating.com BBB- 5Y",
    from_cache: true,
    cache_age_hours: ageHours,
  };
}

// 핵심 로직 — srim 도구가 직접 호출 (zod 검증 우회)
export async function fetchRequiredReturnK(
  ctx: ToolCtx,
  options: { force_refresh?: boolean } = {},
): Promise<RequiredReturnResult> {
  const { force_refresh = false } = options;
  const config = await loadConfig();
  const cached = config.required_return_cache;

  // Fallback 1 검사: 캐시 신선 + force_refresh false
  const isFresh =
    cached.value != null &&
    cached.last_fetched_at != null &&
    Date.now() - new Date(cached.last_fetched_at).getTime() < CACHE_TTL_MS;

  if (!force_refresh && isFresh) {
    return cacheToOutput(cached);
  }

  // 스크래핑 시도
  try {
    const result = await fetchKisRatingBbbMinus5Y();

    // 정상 경로: save 1
    config.required_return_cache = {
      last_fetched_at: result.fetched_at,
      value: result.value,
      source: result.source,
    };
    await saveConfig(config);

    return {
      value: result.value,
      fetched_at: result.fetched_at,
      source: result.source,
      from_cache: false,
      cache_age_hours: null,
    };
  } catch (err) {
    // Fallback 2: 스크래핑 실패 + 유효 캐시 (만료 가능)
    if (cached.value != null && cached.last_fetched_at != null) {
      const ageHours = Math.floor(
        (Date.now() - new Date(cached.last_fetched_at).getTime()) / (1000 * 60 * 60),
      );
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `required-return: 스크래핑 실패, 캐시값 사용 (age ${ageHours}h). 원본 에러: ${errMsg}`,
      );
      return cacheToOutput(cached);
    }

    // Fallback 3: 캐시 없음 → throw + 안내
    const errMsg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${errMsg} (캐시 없음 — sagyeongin_srim 호출 시 override_K 수동 지정 필요)`,
    );
  }
}

// MCP 도구 wrapper
export const requiredReturnTool: ToolDef = defineTool({
  name: "sagyeongin_required_return",
  description:
    "사경인 S-RIM의 요구수익률(K) 자동 조회 — 한국신용평가 BBB- 5Y 채권 수익률, 24시간 캐시. spec §10.5.",
  input: z.object({
    force_refresh: z.boolean().optional().default(false),
  }),
  handler: async (ctx, args) => fetchRequiredReturnK(ctx, args),
});
