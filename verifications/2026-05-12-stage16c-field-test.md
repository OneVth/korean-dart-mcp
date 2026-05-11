# 16(c) 묶음 2 field-test — ADR-0015 효과 측정 + DART burst limit 발견

## 측정 시점

- 1회차 시작: KST 2026-05-12 00:44
- 1회차 종료: KST 2026-05-12 00:45 (~52초 소요)
- 2회차 시작: KST 2026-05-12 00:45 (1회차 직후 즉시)
- 2회차 종료: KST 2026-05-12 00:45 (~1.1초 소요)
- 1회차 → 2회차 간격: ~1초

## 사전 검증 정합

- 사전 검증 결과: ✓ 통과 (verifications/2026-05-11-stage16c-pre-check.md)
- 사전 검증 → 1회차 사이 호출 0: Y
- 1회차 → 2회차 사이 호출 0: Y
- runner: verifications/run-corp-meta-refresh.mjs → build/ 직접 import

## 1회차 결과 (cache 빈 상태)

| 항목 | 값 |
|---|---|
| universe_size | 3,963 |
| fetched_count | 999 |
| cache_hit_count | 0 |
| skipped_corps (length) | 0 |
| dart_call_count | 1,001 |
| duration_ms | 52,201 (~52초) |
| terminated_by | dart_rate_limit |
| cache_size_before → after | 0 → 999 |
| random_seed | null (Math.random) |

### 1회차 분석

- **fetched + cache_hit + skipped 합산** = 999 ≠ universe(3,963) — break 시점 정합 ✓
- **cache 정착 영역** — cache_size_after(999) = fetched_count(999) ✓
- **wrapper retry 흡수** — dart_call_count(1,001) − fetched(999) = 2 (retry 영역, C1 간접 측정) ✓
- **호출 속도** — 999건 / 52초 = ~19건/초 (성공 호출 사이 delay 0)
- **terminated_by = dart_rate_limit** — 라벨링은 정합이나 본질 영역은 IP 차단 (하단 핵심 발견 영역 본격 분석)

## 2회차 결과 (cache 정착 후, 즉시 진입)

| 항목 | 값 |
|---|---|
| universe_size | 3,963 |
| fetched_count | 0 |
| cache_hit_count | 0 |
| skipped_corps (length) | 0 |
| dart_call_count | 2 |
| duration_ms | 1,123 |
| terminated_by | dart_rate_limit |
| cache_size_before → after | 999 → 999 |

### 2회차 분석

- **cache_size_before(999) = 1회차 cache_size_after(999)** ✓ (cache 정착 영역)
- **cache_hit_count = 0 원인** — B1 shuffle 부수 효과로 2회차 첫 corp = 1회차 fetched set 외부 → 즉시 fetch 시도 → IP 차단 발동 → DartRateLimitError throw → break. cache hit 영역 도달 X
- **dart_call_count = 2** — 1 fetch 실패 + retry 1회 = ADR-0015 D1 본문 정합

## ADR-0015 indicator 측정 종합

### B1 shuffle 효과 ✓ **본격 정합**

| 비교 영역 | 결과 |
|---|---|
| 1회차 shuffled_order[0:3] | 00977641, 01594764, 01043871 |
| 2회차 shuffled_order[0:3] | 01060744, 00124780, 00528515 |
| 전체 일치율 | 1 / 3,963 (0.025%) |

**verdict**: 결정론 X. Math.random 시점 의존 영역 정합. **B1 효과 본격 정합**.

본 측정 본질 영역 본격 정합 — seed 미지정 디폴트 정책 (16(b) + 16(c) 합의 정합)에서 *2 측정 사이클 사이 결정론 X* 본격 검증.

### D1 fail-fast ✓ **정합 (단 본문 정정 필요)**

양쪽 측정 모두 DartRateLimitError 즉시 break + saveCheckpoint 정합. **구조는 정합** — 단 본문 본질이 *daily limit이 아닌 IP 차단* — ADR-0015 라벨링/본문 정정 영역 (또는 ADR-0017 신설).

### C1 wrapper retry 흡수 (간접) ✓

1회차: `dart_call_count(1,001) − fetched_count(999) = 2` retry 흡수 영역 확인. 본 측정 영역에서 *간접* 측정 영역만 — 본격 C1 측정은 묶음 3 (cache hit 후 scan_execute 재측정) 영역에서 본격 발동 자격.

