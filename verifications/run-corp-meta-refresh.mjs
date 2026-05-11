#!/usr/bin/env node
/**
 * 16(c) 묶음 2 field-test runner
 * sagyeongin_corp_meta_refresh 2회 실 호출 + 결과 JSON 저장
 *
 * 실행: node verifications/run-corp-meta-refresh.mjs
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
const { _corpMetaRefreshHandler } = await import(
  `file://${root}/build/tools/sagyeongin/corp-meta-refresh.js`
);

const client = new DartClient({ apiKey });
const resolver = new CorpCodeResolver({});
const ctx = { client, resolver };

// corp_code DB 초기화 (필요 시 다운로드)
console.log("=== corp_code DB 초기화 중... ===");
await resolver.init(client);
console.log("초기화 완료\n");

const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, "-");
const R1_PATH = resolve(root, `verifications/2026-05-12-stage16c-field-test-r1.json`);
const R2_PATH = resolve(root, `verifications/2026-05-12-stage16c-field-test-r2.json`);

// === 1회차 ===
console.log(`=== 1회차 시작 (${new Date().toISOString()}) ===`);
const r1Start = new Date();
const r1 = await _corpMetaRefreshHandler(ctx, {
  force_refresh: false,
  dry_run: false,
});
const r1End = new Date();
console.log(`1회차 완료 (${r1End.toISOString()})`);
console.log(`  universe_size: ${r1.universe_size}`);
console.log(`  fetched_count: ${r1.fetched_count}`);
console.log(`  cache_hit_count: ${r1.cache_hit_count}`);
console.log(`  skipped_corps: ${r1.skipped_corps.length}`);
console.log(`  dart_call_count: ${r1.dart_call_count}`);
console.log(`  terminated_by: ${r1.terminated_by}`);
console.log(`  cache_size_before: ${r1.cache_size_before}`);
console.log(`  cache_size_after: ${r1.cache_size_after}`);
console.log(`  duration_ms: ${r1.duration_ms}`);

writeFileSync(R1_PATH, JSON.stringify({ _meta: { call_time_utc: r1Start.toISOString(), response_time_utc: r1End.toISOString() }, ...r1 }, null, 2));
console.log(`  → 저장: ${R1_PATH}\n`);

// === 2회차 ===
console.log(`=== 2회차 시작 (${new Date().toISOString()}) ===`);
const r2Start = new Date();
const r2 = await _corpMetaRefreshHandler(ctx, {
  force_refresh: false,
  dry_run: false,
});
const r2End = new Date();
console.log(`2회차 완료 (${r2End.toISOString()})`);
console.log(`  universe_size: ${r2.universe_size}`);
console.log(`  fetched_count: ${r2.fetched_count}`);
console.log(`  cache_hit_count: ${r2.cache_hit_count}`);
console.log(`  skipped_corps: ${r2.skipped_corps.length}`);
console.log(`  dart_call_count: ${r2.dart_call_count}`);
console.log(`  terminated_by: ${r2.terminated_by}`);
console.log(`  cache_size_before: ${r2.cache_size_before}`);
console.log(`  cache_size_after: ${r2.cache_size_after}`);
console.log(`  duration_ms: ${r2.duration_ms}`);

const intervalSec = ((r2Start - r1End) / 1000).toFixed(1);
writeFileSync(R2_PATH, JSON.stringify({ _meta: { call_time_utc: r2Start.toISOString(), response_time_utc: r2End.toISOString(), interval_from_r1_sec: Number(intervalSec) }, ...r2 }, null, 2));
console.log(`  → 저장: ${R2_PATH}`);
console.log(`\n1회차 → 2회차 간격: ${intervalSec}초`);
console.log("=== field-test 완료 ===");
