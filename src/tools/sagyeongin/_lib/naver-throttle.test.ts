/**
 * naver-throttle 단위 테스트.
 *
 * mock NaverPriceFetcher 주입 — fetchPrice 응답을 큐 형태로 정의.
 * 응답이 NaverPriceResult이면 반환, Error이면 throw.
 *
 * Ref: ADR-0015 C1
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  NaverNetworkError,
  RateLimitedNaverPrice,
  type NaverPriceFetcher,
} from "./naver-throttle.js";
import type { NaverPriceResult } from "./naver-price.js";

type MockFetcher = NaverPriceFetcher & { fetchPriceCallCount: number };

function makeMock(opts: {
  responses: Array<NaverPriceResult | Error>;
}): MockFetcher {
  let i = 0;
  const mock: MockFetcher = {
    fetchPriceCallCount: 0,
    fetchPrice: async (_symbol: string) => {
      mock.fetchPriceCallCount++;
      const r = opts.responses[i++];
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return mock;
}

const sample: NaverPriceResult = {
  symbol: "005930",
  price: 70000,
  fetched_at: "2026-05-09T00:00:00.000Z",
};

describe("RateLimitedNaverPrice", () => {
  describe("정상 + retry 정책 (ADR-0015 C1)", () => {
    test("fetchPrice 정상 → callCount 1 + 결과 반환", async () => {
      const mock = makeMock({ responses: [sample] });
      const limited = new RateLimitedNaverPrice(mock);
      const r = await limited.fetchPrice("005930");
      assert.equal(r.symbol, "005930");
      assert.equal(r.price, 70000);
      assert.equal(limited.callCount, 1);
      assert.equal(mock.fetchPriceCallCount, 1);
    });

    test("fetchPrice 첫 network fetch failed → retry 후 정상 → callCount 2", async () => {
      const mock = makeMock({
        responses: [
          new Error("naver-price: network error: fetch failed"),
          sample,
        ],
      });
      const limited = new RateLimitedNaverPrice(mock);
      const r = await limited.fetchPrice("005930");
      assert.equal(r.price, 70000);
      assert.equal(limited.callCount, 2);
      assert.equal(mock.fetchPriceCallCount, 2);
    });

    test("fetchPrice 2회 연속 network fetch failed → NaverNetworkError throw + 메시지 + callCount 2", async () => {
      const mock = makeMock({
        responses: [
          new Error("naver-price: network error: fetch failed"),
          new Error("naver-price: network error: fetch failed"),
        ],
      });
      const limited = new RateLimitedNaverPrice(mock);
      await assert.rejects(
        () => limited.fetchPrice("005930"),
        (err: unknown) => {
          assert.ok(err instanceof NaverNetworkError);
          assert.match((err as Error).message, /network blocked after retry/);
          assert.match((err as Error).message, /symbol=005930/);
          assert.match((err as Error).message, /status=\[network_block\]/);
          assert.match((err as Error).message, /callCount=2/);
          return true;
        },
      );
      assert.equal(limited.callCount, 2);
      assert.equal(mock.fetchPriceCallCount, 2);
    });

    test("fetchPrice 1차 fetch failed → retry 후 timeout throw → 비-network-fetch-failed propagation", async () => {
      const mock = makeMock({
        responses: [
          new Error("naver-price: network error: fetch failed"),
          new Error("naver-price: request timeout (5s) for 005930"),
        ],
      });
      const limited = new RateLimitedNaverPrice(mock);
      await assert.rejects(
        () => limited.fetchPrice("005930"),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(!(err instanceof NaverNetworkError));
          assert.match((err as Error).message, /request timeout/);
          return true;
        },
      );
      assert.equal(limited.callCount, 2);
      assert.equal(mock.fetchPriceCallCount, 2);
    });

    test("fetchPrice 1차 timeout throw → retry 미진입 + 그대로 propagation + callCount 1", async () => {
      const mock = makeMock({
        responses: [new Error("naver-price: request timeout (5s) for 005930")],
      });
      const limited = new RateLimitedNaverPrice(mock);
      await assert.rejects(
        () => limited.fetchPrice("005930"),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(!(err instanceof NaverNetworkError));
          assert.match((err as Error).message, /request timeout/);
          return true;
        },
      );
      assert.equal(limited.callCount, 1);
      assert.equal(mock.fetchPriceCallCount, 1);
    });
  });
});
