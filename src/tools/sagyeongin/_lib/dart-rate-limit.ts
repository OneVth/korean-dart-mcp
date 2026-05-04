/**
 * dart-rate-limit — 11단계 인프라 (ADR-0009).
 *
 * DartClient를 wrapping해 OpenDART rate limit 정책을 적용한다.
 *
 * 정책:
 * - 호출마다 callCount 증가 (retry 호출도 +1 — DART daily limit과 1:1 정합)
 * - HTTP 429 응답 감지 → 1초 sleep + 1회 retry
 * - retry 후에도 429 → DartRateLimitError throw
 * - 비-429 에러는 그대로 propagate (DartClient throw 메시지 유지)
 *
 * β-i 격리: src/lib/dart-client.ts 변경 0. composition 패턴.
 *
 * 입력 타입은 DartClientLike — DartClient의 호출 표면만 추출한 interface.
 * 단위 테스트에서 mock 주입을 단순화하고 inner의 다른 internals과 결합하지 않는다.
 *
 * 사용 패턴:
 *   const inner = new DartClient({ apiKey });
 *   const limited = new RateLimitedDartClient(inner);
 *   await limited.getJson(...);   // callCount 증가
 *   limited.callCount;             // 카운트 노출 (checkpoint 시점 결정에 활용)
 *
 * Ref: ADR-0009, ADR-0012 (callCount는 daily limit 80% checkpoint 시점에 활용)
 */

/** DartClient의 호출 표면만 추출. inner와 mock 모두 만족하는 interface. */
export interface DartClientLike {
  getJson<T = unknown>(
    path: string,
    params?: Record<string, string | number | undefined>,
  ): Promise<T>;
  getZip(
    path: string,
    params?: Record<string, string | number | undefined>,
  ): Promise<Buffer>;
}

/** DART rate limit 도달 + retry 실패 시 throw. */
export class DartRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DartRateLimitError";
  }
}

/**
 * 429 감지 — DartClient.getJson/getZip이 throw하는 에러 메시지에서 "HTTP 429" 추출.
 *
 * DartClient(`src/lib/dart-client.ts:34/48`)는 `!res.ok` 분기에서
 * `DART ${path} → HTTP ${res.status}` 형식으로 throw — 메시지 매칭이 단순.
 */
function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes("HTTP 429");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * DartClientLike의 composition wrapper.
 *
 * inner의 getJson/getZip 호출에 429 retry 정책 적용 + callCount 노출.
 */
export class RateLimitedDartClient {
  private readonly inner: DartClientLike;
  private _callCount: number = 0;

  constructor(inner: DartClientLike) {
    this.inner = inner;
  }

  get callCount(): number {
    return this._callCount;
  }

  async getJson<T = unknown>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    return this.invokeWithRetry(() => this.inner.getJson<T>(path, params), path);
  }

  async getZip(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<Buffer> {
    return this.invokeWithRetry(() => this.inner.getZip(path, params), path);
  }

  private async invokeWithRetry<T>(
    op: () => Promise<T>,
    path: string,
  ): Promise<T> {
    this._callCount++;
    try {
      return await op();
    } catch (err) {
      if (!isRateLimitError(err)) {
        throw err;
      }
      // 429 — 1초 sleep + 1회 retry. retry 호출도 callCount +1 (daily limit 1:1).
      await sleep(1000);
      this._callCount++;
      try {
        return await op();
      } catch (err2) {
        if (isRateLimitError(err2)) {
          throw new DartRateLimitError(
            `DART rate limit reached after retry — path=${path}, callCount=${this._callCount}`,
          );
        }
        throw err2;
      }
    }
  }
}
