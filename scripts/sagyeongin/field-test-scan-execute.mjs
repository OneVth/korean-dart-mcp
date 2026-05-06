#!/usr/bin/env node
/**
 * 11단계 묶음 2B sagyeongin_scan_execute Stage 1~3 — field-test.
 *
 * 2 케이스:
 * 1: 신규 scan — KOSDAQ + included_industries=["264"] (영상·음향·통신장비) → universe 자연 제한
 * 2: resume_from 미존재 scan_id → throw 검증
 *
 * 임시 SAGYEONGIN_CONFIG_DIR (사용자 환경 + checkpoint 격리).
 * 묶음 2B 도구 등록 0 → 빌드 산물의 named export 직접 import.
 *
 * 실 호출 추정: KSIC 264 KOSDAQ universe 약 50~80 corp.
 *   - Stage 1: company.json N회
 *   - Stage 2: killer × 3 호출 × N
 *   - Stage 3: srim × 4 호출 × (killer 통과 corp)
 * 합산 약 300~700 호출 (daily limit 1.5~3.5%).
 *
 * Ref: spec §10.8, ADR-0009/0012/0013/0014, verifications/2026-05-04-stage11-pre-verify.md
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

const { scanExecuteTool } = await import(
  "../../build/tools/sagyeongin/scan-execute.js"
);
const { CorpCodeResolver } = await import("../../build/lib/corp-code.js");
const { DartClient } = await import("../../build/lib/dart-client.js");

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
    "partial_candidates",
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
}

const startMs = Date.now();
let pass = 0;
let fail = 0;

// 케이스 1
process.stdout.write(
  '[scan_execute] 케이스 1 — 신규 scan, KOSDAQ + KSIC "264"...\n',
);
try {
  const r = await scanExecuteTool.handler(
    {
      markets: ["KOSDAQ"],
      included_industries: ["264"],
      limit: 10,
    },
    ctx,
  );
  assertSchema(r);
  console.log(`  scan_id: ${r.scan_id}`);
  console.log(
    `  pipeline_stats: initial=${r.pipeline_stats.initial_universe}, ` +
      `after_static=${r.pipeline_stats.after_static_filter}, ` +
      `after_killer=${r.pipeline_stats.after_killer_check}, ` +
      `after_srim=${r.pipeline_stats.after_srim_filter}, ` +
      `returned=${r.pipeline_stats.returned_candidates}`,
  );
  console.log(`  partial_candidates: ${r.partial_candidates.length}개`);
  console.log(`  skipped_corps: ${r.skipped_corps.length}개`);
  console.log(`  checkpoint: ${r.checkpoint ?? "null"}`);
  if (r.partial_candidates.length > 0) {
    const first = r.partial_candidates[0];
    console.log(
      `  첫 candidate: corp_code=${first.corp_code}, name=${first.corp_name}, ` +
        `corp_cls=${first.corp_cls}, induty=${first.induty_code}, ` +
        `srim_verdict=${first.srim.verdict}, gap_to_fair=${first.srim.gap_to_fair}`,
    );
  }
  if (r.skipped_corps.length > 0) {
    const stages = r.skipped_corps.reduce((acc, s) => {
      acc[s.stage] = (acc[s.stage] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`  skipped 분포: ${JSON.stringify(stages)}`);
    const sample = r.skipped_corps.slice(0, 3);
    for (const s of sample) {
      console.log(`    ${s.corp_code} ${s.corp_name}: [${s.stage}] ${s.reason}`);
    }
  }
  console.log(`  next_actions: ${JSON.stringify(r.next_actions_suggested)}`);
  console.log(`  PASS`);
  pass++;
} catch (err) {
  console.log(`  FAIL  ${err.message ?? err}`);
  fail++;
}

// 케이스 2: resume_from 미존재 → throw
process.stdout.write(
  "\n[scan_execute] 케이스 2 — resume_from 미존재 scan_id → throw...\n",
);
try {
  let threw = false;
  let errMsg = "";
  try {
    await scanExecuteTool.handler(
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
