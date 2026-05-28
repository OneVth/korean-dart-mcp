/**
 * scan_execute 업종 필터 병합 — 사경인 11단계 stage1 영역 (7부 A 즉시 솎아내기).
 *
 * resolveInput에서 preset의 included/excluded_industries와 user_preference의
 * induty_whitelist / induty_blacklist를 병합. 비대칭 전략:
 * - excluded (blacklist) = union: 제외 범위 확대 = 솎아내기 강화 (7부 A 정합)
 * - included (whitelist) = override: prefList 있으면 우선, 없으면 preset 유지
 *   (intersection은 공집합 = 전부 탈락 위험으로 배제)
 *
 * pure 함수 — I/O 0, 외부 의존 0. 입력 induty_code는 비어있지 않은 문자열 가정
 * (user-preference-store addInduty가 빈 코드 거부).
 *
 * 빈 결과는 undefined 반환 — isIndustryMatch "전부 통과" 의미 정합.
 *
 * Ref: spec §10.x (scan_execute input), philosophy 7부 A, ADR-0001 (격리)
 */

export function mergeIndustries(
  presetList: string[] | undefined,
  prefList: string[],
  strategy: "union" | "override",
): string[] | undefined {
  if (strategy === "union") {
    const merged = [...new Set([...(presetList ?? []), ...prefList])];
    return merged.length > 0 ? merged : undefined;
  }
  // override — whitelist 우선
  return prefList.length > 0 ? prefList : presetList;
}
