/**
 * corp-meta-refresh 단위 테스트.
 *
 * mock 기반 — 실 DART 호출 0. corpListProvider 의존성 주입으로 loadListedCompanies
 * SQLite 영역 격리. SAGYEONGIN_CONFIG_DIR tmpdir로 cache 격리.
 *
 * Ref: ADR-0016, ADR-0015, ADR-0003
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  _corpMetaRefreshHandler,
  type CorpMetaRefreshResult,
} from "./corp-meta-refresh.js";
import { setCorpMeta, corpMetaSize } from "./_lib/corp-meta-cache.js";
import type { ListedCompany } from "./_lib/scan-helpers.js";
import type { CorpRecord } from "../../lib/corp-code.js";
import { DartRateLimitError } from "./_lib/dart-rate-limit.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sagyeongin-cmr-"));
  process.env.SAGYEONGIN_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  delete process.env.SAGYEONGIN_CONFIG_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

interface MockCtx {
  client: {
    getJson: (path: string, params?: Record<string, unknown>) => Promise<unknown>;
  };
  resolver: {
    byCorpCode: (code: string) => CorpRecord | undefined;
  };
}

function makeCtx(opts: {
  jsonResponses?: Array<unknown | Error>;
  corpRecords?: Record<string, CorpRecord>;
}): MockCtx {
  const jsonQueue = [...(opts.jsonResponses ?? [])];
  const records = opts.corpRecords ?? {};
  return {
    client: {
      async getJson() {
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
  };
}

function listedCorp(corp_code: string): ListedCompany {
  return { corp_code, corp_name: `Corp${corp_code}`, stock_code: corp_code };
}

function corpRec(corp_code: string, modify_date = "20260101"): CorpRecord {
  return {
    corp_code,
    corp_name: `Corp${corp_code}`,
    modify_date,
  };
}

describe("dry_run", () => {
  test("dry_run=true → DART 호출 0 + cache 변경 X + shuffled_order 반환", async () => {
    const ctx = makeCtx({ jsonResponses: [], corpRecords: {} });
    const corps = [listedCorp("00000001"), listedCorp("00000002")];

    const result = (await _corpMetaRefreshHandler(
      ctx as never,
      { force_refresh: false, dry_run: true },
      { corpListProvider: () => corps },
    )) as CorpMetaRefreshResult;

    assert.equal(result.universe_size, 2);
    assert.equal(result.fetched_count, 0);
    assert.equal(result.cache_hit_count, 0);
    assert.equal(result.dart_call_count, 0);
    assert.equal(result.dry_run, true);
    assert.equal(result.terminated_by, "completed");
    assert.equal(result.shuffled_order.length, 2);
    assert.deepEqual([...result.shuffled_order].sort(), ["00000001", "00000002"]);
    assert.equal(corpMetaSize(), 0);
  });

  test("dry_run + seed 고정 → 결정론적 shuffled_order", async () => {
    const ctx = makeCtx({ jsonResponses: [] });
    const corps = [
      listedCorp("00000001"),
      listedCorp("00000002"),
      listedCorp("00000003"),
    ];

    const r1 = (await _corpMetaRefreshHandler(
      ctx as never,
      { seed: 42, force_refresh: false, dry_run: true },
      { corpListProvider: () => corps },
    )) as CorpMetaRefreshResult;
    const r2 = (await _corpMetaRefreshHandler(
      ctx as never,
      { seed: 42, force_refresh: false, dry_run: true },
      { corpListProvider: () => corps },
    )) as CorpMetaRefreshResult;

    assert.deepEqual(r1.shuffled_order, r2.shuffled_order);
    assert.equal(r1.random_seed, 42);
  });
});

describe("cache hit/miss 분리", () => {
  test("전체 cache hit → DART 호출 0 + cache_hit_count = universe_size", async () => {
    setCorpMeta({
      corp_code: "00000001",
      induty_code: "26429",
      corp_cls: "Y",
      modify_date: "20260101",
      fetched_at: "2026-05-01T00:00:00.000Z",
    });
    setCorpMeta({
      corp_code: "00000002",
      induty_code: "62010",
      corp_cls: "K",
      modify_date: "20260101",
      fetched_at: "2026-05-01T00:00:00.000Z",
    });

    const ctx = makeCtx({ jsonResponses: [] }); // 빈 큐 — 호출 시 throw
    const corps = [listedCorp("00000001"), listedCorp("00000002")];

    const result = (await _corpMetaRefreshHandler(
      ctx as never,
      { force_refresh: false, dry_run: false },
      { corpListProvider: () => corps },
    )) as CorpMetaRefreshResult;

    assert.equal(result.cache_hit_count, 2);
    assert.equal(result.fetched_count, 0);
    assert.equal(result.dart_call_count, 0);
    assert.equal(result.terminated_by, "completed");
  });

  test("일부 hit / 일부 miss → fetched + hit 분리 카운트", async () => {
    setCorpMeta({
      corp_code: "00000001",
      induty_code: "26429",
      corp_cls: "Y",
      modify_date: "20260101",
      fetched_at: "2026-05-01T00:00:00.000Z",
    });

    const ctx = makeCtx({
      jsonResponses: [
        { status: "000", corp_cls: "K", induty_code: "62010" },
      ],
      corpRecords: { "00000002": corpRec("00000002") },
    });
    const corps = [listedCorp("00000001"), listedCorp("00000002")];

    const result = (await _corpMetaRefreshHandler(
      ctx as never,
      { force_refresh: false, dry_run: false, seed: 0 },
      { corpListProvider: () => corps },
    )) as CorpMetaRefreshResult;

    // seed=0이라도 shuffle 순서는 implementation 의존이므로 합산으로 검증
    assert.equal(result.cache_hit_count + result.fetched_count, 2);
    assert.equal(result.cache_hit_count, 1);
    assert.equal(result.fetched_count, 1);
    assert.equal(result.dart_call_count, 1);
  });
});

describe("force_refresh", () => {
  test("force_refresh=true → 기존 cache invalidate 후 재 fetch", async () => {
    setCorpMeta({
      corp_code: "00000001",
      induty_code: "26429",
      corp_cls: "Y",
      modify_date: "20260101",
      fetched_at: "2026-05-01T00:00:00.000Z",
    });

    const ctx = makeCtx({
      jsonResponses: [
        { status: "000", corp_cls: "Y", induty_code: "26999" },
      ],
      corpRecords: { "00000001": corpRec("00000001") },
    });
    const corps = [listedCorp("00000001")];

    const result = (await _corpMetaRefreshHandler(
      ctx as never,
      { force_refresh: true, dry_run: false },
      { corpListProvider: () => corps },
    )) as CorpMetaRefreshResult;

    assert.equal(result.cache_hit_count, 0);
    assert.equal(result.fetched_count, 1);
    assert.equal(result.cache_size_after, 1);
  });
});

describe("DartRateLimitError 처리", () => {
  test("DartRateLimitError → 즉시 break + terminated_by = dart_rate_limit", async () => {
    const ctx = makeCtx({
      jsonResponses: [
        { status: "000", corp_cls: "Y", induty_code: "26429" },
        new DartRateLimitError("status 020"),
        // 이후 호출 시 throw하지 않음 (break로 도달 X)
      ],
      corpRecords: {
        "00000001": corpRec("00000001"),
        "00000002": corpRec("00000002"),
      },
    });
    const corps = [
      listedCorp("00000001"),
      listedCorp("00000002"),
      listedCorp("00000003"),
    ];

    const result = (await _corpMetaRefreshHandler(
      ctx as never,
      { force_refresh: false, dry_run: false, seed: 0 },
      { corpListProvider: () => corps },
    )) as CorpMetaRefreshResult;

    assert.equal(result.terminated_by, "dart_rate_limit");
    assert.equal(result.fetched_count, 1);
    // 3 corp 중 2 corp 처리 영역 (1 fetched + 1 throw로 break)
    assert.ok(result.cache_size_after >= 1);
  });
});

describe("일반 error 처리", () => {
  test("status !== '000' → skipped_corps push + 진행", async () => {
    const ctx = makeCtx({
      jsonResponses: [
        { status: "013", message: "조회된 데이타가 없습니다" },
        { status: "000", corp_cls: "K", induty_code: "62010" },
      ],
      corpRecords: {
        "00000001": corpRec("00000001"),
        "00000002": corpRec("00000002"),
      },
    });
    const corps = [listedCorp("00000001"), listedCorp("00000002")];

    const result = (await _corpMetaRefreshHandler(
      ctx as never,
      { force_refresh: false, dry_run: false, seed: 0 },
      { corpListProvider: () => corps },
    )) as CorpMetaRefreshResult;

    assert.equal(result.terminated_by, "completed");
    assert.equal(result.skipped_corps.length, 1);
    assert.ok(result.skipped_corps[0].error_msg.includes("013"));
    assert.equal(result.fetched_count, 1);
  });
});

describe("limit 옵션", () => {
  test("limit=2 → universe 영역 처음 2개만 처리", async () => {
    const ctx = makeCtx({
      jsonResponses: [
        { status: "000", corp_cls: "Y", induty_code: "26429" },
        { status: "000", corp_cls: "K", induty_code: "62010" },
      ],
      corpRecords: {
        "00000001": corpRec("00000001"),
        "00000002": corpRec("00000002"),
        "00000003": corpRec("00000003"),
      },
    });
    const corps = [
      listedCorp("00000001"),
      listedCorp("00000002"),
      listedCorp("00000003"),
    ];

    const result = (await _corpMetaRefreshHandler(
      ctx as never,
      { force_refresh: false, dry_run: false, limit: 2 },
      { corpListProvider: () => corps },
    )) as CorpMetaRefreshResult;

    assert.equal(result.universe_size, 2);
    assert.equal(result.shuffled_order.length, 2);
    assert.equal(result.fetched_count + result.cache_hit_count, 2);
  });
});

describe("shuffle 결정론 검증", () => {
  test("seed 고정 2회 호출 → shuffled_order 동일", async () => {
    const ctx1 = makeCtx({ jsonResponses: [] });
    const ctx2 = makeCtx({ jsonResponses: [] });
    const corps = [
      listedCorp("00000001"),
      listedCorp("00000002"),
      listedCorp("00000003"),
      listedCorp("00000004"),
    ];

    const r1 = (await _corpMetaRefreshHandler(
      ctx1 as never,
      { seed: 123, force_refresh: false, dry_run: true },
      { corpListProvider: () => corps },
    )) as CorpMetaRefreshResult;
    const r2 = (await _corpMetaRefreshHandler(
      ctx2 as never,
      { seed: 123, force_refresh: false, dry_run: true },
      { corpListProvider: () => corps },
    )) as CorpMetaRefreshResult;

    assert.deepEqual(r1.shuffled_order, r2.shuffled_order);
  });
});
