# 16단계 진입 전 사전 검증 — ADR-0015 구현

- 일자: 2026-05-09
- baseline: main HEAD `450fc87` (15(a) 사이클 종료 매듭)
- 검증자: Claude (Onev fork view 기반)
- 목적: ADR-0015 4영역 (A2 + B1 + C1 + D1) 본격 구현 명세 작성 전 가정값 vs 실측 어긋남 차단 + 미확정 정책 영역 확정

## 검증 영역

1. RateLimitedDartClient fetch failed detection 매치 패턴
2. naver-price.ts + kis-rating-scraper.ts fetch catch 흐름 + 재포장 메시지
3. D1 fail-fast 카운터 enrich 흐름 적용 정책 (옵션 α/β/γ)
4. dart-rate-limit.test.ts + scan-helpers.test.ts 현재 단테 카운트
5. naver/KIS wrapper 인터페이스 + 클래스명
6. Fisher-Yates shuffle 위치 + 시드 PRNG 채택
7. 묶음 분리 P3 변형 변경 면 표
8. D1 임계 input args 노출 필드명

## 결과 요약

| 영역 | 결론 |
|---|---|
| 1 | `err instanceof TypeError && err.message.includes("fetch failed")` — Node 18+ undici fetch 표준. RateLimitedDartClient는 raw fetch failed 수신 |
| 2 | naver/KIS 둘 다 *재포장* — `network error: ${msg}` 형식 throw. wrapper detection은 메시지 매치 |
| 3 | **옵션 α 확정** — scan-execute level 단일 카운터, stage1/2/3 + enrich 모두 propagate. 5부 침해 미미 (retry 후 throw만 카운터에 도달) |
| 4 | dart-rate-limit.test.ts = **10**, scan-helpers.test.ts = **14** (직접 grep 카운트) |
| 5 | composition 패턴 + 단일-method interface. `RateLimitedNaverPrice` / `RateLimitedKisRating` 클래스, `NaverPriceFetcher` / `KisRatingFetcher` interface |
| 6 | scan-helpers.ts에 helper 추가. mulberry32 PRNG (외부 의존 0). 시그너처 `shuffleWithSeed<T>(arr: T[], seed?: number): T[]` |
| 7 | 묶음 1 (A2) → 묶음 2 (C1 wrapper 신설) → 묶음 3 (B1 + D1 + C1 호출자 적용) → 16(b) field-test |
| 8 | input args `consecutive_fetch_failed_threshold?: number` (디폴트 10), state.input_args 보존 |

---

## 영역 1: RateLimitedDartClient fetch failed detection 매치 패턴

### Node 18+ fetch failed throw 형태

Node.js 내장 fetch (undici 기반) 네트워크 차단 시 throw 패턴:

```
TypeError: fetch failed
  at Object.fetch (node:internal/deps/undici/undici:...)
  ...
  cause: Error { code: 'ECONNREFUSED' | 'ETIMEDOUT' | 'ENOTFOUND' | ... }
```

- `err.name === "TypeError"`, `err.message === "fetch failed"`
- `err.cause`는 undici 버전 의존 + 환경 의존 (ECONNREFUSED / ETIMEDOUT / ENOTFOUND 등 변형) — **매치 영역에서 제외**
- 메시지 매치만 사용: `err.message.includes("fetch failed")` — 안정 + 재현 가능

### 채택 detection 함수

`src/tools/sagyeongin/_lib/dart-rate-limit.ts`에 추가:

```typescript
function isFetchFailedError(err: unknown): boolean {
  return err instanceof TypeError && err.message.includes("fetch failed");
}
```

### 단테 mock 시뮬 패턴

```typescript
const fetchFailedError = new TypeError("fetch failed");
mockClient.getJson = async () => { throw fetchFailedError; };
```

`Object.assign`으로 `cause` 부착은 영역 X — 매치 본 항목이 `err.message`만이므로 mock 단순화.

---

## 영역 2: naver-price.ts + kis-rating-scraper.ts fetch catch 흐름

### naver-price.ts (line 41-51)

