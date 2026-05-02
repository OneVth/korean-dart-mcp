// field-test: sagyeongin_dividend_check 통합 검증.
// 5등급 (A/B/C/D/N/A) GRADE 케이스 + 에러 케이스.
// 7단계 GRADE 의미 layer — fixtures.mjs 헤더 주석 정합 (배당 지속 가능성 분류).
// ADR-0003: 실제 DART API 호출 + fixture 종목 컨텍스트 주석 패턴.

import "dotenv/config";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_CONFIG_DIR = join(tmpdir(), "sagyeongin-field-test-dividend");
if (existsSync(TEST_CONFIG_DIR)) rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
mkdirSync(TEST_CONFIG_DIR, { recursive: true });
process.env.SAGYEONGIN_CONFIG_DIR = TEST_CONFIG_DIR;

// 빌드 산물 import (env 설정 후)
const { TOOL_REGISTRY } = await import("../../build/tools/index.js");
const { CorpCodeResolver } = await import("../../build/lib/corp-code.js");
const { DartClient } = await import("../../build/lib/dart-client.js");
const fixtures = await import("./fixtures.mjs");
const {
  DIVIDEND_GRADE_A_SAMPLE,
  DIVIDEND_GRADE_B_SAMPLE,
  DIVIDEND_GRADE_C_SAMPLE,
  DIVIDEND_GRADE_D_SAMPLE,
  DIVIDEND_GRADE_NA_SAMPLE,
} = fixtures;

const dividendCheckTool = TOOL_REGISTRY.find((t) => t.name === "sagyeongin_dividend_check");
if (!dividendCheckTool) {
  throw new Error("Tool registration failed: sagyeongin_dividend_check missing");
}

const client = new DartClient({ apiKey: process.env.DART_API_KEY });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };

// --- 헬퍼 ---

function assertGrade(r, expected) {
  if (r.sustainability_grade !== expected) {
    throw new Error(
      `grade mismatch: ${r.sustainability_grade} (expected ${expected}) | ` +
        `avg_payout=${r.metrics.avg_payout_ratio?.toFixed(3)}, ` +
        `stddev=${r.metrics.payout_stddev?.toFixed(3)}, ` +
        `years_div=${r.metrics.years_of_dividend}, ` +
        `recent_cut=${r.metrics.recent_cut}`,
    );
  }
}

function assertCorpName(r, expected) {
  if (r.corp_name !== expected) {
    throw new Error(`corp_name mismatch: "${r.corp_name}" (expected "${expected}")`);
  }
}

function formatResult(r) {
  const notesStr = r.interpretation_notes.join(" | ") || "(없음)";
  return (
    `grade=${r.sustainability_grade}, corp_name=${r.corp_name}, ` +
    `avg_payout=${r.metrics.avg_payout_ratio?.toFixed(3)}, ` +
    `stddev=${r.metrics.payout_stddev?.toFixed(3)}, ` +
    `yield=${r.metrics.avg_dividend_yield?.toFixed(3)}, ` +
    `years_div=${r.metrics.years_of_dividend}, ` +
    `recent_cut=${r.metrics.recent_cut}, ` +
    `series_len=${r.series.length}, ` +
    `notes=[${notesStr}]`
  );
}

// --- 테스트 케이스 ---

const tests = [
  // 에러 케이스
  {
    label: "[dividend_check] 존재 안 하는 corp_code — throw 기대",
    run: async () => {
      try {
        await dividendCheckTool.handler({ corp_code: "99999999", years: 5 }, ctx);
        throw new Error("expected throw, got success");
      } catch (err) {
        if (!err.message.includes("not found")) {
          throw new Error(`unexpected error: ${err.message}`);
        }
        return `throw 처리: ${err.message}`;
      }
    },
  },
  // GRADE A: KB금융
  {
    label: `[dividend_check] ${DIVIDEND_GRADE_A_SAMPLE.expected_corp_name} (${DIVIDEND_GRADE_A_SAMPLE.corp_code}) — A 등급 기대`,
    run: async () => {
      const r = await dividendCheckTool.handler(
        { corp_code: DIVIDEND_GRADE_A_SAMPLE.corp_code, years: 5 },
        ctx,
      );
      assertCorpName(r, DIVIDEND_GRADE_A_SAMPLE.expected_corp_name);
      assertGrade(r, DIVIDEND_GRADE_A_SAMPLE.expected_grade);
      return formatResult(r);
    },
  },
  // GRADE B: 삼성전자
  {
    label: `[dividend_check] ${DIVIDEND_GRADE_B_SAMPLE.expected_corp_name} (${DIVIDEND_GRADE_B_SAMPLE.corp_code}) — B 등급 기대`,
    run: async () => {
      const r = await dividendCheckTool.handler(
        { corp_code: DIVIDEND_GRADE_B_SAMPLE.corp_code, years: 5 },
        ctx,
      );
      assertCorpName(r, DIVIDEND_GRADE_B_SAMPLE.expected_corp_name);
      assertGrade(r, DIVIDEND_GRADE_B_SAMPLE.expected_grade);
      return formatResult(r);
    },
  },
  // GRADE C: 케이티앤지
  {
    label: `[dividend_check] ${DIVIDEND_GRADE_C_SAMPLE.expected_corp_name} (${DIVIDEND_GRADE_C_SAMPLE.corp_code}) — C 등급 기대`,
    run: async () => {
      const r = await dividendCheckTool.handler(
        { corp_code: DIVIDEND_GRADE_C_SAMPLE.corp_code, years: 5 },
        ctx,
      );
      assertCorpName(r, DIVIDEND_GRADE_C_SAMPLE.expected_corp_name);
      assertGrade(r, DIVIDEND_GRADE_C_SAMPLE.expected_grade);
      return formatResult(r);
    },
  },
  // GRADE D: POSCO홀딩스
  {
    label: `[dividend_check] ${DIVIDEND_GRADE_D_SAMPLE.expected_corp_name} (${DIVIDEND_GRADE_D_SAMPLE.corp_code}) — D 등급 기대`,
    run: async () => {
      const r = await dividendCheckTool.handler(
        { corp_code: DIVIDEND_GRADE_D_SAMPLE.corp_code, years: 5 },
        ctx,
      );
      assertCorpName(r, DIVIDEND_GRADE_D_SAMPLE.expected_corp_name);
      assertGrade(r, DIVIDEND_GRADE_D_SAMPLE.expected_grade);
      return formatResult(r);
    },
  },
  // GRADE N/A: 카카오
  {
    label: `[dividend_check] ${DIVIDEND_GRADE_NA_SAMPLE.expected_corp_name} (${DIVIDEND_GRADE_NA_SAMPLE.corp_code}) — N/A 등급 기대`,
    run: async () => {
      const r = await dividendCheckTool.handler(
        { corp_code: DIVIDEND_GRADE_NA_SAMPLE.corp_code, years: 5 },
        ctx,
      );
      assertCorpName(r, DIVIDEND_GRADE_NA_SAMPLE.expected_corp_name);
      assertGrade(r, DIVIDEND_GRADE_NA_SAMPLE.expected_grade);
      return formatResult(r);
    },
  },
];

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
