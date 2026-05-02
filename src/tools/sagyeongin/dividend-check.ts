/**
 * 사경인 dividend_check 도구 — 7부 E 배당주 지속 가능성 평가.
 *
 * philosophy 7부 E "배당성향이 20~30%로 낮으면서 배당률이 높으면 지속 가능.
 * 성향이 너무 높으면 이익 소폭 감소에도 배당 급감 위험."
 *
 * 5등급 분류 (A/B/C/D/N/A):
 *   A: 5년+ 연속 배당 + 성향 20~40% + 변동성 낮음(stddev < 0.10) + 삭감 없음
 *   B: 5년+ 연속 배당 + 성향 20~50%
 *   C: 3년+ 배당 + 성향 50~70% 또는 변동성 높음(stddev > 0.20)
 *   D: 성향 > 70% 또는 최근 삭감
 *   N/A: 배당 이력 없음 또는 등급 분류 기준 미충족
 *
 * payout_stddev 임계값 7단계 default (spec-pending-edits §10.6 누적 영역):
 *   PAYOUT_STDDEV_LOW = 0.10, PAYOUT_STDDEV_HIGH = 0.20
 *
 * Ref: spec §10.6, philosophy 7부 E, ADR-0001
 */

import { z } from "zod";
import { defineTool } from "../_helpers.js";
import type { ToolDef, ToolCtx } from "../_helpers.js";
import {
  extractDividendSeries,
  extractNetIncomeSeries,
} from "./_lib/financial-extractor.js";

// 7단계 묶음 2, 7부 E "배당주 지속성" — spec-pending-edits §10.6 임계값 명시 누락 영역
const PAYOUT_STDDEV_LOW = 0.10;
const PAYOUT_STDDEV_HIGH = 0.20;

// Population standard deviation. Returns 0 if values.length < 2.
function calcPopStddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Count of trailing non-zero items (from end toward start).
// [0, 100, 200, 0, 300, 400] → 2
function countTrailingNonZero(arr: number[]): number {
  let count = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== 0) count++;
    else break;
  }
  return count;
}

// Grade classification (priority: D → A → B → C → N/A).
// spec-pending-edits §10.6: 우선순위 + N/A fallback 명시 누락 영역.
function classifyGrade(
  avg_payout_ratio: number,
  payout_stddev: number,
  years_of_dividend: number,
  recent_cut: boolean,
): "A" | "B" | "C" | "D" | "N/A" {
  if (avg_payout_ratio > 0.70 || recent_cut) return "D";
  if (
    years_of_dividend >= 5 &&
    avg_payout_ratio >= 0.20 &&
    avg_payout_ratio <= 0.40 &&
    payout_stddev < PAYOUT_STDDEV_LOW
  )
    return "A";
  if (years_of_dividend >= 5 && avg_payout_ratio >= 0.20 && avg_payout_ratio <= 0.50)
    return "B";
  if (
    years_of_dividend >= 3 &&
    (( avg_payout_ratio > 0.50 && avg_payout_ratio <= 0.70) ||
      payout_stddev > PAYOUT_STDDEV_HIGH)
  )
    return "C";
  return "N/A";
}

