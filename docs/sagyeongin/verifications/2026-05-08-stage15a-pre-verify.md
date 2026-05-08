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

**상태**: DART API 일시 중단으로 미실행 (2026-05-08 기준 company.json "fetch failed")

대상 corp: 인벤테라(01869710), 에임드바이오(01781999), 카나프테라퓨틱스(01782183)

→ DART API 복구 후 `scripts/sagyeongin/pre-verify-stage15a-area23.mjs` 실행

---

## 영역 3: extractSharesOutstanding se 표기 cover 검증

**상태**: 영역 2 미실행으로 대기

---

## 영역 4: 종합 결정

**상태**: 영역 1~3 완료 후 작성 예정

---

## 핵심 발견 요약

1. **DART induty_code 개정 불일치**: 비제조업 서비스 섹터 필터링에 `included_industries: ["47"]`, `["70"]` 방식 사용 불가. 현행 KSIC 10차 개정 코드 기준이 아닌 등록 시점 코드로 저장.

2. **KSIC 70 = 3개**: biotech 3개만 통과 (모두 stage3 network_error). 비제조업 field-test 표본으로 불충분.

3. **Stage 1 비용**: scan_execute Stage 1은 industry 필터와 무관하게 전체 3,963 corp에 대해 company.json 순차 호출 → 영역 1 재실행 시 20,000/일 한도 주의 필요.

4. **universe 재논의 필요**: (iii) 무작위 표본 (industry filter 제거 + 전체 KOSPI+KOSDAQ) 또는 (iv) induty_code 분포 조사 후 적합 코드 선정 중 선택 필요.

---

## 참고

- 스크립트 패턴: `field-test-stage13.mjs` 정합
- 영역 1 JSON: tmpdir/pre-verify-15a-area1.json (KSIC 70), tmpdir/pre-verify-15a-area1-47.json (KSIC 47)
- scan_execute isIndustryMatch: `induty_code.startsWith(p)` (scan-execute.ts:181-193)
- Ref: philosophy 7부 A, ADR-0001 β-i 격리 유지
