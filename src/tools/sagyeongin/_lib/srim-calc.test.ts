import { describe, test } from "node:test";
import * as assert from "node:assert/strict";
import {
  calculateWeightedAvgRoe,
  calculateSrim,
  judgeSrimVerdict,
} from "./srim-calc.js";

// 그룹 1~2 핵심 입력값 (손산출 검증용)
const CORE_INPUT = {
  equity: 100_000_000_000,
  avgRoe: 0.20,
  K: 0.10,
  shares: 1_000_000,
};
// 기대 prices (그룹 8~12에서 재사용)
const CORE_PRICES = { buy: 126_666.67, fair: 145_000, sell: 200_000 };

describe("calculateSrim", () => {
  test("핵심 케이스 — 자본총계 1000억 / ROE 20% / K 10% / 100만주", () => {
    const result = calculateSrim(CORE_INPUT);
    assert.ok(result != null);

    assert.ok(
      Math.abs(result.excessIncome - 10_000_000_000) < 1.0,
      `excessIncome 기대 10_000_000_000, 실제 ${result.excessIncome}`,
    );
    assert.ok(
      Math.abs(result.enterpriseValue.W10 - 200_000_000_000) < 1.0,
      `W10 기대 200_000_000_000, 실제 ${result.enterpriseValue.W10}`,
    );
    assert.ok(
      Math.abs(result.enterpriseValue.W09 - 145_000_000_000) < 1.0,
      `W09 기대 145_000_000_000, 실제 ${result.enterpriseValue.W09}`,
    );
    assert.ok(
      Math.abs(result.enterpriseValue.W08 - 126_666_666_666.67) < 1.0,
      `W08 기대 ≈126_666_666_666.67, 실제 ${result.enterpriseValue.W08}`,
    );
    assert.ok(
      Math.abs(result.prices.sell - 200_000) < 0.01,
      `sell 기대 200_000, 실제 ${result.prices.sell}`,
    );
    assert.ok(
      Math.abs(result.prices.fair - 145_000) < 0.01,
      `fair 기대 145_000, 실제 ${result.prices.fair}`,
    );
    assert.ok(
      Math.abs(result.prices.buy - 126_666.67) < 0.01,
      `buy 기대 ≈126_666.67, 실제 ${result.prices.buy}`,
    );
  });

  test("shares=0 → null (ADR-0013)", () => {
    const result = calculateSrim({ ...CORE_INPUT, shares: 0 });
    assert.strictEqual(result, null);
  });

  test("shares=-1 → null (ADR-0013)", () => {
    const result = calculateSrim({ ...CORE_INPUT, shares: -1 });
    assert.strictEqual(result, null);
  });

  test("분모 ~0 (K=0, W=1.0) → null (ADR-0013)", () => {
    // K=0 이면 1+K-W=1+0-1=0 → 분모 가드 발동
    const result = calculateSrim({ equity: 1, avgRoe: 0.1, K: 0, shares: 1 });
    assert.strictEqual(result, null);
  });
});

describe("calculateWeightedAvgRoe", () => {
  // 그룹 3: 정상 가중평균
  test("길이 3 가중: [0.10, 0.15, 0.20] → ≈0.16667, weighted", () => {
    const result = calculateWeightedAvgRoe([0.10, 0.15, 0.20]);
    assert.ok(result != null);
    assert.equal(result.method, "weighted");
    // (1×0.10 + 2×0.15 + 3×0.20) / 6 = (0.10+0.30+0.60)/6 = 1.00/6
    assert.ok(
      Math.abs(result.value - 1.00 / 6) < 1e-9,
      `기대 ${1.00 / 6}, 실제 ${result.value}`,
    );
  });

  test("길이 2 가중: [0.10, 0.20] → ≈0.16667, weighted", () => {
    const result = calculateWeightedAvgRoe([0.10, 0.20]);
    assert.ok(result != null);
    assert.equal(result.method, "weighted");
    // (1×0.10 + 2×0.20) / 3 = 0.50/3
    assert.ok(Math.abs(result.value - 0.50 / 3) < 1e-9);
  });

  test("길이 4 가중: [0.05, 0.10, 0.15, 0.20] → 0.15, weighted", () => {
    const result = calculateWeightedAvgRoe([0.05, 0.10, 0.15, 0.20]);
    assert.ok(result != null);
    assert.equal(result.method, "weighted");
    // (1×0.05 + 2×0.10 + 3×0.15 + 4×0.20) / 10 = (0.05+0.20+0.45+0.80)/10 = 1.50/10
    assert.ok(Math.abs(result.value - 0.15) < 1e-9);
  });

  // 그룹 4: 단조 감소 → recent_only
  test("길이 3 단조 감소: [0.20, 0.15, 0.10] → 0.10, recent_only", () => {
    const result = calculateWeightedAvgRoe([0.20, 0.15, 0.10]);
    assert.ok(result != null);
    assert.equal(result.method, "recent_only");
    assert.equal(result.value, 0.10);
  });

  test("길이 2 단조 감소: [0.20, 0.10] → 0.10, recent_only", () => {
    const result = calculateWeightedAvgRoe([0.20, 0.10]);
    assert.ok(result != null);
    assert.equal(result.method, "recent_only");
    assert.equal(result.value, 0.10);
  });

  test("길이 4 단조 감소: [0.30, 0.20, 0.15, 0.10] → 0.10, recent_only", () => {
    const result = calculateWeightedAvgRoe([0.30, 0.20, 0.15, 0.10]);
    assert.ok(result != null);
    assert.equal(result.method, "recent_only");
    assert.equal(result.value, 0.10);
  });

  // 그룹 5: 길이 1
  test("길이 1: [0.15] → 0.15, recent_only", () => {
    const result = calculateWeightedAvgRoe([0.15]);
    assert.ok(result != null);
    assert.equal(result.method, "recent_only");
    assert.equal(result.value, 0.15);
  });

  // 그룹 6: 비단조 → weighted (strict 감소가 아님을 검증)
  test("등치 포함: [0.20, 0.20, 0.10] → weighted (strict 감소 아님)", () => {
    const result = calculateWeightedAvgRoe([0.20, 0.20, 0.10]);
    assert.ok(result != null);
    assert.equal(result.method, "weighted");
  });

  test("V자: [0.20, 0.10, 0.15] → weighted", () => {
    const result = calculateWeightedAvgRoe([0.20, 0.10, 0.15]);
    assert.ok(result != null);
    assert.equal(result.method, "weighted");
  });

  test("∧자: [0.10, 0.20, 0.15] → weighted", () => {
    const result = calculateWeightedAvgRoe([0.10, 0.20, 0.15]);
    assert.ok(result != null);
    assert.equal(result.method, "weighted");
  });

  // 그룹 7: 빈 배열
  test("빈 배열 → null (ADR-0013)", () => {
    const result = calculateWeightedAvgRoe([]);
    assert.strictEqual(result, null);
  });
});

