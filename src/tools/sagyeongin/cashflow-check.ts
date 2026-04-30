/**
 * 사경인 cashflow_check 도구 — 7부 B 현금흐름 검증.
 *
 * philosophy 7부 B "수익은 수치, 현금흐름은 사실" + 6부 "초보자에게는 현금흐름표".
 * 손익계산서(발생주의) vs 현금흐름표(실제 돈 흐름) 어긋남 영역 검증.
 *
 * verdict: REVIEW_REQUIRED (검토 진입 결정) / CLEAN.
 * 7부 A killer_check의 EXCLUDE(회피 결정 자체)와 의미 layer 분리 —
 * 도구는 raw 트리거 + severity + investigation_hints만 띄움, 분식/보수/사업
 * 건강성 분리 판정은 사용자(주석/맥락 확인) 영역.
 *
 * 4 룰 평가 — 항목별 try/catch 또는 가드로 데이터 부재 시 룰 미트리거.
 *
 * Ref: spec §10.2, philosophy 7부 B + 6부, ADR-0001
 */

import { z } from "zod";
import { defineTool } from "../_helpers.js";
import type { ToolDef, ToolCtx } from "../_helpers.js";
import {
  extractOperatingIncomeSeries,
  extractCashflowSeries,
  extractTotalAssets,
} from "./_lib/financial-extractor.js";

interface Flag {
  flag: string;
  severity: "low" | "medium" | "high";
  description: string;
  evidence: Record<string, unknown>;
  investigation_hints: string[];
}

const RULE_SCORES: Record<string, number> = {
  oi_cf_divergence: 40,
  negative_ocf_persistent: 30,
  negative_ocf_with_active_icf: 20,
  cf_pattern_risky: 15,
};

const INVESTIGATION_HINTS: Record<string, string[]> = {
  oi_cf_divergence: [
    "매출채권 변동 확인 (외상 매출 누적?)",
    "재고자산 변동 확인 (재고 적체?)",
    "고객 집중도 주석 확인 (대형 고객 결제 지연?)",
  ],
  negative_ocf_persistent: [
    "영업 사이클 길이 확인 (R&D 집중 단계? 매출 발생 전 단계?)",
    "외부 자금 의존 여부 확인 (재무CF 양수 + 부채 증가 패턴?)",
    "사업 모델 자체 검토 (생산 → 판매 → 회수 사이클 작동 여부?)",
  ],
  negative_ocf_with_active_icf: [
    "투자CF 사용처 확인 (기존 사업 케파 증설? 신규 분야 확장?)",
    "투자 자금 출처 확인 (재무CF? 자산 매각?)",
    "7부 B — 신규 시설투자 공시 본문 확인 (기존 사업 vs 신규 분야)",
  ],
  cf_pattern_risky: [
    "자산 매각 여부 확인 (투자CF 양수 본질 — 어떤 자산 처분?)",
    "재무CF 양수 사용처 확인 (CB/BW/유상증자/대출?)",
    "6부 건전 패턴(영업+/투자−/재무−) 거울 — 외부 자금 의존 극치",
  ],
};

// 룰 1: 영업이익(+) vs 영업CF(−) 합산 2회+ 어긋남
async function evaluateOiCfDivergence(
  corp_code: string,
  cf: { operating: number[]; investing: number[]; financing: number[] },
  ctx: ToolCtx,
  years: number,
): Promise<Flag | null> {
  // 7부 B oi_cf_divergence: CFS 우선 → OFS 폴백 (그룹 전체 사실 영역)
  // killer-check.ts의 OFS 강제 호출과 본질 분리 — 호출 시점 정책 명시
  const oi = await extractOperatingIncomeSeries(corp_code, years, ctx, "CFS_FIRST");

  if (!oi.length || !cf.operating.length) return null;

  // 길이 정합: 두 시계열 길이 다를 수 있음 (응답 연도 누락)
  // 가장 최근 N년만 비교 — 어긋남 발생 여부가 본질, 정확한 연도 매핑은 범위 외
  const n = Math.min(oi.length, cf.operating.length);
  const oiTail = oi.slice(-n);
  const cfTail = cf.operating.slice(-n);

  let divergenceCount = 0;
  for (let i = 0; i < n; i++) {
    if (oiTail[i] > 0 && cfTail[i] < 0) divergenceCount++;
  }

  if (divergenceCount < 2) return null;

  return {
    flag: "oi_cf_divergence",
    severity: "high",
    description: `영업이익 양수 vs 영업CF 음수 — ${divergenceCount}회 어긋남`,
    evidence: {
      operating_income_series: oiTail,
      operating_cf_series: cfTail,
      divergence_count: divergenceCount,
    },
    investigation_hints: INVESTIGATION_HINTS.oi_cf_divergence,
  };
}

// 룰 2: 영업CF N년 연속 음수
function evaluateNegativeOcfPersistent(
  cf: { operating: number[]; investing: number[]; financing: number[] },
  years: number,
): Flag | null {
  if (cf.operating.length < years) return null;

  const tail = cf.operating.slice(-years);
  if (!tail.every((v) => v < 0)) return null;

  return {
    flag: "negative_ocf_persistent",
    severity: "high",
    description: `영업CF ${years}년 연속 음수`,
    evidence: {
      operating_cf_series: tail,
      negative_years: years,
    },
    investigation_hints: INVESTIGATION_HINTS.negative_ocf_persistent,
  };
}

