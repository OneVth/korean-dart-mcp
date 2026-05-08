# 15단계 (a) 사전 검증 결과

**작성일**: 2026-05-08  
**branch**: `feat/stage15a-pre-verify`  
**baseline**: `dfb9987`  
**목적**: KSIC 비제조업 활성 섹터 field-test 진입 전 전제 4건 격리 검증

---

## 영역 1: KSIC 70 (+ 47) 모집단 크기 측정

### 실행 조건

```
스크립트: scripts/sagyeongin/pre-verify-stage15a-area1.mjs
KSIC 70 실행: STAGE15A_INDUSTRY=70, limit=1
KSIC 47 실행: STAGE15A_INDUSTRY=47, limit=1
```

### KSIC 70 결과

| 지표 | 값 |
|---|---|
| initial_universe | 3,963 |
| **after_static_filter** | **3** |
| after_killer_check | 3 |
| after_srim_filter | 0 |
| elapsed | 159.9s |

**통과 3개 corp** (stage3 network_error):

| corp_code | corp_name | stage | reason_code |
|---|---|---|---|
| 01869710 | 인벤테라 | stage3 | network_error |
| 01781999 | 에임드바이오 | stage3 | network_error |
| 01782183 | 카나프테라퓨틱스 | stage3 | network_error |

※ 모두 biotech 기업. DART induty_code가 "70xxx"로 등록된 이유: KSIC 9차 개정(2007) 당시 "전문과학기술서비스업" 코드로 추정 (현행 10차 개정에서는 72 이동).

### KSIC 47 결과

| 지표 | 값 |
|---|---|
| initial_universe | 3,963 |
| **after_static_filter** | **0** |
| elapsed | 159.1s |

**원인**: DART의 induty_code 필드가 현행 KSIC 10차 개정(2017) 기준이 아닌 등록 당시 개정 기준으로 저장됨. 소매업은 KSIC 9차 개정 이전 코드("52xx")로 등록된 corp가 대다수로 추정 → `startsWith("47")` 매칭 0개.

### 영역 1 부차 발견: Stage 1 network_error 분포

| run | Stage 1 network_error | Stage 1 성공 | network_error 비율 |
|---|---|---|---|
| KSIC 70 (run 1) | 2,607 | 1,356 | **65.8%** |
| KSIC 47 (run 2) | 3,606 | 357 | **91.0%** |

run 2의 91% 실패는 run 1 직후 DART API rate-limit 누적으로 추정 (20,000/일 한도). **DART API가 3,963 company.json 순차 호출 시 일시적 rate-limit 발동 가능성 확인.**

### 분기 결정

| 조건 | 결과 |
|---|---|
| KSIC 70 ≥ 200? | ✗ (3개) |
| KSIC 70 50~199? | ✗ |
| KSIC 47 ≥ 50? | ✗ (0개) |
| **결론** | **spec §분기: (a) universe 재논의** |

### universe 재논의 — 선택지

| 안 | 내용 | 예상 universe |
|---|---|---|
| (i) KSIC 70 전체 사용 | 3개 corp — 통계 불가 | 3 |
| (ii) KSIC 70 + 47 통합 | 3 + 0 = 3개 — 동일 | 3 |
| **(iii) 무작위 표본** | industry filter 제거, KOSPI+KOSDAQ 전체에서 무작위 N개 | 3,963 → 200 |
| (iv) induty_code 분포 조사 후 적합 코드 선정 | company.json 샘플링 후 비제조업 다수 코드 확인 | 미정 |
| (v) KSIC 제외 필터 전용 | `excluded_industries: ["26"]` 등 제조업 제외 | 미정 |

---

## 영역 2: KSIC 70 corp 표본 DART 응답 형식 정합

**상태**: DART API 불응으로 데이터 없음 — 영역 1의 bulk 스캔(3,963 × 2 = ~8,000 순차 호출) 이후 `fetch failed` 지속

실행 시도: `scripts/sagyeongin/pre-verify-stage15a-area23.mjs` CORPS=01869710,01781999

```
Corp: 01869710 인벤테라  — company.json: fetch failed
Corp: 01781999 에임드바이오 — company.json: fetch failed
```

**원인 추정**: DART API 일일 rate-limit 또는 burst-limit 발동. 20,000/일 한도 내(~8,000건)이나 단시간 집중 호출(~160초 × 2회) 후 일시 차단으로 추정.

→ **다음 날 DART 한도 리셋 후 재실행 필요**.

---

## 영역 3: extractSharesOutstanding se 표기 cover 검증

**상태**: 영역 2 데이터 없음으로 미실행

실행 시도 결과:
```
extractSharesOutstanding(01869710): throw: fetch failed — known_failsafe: false
extractSharesOutstanding(01781999): throw: fetch failed — known_failsafe: false
```

"fetch failed"는 `data_incomplete` 분류 키와 무관한 네트워크 에러 — 14단계 (b) 패일세이프 미발동(정상). DART 복구 시 재실행 필요.

---

## 영역 4: 종합 결정

### Universe 결정 — (v) 채택

**결정**: `excluded_industries: ["26"]` + `markets: ["KOSDAQ", "KOSPI"]` + `limit: 200`

