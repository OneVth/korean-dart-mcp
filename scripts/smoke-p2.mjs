#!/usr/bin/env node
/**
 * P2 스모크 테스트 — 새 도구 7개를 실 DART API 로 호출 검증.
 * 실행: node scripts/smoke-p2.mjs  (DART_API_KEY 필요, .env 자동 로드)
 */
import "dotenv/config";
import { DartClient } from "../build/lib/dart-client.js";
import { CorpCodeResolver } from "../build/lib/corp-code.js";
import { TOOL_REGISTRY } from "../build/tools/index.js";

const apiKey = process.env.DART_API_KEY;
if (!apiKey) {
  console.error("DART_API_KEY 필요");
  process.exit(1);
}

const client = new DartClient({ apiKey });
const resolver = new CorpCodeResolver({});
console.log("resolver init...");
await resolver.init(client);
console.log("  ready\n");

const ctx = { client, resolver };

const findTool = (name) => {
  const t = TOOL_REGISTRY.find((x) => x.name === name);
  if (!t) throw new Error(`도구 없음: ${name}`);
  return t;
};

async function run(label, name, args) {
  const t = findTool(name);
  const t0 = Date.now();
  try {
    const r = await t.handler(args, ctx);
    const ms = Date.now() - t0;
    const summary = summarize(name, r);
    console.log(`[OK ] ${label} (${ms}ms)  ${summary}`);
  } catch (e) {
    console.log(`[ERR] ${label}  ${e.message}`);
  }
}

function summarize(name, r) {
  switch (name) {
    case "get_shareholders":
    case "get_executive_compensation":
      return `sections=${r.sections?.length} counts=[${r.sections?.map((s) => s.count ?? 0).join(",")}]`;
    case "get_major_holdings":
      return `kinds=[${r.results?.map((x) => `${x.kind}:${x.count ?? 0}`).join(",")}]`;
    case "get_corporate_event":
      if (r.mode === "timeline")
        return `timeline=${r.total_events} types_hit=${Object.keys(r.event_type_counts ?? {}).length}`;
      return `items=${r.count ?? 0}`;
    case "insider_signal":
      return `reports=${r.summary?.reports_total} buyers=${r.summary?.unique_buyers} sellers=${r.summary?.unique_sellers} signal=${r.summary?.signal}`;
    case "disclosure_anomaly":
      return `score=${r.score} verdict=${r.verdict} flags=${r.flags?.length} disclosures=${r.stats?.disclosures_total}`;
    case "buffett_quality_snapshot":
      return `calls=${r.api_calls} series=${r.series?.length} avg_roe=${r.ratios?.avg_roe_pct} score=${r.overall_score}`;
    default:
      return JSON.stringify(r).slice(0, 120);
  }
}

// 1~4: 합성 래퍼
await run("9  get_shareholders",          "get_shareholders",          { corp: "삼성전자", year: 2023 });
await run("10 get_executive_compensation", "get_executive_compensation", { corp: "삼성전자", year: 2023 });
await run("11 get_major_holdings",        "get_major_holdings",        { corp: "삼성전자" });
await run("12a get_corporate_event single","get_corporate_event",
  { corp: "LG에너지솔루션", mode: "single", event_type: "rights_offering", start: "2021-01-01", end: "2024-12-31" });
await run("12b get_corporate_event timeline","get_corporate_event",
  { corp: "삼성전자", mode: "timeline", start: "2020-01-01", end: "2024-12-31" });

// 5~7: 킬러
await run("13 insider_signal",             "insider_signal",             { corp: "삼성전자", start: "2023-01-01", end: "2024-12-31" });
await run("14 disclosure_anomaly",         "disclosure_anomaly",         { corp: "삼성전자" });
await run("15 buffett_quality_snapshot",   "buffett_quality_snapshot",   { corp: "삼성전자", years: 6 });

process.exit(0);
