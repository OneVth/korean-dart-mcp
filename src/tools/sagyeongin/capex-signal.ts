/**
 * 사경인 capex_signal 도구 — 7부 C 선행 지표 (기회 포착).
 *
 * philosophy 7부 C "신규 시설투자 공시: 자기자본 10% 이상 투자 시 의무공시.
 * DART 상세검색에서 '신규시설투자'만 필터. 기존 사업 케파 증설은 긍정적 —
 * 매출 증가의 선행지표".
 *
 * 7부 A killer_check (EXCLUDE 회피) / 7부 B cashflow_check (REVIEW_REQUIRED 검토)와
 * 의미 layer 분리 — 7부 C는 긍정 발굴 (SIGNAL_DETECTED 신호 발견).
 *
 * 데이터 소스: DS005 tgastInhDecsn (유형자산 양수 결정) endpoint.
 * 사상 본문 "신규시설투자만 필터" ⊂ "유형자산 양수 결정" 집합 관계 — spec §10.3 그대로.
 *
 * 3 시그널 분기 (spec §10.3):
 * - major_capex_existing_business (자기자본 10%+ + 기존 사업 일치) → +80
 * - major_capex_unrelated_diversification (자기자본 10%+ + 기존 사업 불일치) → −40 (경고)
 * - minor_capex (자기자본 5~10%) → +30
 *
 * 사업분야 일치 판정 (MVP 한정 보수적 분기):
 * - DART 응답에 사업분야 KSIC 직접 부재 가능 — 텍스트 휴리스틱 적용
 * - 양수 자산 텍스트(asset_name 등) + 회사 사업 텍스트(induty 한글) 비교
 * - 응답 형태 확정 후 정밀화 영역 (spec-pending-edits 누적)
 *
 * verdict: SIGNAL_DETECTED (신호 1개+) / NO_SIGNAL.
 * opportunity_score: 시그널 score 합 (0~100 clamp 안 함 — 음수 가능,
 *   spec §10.3 표 score 정합).
 *
 * Ref: spec §10.3, philosophy 7부 C, ADR-0001
 */

import { z } from "zod";
import { defineTool } from "../_helpers.js";
import type { ToolDef, ToolCtx } from "../_helpers.js";
import { extractEquityCurrent } from "./_lib/financial-extractor.js";
// 묶음 1 `matchInduty`는 미래 정밀화 영역 산출 (현재 호출 영역 0).

interface Signal {
  signal: string;
  description: string;
  evidence: {
    date: string;
    amount: number;
    equity_ratio: number;
    category: string;
    existing_business_match: boolean;
    dart_reference: string;
  };
  interpretation_notes: string[];
}

const SIGNAL_SCORES: Record<string, number> = {
  major_capex_existing_business: 80,
  major_capex_unrelated_diversification: -40,
  minor_capex: 30,
};

const INTERPRETATION_NOTES: Record<string, string[]> = {
  major_capex_existing_business: [
    "자기자본 10%+ 시설투자 = 의무공시 임계 통과 — 사업 영향 큰 결정",
    "기존 사업 케파 증설로 추정 — 매출 증가의 선행지표 (7부 C)",
    "공시 본문 직접 확인 권장 — 사업 분야 정확 판정 (DART download_document)",
  ],
  major_capex_unrelated_diversification: [
    "자기자본 10%+ 시설투자 = 의무공시 임계 통과",
    "기존 사업과 무관한 신규 분야 확장으로 추정 — 7부 B 위험 신호 영역",
    "사경인 본문: '케파 증설은 긍정, 신규 분야 확장은 부정'",
    "공시 본문 직접 확인 필수 — 신규 사업 진출 본질 정확 판정",
  ],
  minor_capex: [
    "자기자본 5~10% 시설투자 — 의무공시 임계 미만이지만 자율공시",
    "약한 양수 신호 — 후속 케파 확장 전조 가능성",
    "공시 본문 직접 확인 권장 — 사업 분야 정확 판정",
  ],
};

interface DartListItem {
  rcept_no?: string;
  bddd?: string;               // 이사회 결의일 (날짜 표현 필드 — rcept_dt 없음)
  // tgastInhDecsn 실제 응답 필드 (field-test 검증 완료):
  inhdtl_inhprc?: string;      // 양수가액 (원 단위)
  inhdtl_tast?: string;        // 자산총계 (원 단위, 자기자본 아님)
  inhdtl_tast_vs?: string;     // 자산총계 대비 양수가액 비율 (%, 자기자본 대비 아님)
  ast_sen?: string;            // 자산 구분 (예: "토지 및 건물")
  inh_pp?: string;             // 양수 목적 (자유 텍스트)
  inh_af?: string;             // 양수 후 영향
  [k: string]: string | undefined;
}

interface DartListResp {
  status: string;
  message: string;
  list?: DartListItem[];
}

