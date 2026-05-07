# Spec Pending Edits

이 파일은 `sagyeongin-dart-agent-spec.md`의 표현 정정, 오타, 예시 갱신 같은 비-의미 변경을 누적하는 곳이다. 의미 변경은 즉시 spec 갱신 + ADR 작성한다 (ADR-0004의 강도별 분기 참조).

## 운영 규칙

### 누적 대상 (이 파일에 추가)

- 표현 정정 (모호한 문장의 명확화)
- 오타, 띄어쓰기, 조사 수정
- 예시 갱신 (책 예시값을 더 최신 데이터로 등)
- 매핑 표(§4)의 표현 정정
- 부정확한 표현 정정 (의미 그대로지만 정확하지 않은 표현)

### 누적 대상 아님 (즉시 spec 갱신 + ADR)

- 새 도구 추가 / 도구 삭제
- 도구 input/output 스키마 변경
- 공식 / 임계값 / 룰 정의 변경
- 명시적 비목표(§11) 추가
- 의존성 표(§11.3) 추가

### 항목 형식

각 항목은 다음 형식으로 추가:

```
## [§N.N] 짧은 제목

**현재**: (현재 표현 인용)
**정정**: (정정할 표현)
**근거**: (왜 정정 필요한가, 발견 시점/맥락)
**상태**: pending / applied (vN.N에서)
```

### 일괄 반영 시점

마일스톤 시 (보통 spec patch bump v0.X.Y → v0.X.Y+1).

반영 절차:
1. 이 파일의 모든 `pending` 항목을 spec 본문에 반영
2. 각 항목 상태를 `applied (vN.N에서)`로 업데이트
3. spec 헤더의 수정 이력에 한 줄 추가:
   ```
   - vN.N (YYYY-MM-DD): 표현 정정 N건 일괄 반영 (spec-pending-edits.md 참조)
   ```
4. 커밋 1개로: `docs(spec): vN.N — 표현 정정 N건 일괄`

응용한 항목은 이 파일에서 삭제하지 않고 `applied` 상태로 보존 — 변경 이력 추적 가능하도록.

## Pending 항목

### [§4] 매핑 표의 "재사용 + 래퍼" 표현 — 흡수 완료 (ADR-0011, v0.6)

**현재**: §4 매핑 표에 `insider_signal`이 `재사용 + 래퍼`로 분류되어 있음.

**정정**: ADR-0011 반영으로 §4 line 109가 재작성됨 — 본 항목은 자체 폐기. 새 본문은 "C: 내부자 매수 시그널 | 완전 자동 (majorstock 5%+ stkqy_irds 부호) | `sagyeongin_insider_signal` (신규)". upstream `insider_signal`은 재사용 + 수정 0 (§5.3 정합).

**상태**: 흡수 완료 (v0.6)

### [§10.4] avg_roe / K 단위 표기 불일치

**현재**: §10.4 564줄 `inputs.avg_roe` 단위 표기 `'%'`, §10.5 620줄 `output.value` 단위 표기 분수 (예: 0.0742).

**정정**: spec 본문 전체에서 분수로 통일. 비율은 모두 소수 분수(0.20 = 20%) 표기.

**근거**: 3단계 srim-calc 인터페이스 설계 중 발견 (2026-04-28). 모듈 내부는 G1 결정에 따라 모두 분수 통일. 마일스톤 시 spec 본문 표기 통일 필요.

**상태**: pending

### [§10.5] 607줄 메뉴 경로 탭 선택 정보 누락

**현재**: §10.5 607줄 메뉴 경로 명시("한국신용평가 → 신용등급 → 등급통계 → 등급별금리스프레드 → BBB- 등급 5년 채권 수익률")에 탭 선택 정보 누락.

**정정**: 실제 페이지에 "수익률"/"스프레드" 두 탭이 있고 채권 수익률 값은 "수익률" 탭에서 확인. 메뉴 경로에 탭 선택 정보 보강 필요.

**근거**: 3단계 묶음 2 (2026-04-28) 사용자 페이지 확인 중 발견. 실제 스크래핑 URL은 statics_spread.do 페이지 안의 수익률 탭 영역. 의미 변경 아닌 표현 정정(ADR-0006 강도 분기).

**상태**: pending

### [§10.4] verdict 타입에 null 추가

