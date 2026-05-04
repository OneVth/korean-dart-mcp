/**
 * dart-rate-limit 단위 테스트.
 *
 * Node built-in test runner (node --test). 빌드 후 실행.
 * mock 기반 — 실 DART 호출 0 (ADR-0003 정합).
 *
 * sleep(1000) 호출이 retry 케이스에 들어가므로 각 retry 케이스는 약 1초 대기.
 * 전체 테스트 약 2~4초 소요 자연.
 *
 * Ref: ADR-0009, ADR-0003
 */

import { describe, test } from "node:test";
import * as assert from "node:assert/strict";
import {
  RateLimitedDartClient,
  DartRateLimitError,
  type DartClientLike,
} from "./dart-rate-limit.js";

/**
 * mock DartClient — getJson/getZip 호출 횟수와 응답 시퀀스를 제어.
 *
 * jsonResponses: getJson 호출마다 차례로 꺼내 반환 (Error면 throw).
 * zipResponses: getZip 동일.
 */
interface MockClient extends DartClientLike {
  readonly getJsonCallCount: number;
  readonly getZipCallCount: number;
}

function makeMock(opts: {
  jsonResponses?: Array<unknown | Error>;
  zipResponses?: Array<Buffer | Error>;
}): MockClient {
  let getJsonCallCount = 0;
  let getZipCallCount = 0;
  const jsonQueue = [...(opts.jsonResponses ?? [])];
  const zipQueue = [...(opts.zipResponses ?? [])];

  return {
    async getJson<T = unknown>(): Promise<T> {
      getJsonCallCount++;
      if (jsonQueue.length === 0) {
        throw new Error("mock getJson: 응답 큐 소진");
      }
      const next = jsonQueue.shift();
      if (next instanceof Error) throw next;
      return next as T;
    },
    async getZip(): Promise<Buffer> {
      getZipCallCount++;
      if (zipQueue.length === 0) {
        throw new Error("mock getZip: 응답 큐 소진");
      }
      const next = zipQueue.shift();
      if (next instanceof Error) throw next;
      return next as Buffer;
    },
    get getJsonCallCount() {
      return getJsonCallCount;
    },
    get getZipCallCount() {
      return getZipCallCount;
    },
  };
}

describe("RateLimitedDartClient", () => {
  describe("정상 호출", () => {
    test("getJson 1회 → callCount 1 + 정상 반환", async () => {
      const mock = makeMock({ jsonResponses: [{ data: "ok" }] });
      const limited = new RateLimitedDartClient(mock);
      const r = await limited.getJson("path");
      assert.deepEqual(r, { data: "ok" });
      assert.equal(limited.callCount, 1);
      assert.equal(mock.getJsonCallCount, 1);
    });
  });

  describe("429 retry 정책", () => {
    test("getJson 첫 429 → retry 후 성공 → callCount 2 + 정상 반환", async () => {
      const mock = makeMock({
        jsonResponses: [
          new Error("DART path → HTTP 429"),
          { data: "ok-after-retry" },
        ],
      });
      const limited = new RateLimitedDartClient(mock);
      const r = await limited.getJson("path");
      assert.deepEqual(r, { data: "ok-after-retry" });
      assert.equal(limited.callCount, 2);
      assert.equal(mock.getJsonCallCount, 2);
    });

    test("getJson 2회 연속 429 → DartRateLimitError throw + callCount 2", async () => {
      const mock = makeMock({
        jsonResponses: [
          new Error("DART path → HTTP 429"),
          new Error("DART path → HTTP 429"),
        ],
      });
      const limited = new RateLimitedDartClient(mock);
      await assert.rejects(
        () => limited.getJson("path"),
        (err: unknown) => {
          assert.ok(err instanceof DartRateLimitError);
          assert.match((err as Error).message, /rate limit reached after retry/);
          assert.match((err as Error).message, /callCount=2/);
          return true;
        },
      );
      assert.equal(limited.callCount, 2);
      assert.equal(mock.getJsonCallCount, 2);
    });
  });

  describe("비-429 에러 propagation", () => {
    test("getJson 500 에러 → retry 0회 + 원본 에러 propagation + callCount 1", async () => {
      const mock = makeMock({
        jsonResponses: [new Error("DART path → HTTP 500")],
      });
      const limited = new RateLimitedDartClient(mock);
      await assert.rejects(
        () => limited.getJson("path"),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(!(err instanceof DartRateLimitError));
          assert.match((err as Error).message, /HTTP 500/);
          return true;
        },
      );
      assert.equal(limited.callCount, 1);
      assert.equal(mock.getJsonCallCount, 1);
    });
  });

  describe("getZip 동일 정책", () => {
    test("getZip 첫 429 → retry 후 성공 → callCount 2", async () => {
      const buf = Buffer.from("PK\x03\x04mock-zip");
      const mock = makeMock({
        zipResponses: [new Error("DART path → HTTP 429"), buf],
      });
      const limited = new RateLimitedDartClient(mock);
      const r = await limited.getZip("path");
      assert.equal(r, buf);
      assert.equal(limited.callCount, 2);
      assert.equal(mock.getZipCallCount, 2);
    });

    test("getZip 2회 연속 429 → DartRateLimitError throw", async () => {
      const mock = makeMock({
        zipResponses: [
          new Error("DART path → HTTP 429"),
          new Error("DART path → HTTP 429"),
        ],
      });
      const limited = new RateLimitedDartClient(mock);
      await assert.rejects(() => limited.getZip("path"), DartRateLimitError);
      assert.equal(limited.callCount, 2);
    });
  });

  describe("callCount getter — 누적", () => {
    test("getJson + getZip 여러 호출 후 callCount 누적", async () => {
      const mock = makeMock({
        jsonResponses: [{ a: 1 }, { b: 2 }],
        zipResponses: [Buffer.from("zip1"), Buffer.from("zip2")],
      });
      const limited = new RateLimitedDartClient(mock);
      await limited.getJson("p1");
      await limited.getJson("p2");
      await limited.getZip("p3");
      await limited.getZip("p4");
      assert.equal(limited.callCount, 4);
    });
  });
});
