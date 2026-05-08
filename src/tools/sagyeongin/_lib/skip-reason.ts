/**
 * Stage 1~3 도구 호출 실패에서 분류 키(reason_code) 추출.
 *
 * scan-execute의 stage1/stage2/stage3 catch 블록에서 호출 — DART API status 응답
 * 또는 네트워크/파싱 오류 분기.
 *
 * 본 함수는 **호출 실패만** 분류. verdict-기반 skip(killer EXCLUDE, srim verdict null)은
 * reason 자체에 명확 — 호출 영역 0.
 *
 * 분류 키 (corp_code 덤프 stale 진단 + 도구 처리 차원):
 *   - status_013: 조회 데이터 없음 — corp_code 덤프 stale 또는 폐지 회사 잔존 가설
 *   - status_014: 파일 없음 — 보고기간 부재
 *   - status_other: 기타 DART 응답 오류 (010/011/012/100/...)
 *   - corp_not_found: corp_code SQLite 부재 (resolveCorp throw)
 *   - network_error: HTTP/네트워크/timeout
 *   - parse_error: JSON 파싱
 *   - data_incomplete: financial-extractor 5종 throw — equity/shares/revenue/total_assets 부재
 *   - unknown: 분류 미일치
 *
 * Ref: spec §10.13 (예정), philosophy 7부 A
 */
export function classifySkipReason(error: Error): string {
  const msg = error.message;

  // DART API status 코드 — `[<status>]` 형식 (extractCompanyMeta + 도구 catch 메시지)
  const m = msg.match(/\[(\d{3})\]/);
  if (m) {
    const code = m[1];
    if (code === "013") return "status_013";
    if (code === "014") return "status_014";
    return "status_other";
  }

  // resolveCorp throw 메시지 일치 (`_helpers.ts`의 `회사를 찾을 수 없습니다` 패턴)
  if (/회사를 찾을 수 없습니다/.test(msg)) return "corp_not_found";

  // 네트워크/timeout 분류
  if (/timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED|fetch failed|network/i.test(msg)) {
    return "network_error";
  }

  // JSON 파싱 분류
  if (/JSON|Unexpected token|parse/i.test(msg)) return "parse_error";

  // 도구 처리 차원 — financial-extractor 5종 throw (equity/shares/revenue/total_assets)
  if (/financial-extractor:/i.test(msg)) return "data_incomplete";

  return "unknown";
}
