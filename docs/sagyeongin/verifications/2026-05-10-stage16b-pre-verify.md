# 16(b) field-test 진입 전 사전 검증 — ADR-0015 효과 측정

- 일자: 2026-05-10
- baseline: main HEAD `ee3075d` (16단계 종결 매듭)
- 검증자: Claude (Onev fork view + 외부 자원 직접 호출 보고 기반)
- 목적: ADR-0015 효과 측정 (16(b)) 명세 작성 전 외부 자원 회복 확인 + callCount 측정 영역 코드 변경 영역 확정 + 측정 분기별 정정 후보 사전 명시

## 검증 영역

1. 외부 자원 회복 결과 기록 (DART / naver / KIS 3건)
2. callCount 노출 영역 (옵션 A1) — `srim.ts` + `required-return.ts` singleton export 변경 + scan-execute result schema 추가
3. singleton mutation 단테 격리 영역 — 본 영역 *non-issue* 확정 근거
4. KSIC 26 universe baseline (13단계 정착)
5. shuffle seed = 미지정 디폴트 확정 — resume 시 stage1 재진입 X 흐름 검증
6. 측정 결과 분기별 정정 후보 영역 (14(b) ②-plus 패턴 적용)

## 결과 요약

| 영역 | 결론 |
|---|---|
| 1 | 3건 모두 정상 — 06:27~06:28 UTC (15:27~15:28 KST), HTTP 200 + 본문 sniff 매치. 15(a) 마지막 호출과 시간 차 ~4시간 (정황) |
| 2 | **옵션 A1 확정** — `srim.ts:44` + `required-return.ts:28` `const` → `export const` (2줄). `scan-execute.ts` import 추가 + 최종 result 객체에 `external_call_stats` 필드 추가 |
| 3 | **non-issue 확정** — `naverLimited` / `kisLimited` 사용처 srim/required-return 모듈 *내부*만 (`grep -rnE "naverLimited\|kisLimited" src/` 결과 4건 모두 자체 모듈). 단테는 fresh `new RateLimitedNaverPrice(mock)` 인스턴스 패턴 (`naver-throttle.test.ts:48` 등) — singleton import X. reset 메서드 / fresh instance per test 영역 코드 변경 X |
| 4 | KSIC 26 universe = 전자부품 + KOSDAQ+KOSPI 통합. `verifications/2026-05-07-stage13-field-test.md:5` 정착 baseline. `after_static_filter = 294` (13단계 측정값) |
| 5 | `random_seed` 미지정 디폴트 확정 — `scan-execute.ts:633` (stage1StaticFilter는 신규 scan 분기에서만 호출) + `:618-629` (resume 분기는 `state.pending_corp_codes`로부터 universe 복원, stage1 재진입 X) → shuffle은 최초 1회만 발동, checkpoint에 결과 보존 |
| 6 | 분기 4건 — B1 효과 부재 / C1 retry 흡수 부재 / candidates ≥ 1 회복 / verdict 분포 — 각 분기별 후속 ADR 후보 사전 명시 |

---

## 영역 1: 외부 자원 회복 결과 기록

### 검증 결과 (2026-05-10 06:27~06:28 UTC / 15:27~15:28 KST)

| 항목 | UTC | KST | HTTP/status | sniff 매치 | 판정 |
|---|---|---|---|---|---|
| DART company.json | 06:27:47Z | 15:27:47 | HTTP 200 + body status `000` ("정상") | corp_name `삼성전자(주)` 확인 | 정상 ✓ |
| Naver finance | 06:27:54Z | 15:27:54 | HTTP 200 SIZE=198,471 | 3건: 삼성전자, rate_info_krx, no_today | 정상 ✓ |
| KIS rating | 06:28:24Z | 15:28:24 | HTTP 200 SIZE=77,855 | 5건: BBB, BBB-, spread, 등급별, 회사채 | 정상 ✓ |

검증 환경 IP: `175.118.81.100` (KT Corp, 한국 IP) — production endpoint와 동일 지역, IP 차단 판정 정합.

### naver/KIS IP 차단 회복 시간 정황

15(a) field-test 마지막 외부 호출 추정 시각: 2026-05-10 10:39~11:39 KST (16단계 묶음 3 머지 + 종결 매듭 시점).
16(b) 회복 검증 시각: 2026-05-10 15:27~15:28 KST.
**시간 차: 약 4시간.**

종전 추정 (24-48시간 IP 차단 영역)과 어긋남 — 본 정황 ADR-0015 본질에 영향:

