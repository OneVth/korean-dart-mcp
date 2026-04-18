/**
 * v0.9.0 신규 기능 필드 테스트
 *   1. XBRL markdown_full — taxonomy 기반 전체 계정 + 계산 검증
 *   2. search_disclosures 90일 자동 분할 — 회사 미지정 + 기간 >90일
 *   3. insider_signal / disclosure_anomaly summary_text 존재
 */
import "dotenv/config";
import { DartClient } from "../build/lib/dart-client.js";
import { CorpCodeResolver } from "../build/lib/corp-code.js";
import { TOOL_REGISTRY } from "../build/tools/index.js";

const client = new DartClient({ apiKey: process.env.DART_API_KEY });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };

const getXbrl = TOOL_REGISTRY.find((t) => t.name === "get_xbrl");
const searchDisclosures = TOOL_REGISTRY.find((t) => t.name === "search_disclosures");
const insiderSignal = TOOL_REGISTRY.find((t) => t.name === "insider_signal");
const anomaly = TOOL_REGISTRY.find((t) => t.name === "disclosure_anomaly");

let pass = 0;
let fail = 0;

async function run(name, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    if (result === true) {
      console.log(`[PASS] ${name}  (${ms}ms)`);
      pass++;
    } else {
      console.log(`[FAIL] ${name}  (${ms}ms): ${result}`);
      fail++;
    }
  } catch (e) {
    const ms = Date.now() - t0;
    console.log(`[FAIL] ${name}  (${ms}ms) ERROR: ${e.message}`);
    fail++;
  }
}

// 1. markdown_full — 삼성전자 2023
await run("01-xbrl-full 삼성전자 markdown_full BS+IS+CF 계층 + 검증", async () => {
  const r = await getXbrl.handler(
    {
      rcept_no: "20240312000736",
      report: "annual",
      format: "markdown_full",
      fs_div: "consolidated",
      sections: ["BS", "IS", "CF"],
    },
    ctx,
  );
  if (r.format !== "markdown_full") return `format=${r.format}`;
  const bs = r.statements?.BS?.rows?.length ?? 0;
  const is = r.statements?.IS?.rows?.length ?? 0;
  const cf = r.statements?.CF?.rows?.length ?? 0;
  // whitelist 대비 훨씬 많아야 함 (BS 17→50+)
  if (bs < 20) return `BS rows=${bs} 너무 적음 (full 모드인데 whitelist 수준)`;
  if (is < 15) return `IS rows=${is}`;
  if (cf < 5) return `CF rows=${cf}`;
  // 계층 정보 존재
  const hasDepth = r.statements.BS.rows.some((x) => typeof x.depth === "number" && x.depth > 0);
  if (!hasDepth) return "depth 계층 정보 없음";
  // validations 필드 존재
  if (!Array.isArray(r.validations)) return "validations 없음";
  // 자산=유동자산+비유동자산 등 기본 합산이 맞아야 함 → violations 거의 없거나 작아야
  console.log(
    `    BS=${bs} IS=${is} CF=${cf} | validations=${r.validations.length} | md=${r.markdown.length}자 | roles=P:${r.meta.presentation_roles}/C:${r.meta.calculation_roles}`,
  );
  return true;
});

// 2. markdown_full — 업종 달라도 동작 (KB금융 같은 금융사 택소노미)
await run("02-xbrl-full 금융사(신한지주) 업종별 택소노미 대응", async () => {
  // 신한금융지주 2023 사업보고서 rcept_no 찾기
  const sr = await searchDisclosures.handler(
    { corp: "신한지주", begin: "2024-01-01", end: "2024-06-30", preset: "annual_report", limit: 20 },
    ctx,
  );
  const annual = sr.items.find((i) => /^사업보고서/.test(i.report_nm));
  if (!annual) return "신한지주 사업보고서 못 찾음";
  const r = await getXbrl.handler(
    {
      rcept_no: annual.rcept_no,
      report: "annual",
      format: "markdown_full",
      fs_div: "consolidated",
      sections: ["BS", "IS"],
    },
    ctx,
  );
  const bs = r.statements?.BS?.rows?.length ?? 0;
  const is = r.statements?.IS?.rows?.length ?? 0;
  if (bs < 10 || is < 5) return `BS=${bs} IS=${is} 금융사인데 너무 적음`;
  console.log(`    BS=${bs} IS=${is} | validations=${r.validations.length}`);
  return true;
});

// 3. search_disclosures auto-split — 회사 미지정 180일 범위
await run("03-search-autosplit 전체시장 preset=annual_report 180일 (90일×2 자동분할)", async () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 180);
  const ymd = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const r = await searchDisclosures.handler(
    {
      begin: ymd(start),
      end: ymd(end),
      preset: "annual_report",
      limit: 1000,
    },
    ctx,
  );
  if (r.mode !== "batch") return `mode=${r.mode}`;
  if (r.chunks !== 2 && r.chunks !== 3) return `chunks=${r.chunks}, 180일이면 2 또는 3`;
  if ((r.total_fetched ?? 0) < 50) return `total_fetched=${r.total_fetched} 너무 적음`;
  console.log(
    `    chunks=${r.chunks} pages=${r.pages_fetched} fetched=${r.total_fetched} matched=${r.matched}`,
  );
  return true;
});

// 4. insider_signal summary_text
await run("04-insider-summary insider_signal summary_text 필드 존재 + 한국어", async () => {
  const r = await insiderSignal.handler({ corp: "삼성전자" }, ctx);
  if (typeof r.summary_text !== "string") return "summary_text 문자열 아님";
  if (r.summary_text.length < 20) return `summary_text 너무 짧음: ${r.summary_text}`;
  if (!/삼성전자/.test(r.summary_text)) return `회사명 없음: ${r.summary_text}`;
  console.log(`    "${r.summary_text.slice(0, 120)}..."`);
  return true;
});

// 5. disclosure_anomaly summary_text
await run("05-anomaly-summary disclosure_anomaly summary_text 필드 존재", async () => {
  const r = await anomaly.handler({ corp: "삼성전자" }, ctx);
  if (typeof r.summary_text !== "string") return "summary_text 문자열 아님";
  if (r.summary_text.length < 20) return `summary_text 너무 짧음`;
  if (!/삼성전자/.test(r.summary_text)) return `회사명 없음`;
  if (!/점수/.test(r.summary_text)) return "점수 미포함";
  console.log(`    "${r.summary_text}"`);
  return true;
});

console.log(`\n=== ${pass} PASS / ${fail} FAIL (총 ${pass + fail}) ===`);
process.exit(fail > 0 ? 1 : 0);