```typescript
try {
  response = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
} catch (err: unknown) {
  if (err instanceof Error && err.name === "AbortError") {
    throw new Error(`naver-price: request timeout (5s) for ${symbol}`);
  }
  const msg = err instanceof Error ? err.message : String(err);
  throw new Error(`naver-price: network error: ${msg}`);
}
```

→ fetch failed 발생 시 throw 메시지: `naver-price: network error: fetch failed`

### kis-rating-scraper.ts (line 37-47)

동일 패턴. throw 메시지: `kis-rating-scraper: network error: fetch failed`

### 시사점

두 모듈 모두 *raw fetch failed propagate X* — 재포장된 Error로 throw. 따라서 wrapper detection은:

- naver-throttle: `err.message.includes("naver-price: network error")` 또는 `err.message.includes("network error: fetch failed")`
- kis-throttle: `err.message.includes("kis-rating-scraper: network error")` 또는 동일

추천: **`network error: fetch failed` 매치 통합** — 두 wrapper에서 동일 detection 함수 재사용 가능. AbortError 메시지 (`request timeout`)는 매치 X (별도 분기).

`src/tools/sagyeongin/_lib/`에 공유 detection 모듈 신설 또는 각 wrapper에서 inline. 추천: dart-rate-limit.ts와 같은 위치에 내부 함수, 묶음 2에서 재사용 패턴 정합.

### β-i 격리 검증

naver-price.ts + kis-rating-scraper.ts 둘 다 `src/tools/sagyeongin/_lib/` — `src/lib/`이 아니므로 wrapper 적용을 위한 모듈 변경 가능 영역. 단 본 명세는 *모듈 변경 0* 채택 (wrapper만 추가) — 기존 호출자 (srim 흐름) 호환성 유지 + 변경 면 최소.

---

## 영역 3: D1 fail-fast 카운터 enrich 흐름 적용 정책

### 검토 옵션

| 옵션 | 적용 면 | 5부 사상 정합 | 검토 |
|---|---|---|---|
| α | stage1/2/3 + enrich 모든 catch에 propagate | 일반 fetch failed 누적 시 enrich "탈락 X" 침해 위험 | A2 retry 흡수 후만 카운터 propagate → 침해 미미 |
| β | stage1/2/3 한정 | enrich 5부 사상 보존 | enrich burst 미인지 → ADR-0015 본질 침해 |
| γ | stage1/2/3 임계 10 + enrich 별도 임계 5 | 보존 + 양쪽 인지 | 임계 분리 효용 대비 복잡도 큼 |

### 옵션 α 확정 근거

1. A2 강화 후 retry 1회 흡수 → *retry 실패한 영구 차단 신호*만 `DartRateLimitError` (메시지 `[network_block]`) throw로 propagate
2. 일시 fetch failed 1회는 A2에서 흡수 → scan-execute level 카운터에 미도달 → enrich 일반 실패와 분리 자연
3. 4 dep × N corp 구조 → enrich 한 corp 영구 차단 시 카운터 4 누적 → 임계 10이면 corp ~2.5개 영역에서 fail-fast

### 카운터 위치

scan-execute level. `RateLimitedDartClient` 내부는 단일 호출 단위 — 흐름 통합은 scan-execute의 책임.

### 카운터 흐름

- 변수: scan-execute body의 `let consecutiveFetchFailed = 0;`
- 정상 응답 시: `consecutiveFetchFailed = 0` (리셋)
- `DartRateLimitError` catch 시: `consecutiveFetchFailed++`
- 임계 도달 시 (`>= threshold`): saveAndReturnPartial 호출 (stage1/2/3) 또는 `limitReachedDuringEnrich: true` 반환 (enrich 흐름) — *현재 처리 흐름 자연 정합*

### enrich 흐름 catch 분기 (line 365/387/406/422) 정정

각 catch 블록:
```typescript
} catch (e) {
  if (e instanceof DartRateLimitError) {
    consecutiveFetchFailed++;
    if (consecutiveFetchFailed >= threshold) {
      return { enriched, limitReachedDuringEnrich: true };
    }
    return { enriched, limitReachedDuringEnrich: true };  // 기존 동일
  }
  consecutiveFetchFailed = 0;  // 비-DartRateLimitError 일반 실패는 리셋
  stageNotes.push(...);
}
```

