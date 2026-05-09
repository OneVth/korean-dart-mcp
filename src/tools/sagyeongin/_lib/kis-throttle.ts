/**
 * kis-throttle — 16단계 인프라 (ADR-0015 영역 C1).
 *
 * fetchKisRatingBbbMinus5Y를 wrapping해서 IP 차단 retry 정책 적용.
 *
 * kis-rating-scraper 모듈 재포장 throw 패턴 (kis-rating-scraper.ts:44):
 * - 네트워크 차단 시: throw new Error(`kis-rating-scraper: network error: ${msg}`)
 *   여기서 msg가 "fetch failed" 형태 → 매치 (Node 18+ undici fetch 차단)
 * - 타임아웃: throw new Error("kis-rating-scraper: request timeout (5s)") → 매치 X
 * - HTTP 에러 / parse error: 그대로 propagate
 *
 * 정책 (RateLimitedDartClient 패턴 정합):
 * - 호출마다 callCount 증가 (retry 호출도 +1)
 * - 1차 호출에서 "network error: fetch failed" 메시지 throw → 1초 sleep + 1회 retry
 * - retry 후에도 동일 throw → KisNetworkError throw with [network_block] prefix
 * - 비-network-fetch-failed throw (HTTP / timeout / parse) 그대로 propagate
 *
 * β-i 격리: src/lib/ 변경 0. kis-rating-scraper.ts 변경 0. composition + interface 패턴.
 *
 * 입력 타입은 KisRatingFetcher interface — fetchKisRatingBbbMinus5Y 함수의 호출 표면 추출.
 *
 * 사용:
 *   const inner: KisRatingFetcher = { fetchBbbMinus5Y: fetchKisRatingBbbMinus5Y };
 *   const limited = new RateLimitedKisRating(inner);
 *   await limited.fetchBbbMinus5Y();
 *   limited.callCount;
 *
 * Ref: ADR-0015 C1, philosophy 7부 D-2,
 *      verifications/2026-05-09-stage16-pre-verify.md 영역 2 + 5
 */

import type { KisRatingResult } from "./kis-rating-scraper.js";

/** fetchKisRatingBbbMinus5Y 함수의 호출 표면 — wrapper inner + mock 모두 만족하는 interface. */
export interface KisRatingFetcher {
  fetchBbbMinus5Y(): Promise<KisRatingResult>;
}

/** kis-rating 네트워크 차단 + retry 실패 시 throw. */
export class KisNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KisNetworkError";
  }
}

/**
 * kis-rating network error 감지.
 *
 * kis-rating-scraper.ts:44 재포장 메시지: "kis-rating-scraper: network error: ${msg}"
 * msg가 "fetch failed" 시 매치.
 *
 * AbortError / HTTP / parse 메시지는 매치 X.
 */
function isKisNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes("network error: fetch failed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * KisRatingFetcher의 composition wrapper.
 *
 * inner.fetchBbbMinus5Y 호출에 network fetch failed retry 정책 적용 + callCount 노출.
 */
export class RateLimitedKisRating {
  private readonly inner: KisRatingFetcher;
  private _callCount: number = 0;

  constructor(inner: KisRatingFetcher) {
    this.inner = inner;
  }

  get callCount(): number {
    return this._callCount;
  }

  /**
   * fetchBbbMinus5Y — 1차 network fetch failed 시 sleep + retry, 2차에서도 fetch failed → KisNetworkError throw.
   *
   * 1차: inner.fetchBbbMinus5Y 호출 → 정상 반환 또는 throw
   * 1차에서 "network error: fetch failed" 메시지 throw 시: sleep + retry → 정상 반환 또는 throw
   * 2차에서도 fetch failed → KisNetworkError throw with [network_block] prefix
   *
   * 비-network-fetch-failed throw (HTTP / timeout / parse): 그대로 propagate
   */
  async fetchBbbMinus5Y(): Promise<KisRatingResult> {
    this._callCount++;
    try {
      return await this.inner.fetchBbbMinus5Y();
    } catch (err) {
      if (!isKisNetworkError(err)) throw err;
      // 1차 network fetch failed — sleep + retry
      await sleep(1000);
      this._callCount++;
      try {
        return await this.inner.fetchBbbMinus5Y();
      } catch (err2) {
        if (isKisNetworkError(err2)) {
          throw new KisNetworkError(
            `kis-rating network blocked after retry — status=[network_block], callCount=${this._callCount}`,
          );
        }
        throw err2;
      }
    }
  }
}