- **차단 영역 본질 재검토** — 차단 메커니즘이 *IP 단위 daily ban* (장시간 영구) 영역이 아니라 *burst rate 단위 transient throttle* (단시간 회복) 영역일 가능성
- **C1 wrapper retry 정합성 강화 정황** — 차단이 transient 영역이라면 sleep 1초 + retry 1회 정책이 *동일 호출 burst 직후 retry*로 흡수 가능성 높음 (15(a) 시점 정책 부재로 stage3 = 659 fetch failed 그대로 통과 → 16(b) wrapper 적용 후 흡수율 측정)

본 정황은 16(b) 측정에서 callCount + retry 흡수 영역으로 직접 검증 영역 (영역 2 + 6).

---

## 영역 2: callCount 노출 영역 (옵션 A1)

### 본질

ADR-0015 C1 wrapper retry 정책 적용 후 *retry 흡수 총량* 측정을 위해 `naverLimited.callCount` + `kisLimited.callCount` + 기존 DART `limited.callCount` 셋을 scan-execute 결과 JSON에 노출.

### 옵션 A/B/C 비교 (재인용)

| 옵션 | 변경 | 측정 영역 |
|---|---|---|
| **A1** | `const` → `export const` (2줄) + scan-execute import + 결과 JSON 추가 | retry 흡수 *총량* (callCount > 호출 corp 수 차이) |
| A2 | wrapper에 `_retryCount` 필드 추가 + getter + A1 변경 | retry 발동 *횟수* 직접 |
| B | srim/required-return tool 결과에 callCount 포함 | scan-execute 누적 X (srim/required-return은 scan-execute 내부 직접 호출 X, 별개 tool) — 적용 X |
| C | 별도 카운터 모듈 신설 | 새 인프라 — 16(b) 측정 영역 X |

**옵션 A1 확정.** A2는 retry 발동 횟수 본질이 본 사이클에서 본격적으로 필요하지 않음 — 총 흡수량 측정으로 충분. retry 횟수 본질이 후속 사이클에서 제기 시 A2 도입.

### 변경 영역

#### 변경 1: `src/tools/sagyeongin/srim.ts:44`

```typescript
// 현재
const naverLimited = new RateLimitedNaverPrice(naverInner);
```

```typescript
// 변경 후
export const naverLimited = new RateLimitedNaverPrice(naverInner);
```

JSDoc 추가 (line 41-42 영역 위에):

```typescript
// [16(b) 측정] scan-execute에서 callCount 노출 영역 import — ADR-0015 효과 측정 영역.
```

#### 변경 2: `src/tools/sagyeongin/required-return.ts:28`

```typescript
// 현재
const kisLimited = new RateLimitedKisRating(kisInner);
```

```typescript
// 변경 후
export const kisLimited = new RateLimitedKisRating(kisInner);
```

JSDoc 추가 (line 25-26 영역 위에):

```typescript
// [16(b) 측정] scan-execute에서 callCount 노출 영역 import — ADR-0015 효과 측정 영역.
```

#### 변경 3: `src/tools/sagyeongin/scan-execute.ts` import 추가

import 영역 (현재 line 30~ 영역) 본 두 줄 추가:

```typescript
import { naverLimited } from "./srim.js";
import { kisLimited } from "./required-return.js";
```

#### 변경 4: `src/tools/sagyeongin/scan-execute.ts:538` 최종 result 객체에 `external_call_stats` 필드 추가

```typescript
return {
  scan_id: args.state.scan_id,
  pipeline_stats: { ... },
  external_call_stats: {
    dart_call_count: args.state.call_count,
    naver_call_count: naverLimited.callCount,
    kis_call_count: kisLimited.callCount,
  },
  candidates: args.candidates,
  ...
};
```

본 동일 필드 partial 반환 영역 (`saveAndReturnPartial`, line 554) 정합 추가 — checkpoint 시점에도 callCount 보존.

### 변경 면 표

| 파일 | 줄 변경 | 변경 본질 |
|---|---|---|
| `srim.ts` | 1줄 (line 44 const→export const) + JSDoc 1줄 | export |
| `required-return.ts` | 1줄 (line 28 const→export const) + JSDoc 1줄 | export |
| `scan-execute.ts` | import 2줄 + result 필드 4-6줄 (정상 종료 + partial 둘 다) | import + result schema |

총 변경: 3 files / +~10 / -~3 (예상). β-i 격리 정합 (`src/lib/` 변경 0, `naver-price.ts`/`kis-rating-scraper.ts` 변경 0).

### 단테 영역

