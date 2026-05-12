/**
 * dart-rate-limit 단위 테스트.
 *
 * Node built-in test runner (node --test). 빌드 후 실행.
 * mock 기반 — 실 DART 호출 0 (ADR-0003).
 *
 * retry 케이스는 sleep(1000)이 포함되므로 약 1초씩 대기한다.
 *
 * Ref: ADR-0009, ADR-0003, verifications/2026-05-04-stage11-pre-verify.md 1번
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
 * jsonResponses: getJson 호출마다 차례로 꺼내 반환 (Error면 throw, 아니면 반환).
 * zipResponses: getZip 동일 (Buffer 반환 또는 Error throw).
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
  describe("JSON 분기 — 정상 응답", () => {
    test("getJson status '000' (정상) → callCount 1 + 정상 반환", async () => {
      const mock = makeMock({
        jsonResponses: [{ status: "000", list: [{ a: 1 }] }],
      });
      const limited = new RateLimitedDartClient(mock, 0);
      const r = await limited.getJson<{ status: string; list: unknown[] }>(
        "path",
      );
      assert.equal(r.status, "000");
      assert.deepEqual(r.list, [{ a: 1 }]);
      assert.equal(limited.callCount, 1);
      assert.equal(mock.getJsonCallCount, 1);
    });

    test("getJson 비-020 응답 (status '013' — 데이터 없음) → 정상 반환 + callCount 1", async () => {
      const mock = makeMock({
        jsonResponses: [{ status: "013", message: "조회된 데이터가 없습니다" }],
      });
      const limited = new RateLimitedDartClient(mock, 0);
      const r = await limited.getJson<{ status: string; message: string }>(
        "path",
      );
      assert.equal(r.status, "013");
      assert.equal(limited.callCount, 1);
    });
  });

  describe("JSON 분기 — status '020' retry 정책", () => {
    test("getJson 첫 020 → retry 후 정상('000') → callCount 2 + 정상 반환", async () => {
      const mock = makeMock({
        jsonResponses: [
          { status: "020", message: "요청 건수 초과" },
          { status: "000", list: [{ ok: true }] },
        ],
      });
      const limited = new RateLimitedDartClient(mock, 0);
      const r = await limited.getJson<{ status: string; list?: unknown[] }>(
        "path",
      );
      assert.equal(r.status, "000");
      assert.equal(limited.callCount, 2);
      assert.equal(mock.getJsonCallCount, 2);
    });

    test("getJson 2회 연속 020 → DartRateLimitError throw + 메시지 검증 + callCount 2", async () => {
      const mock = makeMock({
        jsonResponses: [
          { status: "020", message: "초과" },
          { status: "020", message: "초과" },
        ],
      });
      const limited = new RateLimitedDartClient(mock, 0);
      await assert.rejects(
        () => limited.getJson("path"),
        (err: unknown) => {
          assert.ok(err instanceof DartRateLimitError);
          assert.match((err as Error).message, /rate limit reached after retry/);
          assert.match((err as Error).message, /status=020/);
          assert.match((err as Error).message, /callCount=2/);
          return true;
        },
      );
      assert.equal(limited.callCount, 2);
      assert.equal(mock.getJsonCallCount, 2);
    });
  });

  describe("JSON 분기 — 비-020 에러 propagation", () => {
    test("getJson HTTP 500 throw → retry 0회 + 원본 에러 propagation + callCount 1", async () => {
      const mock = makeMock({
        jsonResponses: [new Error("DART path → HTTP 500")],
      });
      const limited = new RateLimitedDartClient(mock, 0);
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

  describe("ZIP 분기 — '[020]' retry 정책", () => {
    test("getZip 정상 ZIP → callCount 1 + Buffer 반환", async () => {
      const buf = Buffer.from("PK\x03\x04mock-zip");
      const mock = makeMock({ zipResponses: [buf] });
      const limited = new RateLimitedDartClient(mock, 0);
      const r = await limited.getZip("path");
      assert.equal(r, buf);
      assert.equal(limited.callCount, 1);
    });

    test("getZip 첫 [020] throw → retry 후 정상 → callCount 2", async () => {
      const buf = Buffer.from("PK\x03\x04mock-zip");
      const mock = makeMock({
        zipResponses: [
          new Error("DART path → [020] 요청 건수 초과"),
          buf,
        ],
      });
      const limited = new RateLimitedDartClient(mock, 0);
      const r = await limited.getZip("path");
      assert.equal(r, buf);
      assert.equal(limited.callCount, 2);
      assert.equal(mock.getZipCallCount, 2);
    });

    test("getZip 2회 연속 [020] throw → DartRateLimitError throw + callCount 2", async () => {
      const mock = makeMock({
        zipResponses: [
          new Error("DART path → [020] 요청 건수 초과"),
          new Error("DART path → [020] 요청 건수 초과"),
        ],
      });
      const limited = new RateLimitedDartClient(mock, 0);
      await assert.rejects(
        () => limited.getZip("path"),
        (err: unknown) => {
          assert.ok(err instanceof DartRateLimitError);
          assert.match((err as Error).message, /status=020/);
          return true;
        },
      );
      assert.equal(limited.callCount, 2);
    });

    test("getZip 비-[020] throw (HTTP 500) → retry 0회 + 원본 에러 propagation", async () => {
      const mock = makeMock({
        zipResponses: [new Error("DART path → HTTP 500")],
      });
      const limited = new RateLimitedDartClient(mock, 0);
      await assert.rejects(
        () => limited.getZip("path"),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(!(err instanceof DartRateLimitError));
          assert.match((err as Error).message, /HTTP 500/);
          return true;
        },
      );
      assert.equal(limited.callCount, 1);
    });
  });

  describe("JSON 분기 — fetch failed retry 정책 (ADR-0015 A2)", () => {
    test("getJson 첫 fetch failed → retry 후 정상('000') → callCount 2 + 정상 반환", async () => {
      const mock = makeMock({
        jsonResponses: [
          new TypeError("fetch failed"),
          { status: "000", list: [{ ok: true }] },
        ],
      });
      const limited = new RateLimitedDartClient(mock, 0);
      const r = await limited.getJson<{ status: string; list?: unknown[] }>(
        "path",
      );
      assert.equal(r.status, "000");
      assert.equal(limited.callCount, 2);
      assert.equal(mock.getJsonCallCount, 2);
    });

    test("getJson 2회 연속 fetch failed → DartRateLimitError throw + 메시지 [network_block] + callCount 2", async () => {
      const mock = makeMock({
        jsonResponses: [
          new TypeError("fetch failed"),
          new TypeError("fetch failed"),
        ],
      });
      const limited = new RateLimitedDartClient(mock, 0);
      await assert.rejects(
        () => limited.getJson("path"),
        (err: unknown) => {
          assert.ok(err instanceof DartRateLimitError);
          assert.match((err as Error).message, /rate limit reached after retry/);
          assert.match((err as Error).message, /status=\[network_block\]/);
          assert.match((err as Error).message, /callCount=2/);
          return true;
        },
      );
      assert.equal(limited.callCount, 2);
      assert.equal(mock.getJsonCallCount, 2);
    });

    test("getJson fetch failed → retry 후 HTTP 500 throw → 비-fetch-failed propagation + callCount 2", async () => {
      const mock = makeMock({
        jsonResponses: [
          new TypeError("fetch failed"),
          new Error("DART path → HTTP 500"),
        ],
      });
      const limited = new RateLimitedDartClient(mock, 0);
      await assert.rejects(
        () => limited.getJson("path"),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(!(err instanceof DartRateLimitError));
          assert.match((err as Error).message, /HTTP 500/);
          return true;
        },
      );
      assert.equal(limited.callCount, 2);
      assert.equal(mock.getJsonCallCount, 2);
    });
  });

  describe("ZIP 분기 — fetch failed retry 정책 (ADR-0015 A2)", () => {
    test("getZip 첫 fetch failed → retry 후 정상 → callCount 2", async () => {
      const buf = Buffer.from("PK\x03\x04mock-zip");
      const mock = makeMock({
        zipResponses: [new TypeError("fetch failed"), buf],
      });
      const limited = new RateLimitedDartClient(mock, 0);
      const r = await limited.getZip("path");
      assert.equal(r, buf);
      assert.equal(limited.callCount, 2);
      assert.equal(mock.getZipCallCount, 2);
    });

    test("getZip 2회 연속 fetch failed → DartRateLimitError throw + 메시지 [network_block] + callCount 2", async () => {
      const mock = makeMock({
        zipResponses: [
          new TypeError("fetch failed"),
          new TypeError("fetch failed"),
        ],
      });
      const limited = new RateLimitedDartClient(mock, 0);
      await assert.rejects(
        () => limited.getZip("path"),
        (err: unknown) => {
          assert.ok(err instanceof DartRateLimitError);
          assert.match((err as Error).message, /status=\[network_block\]/);
          assert.match((err as Error).message, /callCount=2/);
          return true;
        },
      );
      assert.equal(limited.callCount, 2);
      assert.equal(mock.getZipCallCount, 2);
    });

    test("getZip fetch failed → retry 후 [020] throw → 020 prefix throw 통합 (1차 catch 통합 정책)", async () => {
      const mock = makeMock({
        zipResponses: [
          new TypeError("fetch failed"),
          new Error("DART path → [020] 요청 건수 초과"),
        ],
      });
      const limited = new RateLimitedDartClient(mock, 0);
      await assert.rejects(
        () => limited.getZip("path"),
        (err: unknown) => {
          assert.ok(err instanceof DartRateLimitError);
          assert.match((err as Error).message, /status=020/);
          return true;
        },
      );
      assert.equal(limited.callCount, 2);
      assert.equal(mock.getZipCallCount, 2);
    });
  });

  describe("callCount getter — 누적", () => {
    test("getJson + getZip 여러 호출 후 callCount 누적", async () => {
      const mock = makeMock({
        jsonResponses: [
          { status: "000", a: 1 },
          { status: "000", b: 2 },
        ],
        zipResponses: [Buffer.from("zip1"), Buffer.from("zip2")],
      });
      const limited = new RateLimitedDartClient(mock, 0);
      await limited.getJson("p1");
      await limited.getJson("p2");
      await limited.getZip("p3");
      await limited.getZip("p4");
      assert.equal(limited.callCount, 4);
    });
  });
});

describe("ADR-0017 — inter-call delay", () => {
  test("interCallDelayMs > 0 → 성공 호출 후 sleep 발동 (실측)", async () => {
    const mock: DartClientLike = {
      async getJson<T = unknown>(_path: string, _params?: Record<string, string | number | undefined>): Promise<T> {
        return { status: "000", data: "ok" } as unknown as T;
      },
      async getZip(_path: string, _params?: Record<string, string | number | undefined>): Promise<Buffer> {
        return Buffer.from("ok");
      },
    };
    // delay 100ms 에서 2 호출 — 최소 100ms 격증 검증
    const limited = new RateLimitedDartClient(mock, 100);

    const t0 = Date.now();
    await limited.getJson("test.json");
    await limited.getJson("test.json");
    const elapsed = Date.now() - t0;

    // 2 호출에서 첫 번째 호출 후 delay 발동 (100ms)
    // 5ms tolerance (CI 환경 정합)
    assert.ok(
      elapsed >= 95,
      `expected elapsed >= 95ms, got ${elapsed}ms`,
    );
    assert.equal(limited.callCount, 2);
  });
});
