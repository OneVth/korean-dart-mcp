/**
 * sagyeongin_srim — S-RIM Buy/Fair/Sell 트리플 가격 (spec §10.4, philosophy 7부 D-2).
 *
 * 조립:
 * - financial-extractor: equity / ROE 시계열 / shares
 * - srim-calc: 가중평균 ROE + S-RIM 공식 + verdict
 * - required-return: K값 (4단계 조회 순서)
 * - naver-price: 현재가 (실패 시 verdict 계산 불가)
 *
 * 단위 변환 (G1 → spec §10.4 output):
 * - equity_current: 원 / 100,000,000 → 억원
 * - avg_roe: 분수 × 100 → %
 * - required_return_K: 분수 그대로 (spec-pending §10.4 — 분수 통일 방향)
 * - prices: Math.round → 원/주 정수
 *
 * Ref: spec §10.4, philosophy 7부 D-2
 */

import { z } from "zod";
import { defineTool, type ToolCtx, type ToolDef } from "../_helpers.js";
import { loadConfig } from "./_lib/config-store.js";
import {
  extractEquityCurrent,
  extractRoeSeries,
  extractSharesOutstanding,
} from "./_lib/financial-extractor.js";
import {
  calculateWeightedAvgRoe,
  calculateSrim,
  judgeSrimVerdict,
  type SrimBuyPriceBasis,
  type SrimVerdict,
} from "./_lib/srim-calc.js";
import { fetchNaverPrice } from "./_lib/naver-price.js";
import { fetchRequiredReturnK } from "./required-return.js";

async function resolveK(
  args: { override_K?: number },
  ctx: ToolCtx,
): Promise<{ value: number; source: string; K_cache_age_hours: number | null }> {
  // 1. input override
  if (args.override_K != null) {
    return { value: args.override_K, source: "input_override", K_cache_age_hours: null };
  }

  // 2. config override
  const config = await loadConfig();
  if (config.parameters.srim_required_return_override != null) {
    return {
      value: config.parameters.srim_required_return_override,
      source: "config_override",
      K_cache_age_hours: null,
    };
  }

  // 3. 자동 조회 (4. 실패 시 throw 그대로 전파 — 메시지에 override_K 안내 포함)
  const r = await fetchRequiredReturnK(ctx);
  return {
    value: r.value,
    source: r.from_cache ? "auto_cached" : "auto_fresh",
    K_cache_age_hours: r.cache_age_hours,
  };
}

function roundPercent(v: number): number {
  return Math.round(v * 100) / 100;
}

async function handleSrim(
  ctx: ToolCtx,
  args: { corp_code: string; years: number; override_K?: number },
) {
  // 1. corp_name + stock_code 조회
  const corp = ctx.resolver.byCorpCode(args.corp_code);
  if (!corp) {
    throw new Error(`srim: corp_code ${args.corp_code} not found`);
  }

  // 2. K 조회 — 4단계 조회 순서
  const { value: K, source: K_source, K_cache_age_hours } = await resolveK(args, ctx);

  // 3. DART 재무 추출 (병렬)
  const [equity_current_won, roeSeries, shares_outstanding] = await Promise.all([
    extractEquityCurrent(args.corp_code, ctx),
    extractRoeSeries(args.corp_code, args.years, ctx),
    extractSharesOutstanding(args.corp_code, ctx),
  ]);

  if (roeSeries.length === 0) {
    throw new Error(
      `srim: insufficient ROE history for ${args.corp_code} (no usable years)`,
    );
  }

  // 4. 가중평균 ROE
  const { value: avg_roe_fraction, method: roe_method } = calculateWeightedAvgRoe(roeSeries);

  // 5. 네이버 현재가 — try-catch 분리, stock_code 부재 케이스 포함
  let current_price: number | null = null;
  let price_source: string;
  if (corp.stock_code) {
    try {
      const naver = await fetchNaverPrice(corp.stock_code);
      current_price = naver.price;
      price_source = "naver";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      price_source = `null (${msg})`;
    }
  } else {
    price_source = `null (stock_code unavailable for corp_code ${args.corp_code})`;
  }

  // 6. S-RIM 계산
  const srim = calculateSrim({
    equity: equity_current_won,
    avgRoe: avg_roe_fraction,
    K,
    shares: shares_outstanding,
  });

  // 7. verdict — current_price null이면 null
  let verdict: SrimVerdict | null = null;
  let gap_to_buy: number | null = null;
  let gap_to_fair: number | null = null;
  let gap_to_sell: number | null = null;

  if (current_price != null) {
    const config = await loadConfig();
    const basis: SrimBuyPriceBasis = config.parameters.srim_buy_price_basis;
    const v = judgeSrimVerdict({ currentPrice: current_price, prices: srim.prices, basis });
    verdict = v.verdict;
    gap_to_buy = roundPercent(v.gapToBuy);
    gap_to_fair = roundPercent(v.gapToFair);
    gap_to_sell = roundPercent(v.gapToSell);
  }

  // 8. 단위 변환 + 결과 조립
  const noteParts: string[] = [`K_source=${K_source}`];
  if (K_cache_age_hours != null) {
    noteParts.push(`K_cache_age_hours=${K_cache_age_hours}`);
  }
  noteParts.push(`roe_method=${roe_method}`);
  noteParts.push(`price_source=${price_source}`);

  return {
    corp_code: args.corp_code,
    corp_name: corp.corp_name,
    inputs: {
      equity_current: equity_current_won / 100_000_000,   // 억원
      avg_roe: avg_roe_fraction * 100,                     // %
      required_return_K: K,                                // 분수
      shares_outstanding,
    },
    prices: {
      buy_price: Math.round(srim.prices.buy),              // 원/주 정수
      fair_price: Math.round(srim.prices.fair),
      sell_price: Math.round(srim.prices.sell),
      current_price,
    },
    verdict,
    gap_to_buy,
    gap_to_fair,
    gap_to_sell,
    note: noteParts.join(", "),
  };
}

export const srimTool: ToolDef = defineTool({
  name: "sagyeongin_srim",
  description:
    "S-RIM Buy/Fair/Sell 트리플 가격 + 매수 판단. spec §10.4, philosophy 7부 D-2.",
  input: z.object({
    corp_code: z.string().regex(/^\d{8}$/, "corp_code must be 8 digits"),
    years: z.number().int().min(1).max(10).optional().default(3),
    override_K: z.number().optional(),
  }),
  handler: async (ctx, args) => handleSrim(ctx, args),
});
