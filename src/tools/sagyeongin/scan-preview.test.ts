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

test("buildLimitNotes: usage 163.2% 초과 — note 1건 + lever 명시", () => {
  const notes = buildLimitNotes({ usage_pct: 163.2, total_calls: 32636, universe: 3607 });
  assert.equal(notes.length, 1);
  assert.match(notes[0], /한도 초과/);
  assert.match(notes[0], /excluded_name_patterns/);
  assert.match(notes[0], /3607/);
});

test("buildLimitNotes: usage 100% 경계 — [] 반환 (> 100 아님)", () => {
  assert.deepEqual(buildLimitNotes({ usage_pct: 100, total_calls: 20000, universe: 2200 }), []);
});

test("buildLimitNotes: usage 100.1% 직상 — note 1건", () => {
  assert.equal(buildLimitNotes({ usage_pct: 100.1, total_calls: 20020, universe: 2210 }).length, 1);
});

test("buildLimitNotes: usage 50% 정상 — [] 반환", () => {
  assert.deepEqual(buildLimitNotes({ usage_pct: 50, total_calls: 10000, universe: 1100 }), []);
});