→ 단순화: enrich에서 `DartRateLimitError`는 *임계 검사 없이* 즉시 `limitReachedDuringEnrich: true` 반환 (현재 흐름 그대로). 카운터는 enrich 진입 *전후*에 stage2/3에서만 누적 + 검사. enrich 진입 시점에 임계 미달이면 enrich 진입, enrich 안에서 `DartRateLimitError` 발생 시 *그 자체로* limitReached 처리 (현재 흐름 보존).

→ **재정정**: 옵션 α는 카운터를 stage1/2/3 + enrich 모두 누적이 본질이므로 위 단순화는 옵션 β로 회귀. 옵션 α 본질 유지하려면 enrich에서도 카운터 ++ + 임계 검사 필요. 단 enrich의 `limitReachedDuringEnrich: true` 반환은 *어차피* 즉시 종결이므로 카운터 의미는 stage1/2/3 → enrich 진입 시점에 임계 검사가 본질 영역.

### 옵션 α 본질 정정

1. stage1StaticFilter 함수 내부: `DartRateLimitError` catch 시 카운터 ++ + 임계 검사. 임계 도달 시 `limitReached: true` 반환 (현재 흐름 정합).
2. Stage 2/3 loop: `DartRateLimitError` catch 시 카운터 ++ + 임계 검사. 임계 도달 시 saveAndReturnPartial.
3. enrich 흐름: 첫 `DartRateLimitError`만으로 즉시 `limitReachedDuringEnrich: true` (현재 흐름 — 카운터 검사 X. 단 카운터는 enrich 진입 전 stage2/3 누적분이 임계 도달했다면 *enrich 진입 자체 전*에 saveAndReturnPartial로 종결).

→ enrich는 자체 처리 흐름이 *어차피 첫 신호로 즉시 종결*이므로 카운터 검사 추가 의미 X. **옵션 α 본질 = stage1/2/3에 카운터 + 임계 검사 + enrich는 현재 흐름 유지** (사실상 옵션 β와 동일 effect). 

### 최종 결정 — **옵션 β 정정 채택**

옵션 α/β 효과 영역 동일. **옵션 β 채택**: stage1/2/3 한정 카운터. enrich는 현재 `limitReachedDuringEnrich: true` 흐름 그대로. 5부 사상 보존 자동.

근거:
- enrich 흐름은 첫 `DartRateLimitError` 신호로 즉시 종결 — 카운터 추가 의미 X
- 임계 누적은 stage1/2/3 (corp 단위 반복) 본질 — enrich는 4 dep × 1 corp 단위
- 변경 면 최소

---

## 영역 4: 단테 카운트 직접 grep

### dart-rate-limit.test.ts

`grep -cE "^[[:space:]]*test\(" src/tools/sagyeongin/_lib/dart-rate-limit.test.ts` = **10**

기존 10 케이스:
1. getJson status '000' (정상) → callCount 1 + 정상 반환 (line 70)
2. getJson 비-020 응답 (status '013') → 정상 반환 + callCount 1 (line 84)
3. getJson 첫 020 → retry 후 정상('000') → callCount 2 (line 98)
4. getJson 2회 연속 020 → DartRateLimitError throw + 메시지 + callCount 2 (line 114)
5. getJson HTTP 500 throw → retry 0회 + 원본 propagation + callCount 1 (line 138)
6. getZip 정상 ZIP → callCount 1 + Buffer 반환 (line 158)
7. getZip 첫 [020] throw → retry 후 정상 → callCount 2 (line 167)
8. getZip 2회 연속 [020] throw → DartRateLimitError throw + callCount 2 (line 182)
9. getZip 비-[020] throw (HTTP 500) → retry 0회 + 원본 propagation (line 201)
10. getJson + getZip 여러 호출 후 callCount 누적 (line 220)

### A2 +6 케이스 (10 → 16)