**현재**: §10.4 574줄 verdict 타입 `"BUY" | "BUY_FAIR" | "HOLD" | "SELL"`은 current_price 가용 시 정의.

**정정**: §11.3 946줄 "current_price: null + verdict 계산 불가" 케이스 명시 시 verdict도 null. 통합 표현 보강 — verdict 타입에 null 추가:
`"BUY" | "BUY_FAIR" | "HOLD" | "SELL" | null`

**근거**: 3단계 묶음 3 srim 도구 구현 중 발견. naver 실패 또는 stock_code 부재 시 verdict 계산 불가, null 자연 표현.

**상태**: pending

### [§11.3] 네이버 실패 정의 보강 — stock_code 부재 케이스

**현재**: §11.3 946줄 "네이버 금융 / 현재가 크롤링 / sagyeongin_srim 내부 / 실패 시 srim 결과에서 current_price: null + verdict 계산 불가 표시" — "실패"가 네이버 호출 실패만 명시.

**정정**: "실패" 정의에 두 케이스 모두 포함:
- 네이버 호출 실패 (HTTP/네트워크/페이지 구조 변경)
- stock_code 자체 부재 (비상장 / DART 등록 중 미발급) — naver 호출 자체 스킵

**근거**: 3단계 묶음 3 srim.ts 구현 중 발견. CorpRecord.stock_code는 옵셔널 필드라 부재 가능. 두 케이스 모두 동일 처리(current_price: null + verdict: null + note에 price_source=null 사유) 명시 필요.

**상태**: pending

### [§10.4] ROE < K 케이스 가격 순서 역전 영역

**현재**: §10.4 공식과 verdict 분기가 정상 케이스(ROE > K, 가격 순서 buy < fair < sell) 가정.

**정정**: ROE < K(자본 비용 못 만회) 케이스에서 가격 순서 역전(sell < fair < buy) 발생. 수학적으로 정상이지만 verdict 분기 의미 모호 — 현재가 ≤ buy_price 검사가 자동 BUY 분기로 빠질 위험. 보강 방향:
- note에 `roe_lt_k=true` 신호 추가 (사용자 인지)
- 또는 verdict 분기 자체에 ROE<K 케이스 별도 처리 (사경인 본질상 해당 회사 SELL 영역)
- field-test sanity에서도 가격 순서 검증 영역 정의

**근거**: 3단계 묶음 3 field-test 중 삼성전자 2023년 데이터(avg_ROE 8.75% < K 10.36%)에서 발생. 위임자가 sanity를 prices > 0으로 완화 처리.

**상태**: pending

### [§10.1] 데이터 소스 표의 corporate_event 키 명칭 불일치

**현재**: §10.1 데이터 소스 컬럼이 `get_corporate_event(event_type="convertible_bond")` 형태로 표기.

**정정**: upstream `src/tools/get-corporate-event.ts` 실제 키와 일치시킴 —
`cb_issuance` / `bw_issuance` / `rights_offering`. 또는 DART 엔드포인트 직접 표기
(`cvbdIsDecsn` / `bdwtIsDecsn` / `piicDecsn`).

**근거**: 4단계 묶음 3 killer-check.ts 구현 중 발견 (2026-04-29). 의미 변경 0, 표현 정정.

**상태**: pending

### [§10.1] non_clean_opinion 룰의 비교 기준 불명확

**현재**: spec §10.1이 감사의견 비교 기준을 "적정" 으로 표기.

**정정**: DART `accnutAdtorNmNdAdtOpinion.json` 엔드포인트의 `adt_opinion` 실제 반환값은
`"적정의견"` (suffix 포함). 정확 비교 대신 `startsWith("적정")` 패턴 사용. 또한 다수 종목이
연결/별도 구분으로 2 row를 반환하며, 별도 row 중 `"-"` 플레이스홀더가 포함될 수 있음.
spec §10.1에 실제 필드 값 표기 보완 필요.

**근거**: 4단계 묶음 3 field-test 중 발견 (2026-04-29). killer-check.ts 구현 버그 수정으로 연결.

**상태**: pending

---

## 5단계 묶음 1·2 pending 항목 (spec §10.2)

### [§10.2] negative_ocf_with_active_icf 자산총계 비교 시점 명시 누락

**현재**: spec §10.2 negative_ocf_with_active_icf 룰 본문이 "자산총계 10%+" 비교를
명시하나 자산총계의 어느 연도인지 명시 0.

