/**
 * 사경인 7부 D-2 S-RIM (Simple Residual Income Model) 계산 모듈.
 *
 * 순수 계산 — 외부 의존 0, I/O 0. 단위 테스트 영역 (ADR-0003 38줄).
 *
 * 내부 단위 정책 (G1):
 *   - equity: 원
 *   - ROE, K: 분수 (0.20 = 20%)
 *   - shares: 주
 *   - prices: 원/주
 *
 * spec §10.4 공식 그대로 이식:
 *   초과이익 = 자기자본 × (가중평균ROE − K)
 *   기업가치(W) = 자기자본 + 초과이익 × W / (1 + K − W)
 *   적정주가(W) = 기업가치(W) / 발행주식수
 *
 * Ref: spec §10.4, philosophy 7부 D-2 (RIM(잔여이익모델)로 싼 회사 필터)
 */

export type RoeMethod = "weighted" | "recent_only";

export type WeightedAvgRoeResult = {
  value: number; // 분수, 예: 0.1234
  method: RoeMethod;
};

export type SrimInput = {
  equity: number; // 원
  avgRoe: number; // 분수 (0.20)
  K: number; // 분수 (0.0742)
  shares: number; // 주
};

export type SrimResult = {
  excessIncome: number; // 원, 초과이익
  enterpriseValue: {
    W08: number; // 원, W=0.8 기업가치
    W09: number; // 원, W=0.9 기업가치
    W10: number; // 원, W=1.0 기업가치
  };
  prices: {
    buy: number; // 원/주, W=0.8
    fair: number; // 원/주, W=0.9
    sell: number; // 원/주, W=1.0
  };
};

export type SrimVerdict = "BUY" | "BUY_FAIR" | "HOLD" | "SELL";
export type SrimBuyPriceBasis = "fair" | "buy";

export type VerdictInput = {
  currentPrice: number; // 원/주
  prices: SrimResult["prices"];
  basis: SrimBuyPriceBasis;
};

export type VerdictResult = {
  verdict: SrimVerdict;
  gapToBuy: number; // %, (currentPrice - buy) / buy × 100
  gapToFair: number;
  gapToSell: number;
};

/**
 * 시간 순(오래된→최근) ROE 시계열을 받아 가중평균 또는 최근값을 반환한다.
 *
 * - 단조 감소(strict) 시계열: 보수적으로 최근값만 사용 (method: "recent_only")
 * - 그 외: 최근 연도 가중치가 높은 선형 가중평균 (method: "weighted")
 *
 * Ref: spec §12.1
 */
export function calculateWeightedAvgRoe(roeSeries: number[]): WeightedAvgRoeResult {
  if (roeSeries.length === 0) {
    throw new Error("calculateWeightedAvgRoe: roeSeries cannot be empty");
  }

  if (roeSeries.length === 1) {
    return { value: roeSeries[0], method: "recent_only" };
  }

  // 단조 감소 판별 (strict: 모든 인접 쌍에서 다음값이 이전값보다 작아야 함)
  const isStrictlyDecreasing = roeSeries.every((v, i) => i === 0 || v < roeSeries[i - 1]);

  if (isStrictlyDecreasing) {
    return { value: roeSeries[roeSeries.length - 1], method: "recent_only" };
  }

  // 가중평균: 인덱스 i(0-based)에서 가중치 = i+1
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < roeSeries.length; i++) {
    const w = i + 1;
    weightedSum += w * roeSeries[i];
    totalWeight += w;
  }

  return { value: weightedSum / totalWeight, method: "weighted" };
}

/**
 * S-RIM 공식으로 초과이익, 기업가치(W=0.8/0.9/1.0), 트리플 적정주가를 계산한다.
 *
 * Ref: spec §10.4 582~587줄
 */
export function calculateSrim(input: SrimInput): SrimResult {
  const { equity, avgRoe, K, shares } = input;

  if (shares <= 0) {
    throw new Error("calculateSrim: shares must be positive");
  }

  const Ws = [0.8, 0.9, 1.0] as const;
  for (const W of Ws) {
    if (Math.abs(1 + K - W) < 0.001) {
      throw new Error(`calculateSrim: denominator (1+K-W) too small for W=${W}`);
    }
  }

  const excessIncome = equity * (avgRoe - K);

  const W08 = equity + (excessIncome * 0.8) / (1 + K - 0.8);
  const W09 = equity + (excessIncome * 0.9) / (1 + K - 0.9);
  const W10 = equity + (excessIncome * 1.0) / (1 + K - 1.0);

  return {
    excessIncome,
    enterpriseValue: { W08, W09, W10 },
    prices: {
      buy: W08 / shares,
      fair: W09 / shares,
      sell: W10 / shares,
    },
  };
}

/**
 * 현재가와 트리플 가격을 비교해 투자 판단(BUY/BUY_FAIR/HOLD/SELL)과 괴리율을 반환한다.
 *
 * basis="fair" (공격적): BUY → BUY_FAIR → HOLD → SELL 4분기
 * basis="buy" (보수적): BUY → HOLD → SELL 3분기
 *
 * Ref: spec §10.4 589~598줄
 */
export function judgeSrimVerdict(input: VerdictInput): VerdictResult {
  const { currentPrice, prices, basis } = input;

  if (prices.buy <= 0 || prices.fair <= 0 || prices.sell <= 0) {
    throw new Error("judgeSrimVerdict: prices must be positive");
  }

  let verdict: SrimVerdict;

  if (basis === "fair") {
    if (currentPrice <= prices.buy) {
      verdict = "BUY";
    } else if (currentPrice <= prices.fair) {
      verdict = "BUY_FAIR";
    } else if (currentPrice <= prices.sell) {
      verdict = "HOLD";
    } else {
      verdict = "SELL";
    }
  } else {
    if (currentPrice <= prices.buy) {
      verdict = "BUY";
    } else if (currentPrice <= prices.sell) {
      verdict = "HOLD";
    } else {
      verdict = "SELL";
    }
  }

  return {
    verdict,
    gapToBuy: ((currentPrice - prices.buy) / prices.buy) * 100,
    gapToFair: ((currentPrice - prices.fair) / prices.fair) * 100,
    gapToSell: ((currentPrice - prices.sell) / prices.sell) * 100,
  };
}
