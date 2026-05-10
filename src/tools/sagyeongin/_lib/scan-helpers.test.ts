/**
 * scan-helpers 단위 테스트.
 *
 * 영역 본질:
 * - filterUniverse: 빈 config / 빈 배열 / 단일 pattern / 다중 pattern / 부분 매칭
 * - estimateApiCalls: 0 universe / typical (1500) / 분기 합산 정합 / custom pass rate
 * - calculateDailyLimitUsagePct: 0 calls / DAILY_LIMIT 정합 / over DAILY_LIMIT / 소수 1자리
 *
 * loadListedCompanies는 I/O 영역 — 단위 테스트 0, field-test 영역 검증.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterUniverse,
  estimateApiCalls,
  calculateDailyLimitUsagePct,
  shuffleWithSeed,
  KILLER_PASS_RATE_DEFAULT,
  SRIM_PASS_RATE_DEFAULT,
  type ListedCompany,
} from "./scan-helpers.js";

const SAMPLE: ListedCompany[] = [
  { corp_code: "00126380", corp_name: "삼성전자", stock_code: "005930" },
  { corp_code: "00164742", corp_name: "현대자동차", stock_code: "005380" },
  { corp_code: "01234567", corp_name: "ABC스팩1호", stock_code: "999991" },
  { corp_code: "02345678", corp_name: "한국리츠", stock_code: "999992" },
  { corp_code: "03456789", corp_name: "투자회사X", stock_code: "999993" },
];

test("filterUniverse: 빈 pattern → 전체 반환", () => {
  const result = filterUniverse(SAMPLE, {});
  assert.equal(result.length, 5);
});

test("filterUniverse: 빈 pattern 배열 → 전체 반환", () => {
  const result = filterUniverse(SAMPLE, { excluded_name_patterns: [] });
  assert.equal(result.length, 5);
});

test("filterUniverse: 단일 pattern 매칭", () => {
  const result = filterUniverse(SAMPLE, { excluded_name_patterns: ["스팩"] });
  assert.equal(result.length, 4);
  assert.ok(!result.some((r) => r.corp_name.includes("스팩")));
});

test("filterUniverse: 다중 pattern (default preset 정합)", () => {
  const result = filterUniverse(SAMPLE, {
    excluded_name_patterns: ["투자회사", "스팩", "리츠", "REIT"],
  });
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((r) => r.corp_name),
    ["삼성전자", "현대자동차"],
  );
});

test("filterUniverse: 부분 매칭 (substring 본질)", () => {
  const result = filterUniverse(SAMPLE, { excluded_name_patterns: ["전자"] });
  assert.equal(result.length, 4);
  assert.ok(!result.some((r) => r.corp_name === "삼성전자"));
});

test("estimateApiCalls: 0 universe → 모든 분기 0", () => {
  const result = estimateApiCalls(0);
  assert.equal(result.stage1_company_resolution, 0);
  assert.equal(result.stage2_killer, 0);
  assert.equal(result.stage3_srim, 0);
  assert.equal(result.stage4_5_6_tags, 0);
  assert.equal(result.total, 0);
});

test("estimateApiCalls: typical universe 1500 (default preset 영역)", () => {
  const result = estimateApiCalls(1500);
  assert.equal(result.stage1_company_resolution, 1500);
  assert.equal(result.stage2_killer, 4500);
  // killer pass = 1500 × 0.8 = 1200 → stage3 = 1200 × 4 = 4800
  assert.equal(result.stage3_srim, 4800);
  // srim pass = 1200 × 0.33 = 396 → stage4_5_6 = 396 × 7 = 2772
  assert.equal(result.stage4_5_6_tags, 2772);
  assert.equal(result.total, 1500 + 4500 + 4800 + 2772);
});

test("estimateApiCalls: 분기 합산 정합", () => {
  const result = estimateApiCalls(237);
  const sum =
    result.stage1_company_resolution +
    result.stage2_killer +
    result.stage3_srim +
    result.stage4_5_6_tags;
  // Math.round 영역 ±1 허용 (반올림 영역 본질)
  assert.ok(Math.abs(result.total - sum) <= 1);
});

test("estimateApiCalls: custom pass rate 영역", () => {
  const result = estimateApiCalls(1000, 1.0, 1.0);
  // 모든 종목 통과 영역 — stage2 = 3000, stage3 = 4000, stage4_5_6 = 7000
  assert.equal(result.stage2_killer, 3000);
  assert.equal(result.stage3_srim, 4000);
  assert.equal(result.stage4_5_6_tags, 7000);
});

test("calculateDailyLimitUsagePct: 0 calls → 0%", () => {
  assert.equal(calculateDailyLimitUsagePct(0), 0);
});

test("calculateDailyLimitUsagePct: DAILY_LIMIT(20000) → 100%", () => {
  assert.equal(calculateDailyLimitUsagePct(20000), 100);
});

test("calculateDailyLimitUsagePct: over DAILY_LIMIT → 100% 초과 자연", () => {
  const result = calculateDailyLimitUsagePct(30000);
  assert.equal(result, 150);
});

test("calculateDailyLimitUsagePct: 소수 1자리 영역", () => {
  const result = calculateDailyLimitUsagePct(2456);
  // 2456/20000 = 0.1228 → 12.28% → 12.3%
  assert.equal(result, 12.3);
});

test("default 상수 정합", () => {
  assert.equal(KILLER_PASS_RATE_DEFAULT, 0.8);
  assert.equal(SRIM_PASS_RATE_DEFAULT, 0.33);
});

test("shuffleWithSeed: 시드 고정 → 두 번 호출 결과 동일 (결정론)", () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const r1 = shuffleWithSeed(arr, 42);
  const r2 = shuffleWithSeed(arr, 42);
  assert.deepEqual(r1, r2);
  assert.deepEqual(arr, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.notDeepEqual(r1, arr);
});

test("shuffleWithSeed: 시드 미지정 → 두 번 호출 결과 다름 (무작위)", () => {
  // 충분히 큰 배열에서 두 번 무작위 shuffle이 동일할 확률은 1/n! — n=20에서 ~4e-19
  const arr = Array.from({ length: 20 }, (_, i) => i);
  const r1 = shuffleWithSeed(arr);
  const r2 = shuffleWithSeed(arr);
  assert.notDeepEqual(r1, r2);
});

test("shuffleWithSeed: edge — 빈 배열 / 단일 원소 → 동일 반환", () => {
  assert.deepEqual(shuffleWithSeed([]), []);
  assert.deepEqual(shuffleWithSeed([], 42), []);
  assert.deepEqual(shuffleWithSeed([42]), [42]);
  assert.deepEqual(shuffleWithSeed([42], 7), [42]);
});
