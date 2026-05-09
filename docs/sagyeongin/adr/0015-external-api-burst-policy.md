# 0015 - 외부 API burst 차단 통합 정책 (DART + naver/KIS rating)

- 상태: Accepted
- 결정일: 2026-05-09
- 결정자: 사용자 + Claude

## 컨텍스트

15단계 (a) field-test에서 외부 API burst 차단 양상이 직접 실측됨 (`verifications/2026-05-09-stage15a-field-test.md`):

- **DART burst**: stage1 = 2,607 fetch failed (`company.json` 호출 자체 차단). 11단계 65.8% 실패와 정확 일치 → **호출 누적 단위 결정론** (corp_code 순서대로 호출 시 ~1,356번째 영역에서 차단 발동, 시간 단위 X)
- **naver/KIS rating IP 차단**: stage3 = 659 fetch failed (SRIM 단계 외부 API). DART와 별개 메커니즘.

차단 양상의 본질:

- HTTP status code 응답 X (DART status `"020"` 응답 X) = TCP/네트워크 차단
- fetch failed → JavaScript fetch API의 network error = `TypeError: fetch failed` 또는 동등 throw
- ADR-0009의 detection 영역 (`body.status === "020"` + ZIP 메시지 `[020]`) *밖*

ADR-0009 정책의 한계 직접 검증:

- 정책 = status `"020"` 감지 → 1초 sleep + 1회 retry → 실패 시 `DartRateLimitError` throw
- 본 (a) 차단은 status `"020"` 응답 X → ADR-0009 detection 미발동 → fetch failed가 그대로 propagate → `scan-execute`의 catch 블록에서 `network_error` reason_code로 분류
- 결과: ADR-0009 정책의 retry/checkpoint 흐름 미진입. 차단 후 잔여 호출 모두 fetch failed (15(a) elapsed 376.5s 중 stage1 차단 후 계속 진행).

ADR-0009 트레이드오프 명시 영역도 직접 발현:

- "DART 외 다른 외부 의존 (네이버 가격, K값 캐시)은 wrapper 적용 범위 밖" → naver/KIS rating에 retry/throttle 정책 없음. 659회 연속 호출만으로 IP 차단 발동.

## 고려한 옵션

### 영역 A — fetch failed detection 정책

- **A1** (그대로): ADR-0009 status "020"만 cover. fetch failed는 error propagate.
  - 단점: 15(a) 정황 직접 미커버. 결정론적 차단 + 재현 가능에도 불구하고 정책 미적용.
- **A2** (`RateLimitedDartClient` 강화): 기존 wrapper에 fetch failed detection + retry 추가.
  - 적용: status "020" 정책과 같은 분기에 fetch failed 분기 추가. 1초 sleep + 1회 retry. retry 후에도 fetch failed → `DartRateLimitError` throw로 통합 (또는 별도 `DartNetworkError`).
- **A3** (신규 통합 wrapper `api-throttle.ts`): DART + naver/KIS rating 양쪽 cover하는 신규 wrapper. 기존 `RateLimitedDartClient` 통합 또는 그대로 두고 추가.

### 영역 B — 호출 분산 정책 (burst 임계 분산)

- **B1** (corp_code 순서 무작위화): scan_execute의 universe 추출 후 Fisher-Yates shuffle 적용. 호출 누적 임계가 같은 corp 영역에 매번 발동하는 결정론을 분산.
  - 효과: 11단계 + 15(a)의 stage1 = 2,607 동일 결과 → shuffle 후 매 실행마다 차단 영역이 다른 corp 영역으로 분산. 단 *전체* 차단 양은 동일 (호출 누적 임계 자체는 변경 X).
- **B2** (호출 간 ms delay 강제): 호출 간 일정 간격 (예: 100ms) 두어 burst 발동 회피.
  - 효과: 본 burst 임계가 *시간* 단위가 아니라 *호출 누적* 단위라 효과 불확실. 15(a) elapsed 376.5s / 3,963 호출 = 95ms/호출 — 이미 자연 delay 영역. 명시 delay 추가는 elapsed만 증가, 차단 회피 X 가능성.
- **B3** (안 함): 호출 자체는 정상이고 차단 후 처리에 집중.

### 영역 C — naver/KIS rating wrapper

- **C1** (별도 wrapper 신설): `naver-throttle.ts` + `kis-throttle.ts` 또는 통합 `external-api-throttle.ts`. naver-price.ts + kis-rating-scraper.ts를 wrap.
- **C2** (통합 `api-throttle.ts`): A3 정합. DART + naver/KIS rating 통합 wrapper. ADR-0009의 RateLimitedDartClient 흡수 또는 wrap.
- **C3** (그대로): IP 차단 시 fail-fast, 회복 정책 없음. 사용자가 본 단계 도구 차원에서 알아서 처리.