**정정**: 비교 시점을 "분석 윈도 가장 최근 연도(endYear)"로 명시. 룰의 본질이
"현재 자산 규모 대비 투자 강도"이고 시간축 비교 의미 약함 정합.

**근거**: 5단계 묶음 1 financial-extractor 확장 중 발견 (2026-04-29). 의미 변경 0,
표현 정정 영역.

**상태**: pending

---

### [§10.2] 룰 fs_div 정책 명시 0

**현재**: spec §10.2 4 룰 본문에 fs_div 정책 명시 없음.

**정정**: 4 룰 모두 "CFS 우선 → OFS 폴백" 명시 (그룹 전체 사실 영역, 7부 B 본질 정합).
oi_cf_divergence의 영업이익은 extractOperatingIncomeSeries(..., "CFS_FIRST") 호출,
영업/투자/재무 CF는 extractCashflowSeries (CFS 우선 → OFS 폴백). 자산총계는
extractTotalAssets (CFS 우선 → OFS 폴백). 7부 A killer_check의 OFS 강제와
본질 분리.

**근거**: 5단계 묶음 1·2 fs_div 정책 합의 (Q2 답안 정합). 명시 누락이
미래 단계에서 본질 어긋남 가능성.

**상태**: pending

---

### [§10.2] 현금흐름표 엔드포인트 + account_nm 실측값

**현재**: spec §10.2 룰 본문이 영업CF/투자CF/재무CF 추출의 엔드포인트 및 정확한
account_nm 명시 없음. 묶음 1 financial-extractor.ts 후보 리스트는 "가정"으로 명시.

**정정 — 엔드포인트**: fnlttSinglAcnt.json(주요계정, BS+IS만 반환)이 아닌
fnlttSinglAcntAll.json(전체 재무) 필수. CF 항목(sj_div="CF")은 fs_div 미설정 —
CFS/OFS 구분은 API fs_div 파라미터로 처리.

**정정 — account_nm 실측값** (5단계 묶음 2 field-test 확정, 2026-04-30):
- 영업CF: "영업활동현금흐름" (삼성전자, 젬백스), "영업활동으로 인한 순현금흐름" (헬릭스미스),
  "영업활동으로 인한 현금흐름" (현대자동차)
- 투자CF: "투자활동현금흐름" (삼성전자), "투자활동으로 인한 순현금흐름" (헬릭스미스),
  "투자활동으로 인한 현금흐름" (현대자동차)
- 재무CF: "재무활동현금흐름" (삼성전자), "재무활동으로인한 순현금흐름" (헬릭스미스),
  "재무활동으로 인한 현금흐름" (현대자동차)
- 로마자 접두어 변형 (Ⅰ./Ⅱ./Ⅲ.) 종목 존재 (코오롱티슈진 OFS) — 현재 미지원

**근거**: 5단계 묶음 2 field-test 결과 (2026-04-30). 묶음 1 가정 어긋남 발견 →
즉시 코드 정정 포함 (4단계 묶음 3 패턴 정합).

**상태**: pending (로마자 접두어 변형 미지원 TODO 포함)

---

### [§10.2] concern_score 0-100 cap 명시

**현재**: spec §10.2 output에 concern_score 0-100 명시. 4 룰 점수 표 합산 시
40+30+20+15 = 105로 100 초과 가능.

**정정**: concern_score 계산 영역에 "Math.min(룰 점수 합, 100) cap" 명시.
또는 룰 점수 조정 (40+30+20+15 → 35+30+20+15 등 100 합산 정합).

**근거**: 5단계 묶음 2 cashflow-check.ts 구현 중 발견 (2026-04-30). 의미 변경
없음 (cap이 본질 변경 0), 표현 정정.

**상태**: pending

---

### [§10.2] oi_cf_divergence "2년 이상" 합산 vs 연속 명시

**현재**: spec §10.2 oi_cf_divergence 룰 본문이 "영업이익(+) + 영업CF(−) — 2년 이상"
명시. "2년 이상"이 합산 vs 연속 명시 없음.

**정정**: 합산 2회+ 명시 (분석 윈도 안에서 어긋남 발생 횟수 합산). 7부 B "이익이
진짜인가" 검증 — 한 해 어긋남이 운전자본 사이클이면 다음 해 정합, 그 다음 해
어긋남이면 사이클 아닌 신호 본질 정합.

