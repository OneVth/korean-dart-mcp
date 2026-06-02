import test from "node:test";
import assert from "node:assert/strict";
import { buildFilterSummary, buildLimitNotes } from "./scan-preview.js";

// default preset의 excluded_industries 27건 (config-store.ts DEFAULT_CONFIG 정합)
const DEFAULT_EXCLUDED = [
  "64", "65", "66",
  "68",
  "35", "36", "37", "38",
  "41", "42",
  "50", "51",
  "55",
  "111", "112", "12", "5621",
  "91",
  "05", "06", "07", "08", "19",
  "5821", "59", "90", "92",
];

test("case 1: default preset merged — excluded_industries 27건 list + count 정합", () => {
  const result = buildFilterSummary({
    markets: ["KOSPI", "KOSDAQ"],
    excluded_industries: DEFAULT_EXCLUDED,
    excluded_name_patterns: ["투자회사", "투자조합", "기업인수목적", "스팩", "리츠", "REIT"],
  });
  assert.deepEqual(result.excluded_industries, DEFAULT_EXCLUDED);
  assert.equal(result.excluded_industries_count, 27);
  assert.equal(result.excluded_industries.length, 27);
});

test("case 2: excluded_industries undefined — [] + count 0 정합", () => {
  const result = buildFilterSummary({ markets: ["KOSPI", "KOSDAQ"] });
  assert.deepEqual(result.excluded_industries, []);
  assert.equal(result.excluded_industries_count, 0);
});

test("case 3: override excluded_industries [\"64\"] 1건 — list + count 정합", () => {
  const result = buildFilterSummary({
    markets: ["KOSPI"],
    excluded_industries: ["64"],
  });
  assert.deepEqual(result.excluded_industries, ["64"]);
  assert.equal(result.excluded_industries_count, 1);
  assert.deepEqual(result.markets, ["KOSPI"]);
});

test("case 4: included_industries 지정 — string[] 회수 정합", () => {
  const result = buildFilterSummary({
    included_industries: ["26", "27"],
  });
  assert.deepEqual(result.included_industries, ["26", "27"]);
  assert.deepEqual(result.excluded_industries, []);
  assert.equal(result.excluded_industries_count, 0);
});

test("case 5: excluded_name_patterns 지정 — string[] 회수 정합", () => {
  const result = buildFilterSummary({
    excluded_name_patterns: ["스팩", "리츠"],
  });
  assert.deepEqual(result.excluded_name_patterns, ["스팩", "리츠"]);
  assert.equal(result.included_industries, null);
  assert.deepEqual(result.excluded_industries, []);
});

test("buildLimitNotes: total_calls 32636 > 10000 초과 + cache_miss 0 — 규모 초과 1건 (warm 0)", () => {
  const notes = buildLimitNotes({
    usage_pct: 163.2,
    total_calls: 32636,
    estimated_universe_after_cache_filter: 3607,
    cache_miss_count: 0,
    estimated_universe: 3607,
  });
  assert.equal(notes.length, 1);
  assert.match(notes[0], /스캔 규모 초과/);
  assert.match(notes[0], /3607/);
});

test("buildLimitNotes: total_calls 경계 — 10000 미발동, 10001 발동", () => {
  assert.deepEqual(
    buildLimitNotes({
      usage_pct: 50,
      total_calls: 10000,
      estimated_universe_after_cache_filter: 1000,
      cache_miss_count: 0,
      estimated_universe: 1000,
    }),
    [],
  );
  const notes = buildLimitNotes({
    usage_pct: 50,
    total_calls: 10001,
    estimated_universe_after_cache_filter: 1000,
    cache_miss_count: 0,
    estimated_universe: 1000,
  });
  assert.equal(notes.length, 1);
  assert.match(notes[0], /스캔 규모 초과/);
});

test("buildLimitNotes: total_calls 20020 > 10000 초과 + cache_miss 0 — 규모 초과 1건", () => {
  assert.equal(
    buildLimitNotes({
      usage_pct: 100.1,
      total_calls: 20020,
      estimated_universe_after_cache_filter: 2210,
      cache_miss_count: 0,
      estimated_universe: 2210,
    }).length,
    1,
  );
});

test("buildLimitNotes: usage 50% 정상 + cache_miss 0 — [] 반환", () => {
  assert.deepEqual(
    buildLimitNotes({
      usage_pct: 50,
      total_calls: 10000,
      estimated_universe_after_cache_filter: 1100,
      cache_miss_count: 0,
      estimated_universe: 1100,
    }),
    [],
  );
});

test("buildLimitNotes: warm 권고 단독 — cache miss 60%(>50%), usage 50% → warm 1건", () => {
  const notes = buildLimitNotes({
    usage_pct: 50,
    total_calls: 10000,
    estimated_universe_after_cache_filter: 1000,
    cache_miss_count: 600,
    estimated_universe: 1000,
  });
  assert.equal(notes.length, 1);
  assert.match(notes[0], /cache miss ratio 60(\.0)?%/);
  assert.match(notes[0], /corp_meta_refresh/);
  assert.match(notes[0], /~3,963 호출, 한도 내/);
});

test("buildLimitNotes: warm + 스캔 규모 초과 둘 다 — 2건 동시", () => {
  const notes = buildLimitNotes({
    usage_pct: 163.2,
    total_calls: 32636,
    estimated_universe_after_cache_filter: 3607,
    cache_miss_count: 2000,
    estimated_universe: 3607,
  });
  assert.equal(notes.length, 2);
  assert.match(notes[0], /스캔 규모 초과/);
  assert.match(notes[0], /name \+ cache-hit induty 필터/);
  assert.match(notes[1], /cache miss ratio/);
  assert.match(notes[1], /corp_meta_refresh/);
});

test("buildLimitNotes: warm 경계 정확 — cache miss 50% 정확 → [] (≤ 임계)", () => {
  assert.deepEqual(
    buildLimitNotes({
      usage_pct: 50,
      total_calls: 10000,
      estimated_universe_after_cache_filter: 1000,
      cache_miss_count: 500,
      estimated_universe: 1000,
    }),
    [],
  );
});

test("buildLimitNotes: warm 경계 직상 — cache miss 50.1% → warm 1건", () => {
  const notes = buildLimitNotes({
    usage_pct: 50,
    total_calls: 10000,
    estimated_universe_after_cache_filter: 1000,
    cache_miss_count: 501,
    estimated_universe: 1000,
  });
  assert.equal(notes.length, 1);
  assert.match(notes[0], /cache miss ratio 50\.1%/);
});

test("buildLimitNotes: estimated_universe 0 edge — divide-by-zero 0 + warm 영역 0 → [] 반환", () => {
  assert.deepEqual(
    buildLimitNotes({
      usage_pct: 0,
      total_calls: 0,
      estimated_universe_after_cache_filter: 0,
      cache_miss_count: 0,
      estimated_universe: 0,
    }),
    [],
  );
});

test("buildLimitNotes: 전 cache miss + 한도 안쪽 — warm 1건 (한도 초과 0)", () => {
  const notes = buildLimitNotes({
    usage_pct: 50,
    total_calls: 10000,
    estimated_universe_after_cache_filter: 1000,
    cache_miss_count: 1000,
    estimated_universe: 1000,
  });
  assert.equal(notes.length, 1);
  assert.match(notes[0], /cache miss ratio 100(\.0)?%/);
});
