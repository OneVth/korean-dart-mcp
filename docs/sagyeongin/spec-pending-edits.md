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

### [§4] 매핑 표의 "재사용 + 래퍼" 표현

**현재**: §4 매핑 표에 `insider_signal`이 `재사용 + 래퍼`로 분류되어 있음.

**정정**: `재사용 + 직접 수정`으로 변경. 또는 더 정확한 표현 (예: `재사용 + 파라미터 추가`).

**근거**: ADR-0001 (β-iii) 결정 과정에서 확인. 원본 `insider-signal.ts` handler가 거래 항목의 `chg_rsn` 필드를 결과에 보존하지 않으므로 wrapper로 감싸 사후 필터링 불가능. 따라서 직접 수정이 정확. "래퍼"라는 표현은 wrapper 패턴을 시사하므로 부정확.

**상태**: pending

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

## Applied 항목

(아직 없음. v0.3에서 일괄 반영 시 채워짐.)

- ADR-0004 1단계 9번 ("로컬 운영 디렉토리 준비"): config-store가 자동 mkdir 처리하므로 사실상 불필요. 다음 마일스톤에서 단계 정리 검토.
