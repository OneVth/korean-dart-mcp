/**
 * scan-execute pre-check (ADR-0019) 단위 테스트.
 *
 * Node built-in test runner. mock 기반 — 실 DART 호출 0 (ADR-0003).
 *
 * Ref: ADR-0019, 18단계 진단 매듭 fb2a4d7
 */

import { describe, test } from "node:test";
import * as assert from "node:assert/strict";
import { DailyLimitPreCheckError } from "./scan-execute.js";
import {
  estimateApiCalls,
  calculateDailyLimitUsagePct,
} from "./_lib/scan-helpers.js";

describe("ADR-0019: DailyLimitPreCheckError class", () => {
  test("constructor 정합", () => {
    const err = new DailyLimitPreCheckError({
      estimated_calls: 32636,
      daily_limit: 20000,
      usage_pct: 163.2,
      universe_count: 3607,
    });
    assert.equal(err.name, "DailyLimitPreCheckError");
    assert.equal(err.estimated_calls, 32636);
    assert.equal(err.daily_limit, 20000);
    assert.equal(err.usage_pct, 163.2);
    assert.equal(err.universe_count, 3607);
    assert.match(err.message, /estimated calls \(32636\)/);
    assert.match(err.message, /daily limit \(20000/);
    assert.match(err.message, /usage 163\.2%/);
    assert.match(err.message, /current universe: 3607/);
  });
});

describe("ADR-0019: usage_pct 계산", () => {
  test("18단계 본 사례 정합 — 3607 universe → 163.2%", () => {
    const estimate = estimateApiCalls(3607);
    const pct = calculateDailyLimitUsagePct(estimate.total);
    assert.equal(estimate.total, 32636);
    assert.equal(pct, 163.2);
  });

  test("100% threshold 진입/차단 — 2200 ≤ 100%, 2500 > 100%", () => {
    const safe = estimateApiCalls(2200);
    const safePct = calculateDailyLimitUsagePct(safe.total);
    assert.ok(safePct <= 100, `2200 universe usage_pct=${safePct}`);

    const overflow = estimateApiCalls(2500);
    const overflowPct = calculateDailyLimitUsagePct(overflow.total);
    assert.ok(overflowPct > 100, `2500 universe usage_pct=${overflowPct}`);
  });

  test("작은 universe — 500 universe → < 30%", () => {
    const estimate = estimateApiCalls(500);
    const pct = calculateDailyLimitUsagePct(estimate.total);
    assert.ok(pct < 30, `500 universe usage_pct=${pct}`);
  });
});