### cache 정착 효과 (ADR-0016) — **부분 정합**

- 1회차 cache_size_after(999) > 0 ✓
- 2회차 cache_size_before(999) = 1회차 cache_size_after ✓
- **단 *완전 정착* (~3,963)은 본 측정에서 미달성** — IP 차단으로 break

본격 cache 정착은 묶음 2-b (RateLimitedDartClient 정정) 후 재측정에서 본격 정합 영역.

## 핵심 발견 — DART burst limit (IP 차단)

### 진단 본문 (Onev 환경)

측정 직후 단건 호출 시도:

```
* Connected to opendart.fss.or.kr port 443
> GET /api/company.json ...
* Recv failure: Connection was reset
curl: (56) Recv failure: Connection was reset
```

HTTP 200 응답이 아닌 **TCP connection reset** — L7 방화벽 IP 차단 패턴. status `020` (daily limit)이라면 HTTP 200 + JSON body 영역이어야 하므로 본 본질 영역 X.

### 발동 경로

1. 999건 / 52초 = ~19건/초 무지연 연속 호출
2. DART burst 정책 발동 → IP 차단
3. fetch failed (TypeError) → ADR-0015 retry 정책 발동 (1s sleep + 1회 재시도)
4. retry도 fetch failed → DartRateLimitError throw (`status_020_persistent_after_retry` 라벨)
5. 호출자 catch + 즉시 break + saveCheckpoint

`dart_call_count(1,001) = 999 (성공) + 1 (network_block) + 1 (retry)` 정합.

### 근본 원인

`RateLimitedDartClient`는 **재시도 영역만 정합** — 성공 호출 시점에는 inter-call delay 0. burst 정책 영역 미커버.

DART 공식 영역에서는 daily limit 20,000건/일만 본문 영역. burst 영역 정책은 *문서 부재* — 본 측정에서 본격 발견.

## ADR-0015 영역 정정 영역

본 발견 정합으로 본문 정정 영역 4건:

| 영역 | 현재 본문 | 정정 영역 |
|---|---|---|
| `DartRateLimitError` 라벨링 | daily limit (status 020) | daily limit + burst limit (IP 차단) + 외부 차단 일반 모두 흡수 |
| retry 정책 | 1s sleep + 1회 재시도 | 본 정합 |
| **inter-call delay** | 정착 X | **신설 필요 (200ms 추천)** |
| burst limit 본문 | 부재 | 신설 — DART 비공식 영역에서 ~19건/초 burst 영역 발동 |

본 영역 정정은 **묶음 2-b** (별개 commit/branch) — ADR-0017 신설 + RateLimitedDartClient 정정 + 단테 영향 검증.

## 누적 학습 후보 (16(c)분)

| # | 본문 |
|---|---|
| 9 | KIS HEAD 차단 — 사전 검증 스크립트 GET 우선 정책 가드 |
| 10 | **DART burst limit (999건/52초 → IP 차단) 발견** — 외부 자원 호출 시 daily limit *외* burst limit도 사전 검토 필수. RateLimitedDartClient는 *재시도 영역만* 정합, 성공 호출 사이 delay 정착 X |
| 11 | DartRateLimitError 라벨링 본질 — daily limit + burst limit + 외부 차단 일반 모두 흡수. 본문 정정 또는 명칭 분리 영역 (ADR-0017 본격 검토) |

## 다음 단계

1. **묶음 2-b** — ADR-0017 신설 + RateLimitedDartClient inter-call delay 정정 (200ms) + 단테 정합 영역 검증
2. **DART IP 차단 회복 시점 대기** — Onev 환경 영역, 다음 자정 KST 영역 또는 IP 차단 해제 영역
3. **재측정** — cache 999 삭제 후 묶음 2-b 정정 본문 영역으로 본격 재측정 (전체 3,963 cache 정착 목표)
4. **묶음 3 진입** — cache 완전 정착 후 scan_execute 재측정 (C1 wrapper retry + candidates 회복 측정)

## 첨부

- 1회차 결과 JSON: verifications/2026-05-12-stage16c-field-test-r1.json
- 2회차 결과 JSON: verifications/2026-05-12-stage16c-field-test-r2.json
- runner: verifications/run-corp-meta-refresh.mjs
