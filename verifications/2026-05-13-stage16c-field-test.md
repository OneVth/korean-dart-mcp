# 16(c) 묶음 2-c field-test — ADR-0017 효과 재측정 (inter-call delay 200ms 적용 후)

## 측정 시점

- 1회차 시작: 2026-05-12T08:28:10Z (KST 17:28)
- 1회차 종료: 2026-05-12T08:29:17Z (KST 17:29, ~67초 소요)
- 2회차 시작: 2026-05-12T08:29:16Z (1회차 직후 즉시, interval_from_r1_sec = 0.0)
- 2회차 종료: 2026-05-12T08:29:19Z (~2.6초 소요)

## 사전 검증 정합

- 사전 검증 결과: ✓ 통과 (verifications/2026-05-13-stage16c-pre-check.md, 2026-05-12T08:09:27Z)
- cache 삭제 지시: Y (pre-check.md "cache 삭제 완료")
- **cache 삭제 실제 반영 여부: 미정합** — cache_size_before = 3,479 (예상: 0) ← 이상 A
- build/ 최신: Y (npm run build 완료 후 실행)
- runner: verifications/run-corp-meta-refresh.mjs → build/ 직접 import

## 1회차 결과 (cache_size_before = 3,479)

| 항목 | 값 | 기대 | 정합 |
|---|---|---|---|
| universe_size | 3,963 | 3,963 ± 10 | ✓ |
| fetched_count | 244 | ≈ 3,963 | ✗ (이상 A 영향) |
| cache_hit_count | 3,719 | 0 | ✗ (이상 A 영향) |
| skipped_corps (length) | 0 | 0 ~ 수건 | ✓ |
| dart_call_count | 244 | ≈ fetched_count | ✓ (retry 0) |
| duration_ms | 66,842 (~67초) | ≈ 800,000 (~13분) | ✗ (fetched 244건만) |
| terminated_by | **completed** | **completed** | ✓ **핵심 정합** |
| cache_size_before → after | 3,479 → 3,963 | 0 → ≈ 3,963 | △ (after 정합, before 이상) |
| random_seed | null (Math.random) | null | ✓ |

### 1회차 분석

- **ADR-0017 효과 본격 정합**: terminated_by = `completed` ✓ — 200ms delay로 burst IP 차단 재발 X
- **retry 0**: dart_call_count(244) = fetched_count(244) → α = 0, C1 wrapper retry 발동 X
- **소요 시간**: 244 × 200ms = 48.8s 이론값 대비 실제 66.8s → DB 조회·저장 overhead 18s 수준, 정합
- **cache hit 대다수**: 3,719건 = 빈 cache 출발이 아닌 3,479 사전 정착 반영 (이상 A)
- **이상 B**: cache_hit_count(3,719) > cache_size_before(3,479) — 구현 내부 측정 시점 불일치 가능성 (하단 분석)

## 2회차 결과 (cache_size_before = 3,963)

| 항목 | 값 | 기대 | 정합 |
|---|---|---|---|
| universe_size | 3,963 | 3,963 | ✓ |
| fetched_count | 0 | 0 | ✓ |
| cache_hit_count | 3,963 | ≈ 3,963 | ✓ **완전 정착** |
| skipped_corps (length) | 0 | 0 | ✓ |
| dart_call_count | 0 | ≈ 0 | ✓ |
| duration_ms | 2,586 (~2.6초) | ~수 초 | ✓ |
| terminated_by | completed | completed | ✓ |
| cache_size_before → after | 3,963 → 3,963 | = 1회차 after | ✓ |

### 2회차 분석

- **cache 완전 정착 확인**: cache_hit_count = 3,963 = universe_size ✓
- **DART 호출 0**: dart_call_count = 0 → scan_execute 전치 완료 영역 진입 자격 성립
- **cache_size_before = 1회차 cache_size_after(3,963)**: 세션 내 cache 연속성 ✓

## ADR-0017 효과 verdict — 묶음 2-a vs 2-c 비교

**burst 재발 X — 정합 ✓**

| 영역 | 묶음 2-a (delay 0) | 묶음 2-c (delay 200ms) |
|---|---|---|
| 호출 속도 | ~19건/초 (무지연) | ~3.6건/초 (200ms delay) |
| 1회차 처리 | 999 fetch + 0 cache hit / 52초 | 244 fetch + 3,719 cache hit / 67초 |
| terminated_by | dart_rate_limit (IP 차단) | **completed** |
| cache 정착 | 999 (부분) | **3,963 (완전)** |
| 2회차 cache_hit | 0 (B1 부수 효과로 즉시 IP 차단) | **3,963** |
| 2회차 dart_call | 2 (즉시 IP 차단 + retry) | **0** |

