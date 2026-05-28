/**
 * industry-merge 단위 테스트.
 *
 * 케이스:
 * - union (excluded 경로): 제외 범위 확대 + dedup
 * - override (included 경로): prefList 우선 / 빈 prefList → preset 유지
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeIndustries } from "./industry-merge.js";

// --- union (excluded 경로) ---

test("union: preset undefined + pref [] → undefined", () => {
  assert.equal(mergeIndustries(undefined, [], "union"), undefined);
});

test("union: preset undefined + pref [64] → [64]", () => {
  assert.deepEqual(mergeIndustries(undefined, ["64"], "union"), ["64"]);
});

test("union: preset [64] + pref [] → [64]", () => {
  assert.deepEqual(mergeIndustries(["64"], [], "union"), ["64"]);
});

test("union: preset [64] + pref [68] → [64, 68]", () => {
  assert.deepEqual(mergeIndustries(["64"], ["68"], "union"), ["64", "68"]);
});

test("union: dedup — preset [64,68] + pref [68,49] → [64,68,49]", () => {
  assert.deepEqual(mergeIndustries(["64", "68"], ["68", "49"], "union"), ["64", "68", "49"]);
});

// --- override (included 경로) ---

test("override: pref [10] + preset [64,68] → [10] (preset 무시)", () => {
  assert.deepEqual(mergeIndustries(["64", "68"], ["10"], "override"), ["10"]);
});

test("override: pref [] + preset [64] → [64]", () => {
  assert.deepEqual(mergeIndustries(["64"], [], "override"), ["64"]);
});

test("override: pref [] + preset undefined → undefined", () => {
  assert.equal(mergeIndustries(undefined, [], "override"), undefined);
});

test("override: pref [10,11] + preset undefined → [10,11]", () => {
  assert.deepEqual(mergeIndustries(undefined, ["10", "11"], "override"), ["10", "11"]);
});
