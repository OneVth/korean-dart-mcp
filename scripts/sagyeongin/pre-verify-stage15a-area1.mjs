#!/usr/bin/env node
/**
 * 15단계 (a) 사전 검증 — 영역 1: KSIC 70 (사업서비스) 모집단 크기 측정.
 *
 * scan_execute (KSIC 70, KOSDAQ+KOSPI, limit=1) 로 pipeline_stats 읽음.
 * after_static_filter = KSIC 70 매칭 corp 수 → (a) 본격 진입 분기 판단.
 *
 * limit=1 리스크: after_static_filter null 반환 시 STAGE15A_AREA1_LIMIT=5 재실행.
 *
 * 출력: STAGE15A_AREA1_OUTPUT_PATH JSON (area23 스크립트에서 corp 선정에 재사용).
 *
 * Ref: docs/sagyeongin/verifications/2026-05-08-stage15a-pre-verify.md
 */

import "dotenv/config";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_CONFIG_DIR = join(tmpdir(), "sagyeongin-pre-verify-15a");
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

const limit = Number(process.env.STAGE15A_AREA1_LIMIT ?? "1");
// STAGE15A_INDUSTRY: 콤마 구분 복수 지정 가능 (기본: "70")
const industry = (process.env.STAGE15A_INDUSTRY ?? "70").split(",").map((s) => s.trim());
const startedAt = new Date().toISOString();
console.log(`=== 영역 1: KSIC ${industry.join("+")} 모집단 크기 측정 ===`);
console.log(`  included_industries: ${JSON.stringify(industry)}, markets: ["KOSDAQ","KOSPI"], limit: ${limit}`);

let result;
try {
  const t0 = Date.now();
  const r = await scanExecuteTool.handler(
    {
      included_industries: industry,
      markets: ["KOSDAQ", "KOSPI"],
      limit,
    },
    ctx,
  );
  const elapsed = (Date.now() - t0) / 1000;

  const candidates = r.candidates ?? [];
  const skippedCorps = r.skipped_corps ?? [];

  result = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    elapsed_sec: elapsed,
    limit_used: limit,
    industry_filter: industry,
    pipeline_stats: r.pipeline_stats,
    candidates: candidates.map((c) => ({
      corp_code: c.corp_code,
      corp_name: c.corp_name,
      corp_cls: c.corp_cls,
    })),
    skipped_corps: skippedCorps.map((s) => ({
      corp_code: s.corp_code,
      corp_name: s.corp_name,
      corp_cls: s.corp_cls,
      stage: s.stage,
      reason_code: s.reason_code,
    })),
  };

  console.log(`  initial_universe: ${r.pipeline_stats?.initial_universe}`);
  console.log(`  after_static_filter: ${r.pipeline_stats?.after_static_filter}`);
  console.log(`  candidates: ${candidates.length}`);
  console.log(`  skipped_corps: ${skippedCorps.length}`);
  console.log(`  elapsed: ${elapsed.toFixed(1)}s`);

  const n = r.pipeline_stats?.after_static_filter;
  if (n === null || n === undefined) {
    console.warn(
      "  WARNING: after_static_filter null — STAGE15A_AREA1_LIMIT=5 재실행 권장.",
    );
  } else if (n >= 200) {
    console.log(`  => 분기: ≥200 — (a) 본격 진입, 무작위 200 표본`);
  } else if (n >= 50) {
    console.log(`  => 분기: 50≤N<200 — (a) 진입, 전체 사용 (N=${n})`);
  } else {
    console.log(`  => 분기: <50 — KSIC 47 대체 시도 권장`);
  }
} catch (e) {
  console.error("  FAIL:", e.message);
  result = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    error: e.message,
  };
  process.exit(1);
}

const outputPath =
  process.env.STAGE15A_AREA1_OUTPUT_PATH ??
  join(tmpdir(), "pre-verify-15a-area1.json");
writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(`\n=== 결과 저장: ${outputPath} ===`);
console.log("PASS");