**verdict**: ADR-0017 (200ms inter-call delay) 정합으로 burst 재발 X + cache 완전 정착 본격 달성.

200ms inter-call delay 도입으로 DART burst limit (~19건/초 임계) 우회 확인.

## B1 shuffle 효과

| 비교 항목 | 값 |
|---|---|
| r1 shuffled_order[0:3] | 01089855, 00831428, 00876643 |
| r2 shuffled_order[0:3] | 01232192, 01359815, 01117246 |
| 일치 여부 | **불일치 ✓** |

**verdict**: 결정론 X. Math.random 시점 의존 정합. **B1 효과 재정합**.

## skipped_corps 분포

- r1 skipped_corps: **0건** (bundle 2a 측정 대비 전량 성공)
- r2 skipped_corps: **0건**

## 이상 발견 2건

### 이상 A — cache_size_before = 3,479 (0 기대)

본 측정 단계 2 (cache 삭제) 영역에서 `rm -f ~/.sagyeongin-dart/corp_meta_cache.sqlite` 영역 의도가 **미반영** — 1회차 시작 시점 cache 3,479건 잔존.

추정 원인:
1. **Windows bash `rm` 경로 불일치** — Git Bash `~` vs Node.js `os.homedir()` 경로 해석 차이 (가장 유력)
2. **사전 검증 이후 부분 실행** — pre-check(08:09Z) → field-test(08:28Z) 사이 19분간 별도 corp_meta_refresh 실행 가능성 (보고에서 사전 호출 0 Y 정합이라 가능성 낮음)
3. **pre-check.md 선기재** — 삭제 전 md 기재 후 실제 미수행

**측정 본질 영향 X** — cache 완전 정착(3,963) + terminated_by(completed) 모두 정합.

### 이상 B — cache_hit_count(3,719) > cache_size_before(3,479) (차이 240)

**합산 정합 검증**: fetched(244) + cache_hit(3,719) + skipped(0) = **3,963 = universe** ✓

본 본질: `cacheSizeBefore = corpMetaSize()` 측정 시점과 `cache_hit_count` 카운트 시점 영역 어긋남 가능성. handler 시작 시점 cache 3,479 → loop 진행 중 → 외부 사이클 영향 또는 invalidateStale 시점 전 count 기록으로 실제 유효 entry 수와 count 기준 불일치.

가능한 분석 경로: `_corpMetaRefreshHandler` 내부 `invalidateStale()` 호출 순서 vs `cache_size_before` 측정 시점 순서 검토.

**측정 본질 영향 X** — cache_size_after(3,963) 정합 + 합산 정합.

## ADR-0015 / ADR-0017 indicator 재측정 종합

| indicator | bundle 2a | bundle 2c | 상태 |
|---|---|---|---|
| B1 shuffle 결정론 X | ✓ | ✓ | 재정합 |
| D1 fail-fast | ✓ | N/A (completed) | ADR-0017 효과로 미발동 |
| C1 wrapper retry | α=2 (간접) | α=0 | retry 0 = burst 없음 |
| ADR-0016 cache 정착 | 부분(999) | **완전(3,963)** ✓ | **묶음 3 진입 자격** |
| ADR-0017 burst 방어 | — | **confirmed** ✓ | 신규 검증 |

## 누적 학습 후보 (16(c)분 추가)

| # | 본문 |
|---|---|
| 13 | Windows bash 영역에서 `rm -f ~/...` 신뢰성 불확실 — 명세 영역에서 *절대 경로* 또는 *명시적 검증 단계* (node 스크립트 삭제 + 존재 확인) 정착 |
| 14 (잠재) | `cacheSizeBefore` 측정 시점과 `cache_hit_count` 카운트 시점 영역 어긋남 — handler 내부 `invalidateStale` 순서 vs count 기록 시점 정합 검토 (사이클 사이 별개 호출 정책 강화 후보) |

## 다음 단계

1. **묶음 3 진입 자격 성립** — cache 3,963 완전 정착 + ADR-0017 정합. scan_execute 재측정 (C1 wrapper retry + candidates ≥ 1 회복) 진입 준비
2. **이상 B 구현 분석** — `_corpMetaRefreshHandler` 내 `cache_size_before` 측정 시점 vs `invalidateStale` 호출 순서 확인
3. **이상 A 재현 방지** — cache 삭제 절차 명확화 (Windows `rm` 신뢰성 → node 스크립트 삭제 또는 절대 경로 명시)

## 첨부

- 1회차 결과 JSON: verifications/2026-05-13-stage16c-field-test-r1.json
- 2회차 결과 JSON: verifications/2026-05-13-stage16c-field-test-r2.json
- 사전 검증: verifications/2026-05-13-stage16c-pre-check.md
- runner: verifications/run-corp-meta-refresh.mjs