**근거**: 5단계 묶음 2 cashflow-check.ts 구현 중 결정 (2026-04-30). 합산이
spec 표현 직역 정합.

**상태**: pending

---

### [§10.2] investigation_hints 도구 본체 명시

**현재**: spec §10.2가 oi_cf_divergence의 investigation_hints만 예시 3 항목 명시
(매출채권 변동 / 재고자산 변동 / 고객 집중도). 다른 3 룰의 hints는 본문 없음.

**정정**: investigation_hints는 도구 본체(cashflow-check.ts INVESTIGATION_HINTS
객체)에 4 룰 모두 정의. spec §10.2 본문에는 "investigation_hints는 도구 본체
정의" 명시 + oi_cf_divergence 예시는 도구 본체로 이동 (또는 spec 유지하되 "예시"
명시 보강). 7부 B "도구는 사전 판정 안 함" 본질 정합 — hints는 도구 산출 영역,
spec 룰 정의 영역 분리.

**근거**: 5단계 묶음 2 investigation_hints 정의 합의 (2026-04-30).

**상태**: pending

---

## 6단계 묶음 1 pending 항목 (spec §10.3)

### [§10.3] KSIC 매처 자릿수 명시 누락

**현재**: spec §10.3 534줄 "KSIC 업종 코드 비교로 자동화" — KSIC 5자리 표준에서
어느 자릿수까지 prefix 비교하는지 명시 0.

**정정**: 자릿수 명시 영역 추가:
- 기본 3자리 (소분류) prefix 일치 — `matchInduty(a, b, 3)`
- 사경인 본문 "케파 증설은 긍정, 신규 분야 확장은 부정"의 자연 해석
- 사용자 옵션으로 `prefixLen` 조정 가능 (4=세분류 / 5=전체 일치)

**근거**: 6단계 묶음 1 induty-extractor 구현 시 결정 (2026-05-01). 사용자 합의로
3자리(소분류) 기본 채택. 의미 변경 0, 룰 정의의 명시 보강.

**상태**: pending

---

## 6단계 묶음 2 pending 항목

### [§10.3] 사업분야 KSIC 매처 정밀화 영역 (MVP 한정 보수적 분기)

**현재**: spec §10.3 "KSIC 업종 코드 비교"는 `existing_business_match` 판정의
정확 알고리즘 명시.

**정정 (MVP 한정 분기 영역)**: DART tgastInhDecsn 응답에 사업분야 KSIC 코드 직접
부재 가능. MVP는 보수적 default true 휴리스틱 (의심 시 긍정 분기) 적용. 응답 형태
확정 후 정밀화 영역:
- 자산 카테고리 텍스트 + 회사 사업 텍스트 비교 휴리스틱 (현재 미구현)
- 또는 induty_code(KSIC 5자리) prefix 매처 적용 (induty-extractor.matchInduty 호출)
- 명백한 신규 분야 키워드 발견 시 false 분기 (키워드 누적 영역)

**근거**: 6단계 묶음 2 capex-signal 구현 시 결정 (2026-05-01). field-test 응답 본문
확인 후 사업분야 텍스트 형태 발견 시 정밀화. 의미 변경 0, 룰 알고리즘의 명시 보강.

**상태**: pending

---

### [§10.3] DS005 tgastInhDecsn 응답 필드명 정정

**현재**: spec §10.3 본문은 응답 필드명 명시 0 (구현 영역).

**정정 (필드명 매핑 발견)**:
- 양수가액: `inhdtl_inhprc`
- 자산구분: `ast_sen` ("토지 및 건물" 등)
- 양수목적: `inh_pp`
- 이사회 결의일: `bddd`
- 자기자본 대비 비율 직접 제공 부재 — `extractEquityCurrent()` 직접 계산
- `inhdtl_tast_vs`는 자산총계 대비 비율 (자기자본 아님 — 사용 0)

**근거**: 6단계 묶음 2 field-test 발견 (2026-05-01). 의미 변경 0, 구현 영역 명시.

**상태**: pending

---

### [§10.3] tgastInhDecsn 공시 종목 영역 — 코스닥 중소 제조업 편중 발견

**현재**: spec §10.3 데이터 소스 "DS005 tgastInhDecsn (유형자산 양수 결정)" — 공시
종목 영역 명시 0.