scan-execute의 결과 schema에 새 필드 추가 — 기존 단테에 영향 X (대부분 단테가 `pipeline_stats`만 검증). callCount 노출 자체에 대한 단테는 신설 X (단순 export 변경 + 필드 추가는 field-test로 검증 영역).

본 영역 묶음 1 (코드 변경) → 묶음 2 (field-test 진입) 분리 진행.

---

## 영역 3: singleton mutation 단테 격리 영역 — non-issue 확정

### 검증 명령

```bash
grep -rnE "naverLimited|kisLimited" src/
```

결과 4건:
- `srim.ts:44` (declaration)
- `srim.ts:112` (usage in srim tool handler)
- `required-return.ts:28` (declaration)
- `required-return.ts:78` (usage in fetchRequiredReturnK)

**다른 모듈에서의 import / 사용 X.** 단테는 `naver-throttle.test.ts:48` 등에서 `const limited = new RateLimitedNaverPrice(mock)` *fresh instance per test* 패턴 사용 → singleton 자체 import X.

### 결론

singleton mutation 영역 단테 격리 *non-issue 확정*:
1. 단테는 자체 mock + fresh instance — process 단위 누적 영향 X
2. 영역 2 옵션 A1의 export 변경이 단테에 영향 X
3. reset 메서드 / fresh instance per test 영역 코드 변경 X

본 영역 종전 신설 가드 영역 (사전 검증 영역 잠재 영역 2) — *직접 view 검증* 후 *non-issue 확정*. 영역 6 패턴 (검증 결과로 정책 영역 정정) 적용 — 가드 추가 → 가드 무효화.

---

## 영역 4: KSIC 26 universe baseline

### 정착 baseline (13단계 field-test 정합)

`docs/sagyeongin/verifications/2026-05-07-stage13-field-test.md` 인용:

- universe: KSIC 26 (전자부품) + KOSDAQ+KOSPI 통합
- after_static_filter: 294 (KSIC 26 name/induty 매칭 후)
- status_013 = 0 (294 corp 전원 stage1 통과 — corp_code 활성 기업 집합)

### 16(b) 진입 universe 합의

- `included_industries`: `["26"]` (KSIC 26 전자부품 단독)
- `markets`: `["KOSPI", "KOSDAQ"]` (13단계 정합)
- `min_opportunity_score`: 디폴트 (15(a) 정합)

### 11단계 / 15(a) 비교 가능성

11단계 / 15(a)는 broader universe (전 KOSPI+KOSDAQ) 기준 측정 — KSIC 26 단독 측정과 직접 비교 X. 단:
- stage1 차단 발동 시점 (~1,356번째 corp) → KSIC 26 = 294 corp이라 차단 발동 *전*에 stage1 종결 가능성 (B1 효과 직접 측정 어려움)
- 본 영역 잠재 영역 — 16(b) 측정 universe 적정성 재검토 필요

### universe 확정 — (a) KSIC 26 단독

KSIC 26 단독 측정 시 stage1에서 차단 발동 임계 (~1,356) 미도달 → B1 효과 부분 측정만 가능. 옵션:
- **(a) KSIC 26 단독 (13단계 정합 비교) — 확정.** B1 효과 부분 측정 + 15(a) candidates = 0 → ≥ 1 회복 비교 우선
- (b) Broad universe (전 KOSPI+KOSDAQ) — B1 효과 직접 측정 + 차단 임계 발동 영역 측정. 단 daily limit 초과 + 측정 시간 ↑ + 외부 자원 차단 재발 위험 ↑. **후속 사이클 (16(c))로 분리.**

확정 근거:
- 본 사이클 본질은 *측정 자격 회복* (`candidates = 0 → ≥ 1`) — 3 측정 영역 중 C1 효과 + candidates 회복 2/3을 KSIC 26으로 cover
- B1 효과는 KSIC 26 영역에서 어차피 비측정 영역 (block 미발동) → *별개 사이클로 분리*가 본 본 본 정합
- (b) 진입 시 *측정 도중 차단되면 측정 자체 실패* — 15(a) 영역 재현 위험

---

## 영역 5: shuffle seed = 미지정 디폴트 확정

### 검증 명령

```bash
grep -nE "shuffleWithSeed|namePatterned|random_seed|stage1StaticFilter" src/tools/sagyeongin/scan-execute.ts
```

핵심 흐름 영역:

- **line 241**: `const shuffled = shuffleWithSeed(namePatterned, resolved.random_seed);` — `stage1StaticFilter` 함수 *내부*. shuffle 후 line 247 for 루프 진입
- **line 633**: `stage1StaticFilter(...)` 호출 — *신규 scan 분기에서만*
- **line 618-629**: resume 분기 — `state.pending_corp_codes`로부터 universe 복원 (codeMap lookup), `stage1StaticFilter` 호출 X