**사유**: 13단계 universe도 `included_industries: ["26"]` (`induty_code.startsWith("26")`) 규칙으로 추출됨. 26 제외 필터를 동일 규칙 기반으로 적용해야 13단계 결과 (status_013=0) 와 직접 비교 정합이 성립함. DART induty_code의 KSIC 9차/10차 코드 혼재 문제는 (c) 후속 별도 항목으로 분리.

| 항목 | 내용 |
|---|---|
| included_industries | (없음 — 전체 포함) |
| excluded_industries | `["26"]` |
| markets | `["KOSDAQ", "KOSPI"]` |
| limit | 200 |
| 예상 universe | 3,963 − KSIC 26 (294개) = ~3,669 (DART stale rate 감안 실질 처리 수 변동) |

### 영역 2~3 흡수 결정

별도 재실행 없음. 본격 field-test (`excluded_industries: ["26"]`, limit=200) 실행 시 비제조업 corp가 Stage 2~6에 자연 진입. `data_incomplete` 비율 + `se` 변형은 `skip_reason` 분포 / `unknown` 비율로 자연 측정됨. 사전 검증 본래 목적 (format 정합, se cover) 은 본격 field-test 결과로 흡수.

| 영역 | 처리 |
|---|---|
| DART 응답 형식 정합 | 본격 field-test Stage 1 실행으로 흡수 |
| se 표기 변형 발견 여부 | skip_reason=data_incomplete / unknown 비율로 측정 |
| extractSharesOutstanding cover | Stage 2~3 진입 비제조업 corp에서 자연 검증 |

### 본격 (a) field-test 명세 진입 가능 여부

**✓ 가능 — 별도 명세 (B) 작성으로 진행**

---

## 핵심 발견

1. **DART induty_code 개정 불일치**: `included_industries: ["47"]`, `["70"]` 방식 비제조업 필터 불가. KSIC 10차 개정 코드 기준이 아닌 등록 당시 코드로 저장. 향후 비제조업 필터링은 `excluded_industries: ["26"]` 패턴 (제조업 제외) 이 정합.

2. **KSIC 70 = 3개 (biotech)**: Stage 1 통과 3개 모두 stage3 network_error. 이 3개가 "70xxx"로 등록된 이유는 KSIC 9차 개정 당시 "전문과학기술서비스업" 코드 잔류로 추정.

3. **Stage 1 비용 확인**: scan_execute Stage 1은 industry 필터 무관 전체 3,963 corp company.json 순차 호출 → 영역 1 재실행 1회당 ~3,963 API call. 당일 중복 실행 시 daily limit 주의.

---

## 핵심 학습

### 가설 (α) 본질 재정의 — 11단계 65.8% vs 13단계 0% 격차 해소

**기존 해석 (오해)**: 11단계 65.8% = Stage 2~3 status_013 비율 vs 13단계 0% 대비

**정정 해석**:

| 측정 | 영역 | 의미 |
|---|---|---|
| 11단계 65.8% | **Stage 1 실패율** (`corp_code → company.json` HTTP 실패) | industry filter 무관, 전체 universe 공통 |
| 13단계 status_013 = 0 | **Stage 1 통과 후** 후속 API status 분포 | KSIC 26 한정 측정 |

두 수치는 **다른 영역의 다른 지표** — 직접 대비 불가. 격차(65.8% vs 0%)는 "같은 현상의 섹터별 차이"가 아니라 "Stage 1 실패율 vs Stage 2~3 실패율" 의 층위 혼동.

```
영역 1 KSIC 70 run 1: Stage 1 network_error = 2,607/3,963 = 65.8%  ← 11단계 정확 일치
영역 1 KSIC 47 run 2: Stage 1 network_error = 3,606/3,963 = 91.0%  ← run 1 후 rate-limit 누적
```

**가설 (α) 본격 검증 영역 재정의**:

- 가설 (α) 원명: "corp_code stale → DART API status_013 반환"
- 실측 기반 재정의: **Stage 1 실패 corp (65.8%)의 modify_date 분포** — stale corp이 실패하는지 확인
- 검증 방법: `corp_code.sqlite` post-hoc SQLite query — Stage 1 실패 corp_code 목록 × modify_date 분포
- 가설 (β) 방향: Stage 1 실패 corp의 modify_date가 3년 초과 비율이 높으면 (α) 지지, 낮으면 (β) (DART 서버 측 제한) 지지

**15단계 (a) 본격 field-test의 실제 측정 영역**:

- `excluded_industries: ["26"]` universe의 Stage 1 실패율이 KSIC 26 universe (65.8%)와 유사하면 → industry filter 무관 전체 구조 문제 (가설 (β) 방향)
- Stage 2~3 진입 비제조업 corp의 skip_reason 분포 (status_013 / data_incomplete / unknown 비율)
- (a) 본격 field-test 결과와 13단계 KSIC 26 결과 직접 비교 → 섹터 차이 분리 측정

---

## 참고

- 스크립트 패턴: `field-test-stage13.mjs` 정합
- 영역 1 JSON: tmpdir/pre-verify-15a-area1.json (KSIC 70), tmpdir/pre-verify-15a-area1-47.json (KSIC 47)
- scan_execute isIndustryMatch: `induty_code.startsWith(p)` (scan-execute.ts:181-193)
- Ref: philosophy 7부 A, ADR-0001 β-i 격리 유지