**정정 (영역 본질 발견)**:
- 대형 제조업(삼성전자 등) tgastInhDecsn 공시 영역 0 (60개월 lookback)
- 코스닥 중소 제조업이 주 영역 (하나기술/세동/극동유화 등 발견)
- 사상 본문 "DART 상세검색에서 '신규시설투자'만 필터" vs spec §10.3 "유형자산 양수
  결정" 집합 관계 — 실제로는 분리된 영역 가능 (대형사는 별도 양식 사용 가정)

**근거**: 6단계 묶음 2 field-test 발견 (2026-05-01). MVP는 tgastInhDecsn 그대로 유지
(spec §10.3 본문 영역 보존). 사상↔spec 분기 영역은 다음 마일스톤 검토 영역.

**상태**: pending

---

## 7단계 묶음 2 pending 항목 (spec §10.6)

### [§10.6] payout_stddev 임계값 명시 누락

spec §10.6 등급 표에 "변동성 낮음" / "변동성 높음" 정량 임계 0. 7단계 채택 default:

- PAYOUT_STDDEV_LOW = 0.10 (변동성 낮음 임계 — A 등급 진입)
- PAYOUT_STDDEV_HIGH = 0.20 (변동성 높음 임계 — C 등급 진입)
- 회색 영역 (0.10 ~ 0.20): A·C 모두 진입 0 — 등급 본질 약함

근거: 사경인 본문 "20~30% 성향 + 이익 소폭 감소에도 배당 급감 위험" — ± 10%p 진폭은
안정 영역 자연, ± 20%p+ 진폭은 사상 "급감 위험" 영역 진입.

발견: 7단계 묶음 2 (2026-05-02)
처리 영역: 다음 마일스톤(v0.X minor bump) 시점 spec 본문 표 직접 명시 검토.

### [§10.6] 등급 분류 우선순위 + N/A fallback 명시 누락

spec §10.6 등급 표가 우선순위 없이 병렬 나열 — 겹치는 케이스 처리 미명시.
7단계 채택 우선순위: D 최우선 → A → B → C → N/A fallback.

N/A 두 분기:
1. 배당 이력 0 (dividend.total 빈 배열): 조기 N/A — alotMatter 응답 부재 또는 무배당 종목
2. 등급 표 미명시 영역 fallback: A·B·C·D 어느 것도 부합 0 (years < 5 또는 등급 본질 약함)
   예: years_of_dividend = 4 + avg_payout = 0.30 + payout_stddev = 0.05 + recent_cut = false

발견: 7단계 묶음 2 (2026-05-02)
처리 영역: 다음 마일스톤 spec 표에 우선순위 + N/A fallback 영역 명시.

### [§10.6] B등급 "삭감 1회 이내" 조건 단순화

spec §10.6 B등급 조건 "5년 연속 + 성향 20~50% + 삭감 1회 이내".
B등급 "삭감 1회 이내" 본질은 series 안 다년치 검증 (연도별 cut 카운트).

MVP 단순화: recent_cut=false만 검증 (D 등급에서 이미 걸러짐, B 등급 진입 시 recent_cut false 자연).

차이 영역: 5년 안 cut 2회+ 발생했지만 가장 최근 cut 0 종목 → MVP에서 B 진입 가능
(실제 spec "1회 이내" 위반). 5년 안 cut 정확히 1회 → MVP와 spec 정합.

발견: 7단계 묶음 2 (2026-05-02)
처리 영역: 다음 마일스톤 — 다년치 cut 카운트 구현 또는 spec 단순화 명시 검토.

### [§10.6] alotMatter.json 응답 형태 정정 — lwfr 필드 발견

spec §10.6 데이터 소스 "alotMatter.json" — 응답 row 3기간 필드명 가정 영역.

묶음 1 `extractDividendSeries` 가정: `bfefrmtrm` (전전기). 실제 응답 확인 결과:
```
{"se":"현금배당금총액(백만원)","thstrm":"588,448","frmtrm":"590,777","lwfr":"581,400",...}
```
3기간 필드명: `thstrm` (당기) / `frmtrm` (전기) / `lwfr` (전전기).
`bfefrmtrm`는 alotMatter 응답에 부재 (fnlttSinglAcntAll.json BS/IS 응답 필드와 혼용 오류).

정정: `AlotRow` interface + `pickAlotValue` period 타입 + `extractDividendSeries` periods 배열
`"bfefrmtrm"` → `"lwfr"` (묶음 2 commit 3, 16cf4ba).

