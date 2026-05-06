#!/usr/bin/env node
/**
 * 11단계 묶음 3B sagyeongin_scan_execute Stage 1~6 — field-test.
 *
 * 2 케이스:
 * 1: 신규 scan — KOSDAQ + included_industries=["26"] (전자부품) → universe 약 100~150
 *    candidates에 Stage 4~6 stages + composite_score + 정렬 검증
 * 2: resume_from 미존재 scan_id → throw 검증
 *
 * 임시 SAGYEONGIN_CONFIG_DIR (사용자 환경 + checkpoint 격리).
 * 도구 등록 완료 — TOOL_REGISTRY에서 조회 (묶음 2B와 다른 점).
 *
 * 호출 비용 추정: universe 전체 3963 (Stage 1) + Stage 2~3 + Stage 4~6
 *   ≈ 4,500~5,000 호출 (daily limit 22~25%). 시간 약 200~250초.
 *
 * Ref: spec §10.8, ADR-0009/0012/0013/0014, philosophy 5부 + 4부 + 7부 F + 8부
 */

import "dotenv/config";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_CONFIG_DIR = join(tmpdir(), "sagyeongin-field-test-scan-execute");
if (existsSync(TEST_CONFIG_DIR)) {
  rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
}
mkdirSync(TEST_CONFIG_DIR, { recursive: true });
process.env.SAGYEONGIN_CONFIG_DIR = TEST_CONFIG_DIR;

const { TOOL_REGISTRY } = await import("../../build/tools/index.js");
const { CorpCodeResolver } = await import("../../build/lib/corp-code.js");
const { DartClient } = await import("../../build/lib/dart-client.js");

const tool = TOOL_REGISTRY.find((t) => t.name === "sagyeongin_scan_execute");
if (!tool) {
  throw new Error("Tool registration failed: sagyeongin_scan_execute missing");
}

const apiKey = process.env.DART_API_KEY;
if (!apiKey) {
  console.error("DART_API_KEY required in .env");
  process.exit(1);
}

const client = new DartClient({ apiKey });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };

function assertSchema(r) {
  const required = [
    "scan_id",
    "pipeline_stats",
    "candidates",
    "skipped_corps",
    "checkpoint",
    "next_actions_suggested",
  ];
  for (const k of required) {
    if (!(k in r)) throw new Error(`schema missing: ${k}`);
  }
  const statsKeys = [
    "initial_universe",
    "after_static_filter",
    "after_killer_check",
    "after_srim_filter",
    "returned_candidates",
  ];
  for (const k of statsKeys) {
    if (!(k in r.pipeline_stats)) {
      throw new Error(`pipeline_stats missing: ${k}`);
    }
  }
  if (!/^scan_\d{4}-\d{2}-\d{2}_[a-z0-9]{1,6}$/.test(r.scan_id)) {
    throw new Error(`scan_id format invalid: ${r.scan_id}`);
  }
  for (const c of r.candidates) {
    const candKeys = [
      "rank",
      "corp_code",
      "corp_name",
      "corp_cls",
      "induty_code",
      "composite_score",
      "killer",
      "srim",
      "cashflow",
      "capex",
      "insider",
      "dividend",
      "stage_notes",
      "quick_summary",
    ];
    for (const k of candKeys) {
      if (!(k in c)) {
        throw new Error(`candidate missing: ${k} (corp ${c.corp_code})`);
      }
    }
  }
}

function assertSorted(candidates) {
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i - 1].composite_score < candidates[i].composite_score) {
      throw new Error(
        `composite_score DESC 정렬 위반: rank ${candidates[i - 1].rank} ` +
          `(${candidates[i - 1].composite_score}) < rank ${candidates[i].rank} ` +
          `(${candidates[i].composite_score})`,
      );
    }
  }
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].rank !== i + 1) {
      throw new Error(`rank 부여 오류: index ${i} → rank ${candidates[i].rank}`);
    }
  }
}

const startMs = Date.now();
let pass = 0;
let fail = 0;

// 케이스 1
process.stdout.write(
  '[scan_execute] 케이스 1 — 신규 scan, KOSDAQ + KSIC "26" (전자부품)...\n',
);
try {
  const r = await tool.handler(
    {
      markets: ["KOSDAQ"],
      included_industries: ["26"],
      limit: 10,
    },
    ctx,
  );
  assertSchema(r);
  assertSorted(r.candidates);
  console.log(`  scan_id: ${r.scan_id}`);
  console.log(
    `  pipeline_stats: initial=${r.pipeline_stats.initial_universe}, ` +
      `after_static=${r.pipeline_stats.after_static_filter}, ` +
      `after_killer=${r.pipeline_stats.after_killer_check}, ` +
      `after_srim=${r.pipeline_stats.after_srim_filter}, ` +
      `returned=${r.pipeline_stats.returned_candidates}`,
  );
  console.log(`  candidates: ${r.candidates.length}개`);
  console.log(`  skipped_corps: ${r.skipped_corps.length}개`);
  console.log(`  checkpoint: ${r.checkpoint ?? "null"}`);
  // candidates sample (top 3)
  for (const c of r.candidates.slice(0, 3)) {
    console.log(
      `    rank ${c.rank}: ${c.corp_code} ${c.corp_name} ` +
        `composite=${c.composite_score}`,
    );
    console.log(`      ${c.quick_summary}`);
    if (c.stage_notes.length > 0) {
      console.log(`      notes: ${JSON.stringify(c.stage_notes)}`);
    }
  }
  if (r.skipped_corps.length > 0) {
    const stages = r.skipped_corps.reduce((acc, s) => {
      acc[s.stage] = (acc[s.stage] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`  skipped 분포: ${JSON.stringify(stages)}`);
  }
  console.log(`  next_actions: ${JSON.stringify(r.next_actions_suggested)}`);
  console.log(`  PASS`);
  pass++;
} catch (err) {
  console.log(`  FAIL  ${err.message ?? err}`);
  fail++;
}

// 케이스 2: resume_from 미존재
process.stdout.write(
  "\n[scan_execute] 케이스 2 — resume_from 미존재 scan_id → throw...\n",
);
try {
  let threw = false;
  let errMsg = "";
  try {
    await tool.handler(
      { resume_from: "scan_2026-05-04_nonexistent" },
      ctx,
    );
  } catch (e) {
    threw = true;
    errMsg = e.message ?? String(e);
  }
  if (!threw) {
    throw new Error("expected throw, but resolved");
  }
  if (!/체크포인트를 찾을 수 없습니다/.test(errMsg)) {
    throw new Error(
      `expected error containing "체크포인트를 찾을 수 없습니다", got: ${errMsg}`,
    );
  }
  console.log(`  throw 메시지: ${errMsg}`);
  console.log(`  PASS`);
  pass++;
} catch (err) {
  console.log(`  FAIL  ${err.message ?? err}`);
  fail++;
}

const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
console.log();
console.log(`Summary: ${pass} PASS / ${fail} FAIL (${elapsedSec}s)`);
process.exit(fail > 0 ? 1 : 0);