### resume 시 stage1 재진입 X 정황

- stage1 도중 차단 (`stage1.limitReached`) 시 line 643: `pending_corp_codes: universe.map(c => c.corp_code)` — *shuffled 순서 그대로* corp_code 보존 → checkpoint 저장
- resume 시 line 618-629: checkpoint에 저장된 `pending_corp_codes` 그대로 universe 복원 → stage1 재진입 X

### 결론

shuffle은 *최초 실행 1회만 발동* → checkpoint에 결과 보존 → resume 시 random_seed 무관. **`random_seed` 미지정 디폴트 정합 위반 X.**

`shuffleWithSeed`의 `seed === undefined` 분기 (`scan-helpers.ts:139`)는 `Math.random` 사용 → 매 실행 다른 shuffled 결과 → ADR-0015 B1 본질 (매 실행 다른 corp 영역 차단으로 부분 회복 가능) 정합.

**16(b) 측정 정책: `random_seed` 미지정 (디폴트, args에 random_seed 영역 명시 X) 확정.**

---

## 영역 6: 측정 결과 분기별 정정 후보 영역 (14(b) ②-plus 패턴)

### 본질

field-test 결과가 ADR-0015 본 본 정정 트리거 영역에 어떻게 들어가는가 — 사전 view 단계에서 *각 결과 분기별 정정 후보*를 명시. 14(b) ②-plus 정착 패턴 (정책 후보 자체 재정의 — 사전 view 단계 본질 정정).

### 분기별 정정 후보

#### 분기 1 — B1 shuffle 효과 부재

**측정 영역**: 16(b) stage1 차단 발동 corp 분포가 11단계/15(a)와 동일 (~1,356번째 corp 결정론) 또는 유사 패턴 → B1 shuffle 효과 부재.

**정정 후보**:
- 차단 메커니즘이 *호출 순서*가 아닌 *호출 누적량* 또는 *시간당 호출률*에 종속 가설로 전환
- 후속 ADR 후보: rate-limit 전 본격 throttle (call/sec 제한) 정책 추가 검토
- ADR-0015 B1 영역 *효과 X* 정정 — 본 영역 자체 retire 또는 재정의

**측정 indicator**:
- stage1 fetch failed corp 수 (15(a) = 2,607 vs 16(b))
- 차단 발동 시점 corp index (~1,356 vs 16(b)에서의 index)
- 다만 KSIC 26 = 294 corp 영역에서 차단 임계 미도달 시 본 분기 측정 X (영역 4 잠재 영역 인용)

#### 분기 2 — C1 wrapper retry 흡수 부재

**측정 영역**: stage3 fetch failed corp 수가 15(a) = 659와 유사 → C1 wrapper retry 흡수 부재.

**정정 후보**:
- 차단이 *transient burst throttle*이 아닌 *영구 IP ban* 가설로 정정
- retry 정책 본질 재정의 — sleep 시간 ↑ (1초 → 30초/1분/5분) 또는 retry 횟수 ↑ 또는 *백오프 정책* (exponential backoff) 도입
- 후속 ADR 후보: ADR-0015 C1 영역 retry 정책 본질 재검토

**측정 indicator**:
- stage3 fetch failed corp 수 (15(a) = 659 vs 16(b))
- `naverLimited.callCount` + `kisLimited.callCount` (옵션 A1) — retry 흡수 총량 직접 측정
- 정상 흡수: callCount > 호출 corp 수 (차이만큼 retry 발동)
- 흡수 부재: callCount = 호출 corp 수 또는 stage3 fetch failed 수 = 호출 corp 수 (모두 1차 throw)

#### 분기 3 — candidates ≥ 1 회복

**측정 영역**: 15(a) candidates = 0 → 16(b) candidates ≥ 1 (회복) 또는 candidates = 0 (회복 X).

**정정 후보 (회복 X 시)**:
- ADR-0015 본 본 정책 (A2 + B1 + C1 + D1) 효과 부재 가설
- 측정 자격 회복 본질 재검토 — *측정 가능 영역 회복*이 ADR-0015만으로 부족
- 후속 ADR 후보: 외부 자원 의존 영역 본 본 본 본 우회 정책 (cache-first + offline 영역, 외부 자원 X 영역)

**정정 후보 (회복 ✓ 시)**:
- ADR-0015 본 본 정책 효과 인정 + 16(b) 측정 결과 매듭
- 단 verdict 분포 (분기 4) 본 본 본 영역 점검