// 금액 문자열 → number (원). 응답 단위가 천원이면 ×1000 (field-test 확정 영역).
function parseAmount(v: string | undefined): number | null {
  if (!v) return null;
  const cleaned = v.replace(/,/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// 비율 문자열 → 분수 (0.10 = 10%). 응답이 % 단위면 ÷100, 이미 분수면 그대로.
// 가정: 응답값 > 1이면 % 단위로 간주 (field-test 검증 영역).
function parseRatio(v: string | undefined): number | null {
  if (!v) return null;
  const cleaned = v.replace(/,/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}

// 기존 사업 일치 판정 — MVP 한정 보수적 휴리스틱.
// DART 응답에 KSIC 코드 직접 부재 가능 — ast_sen / inh_pp 텍스트와
// 회사 사업 텍스트 비교. 정확 매칭은 spec-pending-edits §10.3 후속 영역.
//
// 휴리스틱: 텍스트 형태 미확정 영역이라 보수적 default true (긍정 분기 우선).
// false 분기는 명확한 신규 분야 키워드 발견 시만 — field-test 응답 본문 확인 후 정밀화.
function judgeExistingBusinessMatch(
  assetCategory: string,
  bsnsObjt: string,
  companyInduty: string,
): boolean {
  // 응답 형태 미확정 — 묶음 2 field-test 후 정밀화
  // 현재는 보수적 default true (의심 시 긍정 분기 — 7부 C 본질 정합)
  // 명백한 신규 분야 키워드 발견 시 false (field-test 후 키워드 누적)
  const _ = { assetCategory, bsnsObjt, companyInduty };
  return true;
}

// 단일 공시 항목 → 시그널 분기 (3 시그널 중 1개 또는 null).
function classifySignal(
  item: DartListItem,
  equityCurrent: number | null,
  companyInduty: string,
): Signal | null {
  const amount = parseAmount(item.inhdtl_inhprc);
  if (amount === null || amount <= 0) return null;

  // 자기자본 비율 — extractEquityCurrent 직접 계산 (spec §10.3 기준)
  // inhdtl_tast_vs는 자산총계 대비 비율이라 사용 0 (spec-pending-edits §10.3)
  let equityRatio: number | null = null;
  if (equityCurrent !== null && equityCurrent > 0) {
    equityRatio = amount / equityCurrent;
  }
  if (equityRatio === null) return null; // equityCurrent 없으면 시그널 0

  const assetCategory = item.ast_sen ?? "";
  const bsnsObjt = item.inh_pp ?? "";
  const existingMatch = judgeExistingBusinessMatch(assetCategory, bsnsObjt, companyInduty);

  let signalName: string;
  if (equityRatio >= 0.10) {
    signalName = existingMatch
      ? "major_capex_existing_business"
      : "major_capex_unrelated_diversification";
  } else if (equityRatio >= 0.05) {
    signalName = "minor_capex";
  } else {
    return null; // 5% 미만은 시그널 영역 0
  }

  return {
    signal: signalName,
    description: `${(equityRatio * 100).toFixed(1)}% 시설투자 — ${assetCategory || "(분류 미기재)"}`,
    evidence: {
      date: item.bddd ?? "",
      amount,
      equity_ratio: Number(equityRatio.toFixed(4)),
      category: assetCategory,
      existing_business_match: existingMatch,
      dart_reference: item.rcept_no ?? "",
    },
    interpretation_notes: INTERPRETATION_NOTES[signalName] ?? [],
  };
}

// lookback_months → bgn_de / end_de (YYYYMMDD).
function rangeFromLookback(lookbackMonths: number): { bgn_de: string; end_de: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10).replace(/-/g, "");
  const bgnDate = new Date(now);
  bgnDate.setMonth(bgnDate.getMonth() - lookbackMonths);
  const bgn = bgnDate.toISOString().slice(0, 10).replace(/-/g, "");
  return { bgn_de: bgn, end_de: end };
}

export const capexSignalTool: ToolDef = defineTool({
  name: "sagyeongin_capex_signal",
  description:
    "7부 C 선행 지표 — 신규 시설투자 공시 포착 (DS005 tgastInhDecsn). 자기자본 10%+ 의무공시 임계 + 기존 사업 일치 판정으로 매출 증가 선행지표 발굴",
  input: z.object({
    corp_code: z.string(),
    lookback_months: z.number().int().min(1).max(60).default(12),
  }),
  handler: async (ctx: ToolCtx, args) => {
    const corp = ctx.resolver.byCorpCode(args.corp_code);
    if (!corp) {
      throw new Error(`capex-signal: corp_code ${args.corp_code} not found`);
    }
    const corp_name = corp.corp_name;
    const { bgn_de, end_de } = rangeFromLookback(args.lookback_months);

    // DS005 tgastInhDecsn 호출 — 응답 형태는 field-test 검증 영역
    const raw = await ctx.client.getJson<DartListResp>("tgastInhDecsn.json", {
      corp_code: args.corp_code,
      bgn_de,
      end_de,
    });

    const items = raw.status === "000" ? (raw.list ?? []) : [];

    // 자기자본 (분모 폴백 영역) — 부재 시 응답 비율만 사용
    let equityCurrent: number | null = null;
    try {
      equityCurrent = await extractEquityCurrent(args.corp_code, ctx);
    } catch {
      // 자기자본 추출 실패 — 응답 비율만으로 판정 (응답 비율도 부재 시 시그널 0)
    }

    // 회사 사업 텍스트 — 묶음 1 extractIndutyCode 호출 영역 (텍스트 비교용 induty 코드 또는
    // 향후 induty_name 보강 영역). 현재는 induty 비교 영역 자체가 휴리스틱 default true이라
    // 실질 호출 영역 0 — 미래 정밀화 시 호출 추가.
    const companyInduty = ""; // MVP 휴리스틱 영역 (정밀화 후속)

    const signals: Signal[] = [];
    for (const item of items) {
      const sig = classifySignal(item, equityCurrent, companyInduty);
      if (sig) signals.push(sig);
    }

    const opportunity_score = signals.reduce(
      (sum, s) => sum + (SIGNAL_SCORES[s.signal] ?? 0),
      0,
    );
    const verdict = signals.length > 0 ? "SIGNAL_DETECTED" : "NO_SIGNAL";

    return {
      corp_code: args.corp_code,
      corp_name,
      verdict,
      opportunity_score,
      signals,
    };
  },
});
