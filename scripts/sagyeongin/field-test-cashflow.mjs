// field-test: sagyeongin_cashflow_check 통합 검증.
// PASS → CLEAN 케이스 (삼성전자) + EXCLUDE → REVIEW_REQUIRED 케이스 (발견 누적).
// 5단계 EXCLUDE 의미 layer — fixtures.mjs 헤더 주석 정합 (검토 대상, 회피 대상 아님).
// ADR-0003: 실제 DART API 호출 + fixture 종목 컨텍스트 주석 패턴.

import "dotenv/config";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_CONFIG_DIR = join(tmpdir(), "sagyeongin-field-test-cashflow");
if (existsSync(TEST_CONFIG_DIR)) rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
mkdirSync(TEST_CONFIG_DIR, { recursive: true });
process.env.SAGYEONGIN_CONFIG_DIR = TEST_CONFIG_DIR;

// 빌드 산물 import (env 설정 후)
const { TOOL_REGISTRY } = await import("../../build/tools/index.js");
const { CorpCodeResolver } = await import("../../build/lib/corp-code.js");
const { DartClient } = await import("../../build/lib/dart-client.js");
const fixtures = await import("./fixtures.mjs");
const { SAMSUNG } = fixtures;

const cashflowCheckTool = TOOL_REGISTRY.find((t) => t.name === "sagyeongin_cashflow_check");
if (!cashflowCheckTool) {
  throw new Error("Tool registration failed: sagyeongin_cashflow_check missing");
}

const client = new DartClient({ apiKey: process.env.DART_API_KEY });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };

// --- 헬퍼 ---

function assertVerdict(r, expected) {
  if (r.verdict !== expected) {
    const flagsStr = r.flags.map((f) => `${f.flag}(${f.severity})`).join(", ") || "(없음)";
    throw new Error(
      `verdict mismatch: ${r.verdict} (expected ${expected}), flags=[${flagsStr}]`,
    );
  }
}

function assertFlagWithSeverity(r, flagName, expectedSeverity) {
  const flag = r.flags.find((f) => f.flag === flagName);
  if (!flag) {
    const flagsStr = r.flags.map((f) => f.flag).join(", ") || "(없음)";
    throw new Error(`flag "${flagName}" not found. flags=[${flagsStr}]`);
  }
  if (flag.severity !== expectedSeverity) {
    throw new Error(
      `severity mismatch for "${flagName}": ${flag.severity} (expected ${expectedSeverity})`,
    );
  }
}

function assertCorpName(r, expected) {
  if (r.corp_name !== expected) {
    throw new Error(`corp_name mismatch: "${r.corp_name}" (expected "${expected}")`);
  }
}

function formatResult(r) {
  const flagsStr = r.flags.map((f) => `${f.flag}(${f.severity})`).join(", ") || "(없음)";
  return `verdict=${r.verdict}, score=${r.concern_score}, corp_name=${r.corp_name}, flags=[${flagsStr}]`;
}

// --- 테스트 케이스 ---

const tests = [
  // CLEAN 케이스
  {
    label: "[cashflow_check] 삼성전자 (00126380) — CLEAN 기대",
    run: async () => {
      const r = await cashflowCheckTool.handler(
        { corp_code: SAMSUNG.corp_code, years: 3 },
        ctx,
      );
      assertCorpName(r, SAMSUNG.expected_corp_name);
      assertVerdict(r, "CLEAN");
      return formatResult(r);
    },
  },
  // 에러 케이스
  {
    label: "[cashflow_check] 존재 안 하는 corp_code — throw 기대",
    run: async () => {
      try {
        await cashflowCheckTool.handler({ corp_code: "99999999", years: 3 }, ctx);
        throw new Error("expected throw, got success");
      } catch (err) {
        if (!err.message.includes("not found")) {
          throw new Error(`unexpected error: ${err.message}`);
        }
        return `throw 처리: ${err.message}`;
      }
    },
  },
];

// EXCLUDE → REVIEW_REQUIRED 케이스 자동 추가
// 4단계 fixture(expected_triggered_rule만 있고 expected_flag 없음) → 자연 스킵
// 5단계 fixture(expected_flag + expected_severity 있음) → 자동 추가
const cashflowExcludeKeys = Object.keys(fixtures).filter(
  (k) => k !== "SAMSUNG" && k !== "HYUNDAI" && k.endsWith("_SAMPLE"),
);
for (const key of cashflowExcludeKeys) {
  const fixture = fixtures[key];
  if (!fixture?.corp_code || !fixture?.expected_flag || !fixture?.expected_severity) continue;

  tests.push({
    label: `[cashflow_check] EXCLUDE: ${fixture.expected_corp_name ?? fixture.corp_code} — ${fixture.expected_flag} (severity=${fixture.expected_severity}) 트리거 기대`,
    run: async () => {
      const r = await cashflowCheckTool.handler(
        { corp_code: fixture.corp_code, years: 3 },
        ctx,
      );
      if (fixture.expected_corp_name) assertCorpName(r, fixture.expected_corp_name);
      assertVerdict(r, "REVIEW_REQUIRED");
      assertFlagWithSeverity(r, fixture.expected_flag, fixture.expected_severity);
      return formatResult(r);
    },
  });
}

// --- 실행 루프 ---

const startMs = Date.now();
let pass = 0;
let fail = 0;

for (const t of tests) {
  process.stdout.write(`${t.label}...\n`);
  try {
    const detail = await t.run();
    process.stdout.write(`  PASS  ${detail}\n`);
    pass++;
  } catch (err) {
    process.stdout.write(`  FAIL  ${err.message ?? err}\n`);
    fail++;
  }
}

const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
console.log();
console.log(`Summary: ${pass} PASS / ${fail} FAIL (${elapsedSec}s)`);
process.exit(fail > 0 ? 1 : 0);
