/**
 * scan-execute pre-check (ADR-0019 + ADR-0028 B1 + ADR-0030) 단위 테스트.
 *
 * Node built-in test runner. mock 기반 — 실 DART 호출 0 (ADR-0003).
 *
 * Stage 32 결선: universe_count 의미 = H'+M (name + cache-hit induty 필터 후).
 * 메시지 본문 ADR-0028 B2 정합 (warm 권고 동반).
 * ADR-0030: 2-모드 게이트 — 신호 없음 → buildPreviewResponse(대화 루트).
 *
 * Ref: ADR-0019, ADR-0028, ADR-0030, 18단계 진단 매듭 fb2a4d7
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { DailyLimitPreCheckError, buildPreviewResponse, resolveInput } from "./scan-execute.js";
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
    assert.match(err.message, /name \+ cache-hit induty filter/);
    assert.match(err.message, /conservative pass assumption/);
    assert.match(err.message, /corp_meta_refresh/);
    // ADR-0025: 평가어 부재 — 사실 진술 양식 회귀 가드
    assert.doesNotMatch(err.message, /precise|better|optimal/i);
    assert.match(err.message, /apply induty filter/);
    assert.doesNotMatch(err.message, /excluded_name_patterns only/);
    assert.doesNotMatch(err.message, /Narrow universe via included_industries/);
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

  test("ADR-0016 cache hit 반영 — 3607 universe + cache 3500 → stage1 차감", () => {
    const estimate = estimateApiCalls(3607, { cacheHitCount: 3500 });
    assert.equal(estimate.stage1_company_resolution, 107);
    assert.equal(estimate.stage2_killer, 3607 * 3);
  });
});

describe("ADR-0030: scan 2-모드 게이트 — buildPreviewResponse", () => {
  const mockArgs = {
    estimate: { total: 32636 },
    usagePct: 163.2,
    split: { matched_cached_count: 100, cache_miss_count: 3507 },
    universeAfterCacheFilter: 3607,
    resolved: {
      preset_used: "default",
      min_opportunity_score: 0,
      limit: 10,
      allow_over_daily_limit: false,
    },
  };

  test("usagePct>100 ∧ 신호 없음 → mode:'preview' + daily_limit_exceeded + options 3개", () => {
    const result = buildPreviewResponse(mockArgs);
    assert.equal(result.mode, "preview");
    assert.equal(result.daily_limit_exceeded, true);
    assert.equal(result.options.length, 3);
    assert.ok(typeof result.guidance === "string" && result.guidance.length > 0);
  });

  test("estimate 6필드 — estimated_calls/daily_limit/usage_pct/universe_count/cache_hit/cache_miss", () => {
    const result = buildPreviewResponse(mockArgs);
    assert.equal(result.estimate.estimated_calls, 32636);
    assert.equal(result.estimate.usage_pct, 163.2);
    assert.equal(result.estimate.universe_count, 3607);
    assert.equal(result.estimate.cache_hit, 100);
    assert.equal(result.estimate.cache_miss, 3507);
    assert.ok(typeof result.estimate.daily_limit === "number" && result.estimate.daily_limit > 0);
  });

  test("options[1] accept_limit — recall_args_hint.scope_confirmed === true", () => {
    const result = buildPreviewResponse(mockArgs);
    assert.equal(result.options[1].action, "accept_limit");
    assert.deepEqual(result.options[1].recall_args_hint, { scope_confirmed: true });
  });

  test("options actions 집합 — narrow_scope / accept_limit / warm_cache 순서", () => {
    const result = buildPreviewResponse(mockArgs);
    assert.deepEqual(
      result.options.map((o) => o.action),
      ["narrow_scope", "accept_limit", "warm_cache"],
    );
  });
});

describe("ADR-0030: scope_confirmed resolveInput 전파", () => {
  let tmpDir: string;

  const CONFIG = {
    version: "0.1",
    watchlist: [],
    scan_presets: {
      default: {
        markets: ["KOSPI", "KOSDAQ"],
        excluded_name_patterns: [],
      },
    },
    active_preset: "default",
    parameters: {
      insider_cluster_threshold: 2,
      srim_required_return_override: null,
      srim_buy_price_basis: "fair",
      dividend_payout_healthy_range: [0.2, 0.4],
    },
    required_return_cache: { last_fetched_at: null, value: null, source: "" },
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sagyeongin-precheck-sc-test-"));
    process.env.SAGYEONGIN_CONFIG_DIR = tmpDir;
    await fs.writeFile(path.join(tmpDir, "config.json"), JSON.stringify(CONFIG), "utf8");
  });

  afterEach(async () => {
    delete process.env.SAGYEONGIN_CONFIG_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("scope_confirmed=true 전파 — resolved.scope_confirmed === true", async () => {
    const r = await resolveInput({ min_opportunity_score: 0, limit: 10, scope_confirmed: true });
    assert.equal(r.scope_confirmed, true);
  });

  test("scope_confirmed 미지정 → resolved.scope_confirmed === undefined (.optional() 회귀)", async () => {
    const r = await resolveInput({ min_opportunity_score: 0, limit: 10 });
    assert.equal(r.scope_confirmed, undefined);
  });
});