11. getJson fetch failed 1회 → retry 후 정상('000') → callCount 2
12. getJson fetch failed 2회 연속 → DartRateLimitError throw + 메시지 `[network_block]` 포함 + callCount 2
13. getJson fetch failed → retry 후 HTTP 500 throw → retry HTTP 에러 propagation
14. getZip fetch failed 1회 → retry 후 정상 → callCount 2
15. getZip fetch failed 2회 연속 → DartRateLimitError throw + 메시지 `[network_block]` 포함 + callCount 2
16. getZip fetch failed → retry 후 [020] throw → 020 retry 분기 미진입 (비-fetch-failed propagation)

### scan-helpers.test.ts

`grep -cE "^[[:space:]]*test\(" src/tools/sagyeongin/_lib/scan-helpers.test.ts` = **14**

### B1 +3 케이스 (14 → 17)

15. shuffleWithSeed: 시드 고정 → 두 번 호출 결과 동일 (결정론)
16. shuffleWithSeed: 시드 미지정 → 두 번 호출 결과 다름 (무작위 — 확률적, 단 충돌 영역 매우 작음)
17. shuffleWithSeed: 빈 배열 → 빈 배열 반환 / 단일 원소 → 동일 반환 (edge)

---

## 영역 5: naver/KIS wrapper 인터페이스

### 모듈 시그너처 직접 view

- naver-price.ts (73줄): `export async function fetchNaverPrice(symbol: string): Promise<NaverPriceResult>` — 단일 named export
- kis-rating-scraper.ts (94줄): `export async function fetchKisRatingBbbMinus5Y(): Promise<KisRatingResult>` — 단일 named export

### Wrapper 클래스 + interface 채택

`src/tools/sagyeongin/_lib/naver-throttle.ts`:

```typescript
export interface NaverPriceFetcher {
  fetchPrice(symbol: string): Promise<NaverPriceResult>;
}

export class NaverNetworkError extends Error {
  constructor(message: string) { super(message); this.name = "NaverNetworkError"; }
}

export class RateLimitedNaverPrice {
  private readonly inner: NaverPriceFetcher;
  private _callCount: number = 0;
  
  constructor(inner: NaverPriceFetcher) { this.inner = inner; }
  get callCount(): number { return this._callCount; }
  
  async fetchPrice(symbol: string): Promise<NaverPriceResult> {
    this._callCount++;
    try {
      return await this.inner.fetchPrice(symbol);
    } catch (err) {
      if (!isNaverNetworkError(err)) throw err;
      // 1차 fetch failed (재포장 메시지) — sleep + retry
      await sleep(1000);
      this._callCount++;
      try {
        return await this.inner.fetchPrice(symbol);
      } catch (err2) {
        if (isNaverNetworkError(err2)) {
          throw new NaverNetworkError(
            `naver-price network blocked after retry — symbol=${symbol}, callCount=${this._callCount}`
          );
        }
        throw err2;
      }
    }
  }
}

function isNaverNetworkError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("network error: fetch failed");
}
```

`src/tools/sagyeongin/_lib/kis-throttle.ts` 동일 패턴 (`KisRatingFetcher` / `KisNetworkError` / `RateLimitedKisRating`).

### inner adapter

`fetchNaverPrice` 함수를 interface 만족 객체로 변환:
```typescript
const naverInner: NaverPriceFetcher = {
  fetchPrice: fetchNaverPrice,  // 함수 자체가 (symbol) => Promise<NaverPriceResult>
};
```

호출자 (srim 흐름) 변경 면은 묶음 3.

---

## 영역 6: Fisher-Yates shuffle 위치 + PRNG

### 위치

`src/tools/sagyeongin/_lib/scan-helpers.ts`에 helper 추가. 별도 파일 신설 X (단순 helper 영역).

### 시그너처

