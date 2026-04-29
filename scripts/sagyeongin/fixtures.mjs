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
// 발견 경로: 훈련 데이터 기반 KOSDAQ 후보 → killer_check 실행 검증 (2026-04-29)
// 각 케이스는 `expected_triggered_rule` 룰이 triggered_rules에 포함되어야 함.

// 헬릭스미스 (코스닥 유전자치료 바이오). 4년 연속 별도재무제표 영업손실 + 매출 30억 미만.
// 발견 경로: 바이오 적자 기업 후보 → killer_check consecutive_operating_loss + low_revenue_kosdaq 트리거 확인
// killer_check 기대: consecutive_operating_loss 룰 트리거 → verdict EXCLUDE
export const CONSECUTIVE_LOSS_SAMPLE = {
  corp_code: "00359395",
  expected_corp_name: "헬릭스미스",
  expected_triggered_rule: "consecutive_operating_loss",
};

// 헬릭스미스 — low_revenue_kosdaq 룰 (동일 회사, 다른 룰 검증)
// 발견 경로: 위와 동일. KOSDAQ + 별도 매출 30억 미만 확인.
// killer_check 기대: low_revenue_kosdaq 룰 트리거 → verdict EXCLUDE
export const LOW_REVENUE_KOSDAQ_SAMPLE = {
  corp_code: "00359395",
  expected_corp_name: "헬릭스미스",
  expected_triggered_rule: "low_revenue_kosdaq",
};

// 한국전자인증 (코스닥 전자인증). 전전기 신한회계법인 → 당기/전기 우리회계법인으로 감사인 변경.
// 발견 경로: auditor_change 후보 탐색 → extractAuditorOpinionSeries 직접 확인
// killer_check 기대: auditor_change 룰 트리거 → verdict EXCLUDE
export const AUDITOR_CHANGE_SAMPLE = {
  corp_code: "00361169",
  expected_corp_name: "한국전자인증",
  expected_triggered_rule: "auditor_change",
};

// 코오롱티슈진 (코스닥 조직공학 바이오). 3년 내 CB 발행 2회 이상.
// 발견 경로: 바이오 CB/BW 빈발 후보 → killer_check frequent_cb_issuance 트리거 확인
// killer_check 기대: frequent_cb_issuance 룰 트리거 → verdict EXCLUDE
export const FREQUENT_CB_SAMPLE = {
  corp_code: "01245062",
  expected_corp_name: "코오롱티슈진",
  expected_triggered_rule: "frequent_cb_issuance",
};

// 코오롱티슈진 — frequent_rights_offering 룰 (동일 회사, 다른 룰 검증)
// 발견 경로: 위와 동일. 3년 내 유상증자 3회 이상 확인.
// killer_check 기대: frequent_rights_offering 룰 트리거 → verdict EXCLUDE
export const FREQUENT_RIGHTS_SAMPLE = {
  corp_code: "01245062",
  expected_corp_name: "코오롱티슈진",
  expected_triggered_rule: "frequent_rights_offering",
};

// 알파AI (코스닥). 당기 감사의견 "의견거절".
// 발견 경로: list.json pblntf_ty=B 3년 CB 빈발 후보 탐색 → extractAuditorOpinionSeries 직접 확인
// killer_check 기대: non_clean_opinion 룰 트리거 → verdict EXCLUDE
export const NON_CLEAN_OPINION_SAMPLE = {
  corp_code: "00220109",
  expected_corp_name: "알파AI",
  expected_triggered_rule: "non_clean_opinion",
};

// 젬백스 (코스닥 바이오). 3년 내 BW(신주인수권부사채) 발행 6회.
// 발견 경로: list.json pblntf_ty=B BW 빈발 후보 탐색 → bdwtIsDecsn 직접 조회 검증
// killer_check 기대: frequent_bw_issuance 룰 트리거 → verdict EXCLUDE
export const FREQUENT_BW_SAMPLE = {
  corp_code: "00492894",
  expected_corp_name: "젬백스",
  expected_triggered_rule: "frequent_bw_issuance",
};