export const dividendCheckTool: ToolDef = defineTool({
  name: "sagyeongin_dividend_check",
  description:
    "7부 E 배당주 지속 가능성 평가 — 배당성향 추이 + 변동성 + 삭감 여부로 A/B/C/D/N/A 5등급 분류",
  input: z.object({
    corp_code: z.string(),
    years: z.number().int().min(2).max(10).default(5),
  }),
  handler: async (ctx: ToolCtx, args) => {
    const corp = ctx.resolver.byCorpCode(args.corp_code);
    if (!corp) {
      throw new Error(`dividend-check: corp_code ${args.corp_code} not found`);
    }
    const corp_name = corp.corp_name;

    // 병렬 추출 (API 호출 절약)
    const [dividend, netIncomeSeries] = await Promise.all([
      extractDividendSeries(args.corp_code, args.years, ctx),
      extractNetIncomeSeries(args.corp_code, args.years, ctx),
    ]);

    // 배당 이력 0 → 조기 N/A 반환
    if (dividend.total.length === 0) {
      return {
        corp_code: args.corp_code,
        corp_name,
        sustainability_grade: "N/A" as const,
        metrics: {
          avg_payout_ratio: 0,
          avg_dividend_yield: 0,
          payout_stddev: 0,
          years_of_dividend: 0,
          recent_cut: false,
        },
        series: [],
        interpretation_notes: ["배당 이력 0 — alotMatter 응답 부재 또는 무배당 종목"],
      };
    }

    // 시계열 정합 — 두 배열 길이 다를 수 있음 (응답 연도 누락)
    const n = Math.min(dividend.total.length, netIncomeSeries.length);
    const dividendTail = dividend.total.slice(-n);
    const netIncomeTail = netIncomeSeries.slice(-n);

    // payout_ratio 계산 (적자 연도 제외)
    const payoutRatios: number[] = [];
    let lossYears = 0;
    for (let i = 0; i < n; i++) {
      if (netIncomeTail[i] > 0) {
        payoutRatios.push(dividendTail[i] / netIncomeTail[i]);
      } else {
        lossYears++;
      }
    }

    // metrics 계산
    const avg_payout_ratio =
      payoutRatios.length > 0
        ? payoutRatios.reduce((s, v) => s + v, 0) / payoutRatios.length
        : 0;
    const payout_stddev = calcPopStddev(payoutRatios);
    const avg_dividend_yield =
      dividend.yield_market.length > 0
        ? dividend.yield_market.reduce((s, v) => s + v, 0) / dividend.yield_market.length
        : 0;
    // years_of_dividend: full array (not tail) — 시계열 정합 전 전체 배당 이력 기준
    const years_of_dividend = countTrailingNonZero(dividend.total);
    // recent_cut: 가장 최근 2 연도 비교 (두 연도 모두 0보다 커야 삭감 판정)
    const lastTotal = dividend.total[dividend.total.length - 1];
    const prevTotal = dividend.total[dividend.total.length - 2];
    const recent_cut =
      dividend.total.length >= 2 &&
      lastTotal > 0 &&
      prevTotal > 0 &&
      lastTotal < prevTotal;

    // interpretation_notes 누적
    const interpretation_notes: string[] = [];
    if (n < 5) interpretation_notes.push(`${n}년 데이터만 — 5년 데이터 권장`);
    if (dividend.yield_market.length === 0)
      interpretation_notes.push("시가배당률 데이터 부재 — alotMatter 해당 필드 미제공");
    if (recent_cut)
      interpretation_notes.push("최근 연도 배당 삭감 발생 — 사용자 본문 확인 권장");
    if (payout_stddev >= PAYOUT_STDDEV_LOW && payout_stddev <= PAYOUT_STDDEV_HIGH)
      interpretation_notes.push("변동성 중간 — 등급 본질 약함, 사용자 본문 확인 권장");
    if (lossYears > 0)
      interpretation_notes.push(`적자 연도 ${lossYears}개 — payout_ratio 분모 정의 0 영역 제외`);

    // 등급 분류
    const sustainability_grade = classifyGrade(
      avg_payout_ratio,
      payout_stddev,
      years_of_dividend,
      recent_cut,
    );
    if (sustainability_grade === "N/A") {
      interpretation_notes.push(
        "등급 분류 영역 외 — A·B·C·D 영역 어느 것도 부합 0 (5년 미만 또는 등급 본질 약함)",
      );
    }

    // series 구성 (n년 창 기준 — yield_market index 직접 사용, sparse MVP limitation)
    const endYear = new Date().getFullYear() - 1;
    const series = Array.from({ length: n }, (_, i) => ({
      year: String(endYear - n + 1 + i),
      payout_ratio: netIncomeTail[i] > 0 ? dividendTail[i] / netIncomeTail[i] : 0,
      dividend_yield: dividend.yield_market[i] ?? 0,
      net_income: netIncomeTail[i],
      dividend_total: dividendTail[i],
    }));

    return {
      corp_code: args.corp_code,
      corp_name,
      sustainability_grade,
      metrics: {
        avg_payout_ratio,
        avg_dividend_yield,
        payout_stddev,
        years_of_dividend,
        recent_cut,
      },
      series,
      interpretation_notes,
    };
  },
});
