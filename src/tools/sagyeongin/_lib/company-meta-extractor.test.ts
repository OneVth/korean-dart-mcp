/**
 * company-meta-extractor 단위 테스트.
 *
 * Node built-in test runner. mock 기반 — 실 DART 호출 0.
 * SAGYEONGIN_CONFIG_DIR을 임시 디렉토리로 가리켜 cache 격리.
 *
 * Ref: ADR-0016, ADR-0015, ADR-0003
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { extractCompanyMeta } from "./company-meta-extractor.js";
import { getCorpMeta, setCorpMeta } from "./corp-meta-cache.js";
import type { CorpRecord } from "../../../lib/corp-code.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sagyeongin-cme-"));
  process.env.SAGYEONGIN_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  delete process.env.SAGYEONGIN_CONFIG_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

interface MockCtx {
  client: {
    getJson: (
      path: string,
      params?: Record<string, unknown>,
    ) => Promise<unknown>;
  };
  resolver: {
    byCorpCode: (code: string) => CorpRecord | undefined;
  };
  __getJsonCallCount: () => number;
}

function makeCtx(opts: {
  jsonResponses?: Array<unknown | Error>;
  corpRecords?: Record<string, CorpRecord>;
}): MockCtx {
  let getJsonCallCount = 0;
  const jsonQueue = [...(opts.jsonResponses ?? [])];
  const records = opts.corpRecords ?? {};

  return {
    client: {
      async getJson() {
        getJsonCallCount++;
        if (jsonQueue.length === 0) {
          throw new Error("mock getJson: 응답 큐 소진");
        }
        const next = jsonQueue.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    },
    resolver: {
      byCorpCode(code: string) {
        return records[code];
      },
    },
    __getJsonCallCount: () => getJsonCallCount,
  };
}

describe("extractCompanyMeta — cache miss", () => {
  test("fetch + cache 저장 + 반환", async () => {
    const ctx = makeCtx({
      jsonResponses: [{ status: "000", corp_cls: "Y", induty_code: "26429" }],
      corpRecords: {
        "00126380": {
          corp_code: "00126380",
          corp_name: "삼성전자",
          modify_date: "20260315",
        },
      },
    });

    const meta = await extractCompanyMeta("00126380", ctx as never);
    assert.equal(meta.corp_cls, "Y");
    assert.equal(meta.induty_code, "26429");
    assert.equal(ctx.__getJsonCallCount(), 1);

    // cache 저장 검증
    const cached = getCorpMeta("00126380");
    assert.equal(cached?.corp_cls, "Y");
    assert.equal(cached?.induty_code, "26429");
    assert.equal(cached?.modify_date, "20260315");
    assert.ok(cached?.fetched_at);
  });

  test("trim 처리 — 응답 공백/누락 처리", async () => {
    const ctx = makeCtx({
      jsonResponses: [
        { status: "000", corp_cls: " Y ", induty_code: undefined },
      ],
      corpRecords: {},
    });

    const meta = await extractCompanyMeta("00000001", ctx as never);
    assert.equal(meta.corp_cls, "Y");
    assert.equal(meta.induty_code, "");

    // cache에도 trim된 값 저장
    const cached = getCorpMeta("00000001");
    assert.equal(cached?.induty_code, "");
    assert.equal(cached?.modify_date, ""); // resolver 부재 → 빈 문자열
  });

  test("status !== '000' → throw + cache 저장 X", async () => {
    const ctx = makeCtx({
      jsonResponses: [{ status: "013", message: "조회된 데이타가 없습니다" }],
      corpRecords: {},
    });

    await assert.rejects(
      () => extractCompanyMeta("00000002", ctx as never),
      /company\.json 응답 오류 \[013\]/,
    );
    assert.equal(getCorpMeta("00000002"), null);
  });

  test("resolver.byCorpCode 부재 → modify_date 빈 문자열로 저장", async () => {
    const ctx = makeCtx({
      jsonResponses: [{ status: "000", corp_cls: "K", induty_code: "62010" }],
      corpRecords: {}, // 빈 영역
    });

    const meta = await extractCompanyMeta("99999999", ctx as never);
    assert.equal(meta.induty_code, "62010");

    const cached = getCorpMeta("99999999");
    assert.equal(cached?.modify_date, "");
  });
});

describe("extractCompanyMeta — cache hit", () => {
  test("cache 존재 시 DartClient 호출 0", async () => {
    // 사전 cache 정착
    setCorpMeta({
      corp_code: "00126380",
      induty_code: "26429",
      corp_cls: "Y",
      modify_date: "20260315",
      fetched_at: "2026-05-01T00:00:00.000Z",
    });

    const ctx = makeCtx({
      jsonResponses: [], // 빈 큐 — 호출 시 throw
      corpRecords: {},
    });

    const meta = await extractCompanyMeta("00126380", ctx as never);
    assert.equal(meta.corp_cls, "Y");
    assert.equal(meta.induty_code, "26429");
    assert.equal(ctx.__getJsonCallCount(), 0);
  });

  test("cache hit 시 fetched_at 갱신 X", async () => {
    const original = "2026-05-01T00:00:00.000Z";
    setCorpMeta({
      corp_code: "00126380",
      induty_code: "26429",
      corp_cls: "Y",
      modify_date: "20260315",
      fetched_at: original,
    });

    const ctx = makeCtx({ jsonResponses: [], corpRecords: {} });
    await extractCompanyMeta("00126380", ctx as never);

    const cached = getCorpMeta("00126380");
    assert.equal(cached?.fetched_at, original);
  });
});

describe("extractCompanyMeta — 반복 호출", () => {
  test("같은 corp_code 3회 호출 — 첫 1회만 fetch, 나머지 cache hit", async () => {
    const ctx = makeCtx({
      jsonResponses: [{ status: "000", corp_cls: "Y", induty_code: "26429" }],
      corpRecords: {
        "00126380": {
          corp_code: "00126380",
          corp_name: "삼성전자",
          modify_date: "20260315",
        },
      },
    });

    await extractCompanyMeta("00126380", ctx as never);
    await extractCompanyMeta("00126380", ctx as never);
    await extractCompanyMeta("00126380", ctx as never);

    assert.equal(ctx.__getJsonCallCount(), 1);
  });
});
