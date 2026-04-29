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

// TODO: non_clean_opinion 케이스 미발견 — 5단계 이후 누적 (ADR-0003 65줄 목표)
// 탐색 경로 시도: KOSDAQ 소형주 + 전문 바이오 + 강제폐지 인접 종목 22개
// 미발견 원인 추정: DART adt_opinion 필드가 "한정의견"/"의견거절" 대신 "적정의견"으로만 응답하는
// 비율이 높음 (의견거절 종목은 이미 DART에서 제거됐을 가능성).

// TODO: frequent_bw_issuance 케이스 미발견 — 5단계 이후 누적
// 탐색 경로 시도: KOSDAQ 바이오/소형주 28개에 bdwtIsDecsn 직접 조회
// 미발견 원인 추정: BW(신주인수권부사채)는 CB 대비 발행 빈도가 낮음.
