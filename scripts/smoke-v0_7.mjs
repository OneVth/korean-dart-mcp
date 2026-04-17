/**
 * v0.7.0 통폐합 스모크 — 3 통합 동작 + 페이지 병렬화 성능.
 */
import "dotenv/config";
import { DartClient } from "../build/lib/dart-client.js";
import { CorpCodeResolver } from "../build/lib/corp-code.js";
import { TOOL_REGISTRY } from "../build/tools/index.js";

const client = new DartClient({ apiKey: process.env.DART_API_KEY });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };
const T = (n) => TOOL_REGISTRY.find((t) => t.name === n);

async function run(label, name, args) {
  const t0 = Date.now();
  try {
    const r = await T(name).handler(args, ctx);
    console.log(`[OK ] ${label} (${Date.now() - t0}ms)`);
    return r;
  } catch (e) {
    console.log(`[ERR] ${label}  ${e.message}`);
    return null;
  }
}

console.log(`\n=== 도구 갯수: ${TOOL_REGISTRY.length}개 ===\n`);

// #1 search_disclosures — 페이지 모드
const r1a = await run("search_disclosures 페이지 모드", "search_disclosures", {
  corp: "삼성전자",
  days: 30,
  size: 5,
});
console.log(`   mode=${r1a?.mode}  total=${r1a?.total_count}  items=${r1a?.items?.length}`);

// #2 search_disclosures — 프리셋 모드 (페이지 병렬)
const r1b = await run("search_disclosures preset=treasury_buy 30d", "search_disclosures", {
  preset: "treasury_buy",
  days: 30,
  limit: 5,
});
console.log(
  `   mode=${r1b?.mode}  pages=${r1b?.pages_fetched}  matched=${r1b?.matched}/${r1b?.total_fetched}`,
);

// #3 search_disclosures — all_pages 모드 (preset 없이 전량)
const r1c = await run("search_disclosures all_pages 10d (삼성)", "search_disclosures", {
  corp: "삼성전자",
  days: 10,
  all_pages: true,
  limit: 50,
});
console.log(`   mode=${r1c?.mode}  pages=${r1c?.pages_fetched}  returned=${r1c?.returned}`);

// #4 get_financials summary 단일
const r2a = await run("get_financials summary 단일", "get_financials", {
  corps: ["삼성전자"],
  year: 2023,
});
console.log(`   mode=${r2a?.mode}  items=${r2a?.items?.length}`);

// #5 get_financials summary 다중
const r2b = await run("get_financials summary 다중", "get_financials", {
  corps: ["삼성전자", "SK하이닉스"],
  year: 2023,
});
console.log(`   mode=${r2b?.mode}  items=${r2b?.items?.length}`);

// #6 get_financials full 단일
const r2c = await run("get_financials full 단일", "get_financials", {
  corps: ["삼성전자"],
  year: 2023,
  scope: "full",
});
console.log(`   mode=${r2c?.mode}  count=${r2c?.count}`);

// #7 get_financials full 다중 → 에러 기대
const r2d = await run("get_financials full 다중(에러 기대)", "get_financials", {
  corps: ["삼성전자", "SK하이닉스"],
  year: 2023,
  scope: "full",
});
console.log(`   (ERR 위가 정상)`);

// #8 buffett snapshot 단일
const r3a = await run("buffett corps=1 단일", "buffett_quality_snapshot", {
  corps: ["삼성전자"],
  years: 5,
});
console.log(`   mode=${r3a?.mode}  series=${r3a?.series?.length}  score=${r3a?.overall_score}`);

// #9 buffett compare 다중
const r3b = await run("buffett corps=3 비교+랭킹", "buffett_quality_snapshot", {
  corps: ["삼성전자", "SK하이닉스", "LG전자"],
  years: 5,
});
console.log(`   mode=${r3b?.mode}  rows=${r3b?.rows?.length}`);
r3b?.rows?.forEach((r) =>
  console.log(
    `     ${r.corp_name.padEnd(12)} ROE=${r.avg_roe_pct} D/E=${r.latest_debt_to_equity_pct} score=${r.overall_score}`,
  ),
);
console.log(`   rankings.by_avg_roe_desc: ${r3b?.rankings?.by_avg_roe_desc?.join(" > ")}`);

process.exit(0);
