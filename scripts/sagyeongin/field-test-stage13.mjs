#!/usr/bin/env node
/**
 * 13단계 묶음 3 — sagyeongin_corp_code_status 도구 + scan-execute reason_code
 * 분포 통합 field-test.
 *
 * 본질:
 *   1. corp_code 덤프 stale 가설 실측 — modify_date 분포 + cache age + verdict
 *   2. Stage 1 company.json 호출 실패 분포 실측 — reason_code 분류 (status_013 등)
 *
 * universe: KSIC 26 (전자부품) + KOSDAQ + KOSPI 통합 — 약 50~100 추정.
 * daily limit < 3% (universe + Stage 2~3 통합 호출 100~150회 영역).
 *
 * 임시 SAGYEONGIN_CONFIG_DIR — 사용자 환경 + checkpoint 격리.
 *
 * 출력: STAGE13_OUTPUT_PATH JSON (verifications/ 저장용).
 *
 * Ref: spec §10.13, philosophy 7부 A
 */

import "dotenv/config";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_CONFIG_DIR = join(tmpdir(), "sagyeongin-field-test-stage13");
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

const corpCodeStatusTool = TOOL_REGISTRY.find(
  (t) => t.name === "sagyeongin_corp_code_status",
);
const scanExecuteTool = TOOL_REGISTRY.find(
  (t) => t.name === "sagyeongin_scan_execute",
);
if (!corpCodeStatusTool) {
  throw new Error("Tool registration missing: sagyeongin_corp_code_status");
}
if (!scanExecuteTool) {
  throw new Error("Tool registration missing: sagyeongin_scan_execute");
}

const client = new DartClient({ apiKey });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };

const startedAt = new Date().toISOString();
const result = {
  started_at: startedAt,
  finished_at: null,
  elapsed_sec: null,
  case_1_corp_code_status: null,
  case_2_scan_execute: null,
  reason_code_distribution: null,
  cross_check: null,
};

// === Case 1: sagyeongin_corp_code_status 단독 호출 ===
console.log("=== Case 1: sagyeongin_corp_code_status ===");
try {
  const r1 = await corpCodeStatusTool.handler({}, ctx);
  result.case_1_corp_code_status = r1;
  console.log("  cache_meta:", JSON.stringify(r1.cache_meta));
  console.log(
    "  modify_date_distribution:",
    JSON.stringify(r1.modify_date_distribution),
  );
  console.log(
    "  staleness_judgment.verdict:",
    r1.staleness_judgment.verdict,
  );
  for (const note of r1.staleness_judgment.notes) {
    console.log(`    - ${note}`);
  }
  console.log("  Case 1 PASS");
} catch (e) {
  console.error("  Case 1 FAIL:", e.message);
  result.case_1_corp_code_status = { error: e.message };
  process.exit(1);
}

// === Case 2: scan-execute (universe 좁힘) — reason_code 분포 ===
console.log("\n=== Case 2: scan_execute (KSIC 26 + KOSDAQ+KOSPI) ===");
try {
  const t0 = Date.now();
  const r2 = await scanExecuteTool.handler(
    {
      included_industries: ["26"],
      markets: ["KOSDAQ", "KOSPI"],
      limit: 5,
    },
    ctx,
  );
  const elapsed = (Date.now() - t0) / 1000;
  result.case_2_scan_execute = {
    pipeline_stats: r2.pipeline_stats,
    candidates_count: r2.candidates.length,
    skipped_corps_count: r2.skipped_corps.length,
    elapsed_sec: elapsed,
    skipped_corps: r2.skipped_corps,
  };
  console.log(`  universe initial: ${r2.pipeline_stats.initial_universe}`);
  console.log(
    `  after_static_filter: ${r2.pipeline_stats.after_static_filter}`,
  );
  console.log(`  candidates: ${r2.candidates.length}`);
  console.log(`  skipped_corps: ${r2.skipped_corps.length}`);
  console.log(`  elapsed: ${elapsed.toFixed(1)}s`);

  // === reason_code 분포 집계 ===
  const reasonCodeDist = {};
  const stageDist = {};
  for (const s of r2.skipped_corps) {
    stageDist[s.stage] = (stageDist[s.stage] ?? 0) + 1;
    if (s.reason_code) {
      reasonCodeDist[s.reason_code] =
        (reasonCodeDist[s.reason_code] ?? 0) + 1;
    } else {
      // verdict-기반 skip — reason_code 부재 (의도적 분리)
      reasonCodeDist["__verdict_based__"] =
        (reasonCodeDist["__verdict_based__"] ?? 0) + 1;
    }
  }
  result.reason_code_distribution = {
    stage_dist: stageDist,
    reason_code_dist: reasonCodeDist,
  };
  console.log("  stage 분포:", JSON.stringify(stageDist));
  console.log("  reason_code 분포:", JSON.stringify(reasonCodeDist));
  console.log("  Case 2 PASS");
} catch (e) {
  console.error("  Case 2 FAIL:", e.message);
  result.case_2_scan_execute = { error: e.message };
  process.exit(1);
}

// === Cross-check: corp-code-status verdict + reason_code 분포 ===
console.log("\n=== Cross-check ===");
const verdict = result.case_1_corp_code_status?.staleness_judgment?.verdict;
const status013Count =
  result.reason_code_distribution?.reason_code_dist?.status_013 ?? 0;
const stage1SkippedCount =
  result.reason_code_distribution?.stage_dist?.stage1 ?? 0;
const status013Ratio =
  stage1SkippedCount > 0 ? status013Count / stage1SkippedCount : 0;

result.cross_check = {
  verdict,
  status_013_count: status013Count,
  stage1_skipped_count: stage1SkippedCount,
  status_013_ratio: status013Ratio,
  hypothesis_supported:
    verdict === "POTENTIALLY_STALE" && status013Ratio > 0.5,
};
console.log(`  verdict: ${verdict}`);
console.log(
  `  status_013 / stage1_skipped: ${status013Count}/${stage1SkippedCount} = ${(status013Ratio * 100).toFixed(1)}%`,
);
console.log(
  `  hypothesis (stale + status_013 > 50%): ${result.cross_check.hypothesis_supported}`,
);

const finishedAt = new Date().toISOString();
result.finished_at = finishedAt;
result.elapsed_sec =
  (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000;

// === verifications/ 저장용 JSON 출력 ===
// Windows 호환: STAGE13_OUTPUT_PATH 미설정 시 os.tmpdir() 사용
const outputPath =
  process.env.STAGE13_OUTPUT_PATH ?? join(tmpdir(), "stage13-field-test.json");
writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(`\n=== 결과 저장: ${outputPath} ===`);
console.log(`총 elapsed: ${result.elapsed_sec.toFixed(1)}s`);
console.log("PASS");