describe("judgeSrimVerdict", () => {
  // 그룹 8: basis="fair" 4분기 + 경계
  test("fair — currentPrice=100_000 (≤buy) → BUY", () => {
    const result = judgeSrimVerdict({ currentPrice: 100_000, prices: CORE_PRICES, basis: "fair" });
    assert.ok(result != null);
    assert.equal(result.verdict, "BUY");
  });

  test("fair — currentPrice=130_000 (buy<x≤fair) → BUY_FAIR", () => {
    const result = judgeSrimVerdict({ currentPrice: 130_000, prices: CORE_PRICES, basis: "fair" });
    assert.ok(result != null);
    assert.equal(result.verdict, "BUY_FAIR");
  });

  test("fair — currentPrice=150_000 (fair<x≤sell) → HOLD", () => {
    const result = judgeSrimVerdict({ currentPrice: 150_000, prices: CORE_PRICES, basis: "fair" });
    assert.ok(result != null);
    assert.equal(result.verdict, "HOLD");
  });

  test("fair — currentPrice=250_000 (>sell) → SELL", () => {
    const result = judgeSrimVerdict({ currentPrice: 250_000, prices: CORE_PRICES, basis: "fair" });
    assert.ok(result != null);
    assert.equal(result.verdict, "SELL");
  });

  test("fair — currentPrice=145_000 (정확히 fair, ≤fair이므로 BUY_FAIR)", () => {
    const result = judgeSrimVerdict({ currentPrice: 145_000, prices: CORE_PRICES, basis: "fair" });
    assert.ok(result != null);
    assert.equal(result.verdict, "BUY_FAIR");
  });

  // 그룹 9: basis="buy" 3분기
  test("buy — currentPrice=100_000 → BUY", () => {
    const result = judgeSrimVerdict({ currentPrice: 100_000, prices: CORE_PRICES, basis: "buy" });
    assert.ok(result != null);
    assert.equal(result.verdict, "BUY");
  });

  test("buy — currentPrice=150_000 → HOLD (BUY_FAIR 없음)", () => {
    const result = judgeSrimVerdict({ currentPrice: 150_000, prices: CORE_PRICES, basis: "buy" });
    assert.ok(result != null);
    assert.equal(result.verdict, "HOLD");
  });

  test("buy — currentPrice=250_000 → SELL", () => {
    const result = judgeSrimVerdict({ currentPrice: 250_000, prices: CORE_PRICES, basis: "buy" });
    assert.ok(result != null);
    assert.equal(result.verdict, "SELL");
  });

  // 그룹 10: 괴리 계산 (양수)
  test("괴리 계산 — currentPrice=200_000 (sell 경계)", () => {
    const result = judgeSrimVerdict({ currentPrice: 200_000, prices: CORE_PRICES, basis: "fair" });
    assert.ok(result != null);
    // gapToBuy = (200_000 - 126_666.67) / 126_666.67 × 100 ≈ 57.8947%
    assert.ok(Math.abs(result.gapToBuy - 57.8947) < 0.01, `gapToBuy=${result.gapToBuy}`);
    // gapToFair = (200_000 - 145_000) / 145_000 × 100 ≈ 37.9310%
    assert.ok(Math.abs(result.gapToFair - 37.9310) < 0.01, `gapToFair=${result.gapToFair}`);
    // gapToSell = 0
    assert.ok(Math.abs(result.gapToSell - 0) < 0.01, `gapToSell=${result.gapToSell}`);
  });

  // 그룹 11: 괴리 계산 (음수) + BUY
  test("음수 괴리 — currentPrice=100_000, verdict=BUY", () => {
    const result = judgeSrimVerdict({ currentPrice: 100_000, prices: CORE_PRICES, basis: "fair" });
    assert.ok(result != null);
    assert.equal(result.verdict, "BUY");
    // gapToBuy = (100_000 - 126_666.67) / 126_666.67 × 100 ≈ -21.0526%
    assert.ok(Math.abs(result.gapToBuy - (-21.0526)) < 0.01, `gapToBuy=${result.gapToBuy}`);
    // gapToFair ≈ -31.0345%
    assert.ok(Math.abs(result.gapToFair - (-31.0345)) < 0.01, `gapToFair=${result.gapToFair}`);
    // gapToSell = -50%
    assert.ok(Math.abs(result.gapToSell - (-50)) < 0.01, `gapToSell=${result.gapToSell}`);
  });

  // 그룹 12: 가드 (prices ≤ 0)
  test("prices.buy=0 → null (ADR-0013)", () => {
    const result = judgeSrimVerdict({ currentPrice: 100_000, prices: { buy: 0, fair: 145_000, sell: 200_000 }, basis: "fair" });
    assert.strictEqual(result, null);
  });

  test("prices.fair 음수 → null (ADR-0013)", () => {
    const result = judgeSrimVerdict({ currentPrice: 100_000, prices: { buy: 126_666.67, fair: -1, sell: 200_000 }, basis: "fair" });
    assert.strictEqual(result, null);
  });

  test("prices.sell=0 → null (ADR-0013)", () => {
    const result = judgeSrimVerdict({ currentPrice: 100_000, prices: { buy: 126_666.67, fair: 145_000, sell: 0 }, basis: "fair" });
    assert.strictEqual(result, null);
  });
});

