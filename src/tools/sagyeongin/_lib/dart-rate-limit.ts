/**
 * dart-rate-limit — 11단계 인프라 (ADR-0009).
 *
 * DartClient를 wrapping해서 OpenDART rate limit 정책을 적용한다.
 *
 * OpenDART rate limit 응답 형태 (사전 검증 1번):
 * - JSON: HTTP 200 + body `{"status":"020","message":"..."}`
 *   (HTTP 429 아님 — DartClient.getJson은 throw 없이 그대로 반환)
 * - ZIP: dart-client.ts:55-65에서 이미 throw로 변환됨
 *   (메시지 형식: `DART ${path} → [020] ${message}`)
 *
 * 정책:
 * - 호출마다 callCount 증가 (retry 호출도 +1 — DART daily limit과 1:1)
 * - JSON: 반환값 body.status === "020" 감지 → 1초 sleep + 1회 retry
 * - ZIP: throw된 에러 메시지에 "[020]" 포함 감지 → 1초 sleep + 1회 retry
 * - retry 후에도 020 → DartRateLimitError throw (status code를 메시지에 명시)
 * - 비-020 에러 (HTTP 4xx/5xx, 다른 status "010"/"011"/"013" 등) 그대로 propagate
 *
 * β-i 격리: src/lib/dart-client.ts 변경 0. composition 패턴.
 *
 * 입력 타입은 DartClientLike — DartClient의 호출 표면만 추출한 interface.
 * 단위 테스트에서 mock 주입을 단순화하고 inner의 다른 internals과 결합하지 않는다.
 *
 * 사용:
 *   const inner = new DartClient({ apiKey });
 *   const limited = new RateLimitedDartClient(inner);
 *   await limited.getJson(...);   // callCount 증가
 *   limited.callCount;             // 카운트 노출 (checkpoint 시점 결정에 활용)
 *
 * Ref: ADR-0009, ADR-0012 (callCount는 daily limit 80% checkpoint 시점에 활용),
 *      verifications/2026-05-04-stage11-pre-verify.md 1번
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

/** OpenDART body status code "020" — 일일 한도 초과. */
const RATE_LIMIT_STATUS = "020";

/**
 * JSON 반환값에서 rate limit 감지.
 *
 * OpenDART body 형식: { status: "020", message: "..." } (HTTP 200).
 * 객체가 아니거나 status 필드가 없거나 "020"이 아니면 false.
 */
function isRateLimitJsonResponse(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const status = (value as { status?: unknown }).status;
  return status === RATE_LIMIT_STATUS;
}

/**
 * ZIP throw 메시지에서 rate limit 감지.
 *
 * dart-client.ts:60-62 — `DART ${path} → [${err.status}] ${err.message}` 형식.
 * 메시지에 "[020]" 포함 시 rate limit 도달.
 */
function isRateLimitErrorMessage(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes(`[${RATE_LIMIT_STATUS}]`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * DartClientLike의 composition wrapper.
 *
 * inner의 getJson/getZip 호출에 020 retry 정책 적용 + callCount 노출.
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

  /**
   * JSON — 반환값 body.status "020" 감지.
   *
   * 1차: inner.getJson 호출 → 반환값 status "020" 검사
   * 2차 (1차에서 020 감지 시): sleep + retry → 반환값 status "020" 검사
   * 2차에서도 020 → DartRateLimitError throw
   *
   * inner.getJson 자체가 throw할 때 (HTTP 4xx/5xx 등): 그대로 propagate
   */
  async getJson<T = unknown>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    this._callCount++;
    const r1 = await this.inner.getJson<T>(path, params);
    if (!isRateLimitJsonResponse(r1)) return r1;
    // 1차 020 감지 — sleep + retry
    await sleep(1000);
    this._callCount++;
    const r2 = await this.inner.getJson<T>(path, params);
    if (!isRateLimitJsonResponse(r2)) return r2;
    throw new DartRateLimitError(
      `DART rate limit reached after retry — path=${path}, status=${RATE_LIMIT_STATUS}, callCount=${this._callCount}`,
    );
  }

  /**
   * ZIP — throw된 에러 메시지에서 "[020]" 감지.
   *
   * 1차: inner.getZip 호출 → 정상 반환 또는 throw
   * 1차에서 020 메시지 throw 시: sleep + retry → 정상 반환 또는 throw
   * 2차에서도 020 메시지 throw → DartRateLimitError throw
   *
   * 비-020 throw (HTTP 에러 또는 다른 status code): 그대로 propagate
   */
  async getZip(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<Buffer> {
    this._callCount++;
    try {
      return await this.inner.getZip(path, params);
    } catch (err) {
      if (!isRateLimitErrorMessage(err)) {
        throw err;
      }
      // 1차 020 감지 — sleep + retry
      await sleep(1000);
      this._callCount++;
      try {
        return await this.inner.getZip(path, params);
      } catch (err2) {
        if (isRateLimitErrorMessage(err2)) {
          throw new DartRateLimitError(
            `DART rate limit reached after retry — path=${path}, status=${RATE_LIMIT_STATUS}, callCount=${this._callCount}`,
          );
        }
        throw err2;
      }
    }
  }
}
