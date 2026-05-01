// field-test: sagyeongin_capex_signal 통합 검증.
// SIGNAL_DETECTED 케이스 (대형 제조업) + NO_SIGNAL 케이스 (시설투자 부재 종목).
// 6단계 SIGNAL 의미 layer — fixtures.mjs 헤더 주석 정합 (긍정 발굴, 회피/검토 영역 아님).
// ADR-0003: 실제 DART API 호출 + fixture 종목 컨텍스트 주석 패턴.

import "dotenv/config";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_CONFIG_DIR = join(tmpdir(), "sagyeongin-field-test-capex");
if (existsSync(TEST_CONFIG_DIR)) rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
mkdirSync(TEST_CONFIG_DIR, { recursive: true });
process.env.SAGYEONGIN_CONFIG_DIR = TEST_CONFIG_DIR;

// 빌드 산물 import (env 설정 후)
const { TOOL_REGISTRY } = await import("../../build/tools/index.js");
const { CorpCodeResolver } = await import("../../build/lib/corp-code.js");
const { DartClient } = await import("../../build/lib/dart-client.js");
const fixtures = await import("./fixtures.mjs");
const { CAPEX_SIGNAL_SAMPLE_LARGE_MFG, CAPEX_NO_SIGNAL_SAMPLE } = fixtures;

const capexTool = TOOL_REGISTRY.find((t) => t.name === "sagyeongin_capex_signal");
if (!capexTool) {
  throw new Error("Tool registration failed: sagyeongin_capex_signal missing");
}

const client = new DartClient({ apiKey: process.env.DART_API_KEY });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };

function assertVerdict(r, expected) {
  if (r.verdict !== expected) {
    const sigStr = r.signals.map((s) => s.signal).join(", ") || "(없음)";
    throw new Error(
      `verdict mismatch: ${r.verdict} (expected ${expected}), signals=[${sigStr}], score=${r.opportunity_score}`,
    );
  }
}

// === SIGNAL_DETECTED 케이스 ===
{
  const fix = CAPEX_SIGNAL_SAMPLE_LARGE_MFG;
  console.log(`\n[SIGNAL_DETECTED] ${fix.expected_corp_name} (lookback ${fix.expected_lookback_months}개월)`);
  const r = await capexTool.handler(
    { corp_code: fix.corp_code, lookback_months: fix.expected_lookback_months },
    ctx,
  );
  console.log(`  verdict=${r.verdict}, score=${r.opportunity_score}, signals=${r.signals.length}`);
  for (const s of r.signals) {
    console.log(`    - ${s.signal}: ${s.description} (${s.evidence.date}, ${(s.evidence.equity_ratio * 100).toFixed(1)}%)`);
  }
  assertVerdict(r, fix.expected_verdict);
  if (r.signals.length === 0) {
    throw new Error(`SIGNAL_DETECTED but signals empty`);
  }
  console.log(`  ✓ PASS`);
}

// === NO_SIGNAL 케이스 ===
{
  const fix = CAPEX_NO_SIGNAL_SAMPLE;
  console.log(`\n[NO_SIGNAL] ${fix.expected_corp_name} (lookback ${fix.expected_lookback_months}개월)`);
  const r = await capexTool.handler(
    { corp_code: fix.corp_code, lookback_months: fix.expected_lookback_months },
    ctx,
  );
  console.log(`  verdict=${r.verdict}, score=${r.opportunity_score}, signals=${r.signals.length}`);
  assertVerdict(r, fix.expected_verdict);
  console.log(`  ✓ PASS`);
}

console.log("\n=== field-test-capex 전체 PASS ===");
