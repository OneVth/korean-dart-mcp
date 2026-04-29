/**
 * DART 감사 데이터 추출기 — 사경인 도구 공유 _lib.
 *
 * spec §12.2 정신 — upstream get-periodic-report.ts 직접 import 금지 (ADR-0001 격리).
 * ctx.client.getJson으로 accnutAdtorNmNdAdtOpinion.json 직접 호출.
 *
 * 책임:
 * - 회계감사인의 명칭 (adtor) 및 감사의견 (adt_opinion) N년 시계열 추출
 * - 단일 사업보고서 호출이 자동으로 3개 row(당기/전기/전전기) 반환 — spec §10.1 "× 3년" 단일 호출로 해결
 *
 * 단위 정책:
 * - bsns_year: string 그대로 보존 ("당기"/"전기"/"전전기" 또는 연도 — 실제 응답 검증은 묶음 3 field-test)
 * - auditor_name / opinion: string 그대로 (한국어)
 *
 * Ref: spec §10.1 auditor_change + non_clean_opinion, philosophy 7부 A, ADR-0001
 */

import type { ToolCtx } from "../../_helpers.js";

interface AuditItem {
  bsns_year?: string;
  adtor?: string;
  adt_opinion?: string;
  [k: string]: string | undefined;
}

interface AuditResp {
  status: string;
  message: string;
  list?: AuditItem[];
}

// 회계감사인의 명칭 + 감사의견 시계열 (사업보고서 단일 호출).
// DART accnutAdtorNmNdAdtOpinion 엔드포인트가 한 번 호출에 당기/전기/전전기 3 row 반환.
// philosophy 7부 A: "잘 나가던 회사가 갑자기 작은 회계법인으로 감사인 변경 (은폐 시도 의심)"
// + "감사보고서 비적정 의견" → spec §10.1 auditor_change + non_clean_opinion 룰.
//
// 호출자(묶음 3 killer-check.ts) 룰 평가:
// - auditor_change: auditor_name의 unique count >= 2 → 트리거
// - non_clean_opinion: 첫 row(또는 당기) opinion !== "적정" → 트리거
//
// 결손 처리: list 비면 빈 배열. 호출자가 length 검증.
//
// Ref: spec §10.1, philosophy 7부 A
export async function extractAuditorOpinionSeries(
  corp_code: string,
  ctx: ToolCtx,
): Promise<Array<{ bsns_year: string; auditor_name: string; opinion: string }>> {
  const year = new Date().getFullYear() - 1;
  const raw = await ctx.client.getJson<AuditResp>(
    "accnutAdtorNmNdAdtOpinion.json",
    {
      corp_code,
      bsns_year: String(year),
      reprt_code: "11011",
    },
  );
  const items = raw.status === "000" ? (raw.list ?? []) : [];

  return items.map((item) => ({
    bsns_year: item.bsns_year ?? "",
    auditor_name: item.adtor ?? "",
    opinion: item.adt_opinion ?? "",
  }));
}
