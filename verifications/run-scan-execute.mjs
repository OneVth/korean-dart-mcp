#!/usr/bin/env node
/**
 * 16(c) 묶음 3 scan_execute runner
 * sagyeongin_scan_execute 1회 실 호출 + 결과 JSON 저장
 *
 * 실행: node verifications/run-scan-execute.mjs
 * 전제: build/ 최신 + DART_API_KEY in .env
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// .env 수동 로드 (dotenv 없이)
const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const envPath = resolve(root, ".env");
const envLines = readFileSync(envPath, "utf8").split("\n");
for (const line of envLines) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const apiKey = process.env.DART_API_KEY;
if (!apiKey) {
  console.error("✗ DART_API_KEY 부재");
  process.exit(1);
}

// build/ 에서 직접 import
const { DartClient } = await import(`file://${root}/build/lib/dart-client.js`);
const { CorpCodeResolver } = await import(`file://${root}/build/lib/corp-code.js`);
const { scanExecuteTool } = await import(
  `file://${root}/build/tools/sagyeongin/scan-execute.js`
);

const client = new DartClient({ apiKey });
const resolver = new CorpCodeResolver({});
const ctx = { client, resolver };

// corp_code DB 초기화 (필요 시 다운로드)
console.log("=== corp_code DB 초기화 중... ===");
await resolver.init(client);
console.log("초기화 완료\n");

const OUT_PATH = resolve(
  root,
  "verifications/2026-05-14-stage16c-scan-execute-rerun.json"
);

// ToolDef.handler 인터페이스: handler(args, ctx) — args 먼저, ctx 나중
const args = {
  included_industries: ["26"],
  markets: ["KOSPI", "KOSDAQ"],
  limit: 10,
  min_opportunity_score: 0,
};

console.log(`=== scan_execute 시작 (${new Date().toISOString()}) ===`);
console.log(`  입력: ${JSON.stringify(args)}`);
const startTime = new Date();

const result = await scanExecuteTool.handler(args, ctx);

const endTime = new Date();
const durationMs = endTime - startTime;
console.log(`scan_execute 완료 (${endTime.toISOString()})`);
console.log(`  duration_ms: ${durationMs}`);
console.log(`  pipeline_stats:`);
console.log(`    initial_universe:    ${result.pipeline_stats?.initial_universe}`);
console.log(`    after_static_filter: ${result.pipeline_stats?.after_static_filter}`);
console.log(`    after_killer_check:  ${result.pipeline_stats?.after_killer_check}`);
console.log(`    after_srim_filter:   ${result.pipeline_stats?.after_srim_filter}`);
console.log(`    returned_candidates: ${result.pipeline_stats?.returned_candidates}`);
console.log(`  external_call_stats:`);
console.log(`    dart_call_count:  ${result.external_call_stats?.dart_call_count}`);
console.log(`    naver_call_count: ${result.external_call_stats?.naver_call_count}`);
console.log(`    kis_call_count:   ${result.external_call_stats?.kis_call_count}`);
console.log(`  candidates:    ${result.candidates?.length}`);
console.log(`  skipped_corps: ${result.skipped_corps?.length}`);
console.log(`  checkpoint:    ${result.checkpoint}`);

writeFileSync(
  OUT_PATH,
  JSON.stringify(
    {
      _meta: {
        call_time_utc: startTime.toISOString(),
        response_time_utc: endTime.toISOString(),
        duration_ms: durationMs,
        input_args: args,
      },
      ...result,
    },
    null,
    2
  )
);
console.log(`  → 저장: ${OUT_PATH}`);
console.log("=== scan_execute 완료 ===");
