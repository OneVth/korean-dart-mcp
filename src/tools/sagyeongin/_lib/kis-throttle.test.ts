/**
 * kis-throttle 단위 테스트.
 *
 * mock KisRatingFetcher 주입 — fetchBbbMinus5Y 응답을 큐 형태로 정의.
 *
 * Ref: ADR-0015 C1
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  KisNetworkError,
  RateLimitedKisRating,
  type KisRatingFetcher,
} from "./kis-throttle.js";
import type { KisRatingResult } from "./kis-rating-scraper.js";

type MockFetcher = KisRatingFetcher & { fetchCallCount: number };

function makeMock(opts: {
  responses: Array<KisRatingResult | Error>;
}): MockFetcher {
  let i = 0;
  const mock: MockFetcher = {
    fetchCallCount: 0,
    fetchBbbMinus5Y: async () => {
      mock.fetchCallCount++;
      const r = opts.responses[i++];
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return mock;
}

const sample: KisRatingResult = {
  value: 0.1036,
  raw_percent: 10.36,
  fetched_at: "2026-05-09T00:00:00.000Z",
  source: "kisrating.com BBB- 5Y",
};

describe("RateLimitedKisRating", () => {
  describe("정상 + retry 정책 (ADR-0015 C1)", () => {
    test("fetchBbbMinus5Y 정상 → callCount 1 + 결과 반환", async () => {
      const mock = makeMock({ responses: [sample] });
      const limited = new RateLimitedKisRating(mock);
      const r = await limited.fetchBbbMinus5Y();
      assert.equal(r.value, 0.1036);
      assert.equal(r.raw_percent, 10.36);
      assert.equal(limited.callCount, 1);
      assert.equal(mock.fetchCallCount, 1);
    });

    test("fetchBbbMinus5Y 첫 network fetch failed → retry 후 정상 → callCount 2", async () => {
      const mock = makeMock({
        responses: [
          new Error("kis-rating-scraper: network error: fetch failed"),
          sample,
        ],
      });
      const limited = new RateLimitedKisRating(mock);
      const r = await limited.fetchBbbMinus5Y();
      assert.equal(r.value, 0.1036);
      assert.equal(limited.callCount, 2);
      assert.equal(mock.fetchCallCount, 2);
    });

    test("fetchBbbMinus5Y 2회 연속 network fetch failed → KisNetworkError throw + 메시지 + callCount 2", async () => {
      const mock = makeMock({
        responses: [
          new Error("kis-rating-scraper: network error: fetch failed"),
          new Error("kis-rating-scraper: network error: fetch failed"),
        ],
      });
      const limited = new RateLimitedKisRating(mock);
      await assert.rejects(
        () => limited.fetchBbbMinus5Y(),
        (err: unknown) => {
          assert.ok(err instanceof KisNetworkError);
          assert.match((err as Error).message, /network blocked after retry/);
          assert.match((err as Error).message, /status=\[network_block\]/);
          assert.match((err as Error).message, /callCount=2/);
          return true;
        },
      );
      assert.equal(limited.callCount, 2);
      assert.equal(mock.fetchCallCount, 2);
    });

    test("fetchBbbMinus5Y 1차 fetch failed → retry 후 HTTP throw → 비-network-fetch-failed propagation", async () => {
      const mock = makeMock({
        responses: [
          new Error("kis-rating-scraper: network error: fetch failed"),
          new Error("kis-rating-scraper: HTTP 503"),
        ],
      });
      const limited = new RateLimitedKisRating(mock);
      await assert.rejects(
        () => limited.fetchBbbMinus5Y(),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(!(err instanceof KisNetworkError));
          assert.match((err as Error).message, /HTTP 503/);
          return true;
        },
      );
      assert.equal(limited.callCount, 2);
      assert.equal(mock.fetchCallCount, 2);
    });

    test("fetchBbbMinus5Y 1차 timeout throw → retry 미진입 + 그대로 propagation + callCount 1", async () => {
      const mock = makeMock({
        responses: [new Error("kis-rating-scraper: request timeout (5s)")],
      });
      const limited = new RateLimitedKisRating(mock);
      await assert.rejects(
        () => limited.fetchBbbMinus5Y(),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(!(err instanceof KisNetworkError));
          assert.match((err as Error).message, /request timeout/);
          return true;
        },
      );
      assert.equal(limited.callCount, 1);
      assert.equal(mock.fetchCallCount, 1);
    });
  });
});