정정 전 증상: years_of_dividend=2 (전전기 데이터 0 → 2년치만 추출).
정정 후 확인: 삼성전자 years_div=5, KB금융 years_div=5 (5년 추출 정상).

발견: 7단계 묶음 2 field-test (2026-05-02) — 5·6단계 패턴 정합 (묶음 1 가정이 묶음 2 field-test에서 정정).
처리: 이미 코드 정정 완료. spec §10.6 데이터 소스 표현에 "lwfr 필드" 명시 검토.

---

## 8단계 pending 항목 (spec §10.7)

### [§10.7] estimated_api_calls default 가정값 명시 누락

spec §10.7 본문 stage2~4_5_6 호출 영역의 분기 가정 미명시. 8단계 채택 default:

- KILLER_PASS_RATE_DEFAULT = 0.8 (spec §7.1 1200/1500 정합)
- SRIM_PASS_RATE_DEFAULT = 0.33 (spec §7.1 "200~400 추정" high end — MVP 보수적 over-estimate 본질)
- STAGE1_CALLS_PER_COMPANY = 1 (company.json 단일 호출)
- STAGE2_CALLS_PER_COMPANY = 3 (killer-check 호출 영역)
- STAGE3_CALLS_PER_COMPANY = 4 (srim 호출 영역 — 3 financial-extractor + naver-price)
- STAGE4_5_6_CALLS_PER_COMPANY = 7 (cashflow 3 + capex 2 + dividend 2)

근거: spec §7.1 파이프라인 본문 + 4·5·6·7단계 도구 호출 영역 정합. MVP 한정 보수적 over-estimate 본질 — daily limit 도달 사전 회피 영역 자연.

발견: 8단계 묶음 (2026-05-02)
처리 영역: 다음 마일스톤 spec 본문 표 직접 명시 검토. 또는 ADR-0010에 누적 (default 가정값 본질 영역).

### [§10.7] sample_companies "앞 10개" 정렬 기준 명시 누락

spec §10.7 본문 "앞 10개"만 명시 — 정렬 기준 영역 0. 8단계 채택: stock_code ASC.

근거: corp-code.ts line 120 휴리스틱 정합 (낮은 종목코드 = 오래된 대형사). 사용자 검증 영역 익숙한 종목 우선 자연.

실측: sample_companies[0] = 신한은행 (stock_code 000000 대 — 대형 금융사가 낮은 코드 점유). stock_code ASC 정렬 자체는 정합.

발견: 8단계 묶음 (2026-05-02)
처리 영역: 다음 마일스톤 spec 본문 정렬 기준 명시.

### [§10.7] estimated_universe 예상치 + daily_limit_usage_pct 예상치 실측과 다름

[응답 형태 정정 영역 — 8단계 field-test 실측값 기반]

spec §10.7 workflow 예시 "default preset 적용 시 universe ≈ 1,500~2,000, daily limit ≈ 60~80%" 가정.

실측 (2026-05-02 corp_code 덤프 기준):
- 전체 상장사 (stock_code 부재 제외): 3963개
- default preset (excluded_name_patterns 6개 + 27개 excluded_industries 정보 없음) 적용 후: 3607개
- estimated_api_calls.total: 32636 → daily_limit_usage_pct: 163.2%

원인 분석:
- spec 예상치 1500~2200은 corp_cls + induty_code 분기(11단계 영역) 적용 후 기준 가능성
- 8단계는 name pattern 제외만 적용 → over-estimate 본질 (ADR-0010 옵션 D 정합)
- daily_limit_usage_pct 163.2%는 단일 배치 실행 시 daily limit 초과 → scan_execute(11단계)에서 분할 실행 전략 필요

발견: 8단계 field-test (2026-05-02)
처리 영역: spec §10.7 workflow 예시 표현 정정 + 11단계 scan_execute 분할 실행 전략 ADR 검토.

### [§10.7] tech_focus 프리셋 spec 예시 vs 실제 config 부재

spec §10.7 workflow 예시에서 "tech_focus 프리셋 적용 시 universe 약 200~400" 언급.
실제 default config (`config-store.ts`)에는 `default` 프리셋만 존재 — `tech_focus` 프리셋 부재.

field-test 분기 3에서 `preset: "tech_focus"` 호출 → "존재하지 않는 프리셋" 에러 정합 확인.

