// 사경인 도구 field-test의 종목 fixture.
// PASS 케이스(안정적 대형주) + EXCLUDE 케이스(구현 중 발견) 누적.
// 신선도 점검: 분기 watchlist_check 시 fixture 종목도 함께 검증 (ADR-0003 79~85줄).
//
// === EXCLUDE / SIGNAL / GRADE 의미 layer (단계별 구분) ===
// 4단계 EXCLUDE = killer_check 회피 대상 (verdict EXCLUDE → 분석 영역 차단).
//   - 키: expected_triggered_rule (단일 룰 검증)
//   - 7부 A 본질 — 상장폐지/관리종목 회피 결정 자체
// 5단계 EXCLUDE = cashflow_check 검토 대상 (verdict REVIEW_REQUIRED → 사용자가
//   investigation_hints 따라 주석/맥락 확인).
//   - 키: expected_flag + expected_severity (다층 검증)
//   - 7부 B 본질 — 도구는 raw 트리거 + severity만, 분식/보수/사업 건강성 판정은 사람
// 6단계 SIGNAL = capex_signal 기회 포착 (SIGNAL_DETECTED).
//   - 키: expected_verdict + expected_lookback_months
//   - 7부 C 본질 — 긍정 발굴 layer (4·5단계 회피/검토와 의미 분리)
// 7단계 GRADE = dividend_check 지속 가능성 분류 (A/B/C/D/N/A).
//   - 키: expected_grade (단일 등급 검증)
//   - 7부 E 본질 — 배당주 지속성 (연속 스펙트럼, binary verdict 아님)
// 모두 *_SAMPLE 명명 통일 — field-test가 키 분기로 자연 분리.
//
// Ref: ADR-0003

// === PASS 케이스 ===

// 코스피 시가총액 1위 대형주. 향후 5년 내 EXCLUDE 가능성 거의 0.
// killer_check: PASS, cashflow_check: CLEAN, srim: 시장 상황별, dividend: A~B 등급 예상
export const SAMSUNG = {
  corp_code: "00126380",
  expected_corp_name: "삼성전자",
};

// 코스피 자동차 대표주. 안정적 대형주.
// killer_check: PASS (공시 이상 없음)
// cashflow_check: REVIEW_REQUIRED — oi_cf_divergence + negative_ocf_persistent 트리거 (2026-04-30 확인)
// 주의: cashflow_check CLEAN 케이스로 사용 불가 — OI_CF_DIVERGENCE_SAMPLE 참조
export const HYUNDAI = {
  corp_code: "00164742",
  expected_corp_name: "현대자동차",
};

// === 4단계 EXCLUDE 케이스 (killer_check 회피 대상) ===
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

// === 5단계 EXCLUDE 케이스 (cashflow_check 검토 대상) ===
// 발견 경로: 4단계 EXCLUDE 종목 + 대형주 5단계 도구 직접 호출 (2026-04-30)
// 각 케이스는 `expected_flag` 룰이 flags에 포함 + `expected_severity` 정합이어야 함.
// verdict: REVIEW_REQUIRED (검토 진입 결정, 회피 결정 아님 — 7부 B 본질)

// 헬릭스미스 (코스닥 유전자치료 바이오). 영업CF 3년 연속 음수.
// 발견 경로: 4단계 EXCLUDE 종목 5단계 도구 직접 호출 → negative_ocf_persistent 트리거 확인
// cashflow_check 기대: negative_ocf_persistent flag (severity=high) → verdict REVIEW_REQUIRED
export const NEGATIVE_OCF_PERSISTENT_SAMPLE = {
  corp_code: "00359395",
  expected_corp_name: "헬릭스미스",
  expected_flag: "negative_ocf_persistent",
  expected_severity: "high",
};

// 코오롱티슈진 (코스닥 조직공학 바이오). 영업CF 음수 + 투자CF 자산총계 10%+ 활발.
// 발견 경로: 4단계 EXCLUDE 종목 5단계 도구 직접 호출 → negative_ocf_with_active_icf 트리거 확인
// cashflow_check 기대: negative_ocf_with_active_icf flag (severity=medium) → verdict REVIEW_REQUIRED
export const NEGATIVE_OCF_ACTIVE_ICF_SAMPLE = {
  corp_code: "01245062",
  expected_corp_name: "코오롱티슈진",
  expected_flag: "negative_ocf_with_active_icf",
  expected_severity: "medium",
};

// 알파AI (코스닥). 영업−/투자+/재무+ 패턴 — 6부 건전 패턴 역상.
// 발견 경로: 4단계 EXCLUDE 종목 5단계 도구 직접 호출 → cf_pattern_risky 트리거 확인
// cashflow_check 기대: cf_pattern_risky flag (severity=medium) → verdict REVIEW_REQUIRED
export const CF_PATTERN_RISKY_SAMPLE = {
  corp_code: "00220109",
  expected_corp_name: "알파AI",
  expected_flag: "cf_pattern_risky",
  expected_severity: "medium",
};

// 현대자동차 (코스피). 영업이익 양수 vs 영업CF 음수 2회+ 어긋남.
// 발견 경로: PASS 케이스 5단계 도구 호출 → oi_cf_divergence 트리거 (예상 외 — 운전자본 변동)
// 주의: killer_check PASS이지만 cashflow_check REVIEW_REQUIRED — 두 도구 의미 layer 분리
// cashflow_check 기대: oi_cf_divergence flag (severity=high) → verdict REVIEW_REQUIRED
export const OI_CF_DIVERGENCE_SAMPLE = {
  corp_code: "00164742",
  expected_corp_name: "현대자동차",
  expected_flag: "oi_cf_divergence",
  expected_severity: "high",
};

