/**
 * pickAccountValue 단위 테스트.
 *
 * DART API mock 없음 — 합성 입력으로 헬퍼만 검증.
 * extractEquityCurrent / extractRoeSeries / extractSharesOutstanding 통합
 * 검증은 scripts/sagyeongin/field-test-srim-stack.mjs에서 수행.
 *
 * Ref: spec §12.2, ADR-0003
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { pickAccountValue, extractOperatingIncomeSeries, extractCashflowSeries } from "./financial-extractor.js";

// --- 그룹 1: 정상 케이스 ---

test("첫 매칭 — 첫 번째 후보 계정 반환", () => {
  const accounts = [
    { account_nm: "자본총계", thstrm_amount: "1,000,000,000" },
    { account_nm: "자기자본", thstrm_amount: "500,000,000" },
  ];
  const v = pickAccountValue(accounts, ["자본총계", "자기자본"]);
  assert.equal(v, 1_000_000_000);
});

test("후보 순서대로 — 첫 후보 부재 시 둘째 사용", () => {
  const accounts = [
    { account_nm: "자기자본", thstrm_amount: "500,000,000" },
  ];
  const v = pickAccountValue(accounts, ["자본총계", "자기자본"]);
  assert.equal(v, 500_000_000);
});

test("매칭 0 → null", () => {
  const accounts = [
    { account_nm: "자본금", thstrm_amount: "100,000" },
  ];
  const v = pickAccountValue(accounts, ["자본총계", "자기자본"]);
  assert.equal(v, null);
});

// --- 그룹 2: 가드 케이스 ---

test("amount 빈 문자열 → 다음 후보 시도", () => {
  const accounts = [
    { account_nm: "자본총계", thstrm_amount: "" },
    { account_nm: "자기자본", thstrm_amount: "500,000,000" },
  ];
  const v = pickAccountValue(accounts, ["자본총계", "자기자본"]);
  assert.equal(v, 500_000_000);
});

test("amount null → 다음 후보 시도", () => {
  const accounts = [
    { account_nm: "자본총계", thstrm_amount: null },
    { account_nm: "자기자본", thstrm_amount: "500,000,000" },
  ];
  const v = pickAccountValue(accounts, ["자본총계", "자기자본"]);
  assert.equal(v, 500_000_000);
});

test("음수 괄호 표기: \"(100,000)\" → -100000", () => {
  const accounts = [
    { account_nm: "당기순이익", thstrm_amount: "(100,000)" },
  ];
  const v = pickAccountValue(accounts, ["당기순이익"]);
  assert.equal(v, -100_000);
});

// --- 그룹 3: 콤마 제거 ---

test("콤마 여러 개", () => {
  const accounts = [
    { account_nm: "자본총계", thstrm_amount: "1,234,567,890" },
  ];
  const v = pickAccountValue(accounts, ["자본총계"]);
  assert.equal(v, 1_234_567_890);
});

test("콤마 없는 경우", () => {
  const accounts = [
    { account_nm: "자본총계", thstrm_amount: "1000" },
  ];
  const v = pickAccountValue(accounts, ["자본총계"]);
  assert.equal(v, 1000);
});

// --- 그룹 4: extractOperatingIncomeSeries fs_div_policy 분기 ---

import type { ToolCtx } from "../../_helpers.js";

function makeOiCtx(list: Record<string, unknown>[]): ToolCtx {
  return {
    client: {
      getJson: async () => ({ status: "000", list }),
    },
  } as unknown as ToolCtx;
}

test("OFS 분기 — OFS 항목 존재 시 값 반환", async () => {
  const items = [
    { account_nm: "영업이익", fs_div: "OFS", thstrm_amount: "5,000,000" },
  ];
  const series = await extractOperatingIncomeSeries("000000", 1, makeOiCtx(items), "OFS");
  assert.deepEqual(series, [5_000_000]);
});

test("OFS 분기 — CFS만 있고 OFS 부재 시 해당 연도 누락", async () => {
  const items = [
    { account_nm: "영업이익", fs_div: "CFS", thstrm_amount: "5,000,000" },
  ];
  const series = await extractOperatingIncomeSeries("000000", 1, makeOiCtx(items), "OFS");
  assert.deepEqual(series, []);
});

test("CFS_FIRST 분기 — CFS + OFS 모두 존재 시 CFS 우선", async () => {
  const items = [
    { account_nm: "영업이익", fs_div: "CFS", thstrm_amount: "5,000,000" },
    { account_nm: "영업이익", fs_div: "OFS", thstrm_amount: "3,000,000" },
  ];
  const series = await extractOperatingIncomeSeries("000000", 1, makeOiCtx(items), "CFS_FIRST");
  assert.deepEqual(series, [5_000_000]);
});

test("CFS_FIRST 분기 — CFS 부재 + OFS 존재 시 OFS 폴백", async () => {
  const items = [
    { account_nm: "영업이익", fs_div: "OFS", thstrm_amount: "3,000,000" },
  ];
  const series = await extractOperatingIncomeSeries("000000", 1, makeOiCtx(items), "CFS_FIRST");
  assert.deepEqual(series, [3_000_000]);
});

// --- 그룹 5: extractCashflowSeries ---

function makeCfCtx(list: Record<string, unknown>[]): ToolCtx {
  return {
    client: {
      getJson: async () => ({ status: "000", list }),
    },
  } as unknown as ToolCtx;
}

test("CF 정상 — 3 항목 + 1년 모두 채워짐", async () => {
  const items = [
    { account_nm: "영업활동현금흐름", fs_div: "CFS", sj_div: "CF", thstrm_amount: "(50,000,000)" },
    { account_nm: "투자활동현금흐름", fs_div: "CFS", sj_div: "CF", thstrm_amount: "(30,000,000)" },
    { account_nm: "재무활동현금흐름", fs_div: "CFS", sj_div: "CF", thstrm_amount: "10,000,000" },
  ];
  const result = await extractCashflowSeries("000000", 1, makeCfCtx(items));
  assert.equal(result.operating.length, 1);
  assert.equal(result.investing.length, 1);
  assert.equal(result.financing.length, 1);
  assert.equal(result.operating[0], -50_000_000);
  assert.equal(result.investing[0], -30_000_000);
  assert.equal(result.financing[0], 10_000_000);
});

test("CF 항목별 독립 누락 — 영업CF만 존재, 투자/재무 부재", async () => {
  const items = [
    { account_nm: "영업활동현금흐름", fs_div: "CFS", sj_div: "CF", thstrm_amount: "(50,000,000)" },
  ];
  const result = await extractCashflowSeries("000000", 1, makeCfCtx(items));
  assert.equal(result.operating.length, 1);
  assert.deepEqual(result.investing, []);
  assert.deepEqual(result.financing, []);
});

test("CF 괄호 음수 — (123,456) → -123456", async () => {
  const items = [
    { account_nm: "영업활동현금흐름", fs_div: "OFS", sj_div: "CF", thstrm_amount: "(123,456)" },
    { account_nm: "투자활동현금흐름", fs_div: "OFS", sj_div: "CF", thstrm_amount: "0" },
    { account_nm: "재무활동현금흐름", fs_div: "OFS", sj_div: "CF", thstrm_amount: "0" },
  ];
  const result = await extractCashflowSeries("000000", 1, makeCfCtx(items));
  assert.equal(result.operating[0], -123_456);
});

test("CF - 플레이스홀더 — 해당 항목 누락", async () => {
  const items = [
    { account_nm: "영업활동현금흐름", fs_div: "CFS", sj_div: "CF", thstrm_amount: "-" },
    { account_nm: "투자활동현금흐름", fs_div: "CFS", sj_div: "CF", thstrm_amount: "10,000,000" },
    { account_nm: "재무활동현금흐름", fs_div: "CFS", sj_div: "CF", thstrm_amount: "5,000,000" },
  ];
  const result = await extractCashflowSeries("000000", 1, makeCfCtx(items));
  assert.deepEqual(result.operating, []);
  assert.equal(result.investing[0], 10_000_000);
});

test("CF CFS 우선 — CFS + OFS 모두 존재 시 CFS 값", async () => {
  const items = [
    { account_nm: "영업활동현금흐름", fs_div: "CFS", sj_div: "CF", thstrm_amount: "(100,000,000)" },
    { account_nm: "투자활동현금흐름", fs_div: "CFS", sj_div: "CF", thstrm_amount: "(50,000,000)" },
    { account_nm: "재무활동현금흐름", fs_div: "CFS", sj_div: "CF", thstrm_amount: "20,000,000" },
    { account_nm: "영업활동현금흐름", fs_div: "OFS", sj_div: "CF", thstrm_amount: "(80,000,000)" },
    { account_nm: "투자활동현금흐름", fs_div: "OFS", sj_div: "CF", thstrm_amount: "(40,000,000)" },
    { account_nm: "재무활동현금흐름", fs_div: "OFS", sj_div: "CF", thstrm_amount: "15,000,000" },
  ];
  const result = await extractCashflowSeries("000000", 1, makeCfCtx(items));
  assert.equal(result.operating[0], -100_000_000);
  assert.equal(result.investing[0], -50_000_000);
  assert.equal(result.financing[0], 20_000_000);
});

test("CF OFS 폴백 — CFS 부재 + OFS 존재 시 OFS 값", async () => {
  const items = [
    { account_nm: "영업활동현금흐름", fs_div: "OFS", sj_div: "CF", thstrm_amount: "(80,000,000)" },
    { account_nm: "투자활동현금흐름", fs_div: "OFS", sj_div: "CF", thstrm_amount: "(40,000,000)" },
    { account_nm: "재무활동현금흐름", fs_div: "OFS", sj_div: "CF", thstrm_amount: "15,000,000" },
  ];
  const result = await extractCashflowSeries("000000", 1, makeCfCtx(items));
  assert.equal(result.operating[0], -80_000_000);
  assert.equal(result.investing[0], -40_000_000);
  assert.equal(result.financing[0], 15_000_000);
});

test("CF sj_div 필터 — BS/IS 항목 제외", async () => {
  const items = [
    { account_nm: "영업활동현금흐름", fs_div: "CFS", sj_div: "BS", thstrm_amount: "(50,000,000)" },
    { account_nm: "영업이익", fs_div: "CFS", sj_div: "IS", thstrm_amount: "30,000,000" },
  ];
  const result = await extractCashflowSeries("000000", 1, makeCfCtx(items));
  assert.deepEqual(result.operating, []);
  assert.deepEqual(result.investing, []);
  assert.deepEqual(result.financing, []);
});

test("CF 빈 응답 — 모든 항목 빈 배열", async () => {
  const ctx = {
    client: { getJson: async () => ({ status: "000", list: [] }) },
  } as unknown as ToolCtx;
  const result = await extractCashflowSeries("000000", 1, ctx);
  assert.deepEqual(result.operating, []);
  assert.deepEqual(result.investing, []);
  assert.deepEqual(result.financing, []);
});
