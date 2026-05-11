/**
 * 사경인 corp_meta_refresh 도구 — corp_meta cache eager fetch.
 *
 * ADR-0016 §묶음 2 정착. 전체 상장사 (~3,963 corp)의 induty_code + corp_cls를
 * 일괄 fetch + cache 저장하여 측정 자격을 본격 정착시킨다.
 *
 * 본 도구 호출 시점에 ADR-0015 wrapper (RateLimitedDartClient + shuffleWithSeed)가
 * 본격 발동 — D1 fail-fast + B1 shuffle 효과의 측정 자격이 본 도구에서 발동된다.
 * 후속 scan_execute 사이클은 cache hit으로 stage1 호출 ~0 → stage2-6 진입 →
 * C1 + candidates 측정 자격.
 *
 * universe = loadListedCompanies() — 13단계 baseline 정합 (~3,963 corp).
 * shuffle = shuffleWithSeed (seed 미지정 = Math.random — B1 정합).
 *
 * cache 사전 체크: getCorpMeta로 cache hit 영역 사전 분류 → cache_hit_count 카운트
 * + DART 진입 X. cache miss만 extractCompanyMeta 호출 → fetched_count 증가.
 * (extractCompanyMeta 내부에도 동일 cache 체크가 있으나 본 도구는 cache_hit vs
 * fetched 분리 측정이 본질이라 외부 사전 체크 + 호출 모두 정합.)
 *
 * 에러 처리:
 * - DartRateLimitError → 즉시 break + terminated_by = "dart_rate_limit" (D1 정합)
 * - 다른 error → skipped_corps push + 진행
 *
 * β-i 격리: src/lib/ 변경 0. 사경인 평면 도구 정합 (ADR-0001 §B2).
 *
 * Ref: ADR-0016, ADR-0015, philosophy 7부 A + 5부
 */

import { z } from "zod";
import { defineTool, type ToolCtx } from "../_helpers.js";
import type { ToolDef } from "../_helpers.js";
import {
  RateLimitedDartClient,
  DartRateLimitError,
} from "./_lib/dart-rate-limit.js";
import {
  loadListedCompanies,
  shuffleWithSeed,
  type ListedCompany,
} from "./_lib/scan-helpers.js";
import { extractCompanyMeta } from "./_lib/company-meta-extractor.js";
import {
  getCorpMeta,
  invalidateCorpMeta,
  corpMetaSize,
} from "./_lib/corp-meta-cache.js";

const inputSchema = z.object({
  seed: z
    .number()
    .int()
    .optional()
    .describe("shuffle seed — 미지정 시 Math.random (B1 측정 본질 정합)"),
  force_refresh: z
    .boolean()
    .default(false)
    .describe("true 시 universe corp_code 일괄 invalidate 후 재 fetch"),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("디버깅용 corp 수 제한 — eager 측정에서는 미지정"),
  dry_run: z
    .boolean()
    .default(false)
    .describe("true 시 corp_code 목록만 반환 + DART fetch X"),
});

export interface SkippedCorp {
  corp_code: string;
  error_type: string;
  error_msg: string;
}

export interface CorpMetaRefreshResult {
  universe_size: number;
  fetched_count: number;
  cache_hit_count: number;
  skipped_corps: SkippedCorp[];
  dart_call_count: number;
  shuffled_order: string[];
  random_seed: number | null;
  duration_ms: number;
  terminated_by: "completed" | "dart_rate_limit";
  cache_size_before: number;
  cache_size_after: number;
  dry_run: boolean;
}

/**
 * Internal handler — corpListProvider 의존성 주입 영역 (단테 격리).
 * Production handler는 본 함수를 loadListedCompanies 기본값으로 호출.
 */
export async function _corpMetaRefreshHandler(
  ctx: ToolCtx,
  args: z.infer<typeof inputSchema>,
  opts: { corpListProvider?: () => ListedCompany[] } = {},
): Promise<CorpMetaRefreshResult> {
  const startTime = Date.now();
  const listProvider = opts.corpListProvider ?? loadListedCompanies;

  // universe 구성
  const listed = listProvider();
  const universe = args.limit !== undefined ? listed.slice(0, args.limit) : listed;
  const universeSize = universe.length;
  const cacheSizeBefore = corpMetaSize();

  // shuffle — ADR-0015 B1 측정 indicator
  const shuffled = shuffleWithSeed(universe, args.seed);
  const shuffledOrder = shuffled.map((c) => c.corp_code);

  // dry_run — 호출 X
  if (args.dry_run) {
    return {
      universe_size: universeSize,
      fetched_count: 0,
      cache_hit_count: 0,
      skipped_corps: [],
      dart_call_count: 0,
      shuffled_order: shuffledOrder,
      random_seed: args.seed ?? null,
      duration_ms: Date.now() - startTime,
      terminated_by: "completed",
      cache_size_before: cacheSizeBefore,
      cache_size_after: cacheSizeBefore,
      dry_run: true,
    };
  }

  // force_refresh — universe corp_code 일괄 invalidate
  if (args.force_refresh) {
    for (const corp of shuffled) {
      invalidateCorpMeta(corp.corp_code);
    }
  }

  // RateLimitedDartClient wrapper — ADR-0015 D1 + retry
  const limited = new RateLimitedDartClient(ctx.client);
  const limitedCtx: ToolCtx = {
    ...ctx,
    client: limited as unknown as ToolCtx["client"],
  };

  let fetchedCount = 0;
  let cacheHitCount = 0;
  const skippedCorps: SkippedCorp[] = [];
  let terminatedBy: "completed" | "dart_rate_limit" = "completed";

  for (const corp of shuffled) {
    // cache hit 사전 분류 — DART 진입 X
    const cached = getCorpMeta(corp.corp_code);
    if (cached) {
      cacheHitCount++;
      continue;
    }

    try {
      await extractCompanyMeta(corp.corp_code, limitedCtx);
      fetchedCount++;
    } catch (e) {
      if (e instanceof DartRateLimitError) {
        terminatedBy = "dart_rate_limit";
        break;
      }
      // 다른 error → skip + 진행 (예: status "013" 등 corp 영역 어긋남)
      skippedCorps.push({
        corp_code: corp.corp_code,
        error_type: e instanceof Error ? e.constructor.name : "Unknown",
        error_msg: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    universe_size: universeSize,
    fetched_count: fetchedCount,
    cache_hit_count: cacheHitCount,
    skipped_corps: skippedCorps,
    dart_call_count: limited.callCount,
    shuffled_order: shuffledOrder,
    random_seed: args.seed ?? null,
    duration_ms: Date.now() - startTime,
    terminated_by: terminatedBy,
    cache_size_before: cacheSizeBefore,
    cache_size_after: corpMetaSize(),
    dry_run: false,
  };
}

export const corpMetaRefreshTool: ToolDef = defineTool({
  name: "sagyeongin_corp_meta_refresh",
  description:
    "사경인 corp_meta cache eager fetch — 전체 상장사 induty_code + corp_cls 일괄 fetch + cache 저장 (ADR-0016). ADR-0015 wrapper 효과 측정 자격이 본 도구에서 발동.",
  input: inputSchema,
  handler: async (ctx, args) => _corpMetaRefreshHandler(ctx, args),
});
