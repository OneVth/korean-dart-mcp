// 사경인 도구 field-test의 종목 fixture.
// PASS 케이스(안정적 대형주) + EXCLUDE 케이스(구현 중 발견) 누적.
// 신선도 점검: 분기 watchlist_check 시 fixture 종목도 함께 검증 (ADR-0003 79~85줄).
//
// Ref: ADR-0003

// === PASS 케이스 ===

// 코스피 시가총액 1위 대형주. 향후 5년 내 EXCLUDE 가능성 거의 0.
// killer_check: PASS, srim: 시장 상황별, dividend: A~B 등급 예상
export const SAMSUNG = {
  corp_code: "00126380",
  expected_corp_name: "삼성전자",
};

// 코스피 자동차 대표주. 안정적 대형주.
// killer_check: PASS, srim: 시장 상황별
export const HYUNDAI = {
  corp_code: "00164742",
  expected_corp_name: "현대자동차",
};

// === EXCLUDE 케이스 ===
// (구현 중 발견 시 누적. 4단계 killer-check 영역에서 본격 추가 예정.)
