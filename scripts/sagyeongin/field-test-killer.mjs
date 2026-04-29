// field-test: sagyeongin_killer_check 통합 검증.
// PASS 케이스 (삼성전자, 현대차) + EXCLUDE 케이스 (발견 누적).
// ADR-0003: 실제 DART API 호출 + fixture 종목 컨텍스트 주석 패턴.

import "dotenv/config";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_CONFIG_DIR = join(tmpdir(), "sagyeongin-field-test-killer");
if (existsSync(TEST_CONFIG_DIR)) rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
mkdirSync(TEST_CONFIG_DIR, { recursive: true });
process.env.SAGYEONGIN_CONFIG_DIR = TEST_CONFIG_DIR;

// 빌드 산물 import (env 설정 후)
const { TOOL_REGISTRY } = await import("../../build/tools/index.js");
const { CorpCodeResolver } = await import("../../build/lib/corp-code.js");
const { DartClient } = await import("../../build/lib/dart-client.js");
const fixtures = await import("./fixtures.mjs");
const { SAMSUNG, HYUNDAI } = fixtures;

const killerCheckTool = TOOL_REGISTRY.find((t) => t.name === "sagyeongin_killer_check");
if (!killerCheckTool) {
  throw new Error("Tool registration failed: sagyeongin_killer_check missing");
}

const client = new DartClient({ apiKey: process.env.DART_API_KEY });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };

// --- 헬퍼 ---

function assertVerdict(r, expected) {
  if (r.verdict !== expected) {
    const rules = r.triggered_rules.map((t) => t.rule).join(", ") || "(없음)";
    throw new Error(
      `verdict mismatch: ${r.verdict} (expected ${expected}), rules=[${rules}]`,
    );
  }
}

function assertRuleTriggered(r, expectedRule) {
  const triggered = r.triggered_rules.map((t) => t.rule);
  if (!triggered.includes(expectedRule)) {
    throw new Error(
      `rule "${expectedRule}" not triggered. triggered=[${triggered.join(", ") || "없음"}]`,
    );
  }
}

function assertCorpName(r, expected) {
  if (r.corp_name !== expected) {
    throw new Error(`corp_name mismatch: "${r.corp_name}" (expected "${expected}")`);
  }
}

function formatResult(r) {
  const rules = r.triggered_rules.map((t) => t.rule).join(", ") || "(없음)";
  return `verdict=${r.verdict}, corp_name=${r.corp_name}, rules=[${rules}]`;
}

// --- 테스트 케이스 ---

const tests = [
  // PASS 케이스
  {
    label: "[killer_check] 삼성전자 (00126380) — PASS 기대",
    run: async () => {
      const r = await killerCheckTool.handler(
        { corp_code: SAMSUNG.corp_code, check_financial: true, check_disclosure: true },
        ctx,
      );
      assertCorpName(r, SAMSUNG.expected_corp_name);
      assertVerdict(r, "PASS");
      return formatResult(r);
    },
  },
  {
    label: "[killer_check] 현대자동차 (00164742) — PASS 기대",
    run: async () => {
      const r = await killerCheckTool.handler(
        { corp_code: HYUNDAI.corp_code, check_financial: true, check_disclosure: true },
        ctx,
      );
      assertCorpName(r, HYUNDAI.expected_corp_name);
      assertVerdict(r, "PASS");
      return formatResult(r);
    },
  },
  // 토글 테스트
  {
    label: "[killer_check] 삼성전자 check_financial=false — financial 룰 미평가",
    run: async () => {
      const r = await killerCheckTool.handler(
        { corp_code: SAMSUNG.corp_code, check_financial: false, check_disclosure: true },
        ctx,
      );
      const financialRules = ["consecutive_operating_loss", "low_revenue_kosdaq"];
      for (const rule of r.triggered_rules) {
        if (financialRules.includes(rule.rule)) {
          throw new Error(`financial rule triggered despite check_financial=false: ${rule.rule}`);
        }
      }
      return `check_financial=false OK, verdict=${r.verdict}`;
    },
  },
  {
    label: "[killer_check] 삼성전자 check_disclosure=false — disclosure 룰 미평가",
    run: async () => {
      const r = await killerCheckTool.handler(
        { corp_code: SAMSUNG.corp_code, check_financial: true, check_disclosure: false },
        ctx,
      );
      const disclosureRules = [
        "auditor_change",
        "non_clean_opinion",
        "frequent_cb_issuance",
        "frequent_bw_issuance",
        "frequent_rights_offering",
      ];
      for (const rule of r.triggered_rules) {
        if (disclosureRules.includes(rule.rule)) {
          throw new Error(`disclosure rule triggered despite check_disclosure=false: ${rule.rule}`);
        }
      }
      return `check_disclosure=false OK, verdict=${r.verdict}`;
    },
  },
  // 에러 케이스
  {
    label: "[killer_check] 존재 안 하는 corp_code — throw 기대",
    run: async () => {
      try {
        await killerCheckTool.handler(
          { corp_code: "99999999", check_financial: true, check_disclosure: true },
          ctx,
        );
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

// EXCLUDE 케이스 자동 추가 (fixtures.mjs에서 export된 *_SAMPLE 변수)
const excludeKeys = Object.keys(fixtures).filter(
  (k) => k !== "SAMSUNG" && k !== "HYUNDAI" && k.endsWith("_SAMPLE"),
);
for (const key of excludeKeys) {
  const fixture = fixtures[key];
  if (!fixture?.corp_code || !fixture?.expected_triggered_rule) continue;
  tests.push({
    label: `[killer_check] EXCLUDE: ${fixture.expected_corp_name ?? fixture.corp_code} — ${fixture.expected_triggered_rule} 트리거 기대`,
    run: async () => {
      const r = await killerCheckTool.handler(
        { corp_code: fixture.corp_code, check_financial: true, check_disclosure: true },
        ctx,
      );
      if (fixture.expected_corp_name) assertCorpName(r, fixture.expected_corp_name);
      assertVerdict(r, "EXCLUDE");
      assertRuleTriggered(r, fixture.expected_triggered_rule);
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
