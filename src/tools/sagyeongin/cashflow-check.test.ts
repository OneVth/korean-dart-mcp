/**
 * cashflow_check 19단계 단테 — yearly_data 계산 검증.
 *
 * 7부 B CF 사실 시계열 노출 + 영업이익(opIncome) 정합 케이스.
 * ctx.client.getJson mock 주입: fnlttSinglAcntAll(CF) vs fnlttSinglAcnt(OI+TA) 경로 분기.
 *
 * Ref: stage19 §3 C1-C6, philosophy 7부 B, ADR-0003
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";
import { cashflowCheckTool } from "./cashflow-check.js";
import type { ToolCtx } from "../_helpers.js";

// --- mock 헬퍼 ---

function makeCtx(opts: {
  cfItems?: Record<string, unknown>[];   // fnlttSinglAcntAll.json 반환
  oiTaItems?: Record<string, unknown>[]; // fnlttSinglAcnt.json 반환
}): ToolCtx {
  return {
    client: {
      getJson: async (path: string) => {
        if (path === "fnlttSinglAcntAll.json") {
          return { status: "000", list: opts.cfItems ?? [] };
        }
        return { status: "000", list: opts.oiTaItems ?? [] };
      },
    },
    resolver: {
      byCorpCode: () => ({ corp_name: "테스트법인" }),
    },
  } as unknown as ToolCtx;
}

type YearlyEntry = {
  year: string;
  op_profit: number | null;
  op_cf: number;
  inv_cf: number;
  fin_cf: number;
  oi_cf_ratio: number | null;
};

async function runHandler(ctx: ToolCtx, years = 3) {
  return (await cashflowCheckTool.handler({ corp_code: "00001", years }, ctx)) as {
    verdict: string;
    concern_score: number;
    flags: Array<{ flag: string }>;
    yearly_data: YearlyEntry[];
  };
}

// 기준 연도 (핸들러와 동일 로직)
const END_YEAR = new Date().getFullYear() - 1;

// 3년 기본 CF 아이템 (thstrm=END_YEAR, frmtrm=END_YEAR-1, bfefrmtrm=END_YEAR-2)
// operating=[100,200,300], investing=[-50,-60,-70], financing=[30,40,50]
const BASE_CF = [
  { account_nm: "영업활동현금흐름", sj_div: "CF", thstrm_amount: "300", frmtrm_amount: "200", bfefrmtrm_amount: "100" },
  { account_nm: "투자활동현금흐름", sj_div: "CF", thstrm_amount: "(70)", frmtrm_amount: "(60)", bfefrmtrm_amount: "(50)" },
  { account_nm: "재무활동현금흐름", sj_div: "CF", thstrm_amount: "50", frmtrm_amount: "40", bfefrmtrm_amount: "30" },
];

// 3년 OI 아이템 — opIncome=[80,90,100]
const BASE_OI = [
  { account_nm: "영업이익", fs_div: "CFS", thstrm_amount: "100", frmtrm_amount: "90", bfefrmtrm_amount: "80" },
];

// 자산총계 — recentOcf=300 양수 → rule 3 미트리거
const BASE_TA = { account_nm: "자산총계", fs_div: "CFS", thstrm_amount: "10000" };

// --- C1: 정상 3년 ---

test("C1: 정상 3년 — yearly_data 3건, op_profit + oi_cf_ratio 정합", async () => {
  const ctx = makeCtx({ cfItems: BASE_CF, oiTaItems: [...BASE_OI, BASE_TA] });
  const r = await runHandler(ctx);

  const yd = r.yearly_data;
  assert.equal(yd.length, 3);

  // 첫 항목 (END_YEAR-2): op_profit=80, op_cf=100, inv_cf=-50, fin_cf=30
  assert.equal(yd[0].year, String(END_YEAR - 2));
  assert.equal(yd[0].op_profit, 80);
  assert.equal(yd[0].op_cf, 100);
  assert.equal(yd[0].inv_cf, -50);
  assert.equal(yd[0].fin_cf, 30);
  assert.equal(yd[0].oi_cf_ratio, 100 / 80); // 1.25

  // 마지막 항목 (END_YEAR): op_profit=100, op_cf=300, oi_cf_ratio=3
  assert.equal(yd[2].year, String(END_YEAR));
  assert.equal(yd[2].op_profit, 100);
  assert.equal(yd[2].op_cf, 300);
  assert.equal(yd[2].oi_cf_ratio, 3);
});

// --- C2: OI 데이터 없음 → op_profit/oi_cf_ratio 전부 null ---

test("C2: OI 데이터 부재 → yearly_data op_profit/oi_cf_ratio 전부 null", async () => {
  const ctx = makeCtx({ cfItems: BASE_CF, oiTaItems: [] });
  const r = await runHandler(ctx);

  const yd = r.yearly_data;
  assert.equal(yd.length, 3);
  for (const entry of yd) {
    assert.equal(entry.op_profit, null);
    assert.equal(entry.oi_cf_ratio, null);
    // CF 사실 시계열은 정상 노출
    assert.ok(typeof entry.op_cf === "number");
  }
});

// --- C3: 룰 1 미트리거 (divergence_count < 2) → 플래그 없으나 yearly_data 정상 노출 ---

test("C3: 룰 1 미트리거 — divergence_count=1, yearly_data 정상 + flag 없음", async () => {
  // operating: [-100, 200, 300] — 첫 해만 음수 (divergence_count=1 < 2 threshold)
  const cfC3 = [
    { account_nm: "영업활동현금흐름", sj_div: "CF", thstrm_amount: "300", frmtrm_amount: "200", bfefrmtrm_amount: "(100)" },
    { account_nm: "투자활동현금흐름", sj_div: "CF", thstrm_amount: "(70)", frmtrm_amount: "(60)", bfefrmtrm_amount: "(50)" },
    { account_nm: "재무활동현금흐름", sj_div: "CF", thstrm_amount: "50", frmtrm_amount: "40", bfefrmtrm_amount: "30" },
  ];
  const ctx = makeCtx({ cfItems: cfC3, oiTaItems: [...BASE_OI, BASE_TA] });
  const r = await runHandler(ctx);

  // 룰 1 플래그 없음 (divergence_count=1)
  assert.equal(r.flags.filter((f) => f.flag === "oi_cf_divergence").length, 0);

  // yearly_data는 정상 노출
  const yd = r.yearly_data;
  assert.equal(yd.length, 3);
  assert.equal(yd[0].op_cf, -100); // 첫 해 CF 음수 정합
  assert.equal(yd[0].op_profit, 80);
  // oi_cf_ratio = -100/80 = -1.25
  assert.ok(Math.abs((yd[0].oi_cf_ratio ?? 0) - (-100 / 80)) < 1e-9);
});

// --- C4: op_profit=0 → 해당 연도 oi_cf_ratio null ---

test("C4: op_profit=0 케이스 → oi_cf_ratio null (분모 0 가드)", async () => {
  // bfefrmtrm(END_YEAR-2)의 영업이익 = 0
  const oiC4 = [
    { account_nm: "영업이익", fs_div: "CFS", thstrm_amount: "100", frmtrm_amount: "90", bfefrmtrm_amount: "0" },
  ];
  const ctx = makeCtx({ cfItems: BASE_CF, oiTaItems: [...oiC4, BASE_TA] });
  const r = await runHandler(ctx);

  const yd = r.yearly_data;
  assert.equal(yd.length, 3);

  // END_YEAR-2: op_profit=0 → oi_cf_ratio=null
  assert.equal(yd[0].op_profit, 0);
  assert.equal(yd[0].oi_cf_ratio, null);

  // 다른 연도는 정상
  assert.ok(yd[1].oi_cf_ratio !== null);
  assert.ok(yd[2].oi_cf_ratio !== null);
});

// --- C5: opIncome 길이 < n → 앞쪽 null 채움 ---

test("C5: opIncome 2년, CF 3년 → 첫 항목 op_profit null (앞쪽 채움)", async () => {
  // bfefrmtrm_amount="" → parseAccountAmount null → END_YEAR-2 OI 누락
  const oiC5 = [
    { account_nm: "영업이익", fs_div: "CFS", thstrm_amount: "100", frmtrm_amount: "90", bfefrmtrm_amount: "" },
  ];
  const ctx = makeCtx({ cfItems: BASE_CF, oiTaItems: [...oiC5, BASE_TA] });
  const r = await runHandler(ctx);

  const yd = r.yearly_data;
  assert.equal(yd.length, 3);

  // 첫 항목 (END_YEAR-2): opIncome 부재 → null 채움
  assert.equal(yd[0].op_profit, null);
  assert.equal(yd[0].oi_cf_ratio, null);

  // 나머지 2항목: opIncome 정상
  assert.equal(yd[1].op_profit, 90);
  assert.equal(yd[2].op_profit, 100);
  assert.ok(yd[1].oi_cf_ratio !== null);
  assert.ok(yd[2].oi_cf_ratio !== null);
});

// --- C6: CF 길이 정합 — investing 짧음 → n=min 기준 ---

test("C6: investing CF 2년, operating/financing 3년 → yearly_data 2건", async () => {
  // investing bfefrmtrm="" → END_YEAR-2 누락 → investing.length=2
  const cfC6 = [
    { account_nm: "영업활동현금흐름", sj_div: "CF", thstrm_amount: "300", frmtrm_amount: "200", bfefrmtrm_amount: "100" },
    { account_nm: "투자활동현금흐름", sj_div: "CF", thstrm_amount: "(70)", frmtrm_amount: "(60)", bfefrmtrm_amount: "" },
    { account_nm: "재무활동현금흐름", sj_div: "CF", thstrm_amount: "50", frmtrm_amount: "40", bfefrmtrm_amount: "30" },
  ];
  const ctx = makeCtx({ cfItems: cfC6, oiTaItems: [...BASE_OI, BASE_TA] });
  const r = await runHandler(ctx);

  // n = min(3, 2, 3) = 2
  const yd = r.yearly_data;
  assert.equal(yd.length, 2);

  // 최근 2년 tail: END_YEAR-1, END_YEAR
  assert.equal(yd[0].year, String(END_YEAR - 1));
  assert.equal(yd[1].year, String(END_YEAR));
  assert.equal(yd[0].op_cf, 200);
  assert.equal(yd[0].inv_cf, -60);
  assert.equal(yd[1].op_cf, 300);
  assert.equal(yd[1].inv_cf, -70);
});
