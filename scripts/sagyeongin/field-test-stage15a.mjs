#!/usr/bin/env node
/**
 * 15단계 (a) field-test — KSIC 26 제외 (non-KSIC26) universe.
 *
 * 본질:
 *   가설 (α) 정밀 검증 — Stage 1 실패 corp의 modify_date 분포 실측.
 *   excluded_industries: ["26"] 로 비KSIC26 활성 섹터 전체 대상.
 *   post-hoc SQLite 분석 — Stage 1 실패 corp_code의 modify_date 분포.
 *   3년 초과 비율 vs 모집단 기준선(73.1%) 비교 → 가설 (α) 지지/기각 판정.
 *
 * universe: KOSDAQ + KOSPI, KSIC 26 제외, limit 200.
 * 임시 SAGYEONGIN_CONFIG_DIR — 격리.
 *
 * 출력: STAGE15A_OUTPUT_PATH JSON (verifications/data/ 저장용).
 *
 * Ref: docs/sagyeongin/verifications/2026-05-08-stage15a-pre-verify.md
 *      docs/sagyeongin/verifications/2026-05-07-stage13-field-test.md
 *      philosophy 7부 A, ADR-0001 β-i 격리
 */

import "dotenv/config";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import Database from "better-sqlite3";

const TEST_CONFIG_DIR = join(tmpdir(), "sagyeongin-field-test-stage15a");
if (existsSync(TEST_CONFIG_DIR)) {
  rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
}
mkdirSync(TEST_CONFIG_DIR, { recursive: true });
process.env.SAGYEONGIN_CONFIG_DIR = TEST_CONFIG_DIR;

const { TOOL_REGISTRY } = await import("../../build/tools/index.js");
const { CorpCodeResolver } = await import("../../build/lib/corp-code.js");
const { DartClient } = await import("../../build/lib/dart-client.js");
const { parseModifyDate, classifyModifyDateAge } = await import(
  "../../build/tools/sagyeongin/corp-code-status.js"
);

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
console.log("=== 15단계 (a) field-test — KSIC 26 제외 universe ===");
console.log(
  '  excluded_industries: ["26"], markets: ["KOSDAQ","KOSPI"], limit: 200',
);
console.log(`  시작: ${startedAt}`);

// === scan_execute 실행 ===
let r;
try {
  const t0 = Date.now();
  r = await scanExecuteTool.handler(
    { excluded_industries: ["26"], markets: ["KOSDAQ", "KOSPI"], limit: 200 },
    ctx,
  );
  const elapsed = (Date.now() - t0) / 1000;
  console.log(`  initial_universe: ${r.pipeline_stats?.initial_universe}`);
  console.log(
    `  after_static_filter: ${r.pipeline_stats?.after_static_filter}`,
  );
  console.log(`  after_killer_check: ${r.pipeline_stats?.after_killer_check}`);
  console.log(`  after_srim_filter: ${r.pipeline_stats?.after_srim_filter}`);
  console.log(`  candidates: ${r.candidates.length}`);
  console.log(`  skipped_corps: ${r.skipped_corps.length}`);
  console.log(`  elapsed: ${elapsed.toFixed(1)}s`);
  console.log("  scan_execute PASS");
} catch (e) {
  console.error("  scan_execute FAIL:", e.message);
  process.exit(1);
}

// === stage 분포 집계 ===
const stageDist = { stage1: 0, stage2: 0, stage3: 0 };
for (const s of r.skipped_corps) {
  if (s.stage === "stage1") stageDist.stage1 += 1;
  else if (s.stage === "stage2") stageDist.stage2 += 1;
  else if (s.stage === "stage3") stageDist.stage3 += 1;
}

// === reason_code 분포 집계 (고정 키 열거) ===
const reasonCodeDist = {
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
    // verdict-기반 skip (stage2/3) — reason_code 부재 → unknown
    reasonCodeDist.unknown += 1;
  }
}
console.log("\n  stage 분포:", JSON.stringify(stageDist));
console.log("  reason_code 분포:", JSON.stringify(reasonCodeDist));

// === post-hoc SQLite 분석 — Stage 1 실패 corp modify_date ===
console.log("\n=== post-hoc SQLite 분석 — Stage 1 실패 modify_date ===");
const stage1Failed = r.skipped_corps.filter((s) => s.stage === "stage1");
const corpCodes = stage1Failed.map((s) => s.corp_code);
const stage1ModifyDist = {
  within_30_days: 0,
  within_1_year: 0,
  within_3_years: 0,
  older_than_3_years: 0,
  null_or_invalid: 0,
};

