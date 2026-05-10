#!/usr/bin/env node
/**
 * 16단계 (b) field-test — ADR-0015 효과 직접 측정.
 *
 * 본질:
 *   ADR-0015 본격 구현 (A2 fetch failed retry + B1 universe shuffle + C1 wrapper retry) 효과 측정.
 *   15(a) candidates = 0 → 16(b) candidates ≥ 1 회복 검증 + retry 흡수 총량 직접 측정.
 *
 * universe: KSIC 26 (전자부품) + KOSPI + KOSDAQ. 13단계 baseline = after_static_filter 294.
 * 임시 SAGYEONGIN_CONFIG_DIR — checkpoint 격리.
 *
 * 출력: STAGE16B_OUTPUT_PATH JSON (verifications/data/ 저장용).
 *
 * Ref: docs/sagyeongin/verifications/2026-05-10-stage16b-pre-verify.md
 *      docs/sagyeongin/verifications/2026-05-07-stage13-field-test.md
 *      ADR-0015, philosophy 7부 A + 5부, ADR-0001 β-i 격리
 */

import "dotenv/config";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const TEST_CONFIG_DIR = join(tmpdir(), "sagyeongin-field-test-stage16b");
if (existsSync(TEST_CONFIG_DIR)) {
  rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
}
mkdirSync(TEST_CONFIG_DIR, { recursive: true });
process.env.SAGYEONGIN_CONFIG_DIR = TEST_CONFIG_DIR;

const { TOOL_REGISTRY } = await import("../../build/tools/index.js");
const { CorpCodeResolver } = await import("../../build/lib/corp-code.js");
const { DartClient } = await import("../../build/lib/dart-client.js");

const apiKey = process.env.DART_API_KEY;
if (!apiKey) {
  console.error("DART_API_KEY required in .env");
  process.exit(1);
}

const scanExecuteTool = TOOL_REGISTRY.find(
  (t) => t.name === "sagyeongin_scan_execute",
);
if (!scanExecuteTool) {
  throw new Error("Tool registration missing: sagyeongin_scan_execute");
}

const client = new DartClient({ apiKey });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };

const startedAt = new Date().toISOString();
console.log("=== 16(b) field-test — KSIC 26 universe (ADR-0015 효과 측정) ===");
console.log(
  '  included_industries: ["26"], markets: ["KOSPI", "KOSDAQ"], limit: 10 (default)',
);
console.log(`  시작: ${startedAt}`);

// === scan_execute 실행 ===
let r;
let elapsedSec;
let runError = null;
const t0 = Date.now();
try {
  r = await scanExecuteTool.handler(
    {
      included_industries: ["26"],
      markets: ["KOSPI", "KOSDAQ"],
    },
    ctx,
  );
  elapsedSec = (Date.now() - t0) / 1000;
  console.log(`  initial_universe: ${r.pipeline_stats?.initial_universe}`);
  console.log(
    `  after_static_filter: ${r.pipeline_stats?.after_static_filter}`,
  );
  console.log(`  after_killer_check: ${r.pipeline_stats?.after_killer_check}`);
  console.log(`  after_srim_filter: ${r.pipeline_stats?.after_srim_filter}`);
  console.log(
    `  returned_candidates: ${r.pipeline_stats?.returned_candidates}`,
  );
  console.log(`  candidates: ${r.candidates.length}`);
  console.log(`  skipped_corps: ${r.skipped_corps.length}`);
  console.log(`  checkpoint: ${r.checkpoint ?? "null"}`);
  console.log(`  elapsed: ${elapsedSec.toFixed(1)}s`);

  // === external_call_stats (묶음 1 신설 필드) ===
  const ecs = r.external_call_stats;
  if (ecs) {
    console.log("\n  external_call_stats:");
    console.log(`    dart_call_count: ${ecs.dart_call_count}`);
    console.log(`    naver_call_count: ${ecs.naver_call_count}`);
    console.log(`    kis_call_count: ${ecs.kis_call_count}`);
  } else {
    console.warn("  WARNING: external_call_stats 부재 — 묶음 1 머지 영역 점검 필요");
  }

  console.log("  scan_execute PASS");
} catch (e) {
  elapsedSec = (Date.now() - t0) / 1000;
  runError = { message: e.message, stack: e.stack };
  console.error(`  scan_execute FAIL (elapsed ${elapsedSec.toFixed(1)}s):`, e.message);
}