### 영역 D — 차단 detection 후 처리

- **D1** (retry-and-throw 즉시 종결): A2 retry 흡수 후 1번 throw → scan-execute의 모든 catch에서 즉시 종결. 별도 카운터 추가 X — 본 흐름이 본질적 fail-fast.
  - 본질: A2의 1차 fetch failed → sleep + retry → 2차 fetch failed 시 `DartRateLimitError` throw. scan-execute가 catch 시 saveAndReturnPartial 또는 limitReached flag 즉시 반환. *N회 누적 임계*는 본 흐름에서 의미 X (1번 throw로 즉시 종결).
- **D2** (현재 흐름 유지): 모든 호출 시도, 실패 누적. 15(a) 376.5s 중 stage1 차단 후 계속 진행한 비효율 그대로.

## 결정

**A2 + B1 + C1 + D1 통합 채택** (옵션 X 분산):

### A2: RateLimitedDartClient 강화

`src/tools/sagyeongin/_lib/dart-rate-limit.ts`에 fetch failed detection 추가:

- `getJson` / `getZip` 호출 시 catch 블록에서 fetch failed 매치 (`error.cause?.code === "ECONNREFUSED"` 또는 메시지 `"fetch failed"` 매치)
- 매치 시: 1초 sleep + 1회 retry (status "020" 분기와 동일)
- retry 후에도 fetch failed → `DartRateLimitError` throw (메시지에 `[network_block]` prefix 명시 — 기존 `[020]` 분기와 구별)

### B1: corp_code 순서 무작위화

`src/tools/sagyeongin/scan-execute.ts`의 universe 추출 후 Fisher-Yates shuffle 적용:

- 위치: stage1 진입 직전 (universe 배열 확정 후)
- 시드: 무작위 (재현성 필요 시 Onev 결정 후 시드 고정 옵션 추가)
- 효과: burst 임계 영역 분산 — 매 실행마다 다른 corp 차단

### C1: naver/KIS rating 별도 wrapper

`src/tools/sagyeongin/_lib/naver-throttle.ts` + `src/tools/sagyeongin/_lib/kis-throttle.ts` 신설:

- naver-price.ts + kis-rating-scraper.ts를 composition으로 wrap
- 정책: 호출 간 200ms delay 강제 (IP 차단 회피) + 차단 detection (fetch failed 또는 HTTP 4xx/5xx) → 1회 retry → 실패 시 `NaverRateLimitError` / `KisRateLimitError` throw
- D1 정합: A2 retry 흡수 후 throw 시 scan-execute 즉시 종결 흐름과 통합 (별도 카운터 영역 X)

### D1: retry-and-throw 즉시 종결 (코드 변경 X)

A2 강화 후 흐름 분석 결과 D1 본질이 *현재 흐름이 이미 만족*하는 영역:

- A2: 1차 fetch failed → sleep 1초 + retry → 2차 fetch failed → `DartRateLimitError` throw (network_block)
- scan-execute catch 흐름 (모든 영역에서 첫 throw로 즉시 종결):
  - `stage1StaticFilter` (line 252-260): `DartRateLimitError` catch → `limitReached: true` 반환 → caller가 saveCheckpoint
  - Stage 2 loop (line 700): `DartRateLimitError` catch → `saveAndReturnPartial` 즉시 종결
  - Stage 3 loop (line 754): 동일
  - enrich 4 영역 (line 365/387/406/422): `DartRateLimitError` catch → `limitReachedDuringEnrich: true` 즉시 반환
- 본 흐름이 *retry-and-throw 1번으로 즉시 종결* = fail-fast 본질 영역 자체

별도 카운터 추가 영역 X:
- 1번 throw 후 즉시 종결 → *N회 누적 임계*가 발동 시점 전에 의미 X
- ADR-0015 line 92의 *연속 N회 fetch failed 임계*는 *retry 흡수 영역* (1차 + retry = N=2)으로 재해석 — A2 정책의 retry 1회 = 본 임계 만족

코드 변경: 0. ADR-0014 checkpoint 저장 흐름은 *현재 코드*에서 이미 활용 중 (saveCheckpoint 호출 영역 정합).

정책 사유: 15(a) stage1 차단 후 1번 throw 시점에 즉시 종결되므로 잔여 호출 영역 발생 X. *현재 흐름이 본질 만족*.

### 위치 결정 — 옵션 X (분산) 채택

- DART: 기존 `dart-rate-limit.ts` 강화 (A2)
- naver/KIS: 별도 wrapper 신설 (C1)
- 통합 wrapper (`api-throttle.ts`)는 채택 X — 영역별 분리가 명료

### β-i 격리 정합