// === 6단계 SIGNAL 케이스 (capex_signal 기회 포착) ===
// 7부 C 본질 — 긍정 발굴 layer (4단계 EXCLUDE 회피 / 5단계 EXCLUDE 검토와 의미 분리)
// 키 패턴: expected_verdict + expected_signal_min (시그널 1개+ 발견 검증)
// SIGNAL_DETECTED 케이스: 코스닥 중소 제조업 — tgastInhDecsn 주 영역 (대형사 공시 0)

// 하나기술 (코스닥 이차전지 장비 제조업) — 2차전지 생산시설 증설 (기존 사업 케파 증설)
// 사경인 본문 "케파 증설 = 매출 증가 선행지표" 전형 케이스 (spec §10.3 major_capex_existing_business)
// 발견 경로: 6단계 field-test 중 tgastInhDecsn 공시 종목 탐색 (2026-05-01)
// 자산총계 대비 26.17% — 자기자본 대비 비율은 extractEquityCurrent 직접 계산
export const CAPEX_SIGNAL_SAMPLE_LARGE_MFG = {
  corp_code: "00601191",
  expected_corp_name: "하나기술",
  expected_verdict: "SIGNAL_DETECTED",
  expected_lookback_months: 60,
};

// NO_SIGNAL 케이스 — 시설투자 적은 서비스/금융업
// 헬릭스미스 (4단계 EXCLUDE 케이스 재활용 — 시설투자 부재 종목)
export const CAPEX_NO_SIGNAL_SAMPLE = {
  corp_code: "00359395",
  expected_corp_name: "헬릭스미스",
  expected_verdict: "NO_SIGNAL",
  expected_lookback_months: 12,
};

// === 7단계 GRADE 케이스 (dividend_check 지속 가능성 분류) ===
// 7부 E 본질 — 배당 지속 가능성 5등급 (A/B/C/D/N/A).
// 키 패턴: expected_grade (단일 등급 검증)
// 5등급 모두 발견 시도 — 실측 불일치 시 등급 조정 + 주석 보완 (6단계 패턴 정합)
// 발견 경로: 7단계 묶음 2 field-test (2026-05-02)

// KB금융지주 (코스피 금융지주). 안정 배당주 — 5년+ 연속 + 성향 20~40% + 변동성 낮음.
// 초기 후보는 케이티앤지였으나 실측 성향 57.7% → C 등급 — KB금융으로 교체 (2026-05-02)
// KB금융 실측: avg_payout=0.256, stddev=0.013, years_div=5, cut=false → A 등급 확인
// dividend_check 기대: A 등급
export const DIVIDEND_GRADE_A_SAMPLE = {
  corp_code: "00688996",
  expected_corp_name: "KB금융",
  expected_grade: "A",
};

// 삼성전자 (코스피 시가총액 1위). 기존 SAMSUNG fixture 재활용.
// 실측: avg_payout=0.317, stddev=0.162, years_div=5, cut=false → B 등급 확인 (2026-05-02)
// stddev 0.162 > PAYOUT_STDDEV_LOW(0.10) → A 진입 불가, 성향 20~50% 내 B 분기
// killer_check PASS + cashflow_check CLEAN + dividend B 등급
// dividend_check 기대: B 등급
export const DIVIDEND_GRADE_B_SAMPLE = {
  corp_code: "00126380",
  expected_corp_name: "삼성전자",
  expected_grade: "B",
};

// 케이티앤지 (코스피 담배/인삼). 성향 높은 안정 배당주.
// 초기 A 등급 가설이었으나 실측 avg_payout=0.577 (50~70% 범위) → C 등급 확인 (2026-05-02)
// years_div=5, stddev=0.044 (낮음), recent_cut=false — C 분기(성향 50~70%)
// dividend_check 기대: C 등급
export const DIVIDEND_GRADE_C_SAMPLE = {
  corp_code: "00244455",
  expected_corp_name: "케이티앤지",
  expected_grade: "C",
};

// POSCO홀딩스 (코스피 철강). 순환주 — recent_cut=true 발견 (2026-05-02).
// 초기 C 등급 가설이었으나 recent_cut 트리거 → D 등급 확인 (D 우선 판정)
// 실측: avg_payout=0.629, stddev=0.485, years_div=5, cut=true → D
// 7부 E "이익 소폭 감소에도 배당 급감" 전형 케이스 (순환주 실증)
// dividend_check 기대: D 등급
export const DIVIDEND_GRADE_D_SAMPLE = {
  corp_code: "00155319",
  expected_corp_name: "POSCO홀딩스",
  expected_grade: "D",
};

// 카카오 (코스피 IT/플랫폼). 성장주 — 배당 이력 극소.
// 실측: avg_payout=0.034, years_div=5, 적자 연도 2개 → N/A 등급 확인 (2026-05-02)
// 적자 연도 비중 높아 payoutRatios 누적 극소 + A/B/C/D 어느 등급도 미충족
// dividend_check 기대: N/A 등급
export const DIVIDEND_GRADE_NA_SAMPLE = {
  corp_code: "00258801",
  expected_corp_name: "카카오",
  expected_grade: "N/A",
};