if (corpCodes.length > 0) {
  const dbPath = join(homedir(), ".korean-dart-mcp", "corp_code.sqlite");
  if (!existsSync(dbPath)) {
    console.warn(`  WARNING: SQLite DB 부재 (${dbPath}) — modify_date 분석 생략`);
  } else {
    const db = new Database(dbPath, { readonly: true });
    try {
      const CHUNK_SIZE = 100; // SQLite 999-var 한도 안전 마진
      const now = Date.now();
      for (let i = 0; i < corpCodes.length; i += CHUNK_SIZE) {
        const chunk = corpCodes.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => "?").join(",");
        const rows = db
          .prepare(
            `SELECT modify_date FROM corps WHERE corp_code IN (${placeholders})`,
          )
          .all(...chunk);
        for (const row of rows) {
          const bucket = classifyModifyDateAge(
            parseModifyDate(row.modify_date),
            now,
          );
          stage1ModifyDist[bucket] += 1;
        }
      }
    } finally {
      db.close();
    }
  }
}

console.log(
  `  Stage 1 실패 총 ${stage1Failed.length}건 — modify_date 분포:`,
  JSON.stringify(stage1ModifyDist),
);

// === hypothesis_alpha 산출 ===
const stage1FailedCount = stage1Failed.length;
const olderCount = stage1ModifyDist.older_than_3_years;
const olderRatio =
  stage1FailedCount > 0 ? (olderCount / stage1FailedCount) * 100 : 0;
const olderRatioPct = `${olderRatio.toFixed(1)}%`;

let interpretationNote;
if (olderRatio >= 90) {
  interpretationNote =
    "가설 (α) 강한 지지 — Stage 1 실패 corp의 3년 초과 비율이 모집단(73.1%)보다 유의미하게 높음. stale corp_code는 결정론적 Stage 1 실패 시그널.";
} else if (olderRatio >= 60) {
  interpretationNote = `가설 (α) 약한 지지 — 3년 초과 비율(${olderRatioPct})이 모집단(73.1%) 근방. stale은 부분 원인이나 결정론적이지 않음.`;
} else {
  interpretationNote = `가설 (α) 기각 — 3년 초과 비율(${olderRatioPct})이 낮음. Stage 1 실패는 stale과 무관 → 가설 (β) 가중.`;
}
console.log(
  `\n  hypothesis_alpha — older_than_3_years_ratio: ${olderRatioPct} (모집단 기준 73.1%)`,
);
console.log(`  interpretation: ${interpretationNote}`);

const finishedAt = new Date().toISOString();
const elapsedSec =
  (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000;

// === 결과 조립 ===
const result = {
  started_at: startedAt,
  finished_at: finishedAt,
  elapsed_sec: elapsedSec,
  pipeline_stats: r.pipeline_stats,
  candidates_count: r.candidates.length,
  skipped_corps_count: r.skipped_corps.length,
  stage_distribution: stageDist,
  reason_code_distribution: reasonCodeDist,
  hypothesis_alpha: {
    stage1_failed_count: stage1FailedCount,
    stage1_failed_modify_date_distribution: stage1ModifyDist,
    older_than_3_years_ratio: olderRatioPct,
    universe_baseline_ratio: 73.1,
    interpretation_note: interpretationNote,
  },
  ksic26_comparison: {
    pipeline_after_static_filter: r.pipeline_stats?.after_static_filter ?? null,
    pipeline_after_killer: r.pipeline_stats?.after_killer_check ?? null,
    pipeline_after_srim: r.pipeline_stats?.after_srim_filter ?? null,
    candidates: r.candidates.length,
    note: "13단계 KSIC 26 기준값: after_static_filter=294, after_killer=79, after_srim=18, candidates=5",
  },
  raw_skipped_corps: r.skipped_corps,
  candidates_summary: r.candidates.map((c) => ({
    corp_code: c.corp_code,
    corp_name: c.corp_name,
    induty_code: c.induty_code,
    composite_score: c.composite_score,
  })),
};

// === JSON 저장 ===
const outputPath =
  process.env.STAGE15A_OUTPUT_PATH ??
  join(
    "docs",
    "sagyeongin",
    "verifications",
    "data",
    "2026-05-09-stage15a-field-test.json",
  );
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(`\n=== 결과 저장: ${outputPath} ===`);
console.log(`총 elapsed: ${elapsedSec.toFixed(1)}s`);
console.log("PASS");