모든 변경은 `src/tools/sagyeongin/_lib/` 내부. `src/lib/` 변경 0. ADR-0001 정합 유지.

### ADR-0009 / ADR-0014 관계

- **ADR-0009**: Superseded 아님. status "020" 정책은 그대로 유지. ADR-0015가 fetch failed 분기 추가 cover. ADR-0009 본문에 분기 표기 추가 권고 (Optional — Claude Code 판단).
- **ADR-0014**: 정합. ADR-0015 fail-fast 발동 시 ADR-0014 checkpoint 저장 흐름 그대로 활용.

## 근거

- **A2 채택 (A1/A3 거부)**: 15(a) 직접 검증으로 A1 부족. A3 통합 wrapper는 영역별 분리 (DART vs naver/KIS) 명료성 손상. 기존 wrapper 강화가 최소 변경 + 효과 직접.
- **B1 채택 (B2/B3 거부)**: B2는 시간 단위가 아닌 호출 누적 단위 차단에 효과 불확실. B3는 결정론적 차단 정황 무시. B1은 결정론 분산 — 매 실행마다 다른 corp 영역 차단으로 *부분 회복* 가능 (1,356 영역의 통과 corp이 매 실행마다 다름).
- **C1 채택 (C2/C3 거부)**: C2 통합 wrapper는 DART vs naver/KIS의 별개 메커니즘을 같은 로직으로 처리하는 구조 비정합. C3는 ADR-0009 트레이드오프 영역 검증된 한계 무시.
- **D1 채택 (D2 거부)**: A2 강화 후 흐름이 *retry-and-throw 1번으로 즉시 종결* — 본질적 fail-fast. 별도 카운터 영역 X (코드 변경 0). D2의 1번 throw 후 잔여 호출 진행 영역은 A2 강화로 자동 회복.

## 결과

### 좋은 점

- DART burst 차단 결정론 분산 (B1) — 11단계/15(a) 동일 차단 영역 패턴 회피
- ADR-0009 트레이드오프 영역 (naver/KIS) 직접 cover
- fail-fast로 차단 후 elapsed 절약
- β-i 격리 유지 — `src/lib/` 0 변경
- ADR-0009/0014와 분기 정합 — Superseded 0

### 트레이드오프

- **재현성 손실 (B1)**: corp_code 순서 무작위화로 매 실행마다 차단 영역 다름. 디버깅 시 시드 고정 옵션 활용 필요.
- **호출 누적 임계 자체는 변경 X (B1)**: shuffle은 차단 영역 *분산*만, *회피*는 X. 전체 차단 양은 동일 (~2,607).
- **D1 본질 영역 (변경 X)**: A2 강화 후 흐름이 본질 만족 — 별도 카운터 추가 영역 X. input args 노출 (`consecutive_fetch_failed_threshold`)도 자동 회피.
- **새 wrapper 추가로 인프라 확장**: naver-throttle.ts + kis-throttle.ts 신설. 단순 fetch에서 wrapper 한 단계 추가.

### 미래 변경 시 영향

- **본격 (a) 재측정 영역 후속 단계**: ADR-0015 구현 후 (a) 재실행 → KSIC 26 비교 차원 본격 측정 가능 (15(a)에서 candidates 0이었던 영역).
- **DART API 정책 변경 시**: 본 ADR 갱신 (예: status "020"에서 다른 status code로 변경 시 detection 분기 추가).
- **새 외부 의존 추가 시**: 본 ADR cover 영역 확장 (예: 새 외부 가격 source 추가 시 wrapper 추가).
- **ADR-0014 fail-fast 흐름 정합**: A2 retry 후 throw는 scan-execute catch에서 ADR-0014 checkpoint 저장 흐름 (saveCheckpoint / saveAndReturnPartial)으로 즉시 통합. 추가 명세 신설 영역 X — 통합 자체가 정합.

## 참조

- ADR-0001 (β-i 격리 정책 — `src/tools/sagyeongin/_lib/` 위치 정합)
- ADR-0009 (DART rate-limit 정책 — 본 ADR이 fetch failed 분기 추가 cover)
- ADR-0014 (scan_execute checkpoint storage — 본 ADR fail-fast 시 활용)
- 15(a) field-test 결과: `docs/sagyeongin/verifications/2026-05-09-stage15a-field-test.md`
- 15(a) 사전 검증: `docs/sagyeongin/verifications/2026-05-08-stage15a-pre-verify.md`
- 11단계 사전 검증: `docs/sagyeongin/verifications/2026-05-04-stage11-pre-verify.md`
- philosophy 7부 A (사전 솎아내기 — 차단으로 측정 자체가 불가하면 사전 솎아내기 자체가 불가) + 5부 (분기 단위 점검 — 도구 신뢰성)