발견: 8단계 field-test (2026-05-02)
처리 영역: spec §10.7 workflow 예시 표현 정정 (tech_focus 예시 → 직접 지정 분기로 대체). 또는 config-store.ts default config에 tech_focus 프리셋 추가 검토 (2단계 영역).

### [§10.13] `unknown` reason_code 분류 정밀화 — `data_incomplete` 분류 키 추가 후보

**현재**: §10.13 본문에 `classifySkipReason` 분류 키 7건 명시 (`status_013` / `status_014` / `status_other` / `network_error` / `parse_error` / `corp_not_found` / `unknown`). 묶음 1 `_lib/skip-reason.ts` 본문에서 `unknown`은 분류 미일치 fallback.

**정정**: 묶음 3 field-test (2026-05-07)에서 `unknown` 8건 발견 — 모두 srim Stage 3 호출 실패 본문 (`shares_outstanding not found`, financial-extractor 영역). 분류 키 추가 후보 — `data_incomplete` 또는 `financial_data_missing`. `_lib/skip-reason.ts` regex 패턴 추가 + spec §10.13 분류 키 본문 정정.

후보 regex 본문 (예시):
```ts
if (/shares_outstanding not found|financial-extractor:|series sparse/i.test(msg)) {
  return "data_incomplete";
}
```

**근거**: 묶음 3 verifications (2026-05-07) 영역 5 누적 학습 정합. `unknown`은 미분류 영역의 신호 — 발생 본문이 식별되면 분류 키 추가 본질. 본 영역은 후속 14단계 (b) `shares_outstanding not found` 정정 작업과 연계 — financial-extractor 보완 + 분류 키 추가가 한 본문에서 처리 가능. 단독 정정도 가능하나 후속 (b) 본문 변경 영향이 분류 메시지에 미칠 가능성 본 본문에서 통합 처리가 자연.

발견: 13단계 묶음 3 field-test (2026-05-07).
처리 영역: 14단계 후속 (b) 또는 단독 분류 키 추가 commit.

**상태**: pending

---

## Applied 항목

(아직 없음. v0.3에서 일괄 반영 시 채워짐.)

- ADR-0004 1단계 9번 ("로컬 운영 디렉토리 준비"): config-store가 자동 mkdir 처리하므로 사실상 불필요. 다음 마일스톤에서 단계 정리 검토.

### 11단계 §10.8 정정 (적용일 2026-05-06)

11단계 매듭 commit `b953571`로 누적된 5건 + 매듭 시점 누락된 `skipped_corps` 보강 1건 — 총 6건을 spec §10.8 본문에 일괄 적용.

1. **[§10.8] Input의 `sort_by` 필드 삭제 + MVP 본문 추가**: composite DESC 단일 정렬 MVP. `sort_by` 옵션은 향후 정밀화 영역.
2. **[§10.8] Input `limit` default `30` → `10` 정정**: 구현(묶음 3B)과 일치. `min_opportunity_score` default `0` 명시.
3. **[§10.8] Output candidates에 `corp_cls` / `induty_code` / `stage_notes` 추가**: KOSPI/KOSDAQ 식별 + KSIC + Stage 4~6 실패 메모.
4. **[§10.8] Output stages 중첩 → 직접 필드**: candidate 안 killer/srim/cashflow/capex/insider/dividend를 직접 필드로 표현. 중첩 객체 제거. cashflow/capex/insider/dividend는 `null` 가능 표시.
5. **[§10.8] composite_score MVP 산식 명시**: `(capex.opportunity_score ?? 0) - (cashflow.concern_score ?? 0)`. 범위 -100 ~ +110 (사전 검증 영역).
6. **[§10.8] 체크포인트 단순화 4 명시**: Stage 4~6 enriched 결과 in-memory만 → resume 시 다시 호출. universe_meta + partial_candidates는 보존.
7. **[§10.8] Output에 `skipped_corps` 필드 추가** (매듭 시점 pending 누락 보강): Stage 1~3 탈락 corp의 corp_code/corp_name/stage/reason 누적 배열. field-test 검증 본문 일치.
8. **[§10.8] Stage 4~6 도구 호출 실패 처리 본문 추가**: 비-rate-limit 실패 시 stage = null + stage_notes 누적, rate-limit 시 throw → checkpoint 저장.

처리 commit: spec §10.8 일괄 정정 (2026-05-06).