// ADR-0023: ROE < K 케이스 분포 역전 (buy > fair > sell) — verdict invariant 가드
const INVERTED_INPUT = {
  equity: 100_000_000_000,
  avgRoe: 0.05,
  K: 0.10,
  shares: 1_000_000,
};
// 산수: excess=-5B, W08=86.67B→buy≈86_666.67, W09=77.5B→fair=77_500, W10=50B→sell=50_000
const INVERTED_PRICES = { buy: 86_666.67, fair: 77_500, sell: 50_000 };

describe("calculateSrim — ROE < K 분포 역전 (ADR-0023)", () => {
  test("ROE 5% / K 10% → 분포 buy > fair > sell 산출", () => {
    const result = calculateSrim(INVERTED_INPUT);
    assert.ok(result != null);
    assert.ok(Math.abs(result.excessIncome - (-5_000_000_000)) < 1.0, `excessIncome 기대 -5B, 실제 ${result.excessIncome}`);
    assert.ok(Math.abs(result.prices.buy - 86_666.67) < 0.01, `buy 기대 ≈86_666.67, 실제 ${result.prices.buy}`);
    assert.ok(Math.abs(result.prices.fair - 77_500) < 0.01, `fair 기대 77_500, 실제 ${result.prices.fair}`);
    assert.ok(Math.abs(result.prices.sell - 50_000) < 0.01, `sell 기대 50_000, 실제 ${result.prices.sell}`);
    assert.ok(result.prices.buy > result.prices.fair, "buy > fair (분포 역전)");
    assert.ok(result.prices.fair > result.prices.sell, "fair > sell (분포 역전)");
  });
});

describe("judgeSrimVerdict — invariant 가드 (ADR-0023)", () => {
  test("buy > sell → null (분포 역전 invariant 가드)", () => {
    const result = judgeSrimVerdict({ currentPrice: 70_000, prices: INVERTED_PRICES, basis: "fair" });
    assert.strictEqual(result, null);
  });

  test("buy > sell + basis=buy → null (basis 무관 가드 발동)", () => {
    const result = judgeSrimVerdict({ currentPrice: 70_000, prices: INVERTED_PRICES, basis: "buy" });
    assert.strictEqual(result, null);
  });

  test("INVERTED_INPUT 전체 흐름 — calculateSrim + judgeSrimVerdict null", () => {
    const srim = calculateSrim(INVERTED_INPUT);
    assert.ok(srim != null);
    const verdict = judgeSrimVerdict({ currentPrice: 70_000, prices: srim.prices, basis: "fair" });
    assert.strictEqual(verdict, null);
  });

  test("정상 분포 (CORE_PRICES, buy < sell) → null 아님 (가드 미발동)", () => {
    const result = judgeSrimVerdict({ currentPrice: 100_000, prices: CORE_PRICES, basis: "fair" });
    assert.ok(result != null);
    assert.equal(result.verdict, "BUY");
  });
});