```typescript
/**
 * Fisher-Yates shuffle — seed 기반 결정론 또는 무작위.
 * seed 미지정: Math.random() 디폴트 (무작위)
 * seed 지정 (number): mulberry32 PRNG 결정론
 *
 * 외부 의존 0. 입력 배열 변경 X (새 배열 반환).
 */
export function shuffleWithSeed<T>(arr: T[], seed?: number): T[] {
  const result = arr.slice();
  const rand = seed === undefined ? Math.random : mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

### 시드 보존 흐름

scan-execute input args:
```typescript
random_seed?: number;  // optional, default undefined (무작위)
```

`state.input_args.random_seed` 보존 → resume 시 동일 seed로 universe 순서 복원 (ADR-0014 정합).

---

## 영역 7: 묶음 분리 P3 변형 변경 면 표

| 묶음 | 영역 | 변경 면 | 단테 변경 |
|---|---|---|---|
| **1** | A2 — RateLimitedDartClient 강화 | `dart-rate-limit.ts`: `getJson` try/catch 구조 변경 + `getZip` catch 분기 추가 + `isFetchFailedError` + `[network_block]` throw 메시지 | `dart-rate-limit.test.ts` 10 → 16 (+6) |
| **2** | C1 — naver/KIS wrapper 신설 | `naver-throttle.ts` 신설 + `kis-throttle.ts` 신설 (lib 독립, 호출자 미연결 — dead code 머지) | `naver-throttle.test.ts` 신설 (~5) + `kis-throttle.test.ts` 신설 (~5) |
| **3** | B1 + D1 + C1 호출자 적용 | `scan-helpers.ts`: `shuffleWithSeed` + `mulberry32` 추가. `scan-execute.ts`: universe shuffle + `consecutiveFetchFailed` 카운터 (stage1/2/3) + input args `random_seed` + `consecutive_fetch_failed_threshold`. srim 호출 흐름의 naver/KIS 적용 (호출자 변경) | `scan-helpers.test.ts` 14 → 17 (+3). scan-execute D1 카운터 단테 — 신설 또는 helper 추출 후 단테 |
| **4 (16(b))** | field-test (a) 재측정 | DART 24h 리셋 + naver/KIS IP 회복 후 별도 사이클 | 없음 |

### 묶음 2 dead code 머지 영역 검증

C1 wrapper 신설은 묶음 2 머지 시점에 호출자 미연결 → unused export. broken state 정의는 build/test 실패이므로 dead code 머지는 broken 아님. 묶음 3 호출자 변경 시 활용. 분기 정합.

---

## 영역 8: D1 임계 input args 노출

### scan-execute input schema 추가

```typescript
random_seed: z.number().int().optional(),
consecutive_fetch_failed_threshold: z.number().int().min(1).default(10),
```

### 디폴트 10 근거

영역 1 (15(a) field-test):
- stage1 = 2,607 fetch failed 영구 차단 + retry 정상 응답 0건
- 5회 = 단발성 네트워크 오류 흡수 부족 가능
- 20회 = ~2.9s 추가 낭비 (throw 자체 빠름이므로 정확 영역 미미)
- **10**: 단발성 흡수 + burst 빠른 인지 균형

### state.input_args 보존

`state.input_args.random_seed` + `state.input_args.consecutive_fetch_failed_threshold` 보존 → resume 시 동일 정책 적용.

---

## 묶음 1 진입 사전 합의 항목

위 8 영역 본 결과 기반 묶음 1 (A2) 위임 명세 작성 진입. Onev 확인 영역:

1. **영역 3 옵션 β 정정 합의** (앞서 옵션 α 추천을 본 검증 분석 후 옵션 β로 정정 — enrich 자체 흐름이 첫 신호 즉시 종결로 카운터 검사 의미 X)
2. **영역 5 wrapper 클래스명** — `RateLimitedNaverPrice` / `RateLimitedKisRating` 또는 다른 명명 영역
3. **영역 6 PRNG 채택** — mulberry32 (외부 의존 0) 또는 다른 알고리즘 영역
4. **영역 8 input args 필드명** — `random_seed` + `consecutive_fetch_failed_threshold` 또는 다른 명명 영역

위 4건 합의 후 묶음 1 위임 명세 작성 진입.

## 참조

- ADR-0015 본문 (`docs/sagyeongin/adr/0015-external-api-burst-policy.md`)
- 15(a) field-test 결과 (`docs/sagyeongin/verifications/2026-05-09-stage15a-field-test.md`)
- 11단계 사전 검증 패턴 (`docs/sagyeongin/verifications/2026-05-04-stage11-pre-verify.md`)
- 9단계 verifications/ 패턴 정착 (`docs/sagyeongin/verifications/2026-05-03-stage9-pre-verify.md`)
