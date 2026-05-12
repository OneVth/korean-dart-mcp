# 0017 - DART burst limit 정책 — inter-call delay 정착

- 상태: Accepted
- 결정일: 2026-05-12
- 결정자: 사용자 + Claude

## 컨텍스트

16(c) 묶음 2 field-test (2026-05-12, baseline `2089a26`) 결과 DART OpenDART API에서 **공식 문서 부재 영역의 burst limit 발견**:

- 1회차 측정: 999건 / 52초 = ~19건/초 무지연 연속 호출 → TCP connection reset (curl exit 56)
- 응답 형식: HTTP 200 + status `020`이 아닌 **L7 방화벽 IP 차단 패턴**
- 발동 경로: fetch failed (TypeError) → ADR-0015 retry (1s sleep + 1회) → 또 fetch failed → `DartRateLimitError(status=[network_block])` throw

### ADR-0015와의 본질 차이

| 영역 | ADR-0015 | 본 ADR-0017 |
|---|---|---|
| 트리거 | daily limit (status 020) 또는 retry 후에도 fetch failed | **burst** (시간당 호출 빈도) |
| 응답 | HTTP 200 + body `{"status":"020"}` 또는 TCP 차단 | TCP connection reset (L7 방화벽) |
| 대응 | retry 후 throw + fail-fast | **inter-call delay로 사전 회피** |

ADR-0015는 *발동 후 대응*이며 본 ADR-0017은 *사전 회피*. 두 정책은 **상호 보완** — burst 회피로 발동 빈도 감소 + 발동 시 fail-fast.

### DART 공식 영역 부재

OpenDART 공식 문서 (`https://opendart.fss.or.kr/guide/main.do`)에서 발견된 한도:
- daily limit: 20,000건/일
- burst limit: **문서 부재** (본 측정에서 비공식 발견)

본 측정 결과 기준으로 **~19건/초 영역에서 IP 차단 발동** 추정. 보수적 정책 정착 필요.

## 고려한 옵션

### (a) 신규 ADR-0017 신설 (별개 정책)

ADR-0015와 별개로 burst limit 정책 신설. ADR-0015 본문에 cross-reference 추가.

**장점**: 정책 본질 분리 — daily(반응) vs burst(회피). ADR 본문 가독성 정합. 미래 변경 시 영역 분리.

### (b) ADR-0015 본문 확장

ADR-0015에 burst limit 절 추가 + DartRateLimitError 라벨링 정정 + retry 정책 + inter-call delay 통합.

**문제**: 한 ADR에 *반응 정책 + 회피 정책 + 라벨링 본문* 통합 — 본문 큼, 가독성 어긋남. 미래 변경 시 conflict 면 증가.

## 결정

**(a) 신규 ADR-0017 신설 채택.**

### 정책

**delay 정착 위치**: `RateLimitedDartClient.getJson` + `getZip` 내부, 성공 호출 *후* sleep. retry sleep (1s)은 그대로 — 본질 영역 별개.

```typescript
class RateLimitedDartClient {
  constructor(
    inner: DartClientLike,
    private readonly interCallDelayMs: number = 200,
  ) { ... }

  async getJson(...): Promise<T> {
    // ... 기존 fetch + retry 영역 ...
    const result = ...; // 정상 반환값

    // ADR-0017: burst 보호 — 성공 호출 후 inter-call delay
    if (this.interCallDelayMs > 0) {
      await sleep(this.interCallDelayMs);
    }
    return result;
  }
}
```

**delay 값**: **200ms** (default).
- 산출: 묶음 2-a 측정 ~19건/초에서 burst 발동 → 보수적 5건/초 (200ms × 5 = 1초) 정책
- 100ms (10건/초) 영역도 유효하나 *재발 위험* — 200ms 정합
- 500ms (2건/초) 영역은 *과보수* — 3,963 corp 기준 ~33분 소요
- 200ms 정합: 3,963 corp 기준 ~13분 (수용 가능)

**적용 범위**: RateLimitedDartClient 모든 사용자 (scan-execute + corp-meta-refresh + 미래 도구). β-i 정합 — `src/lib/dart-client.ts` 0 변경, wrapper에서만 delay 정착.

**단테 격리**: constructor param 옵션으로 `interCallDelayMs=0` 허용. 기존 16 test 정정으로 시간 격증 0.

### DartRateLimitError 라벨링 정정 (cross-cutting)

본 ADR 범위 외 (라벨링 정정은 미래 영역 — *DartExternalAccessError* 명칭 분리 또는 그대로 유지 결정). 본 결정에서는 *DartRateLimitError 라벨링 그대로 유지* (daily + burst + network_block 모두 흡수 정합).

## 근거

### (a)를 선택한 이유

- **정책 본질 분리** — daily limit (반응 — retry + throw) vs burst limit (회피 — 사전 delay)
- **ADR 본문 가독성** — 각 ADR 본문 짧음 + 본질 명확
- **미래 변경 영역 격리** — burst 정책 변경 시 ADR-0015 본문 영향 X
- **cross-reference** — ADR-0015 본문에 *ADR-0017 참조* 추가만으로 정합

### (b)가 거부된 이유

- 한 ADR에 *반응 + 회피 + 라벨링* 통합 — 본문 큼
- 미래 변경 시 conflict 면 증가

## 결과

### 좋은 점

- **DART burst 회피** — 200ms × 5건/초 정책으로 재발 방지
- **β-i 영구 정합** — `src/lib/dart-client.ts` 0 변경. wrapper composition 정합
- **단테 정합** — constructor param 옵션으로 *test 시간 격증 0* + *production 200ms* 분리
- **모든 사용자 자동 적용** — scan-execute + corp-meta-refresh + 미래 도구 모두 정합

### 트레이드오프

- **소요 시간 증가** — 3,963 corp 기준 ~13분 (200ms). 단 *eager fetch 1회만* 발생 (cache 정착 후 후속 호출 ~0)
- **delay 값 불확실** — DART 공식 문서 부재이므로 200ms가 재발 0 보장 X. 재측정에서 검증 필요
- **scan-execute stage2-6 영향** — cache 정착 후 ~수십 호출에도 delay 정착. 단 호출 수 작아 영향 미미 (~수 초 증가)

### 미래 변경 시 영향

- **delay 값 정정** — 재측정 결과 기준으로 100ms / 300ms / 500ms 정정 가능. constructor default 변경만
- **DartRateLimitError 명칭 분리** — daily + burst + network_block 분리 필요 시 별개 ADR
- **per-endpoint delay** — DART endpoint별 burst 한도 차이 발견 시 본 ADR 확장 (예: getZip은 다른 delay)

## 참조

- ADR-0009 (rate limit policy)
- ADR-0015 (외부 API burst 차단 통합 정책 — 반응 영역; 본 ADR과 상호 보완)
- ADR-0016 (corp_meta cache — 본 발견의 측정 맥락)
- `verifications/2026-05-12-stage16c-field-test.md` (본 발견의 측정 본문)
- `src/tools/sagyeongin/_lib/dart-rate-limit.ts` (본 ADR 구현)