**측정 indicator**:
- `pipeline_stats.returned_candidates` (15(a) = 0 vs 16(b))
- `candidates` 배열 길이 + 본 본 본 본 corp 본 본 본 본 영역

#### 분기 4 — verdict 분포 비정합

**측정 영역**: candidates ≥ 1 회복 후 verdict 분포 (BUY / BUY_FAIR / HOLD / SELL / null) 본 본 본 본 영역.

**정정 후보**:
- S-RIM verdict 본 본 본 본 본 영역 점검 트리거 (D-2 영역, ADR-0013 정착 영역)
- required-return 본 본 본 본 본 본 본 본 본 영역
- 본 영역 본격 정정 X — *후속 점검 영역*으로 본 본 본 본 매듭 시점에 누적

**측정 indicator**:
- candidates 본 본 본 본 본 verdict 분포
- skipped_corps 본 본 본 본 본 본 본 본 본 영역

### 분기별 본 본 본 본 본 본 매듭 시점 정책

각 분기 발동 시 *별개 ADR* 신설 X — *16(b) 매듭 시 누적 학습 영역*으로 본 본 본 본 영역에 누적. 본격 정책 정정 (별개 ADR) 영역은 *재현 가능 영역* 확보 후 (다른 universe 또는 다른 시점 측정 영역) 결정.

---

## 묶음 분리 영역

| 묶음 | 영역 | 변경 면 |
|---|---|---|
| 묶음 1 (callCount 노출) | 영역 2 코드 변경 (export + import + result schema) | 3 files / +~10 / -~3 |
| 묶음 2 (field-test 진입) | KSIC 26 universe + scan-execute 전체 진입 + 결과 JSON 보존 + verifications/ field-test 결과 md | code 변경 0 + verifications/ 1 file 신설 |
| 묶음 3 (16(b) 매듭) | CLAUDE.md 갱신 + 누적 학습 5번째 (진입 프롬프트 작성 시 ADR/spec 직접 grep 누락 가드) + 분기별 결과 영역 누적 | docs 변경 |

---

## 진입 흐름

1. 본 사전 검증 명세 main commit + push (사전 검증 작성 직후 main 직커밋 영역 — 16단계 누적 학습 2번 정합)
2. 묶음 1 위임 명세 작성 → Onev이 Claude Code 제출 → 결과 보고 → byte-level 검증 → 묶음 1 머지
3. 묶음 2 (field-test) 위임 명세 작성 → Onev이 Claude Code 제출 (한국 IP 환경) → 결과 보고 + 결과 JSON → byte-level 검증 → 결과 분석 → verifications/ md 추가 commit
4. 결과 분석 → 분기별 정정 후보 영역 (영역 6) 본 본 본 본 영역 누적 → 후속 ADR 후보 결정 (필요 시)
5. 묶음 3 (CLAUDE.md 갱신 + 누적 학습 5번째 추가) 직커밋

## 합의 결과

본 명세 main commit 진입 시점 합의 결과:

1. **영역 4 universe = (a) KSIC 26 단독 확정** — 15(a) 비교 차원 회복 본질 우선. (b) Broad universe는 후속 사이클 (16(c))로 분리.
2. **영역 6 분기 4 (verdict 분포) — 매듭 시점 누적 학습 영역 처리.** 1회 측정 영역의 verdict 분포 비정합은 *재현 가능 영역 X* — 별개 ADR 신설 X, 관찰 누적만. 후속 점검 영역으로 누적 → 다른 universe / 다른 시점 재현 시 ADR escalation.
3. **묶음 분리 (1 callCount 노출 / 2 field-test / 3 매듭) 확정** — 각 묶음 본질 분리됨 (code-only / 한국 IP 의존 / docs-only). 묶음 1 머지 후 build 정합 검증 → 묶음 2 진입 흐름.

본 합의 후 main 직커밋 → 묶음 1 위임 명세 진입.

---

## 참조

- ADR-0015 외부 API burst 차단 통합 정책
- `verifications/2026-05-09-stage16-pre-verify.md` — 16단계 사전 검증 (본 사이클 직전)
- `verifications/2026-05-07-stage13-field-test.md` — KSIC 26 universe 정착
- 16단계 누적 학습 4건 (`ee3075d` 매듭 시점)
- 14(b) ②-plus 정착 패턴 — 정책 후보 자체 재정의
- philosophy 7부 A (사전 솎아내기) + 5부 (분기 단위 점검 — 도구 신뢰성)
