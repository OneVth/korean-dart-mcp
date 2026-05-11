/**
 * DART 회사 메타데이터 추출기 — 사경인 6단계 capex_signal 영역.
 *
 * spec §10.3 capex_signal의 existing_business_match 판정에 사용.
 *
 * 본 모듈은 2 함수 제공:
 * - extractIndutyCode: company-meta-extractor wrapper. induty_code 추출 + 부재
 *   시 throw. cache 우선 (ADR-0016).
 * - matchInduty: KSIC 매처 (앞 N자리 prefix 일치, 기본 3자리 소분류). 외부 호출 X.
 *
 * 응답 형태 가정 (묶음 2 field-test 검증 영역):
 * - induty_code 필드는 KSIC 5자리 코드 문자열
 * - 부재 시 throw — 호출자가 try/catch로 룰 미트리거 처리
 *
 * Ref: spec §10.3, ADR-0016, philosophy 7부 C, ADR-0001 (격리)
 */

import type { ToolCtx } from "../../_helpers.js";
import { extractCompanyMeta } from "./company-meta-extractor.js";

/**
 * 회사 KSIC 업종 코드 추출 (wrapper for extractCompanyMeta).
 *
 * cache 우선 — company-meta-extractor가 cache hit/miss + DART fetch + cache 저장
 * 모두 처리. 본 wrapper는 induty_code 추출 + 부재 시 throw만 담당.
 *
 * 부재 시 throw — 호출자(묶음 2 capex-signal.ts)가 try/catch로 룰 미트리거 처리.
 */
export async function extractIndutyCode(
  corp_code: string,
  ctx: ToolCtx,
): Promise<string> {
  const meta = await extractCompanyMeta(corp_code, ctx);
  const induty = meta.induty_code;
  if (!induty || !induty.trim()) {
    throw new Error(`induty-extractor: induty_code not found for ${corp_code}`);
  }
  return induty.trim();
}

/**
 * KSIC 업종 코드 prefix 일치 판정 (기본 3자리 — 소분류).
 *
 * 사경인 본문 "케파 증설은 긍정, 신규 분야 확장은 부정"의 코드 본질.
 * 같은 소분류(3자리)면 케파 확장으로 간주, 다르면 신규 분야 확장으로 간주.
 *
 * - prefixLen=3 (기본): 소분류 일치 — 보수적
 * - prefixLen=4: 세분류 일치 — 더 엄격
 * - prefixLen=5: 전체 일치
 *
 * 입력 정규화: 양쪽 trim. 빈 문자열 또는 길이 < prefixLen이면 false.
 *
 * spec §10.3 본문에 자릿수 명시 누락 — spec-pending-edits 누적 영역
 * (본 묶음 commit과 같은 commit 안에서 누적 처리).
 */
export function matchInduty(
  a: string,
  b: string,
  prefixLen: number = 3,
): boolean {
  const normA = (a ?? "").trim();
  const normB = (b ?? "").trim();
  if (!normA || !normB) return false;
  if (normA.length < prefixLen || normB.length < prefixLen) return false;
  return normA.slice(0, prefixLen) === normB.slice(0, prefixLen);
}
