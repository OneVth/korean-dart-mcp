# 0018 - DART HTML 응답 (302 redirect) → DartRateLimitError 변환 정책

- 상태: Accepted
- 결정일: 2026-05-14
- 결정자: 사용자 + Claude

## 컨텍스트

18단계 (ii) 통합 흐름 진입 시 `sagyeongin_scan_execute` 56분 31초 hang 발생. 진단 매듭 (`verifications/2026-05-14-stage18-block-diagnosis.md`, baseline `fb2a4d7`) 결과 — DART IP 차단 발동 후 `DartClient.getJson` 본문 gap에서 SyntaxError silent 본 식별.

### 본 사례 인과 (3-tier)

1. **DART IP 차단** — `curl -I https://opendart.fss.or.kr/api/list.json` → `302 Found → /error1.html`
2. **DartClient.getJson gap** — Node fetch 자동 redirect 추적 → `error1.html` HTML 응답 → `res.ok = true` → `res.json()` 호출 → **SyntaxError**
3. **wrapper fallthrough** — `RateLimitedDartClient.isFetchFailedError = false` (SyntaxError ≠ fetch failed) → retry 미발동 + DartRateLimitError throw 부재 → 모든 도구 silent failure → killer-check fail-safe (전 corp PASS) → scan-execute runaway loop

### DartClient.getJson 본문

```typescript
// src/lib/dart-client.ts
async getJson<T>(path, params): Promise<T> {
  const res = await this.fetch(url);
  if (!res.ok) {
    throw new Error(`DART ${path} → HTTP ${res.status}`);
  }
  return (await res.json()) as T;   // ← HTML 응답 시 SyntaxError throw
}
```

`getZip`은 ZIP magic byte (`PK\x03\x04`) + JSON 에러 감지 본문 정착 — `getJson`만 gap.

### β-i 가드

`src/lib/dart-client.ts` 직접 수정 — **β-i 위배 (영구 정합 가드)**. wrapper level 정착 필수.

### ADR-0015/0017과의 본질 차이

| 영역 | ADR-0015 | ADR-0017 | 본 ADR-0018 |
|---|---|---|---|
| 트리거 | daily limit / fetch failed | burst (호출 빈도) | **IP 차단 (302 → HTML)** |
| 응답 | `status: '020'` body 또는 TCP 차단 | TCP connection reset | **HTTP 200 + HTML body (redirect 추적 후)** |
| 발동 시 동작 | retry + throw | (사전 회피) | **SyntaxError silent** — 본 ADR 영역 |

ADR-0018은 ADR-0015/0017 영역 외 본 gap을 보완 — 셋이 **상호 보완** 본문.

## 고려한 옵션

### (a) wrapper level SyntaxError catch → DartRateLimitError throw 변환

`RateLimitedDartClient.getJson`에 try/catch 추가, SyntaxError 발생 시 `DartRateLimitError({ status: 'html_response_block', ... })` throw.

**장점**:
- β-i 영구 정합 (`src/lib/` 0 변경)
- 모든 사경인 14개 도구 자동 적용 (wrapper composition)
- DartRateLimitError 통합 라벨 정합 — 기존 catch 영역 영향 X
- 단테 — constructor param 변경 X

### (b) `src/lib/dart-client.ts` 직접 수정

`getJson`에 Content-Type 검사 또는 SyntaxError catch 추가.

**문제**: β-i 위배 — 영구 정합 가드. 거부.

### (c) DartClient 신규 wrapper 신설 (별개 layer)

`RateLimitedDartClient` 외 `SafeDartClient` 신설 → SyntaxError 변환 단독 책임.

**문제**: layer 복잡도 증가, wrapper composition 어긋남, 단테 영향. (a) 단일 wrapper 적절.

## 결정

**(a) wrapper level SyntaxError catch → DartRateLimitError throw 채택.**

### 정책

`RateLimitedDartClient.getJson` 정정:

```typescript
async getJson<T>(path, params) {
  try {
    const r1 = await this.inner.getJson<T>(path, params);
    if (!isRateLimitJsonResponse(r1)) {
      await this.interCallDelay();
      return r1;
    }
    // 기존 retry 본문 (ADR-0015 A2)
    // ...
  } catch (e: unknown) {
    // ADR-0018: HTML 응답 (302 redirect 추적 후) 감지
    if (e instanceof SyntaxError) {
      throw new DartRateLimitError({
        status: 'html_response_block',
        path,
        message: `DART returned non-JSON (likely IP block): ${path}`,
      });
    }
    // 기존 fetch failed retry 본문 (ADR-0015)
    if (this.isFetchFailedError(e)) {
      // ...
    }
    throw e;
  }
}
```

### DartRateLimitError status 확장

기존 `daily_limit_exceeded` / `network_block` 외 `html_response_block` 추가:

```typescript
type DartRateLimitStatus =
  | 'daily_limit_exceeded'
  | 'network_block'
  | 'html_response_block';   // ADR-0018 신설
```

### 적용 범위

`RateLimitedDartClient.getJson` 단독. `getZip`은 기존 ZIP magic byte 검사 정착 정합 — 본 ADR 영역 외.

미래 — `getZip`에서도 HTML 응답 어긋남 발견 시 본 ADR 확장.

### 단테 격리

기존 단테 영향 X — 정상 응답 path는 변경 없음. SyntaxError 발생 path는 *throw 경로 정정*만 — DartRateLimitError catch 영역 적절.

신규 단테 1건 — `mock fetch → HTML 응답 → SyntaxError → DartRateLimitError throw 검증`.

## 근거

### (a)를 선택한 이유

- **β-i 영구 정합** — `src/lib/dart-client.ts` 0 변경
- **wrapper composition 정합** — 모든 사경인 14개 도구 자동 적용
- **silent failure 차단** — scan-execute runaway loop 발생 X
- **DartRateLimitError 통합** — 기존 catch (scan-execute stage2/3 fail-fast) 자동 영향

### (b)/(c) 거부

- (b): β-i 위배 — 영구 정합 가드
- (c): layer 복잡도 + 단테 영향, 본 사례 대비 과대

## 결과

### 좋은 점

- **18단계 hang 직접 차단** — 동일 시나리오 재발 시 즉시 throw + scan-execute fail-fast
- **14개 도구 자동 보호** — wrapper composition 정합
- **β-i 영구 정합** — 미래 upstream merge 시 conflict 면 0

### 트레이드오프

- **SyntaxError 본 사례 외 원인 가능성** — false positive 영역 (단 응답이 JSON 파싱 불가 자체가 fail 정합 — DART 응답 어긋남 자체가 abnormal 영역)
- **`html_response_block` status 추가** — DartRateLimitError 확장, 기존 catch 코드 정정 0 (catch는 status 무관 — 단 status 활용 영역 정정 검토)

### 미래 변경 시 영향

- **redirect 차단 정책 추가** — Node fetch `redirect: 'manual'` 옵션 정합 시 302 직접 감지 가능 (별개 ADR 영역)
- **`getZip` HTML 응답 발견** — 본 ADR 확장 또는 별개 ADR
- **truncated JSON** — SyntaxError가 IP 차단 외 원인 시 별개 ADR (현재 영역 외)

## 참조

- ADR-0015 (외부 API burst 차단 통합 정책 — daily / fetch failed 영역, 본 gap 영역 외)
- ADR-0017 (DART burst limit — inter-call delay 회피 정책, 차단 발동 후 영역 외)
- ADR-0019 (daily_limit_usage_pct 사전 가드 — 동시 정착, 본 ADR과 상호 보완)
- 18단계 진단 매듭 `fb2a4d7` (`verifications/2026-05-14-stage18-block-diagnosis.md`)
- `src/tools/sagyeongin/_lib/dart-rate-limit.ts` (본 ADR 구현 위치)
