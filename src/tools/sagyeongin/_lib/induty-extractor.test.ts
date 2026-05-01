import test from "node:test";
import assert from "node:assert/strict";
import { matchInduty } from "./induty-extractor.js";

test("matchInduty: 동일 5자리 → true", () => {
  assert.strictEqual(matchInduty("26410", "26410"), true);
});

test("matchInduty: 같은 3자리 prefix (소분류 일치, 세분류 다름) → true (기본 3자리)", () => {
  assert.strictEqual(matchInduty("26410", "26429"), true);
});

test("matchInduty: 다른 3자리 → false", () => {
  assert.strictEqual(matchInduty("26410", "27110"), false);
});

test("matchInduty: prefixLen=4 (세분류) — 4자리 다르면 false", () => {
  assert.strictEqual(matchInduty("26410", "26429", 4), false);
});

test("matchInduty: prefixLen=4 (세분류) — 4자리 같으면 true", () => {
  assert.strictEqual(matchInduty("26410", "26419", 4), true);
});

test("matchInduty: prefixLen=2 (중분류) — 2자리 같으면 true (제조업 26 vs 27 분리 확인)", () => {
  assert.strictEqual(matchInduty("26410", "27110", 2), false);
  assert.strictEqual(matchInduty("26410", "26999", 2), true);
});

test("matchInduty: 빈 문자열 → false", () => {
  assert.strictEqual(matchInduty("", "26410"), false);
  assert.strictEqual(matchInduty("26410", ""), false);
});

test("matchInduty: 길이 < prefixLen → false", () => {
  assert.strictEqual(matchInduty("26", "26410"), false);
  assert.strictEqual(matchInduty("26410", "26"), false);
});

test("matchInduty: trim 처리 — 공백 무시", () => {
  assert.strictEqual(matchInduty(" 26410 ", "26410"), true);
});
