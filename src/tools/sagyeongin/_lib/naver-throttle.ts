/**
 * naver-throttle — 16단계 인프라 (ADR-0015 영역 C1).
 *
 * fetchNaverPrice를 wrapping해서 IP 차단 retry 정책 적용.
 *
 * naver-price 모듈 재포장 throw 패턴 (naver-price.ts:48):
 * - 네트워크 차단 시: throw new Error(`naver-price: network error: ${msg}`)
 *   여기서 msg가 "fetch failed" 형태 → 매치 (Node 18+ undici fetch 차단)
 * - 타임아웃: throw new Error(`naver-price: request timeout (5s) for ${symbol}`) → 매치 X
 * - HTTP 에러 / parse error: 그대로 propagate
 *
 * 정책 (RateLimitedDartClient 패턴 정합):
 * - 호출마다 callCount 증가 (retry 호출도 +1)
 * - 1차 호출에서 "network error: fetch failed" 메시지 throw → 1초 sleep + 1회 retry
 * - retry 후에도 동일 throw → NaverNetworkError throw with [network_block] prefix
 * - 비-network-fetch-failed throw (HTTP / timeout / parse) 그대로 propagate
 *
 * β-i 격리: src/lib/ 변경 0. naver-price.ts 변경 0. composition + interface 패턴.
 *
 * 입력 타입은 NaverPriceFetcher interface — fetchNaverPrice 함수의 호출 표면만 추출.
 * 단위 테스트에서 mock 주입을 단순화하고 inner 모듈 internals과 결합하지 않는다.
 *
 * 사용:
 *   const inner: NaverPriceFetcher = { fetchPrice: fetchNaverPrice };
 *   const limited = new RateLimitedNaverPrice(inner);
 *   await limited.fetchPrice("005930");
 *   limited.callCount;  // 카운트 노출
 *
 * Ref: ADR-0015 C1, philosophy 7부 D-2,
 *      verifications/2026-05-09-stage16-pre-verify.md 영역 2 + 5
 */

import type { NaverPriceResult } from "./naver-price.js";

/** fetchNaverPrice 함수의 호출 표면 — wrapper inner + mock 모두 만족하는 interface. */
export interface NaverPriceFetcher {
  fetchPrice(symbol: string): Promise<NaverPriceResult>;
}

/** naver-price 네트워크 차단 + retry 실패 시 throw. */
export class NaverNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NaverNetworkError";
  }
}

/**
 * naver-price network error 감지.
 *
 * naver-price.ts:48 재포장 메시지: "naver-price: network error: ${msg}"
 * 여기서 msg는 raw err.message — fetch 차단 시 "fetch failed".
 * 메시지 매치: includes("network error: fetch failed").
 *
 * AbortError (timeout) 메시지는 "naver-price: request timeout (5s) for ${symbol}" → 매치 X.
 * HTTP / parse error 메시지도 매치 X.
 */
function isNaverNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes("network error: fetch failed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * NaverPriceFetcher의 composition wrapper.
 *
 * inner.fetchPrice 호출에 network fetch failed retry 정책 적용 + callCount 노출.
 */
export class RateLimitedNaverPrice {
  private readonly inner: NaverPriceFetcher;
  private _callCount: number = 0;

  constructor(inner: NaverPriceFetcher) {
    this.inner = inner;
  }

  get callCount(): number {
    return this._callCount;
  }

  /**
   * fetchPrice — 1차 network fetch failed 시 sleep + retry, 2차에서도 fetch failed → NaverNetworkError throw.
   *
   * 1차: inner.fetchPrice 호출 → 정상 반환 또는 throw
   * 1차에서 "network error: fetch failed" 메시지 throw 시: sleep + retry → 정상 반환 또는 throw
   * 2차에서도 fetch failed → NaverNetworkError throw with [network_block] prefix
   *
   * 비-network-fetch-failed throw (HTTP / timeout / parse): 그대로 propagate
   */
  async fetchPrice(symbol: string): Promise<NaverPriceResult> {
    this._callCount++;
    try {
      return await this.inner.fetchPrice(symbol);
    } catch (err) {
      if (!isNaverNetworkError(err)) throw err;
      // 1차 network fetch failed — sleep + retry
      await sleep(1000);
      this._callCount++;
      try {
        return await this.inner.fetchPrice(symbol);
      } catch (err2) {
        if (isNaverNetworkError(err2)) {
          throw new NaverNetworkError(
            `naver-price network blocked after retry — symbol=${symbol}, status=[network_block], callCount=${this._callCount}`,
          );
        }
        throw err2;
      }
    }
  }
}