// === stage 분포 + reason_code 분포 (15a 패턴 정합) ===
let stageDist = null;
let reasonCodeDist = null;
let verdictDist = null;
if (r) {
  stageDist = { stage1: 0, stage2: 0, stage3: 0 };
  for (const s of r.skipped_corps) {
    if (s.stage === "stage1") stageDist.stage1 += 1;
    else if (s.stage === "stage2") stageDist.stage2 += 1;
    else if (s.stage === "stage3") stageDist.stage3 += 1;
  }
  reasonCodeDist = {
    status_013: 0,
    status_014: 0,
    status_other: 0,
    corp_not_found: 0,
    network_error: 0,
    parse_error: 0,
    data_incomplete: 0,
    unknown: 0,
  };
  for (const s of r.skipped_corps) {
    const rc = s.reason_code;
    if (rc && rc in reasonCodeDist) {
      reasonCodeDist[rc] += 1;
    } else {
      reasonCodeDist.unknown += 1;
    }
  }
  // verdict 분포 (candidates srim.verdict 영역)
  verdictDist = { BUY: 0, BUY_FAIR: 0, HOLD: 0, SELL: 0, null: 0, other: 0 };
  for (const c of r.candidates) {
    const v = c.srim?.verdict;
    if (v === null || v === undefined) verdictDist.null += 1;
    else if (v in verdictDist) verdictDist[v] += 1;
    else verdictDist.other += 1;
  }
  console.log("\n  stage 분포:", JSON.stringify(stageDist));
  console.log("  reason_code 분포:", JSON.stringify(reasonCodeDist));
  console.log("  verdict 분포 (candidates):", JSON.stringify(verdictDist));
}

// === candidates summary ===
let candidatesSummary = [];
if (r && r.candidates.length > 0) {
  console.log("\n  candidates 상위 10건:");
  for (const c of r.candidates.slice(0, 10)) {
    candidatesSummary.push({
      rank: c.rank,
      corp_code: c.corp_code,
      corp_name: c.corp_name,
      induty_code: c.induty_code,
      composite_score: c.composite_score,
      srim_verdict: c.srim?.verdict ?? null,
    });
    console.log(
      `    rank ${c.rank}: ${c.corp_code} ${c.corp_name} ` +
        `composite=${c.composite_score} srim=${c.srim?.verdict ?? "null"}`,
    );
  }
}

// === 결과 JSON 저장 ===
const result = {
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  elapsed_sec: elapsedSec,
  universe_args: {
    included_industries: ["26"],
    markets: ["KOSPI", "KOSDAQ"],
  },
  baseline_main_hash: "b44d3e5",
  run_error: runError,
  pipeline_stats: r?.pipeline_stats ?? null,
  external_call_stats: r?.external_call_stats ?? null,
  scan_id: r?.scan_id ?? null,
  checkpoint: r?.checkpoint ?? null,
  next_actions_suggested: r?.next_actions_suggested ?? null,
  stage_distribution: stageDist,
  reason_code_distribution: reasonCodeDist,
  verdict_distribution: verdictDist,
  candidates_count: r?.candidates?.length ?? 0,
  skipped_corps_count: r?.skipped_corps?.length ?? 0,
  raw_skipped_corps: r?.skipped_corps ?? null,
  candidates_summary: candidatesSummary,
  candidates_full: r?.candidates ?? null,
};

const outputPath =
  process.env.STAGE16B_OUTPUT_PATH ??
  join(
    "docs",
    "sagyeongin",
    "verifications",
    "data",
    "2026-05-10-stage16b-field-test.json",
  );
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(`\n=== 결과 저장: ${outputPath} ===`);
console.log(`총 elapsed: ${elapsedSec.toFixed(1)}s`);
console.log(runError ? "FAIL (저장은 완료)" : "PASS");
process.exit(runError ? 1 : 0);