// 룰 3: 영업CF 음수 + 투자CF 자산총계 10%+ 활발
async function evaluateNegativeOcfWithActiveIcf(
  corp_code: string,
  cf: { operating: number[]; investing: number[]; financing: number[] },
  ctx: ToolCtx,
): Promise<Flag | null> {
  if (!cf.operating.length || !cf.investing.length) return null;

  // 자산총계: 분석 윈도 가장 최근 연도 기준 — 룰 본질이 "현재 자산 규모 대비 투자 강도"
  // (spec §10.2 명시 누락, spec-pending-edits 누적)
  const endYear = new Date().getFullYear() - 1;
  const totalAssets = await extractTotalAssets(corp_code, endYear, ctx);
  if (totalAssets <= 0) return null;

  const recentOcf = cf.operating[cf.operating.length - 1];
  const recentIcf = cf.investing[cf.investing.length - 1];

  if (recentOcf >= 0) return null;
  const icfRatio = Math.abs(recentIcf) / totalAssets;
  if (icfRatio < 0.1) return null;

  return {
    flag: "negative_ocf_with_active_icf",
    severity: "medium",
    description: `영업CF 음수 + 투자CF 자산총계 ${(icfRatio * 100).toFixed(1)}% 활발`,
    evidence: {
      operating_cf_recent: recentOcf,
      investing_cf_abs: Math.abs(recentIcf),
      total_assets: totalAssets,
      ratio: icfRatio,
    },
    investigation_hints: INVESTIGATION_HINTS.negative_ocf_with_active_icf,
  };
}

// 룰 4: 영업−/투자+/재무+ 패턴 (6부 건전 패턴 역상)
function evaluateCfPatternRisky(
  cf: { operating: number[]; investing: number[]; financing: number[] },
): Flag | null {
  const n = Math.min(cf.operating.length, cf.investing.length, cf.financing.length);
  if (n === 0) return null;

  const oTail = cf.operating.slice(-n);
  const iTail = cf.investing.slice(-n);
  const fTail = cf.financing.slice(-n);

  // 최근 연도부터 역방향 탐색 — 단발 패턴 신호
  for (let idx = n - 1; idx >= 0; idx--) {
    if (oTail[idx] < 0 && iTail[idx] > 0 && fTail[idx] > 0) {
      return {
        flag: "cf_pattern_risky",
        severity: "medium",
        description: `영업−/투자+/재무+ 패턴 — 최근 ${n}년 중 발견`,
        evidence: {
          operating_cf: oTail[idx],
          investing_cf: iTail[idx],
          financing_cf: fTail[idx],
        },
        investigation_hints: INVESTIGATION_HINTS.cf_pattern_risky,
      };
    }
  }

  return null;
}

export const cashflowCheckTool: ToolDef = defineTool({
  name: "sagyeongin_cashflow_check",
  description:
    "7부 B 현금흐름 검증 — 영업이익 vs 영업CF 어긋남 + 영업CF 지속 음수 + 외부 자금 의존 패턴 검토 진입 결정",
  input: z.object({
    corp_code: z.string(),
    years: z.number().int().min(2).max(10).default(3),
  }),
  handler: async (ctx, args) => {
    const corp = ctx.resolver.byCorpCode(args.corp_code);
    if (!corp) {
      throw new Error(`cashflow-check: corp_code ${args.corp_code} not found`);
    }
    const corp_name = corp.corp_name;

    // CF 시계열 추출 (CFS 우선 → OFS 폴백, 항목별 독립 누락)
    // 7부 B "현금흐름은 사실" 본질 — 그룹 전체 사실 영역
    const cf = await extractCashflowSeries(args.corp_code, args.years, ctx);

    const flags: Flag[] = [];

    // 룰 1: oi_cf_divergence
    try {
      const f = await evaluateOiCfDivergence(args.corp_code, cf, ctx, args.years);
      if (f) flags.push(f);
    } catch {
      // 영업이익 추출 실패 — 룰 미트리거 (7부 B 본질: 데이터 부재 시 사전 판정 안 함)
    }

    // 룰 2: negative_ocf_persistent (CF 시계열만 사용)
    const f2 = evaluateNegativeOcfPersistent(cf, args.years);
    if (f2) flags.push(f2);

    // 룰 3: negative_ocf_with_active_icf
    try {
      const f3 = await evaluateNegativeOcfWithActiveIcf(args.corp_code, cf, ctx);
      if (f3) flags.push(f3);
    } catch {
      // 자산총계 부재 — 룰 미트리거
    }

    // 룰 4: cf_pattern_risky (CF 시계열만 사용)
    const f4 = evaluateCfPatternRisky(cf);
    if (f4) flags.push(f4);

    const concern_score = Math.min(
      flags.reduce((sum, f) => sum + (RULE_SCORES[f.flag] ?? 0), 0),
      100,
    );
    const verdict = flags.length > 0 ? "REVIEW_REQUIRED" : "CLEAN";

    return { corp_code: args.corp_code, corp_name, verdict, concern_score, flags };
  },
});
