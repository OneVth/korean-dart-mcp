// field-test: Stage 30.1.1 — sagyeongin_capex_signal 13건 전수 + KEY CASE 검증.
// 인콘(468, 00475976): evidence.existing_business_match = null → 시그널 existing_business (null 흡수 ADR-0027)
// 한화리츠(68112, 01669226): evidence.existing_business_match = false → 시그널 unrelated (blacklist 임대)
// Ref: ADR-0027, phase2-summary-2026-05-24.md, 회수 F 13건 (verifications/stage30/)

import "dotenv/config";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const TEST_CONFIG_DIR = join(tmpdir(), "sagyeongin-field-test-capex-30-1-1");
if (existsSync(TEST_CONFIG_DIR)) rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
mkdirSync(TEST_CONFIG_DIR, { recursive: true });
process.env.SAGYEONGIN_CONFIG_DIR = TEST_CONFIG_DIR;

// 빌드 산물 import (env 설정 후)
const { TOOL_REGISTRY } = await import("../../build/tools/index.js");
const { CorpCodeResolver } = await import("../../build/lib/corp-code.js");
const { DartClient } = await import("../../build/lib/dart-client.js");

const capexTool = TOOL_REGISTRY.find((t) => t.name === "sagyeongin_capex_signal");
if (!capexTool) {
  throw new Error("Tool registration failed: sagyeongin_capex_signal missing");
}

const client = new DartClient({ apiKey: process.env.DART_API_KEY });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };

// 회수 F 13건 — corp_code 출처: verifications/stage30/tgast-inh-decsn-raw-2026-05-22.json
// expected_judge: judgeExistingBusinessMatch 예상 결과 (이론치, ADR-0027 keyword chain)
// key_case: true = hard assertion 대상 (2건)
const FIXTURES = [
  { corp_code: "00659976", corp_name: "영화테크",      induty: "3033",  expected_judge: "true"       },
  { corp_code: "01706794", corp_name: "아이언디바이스", induty: "26112", expected_judge: "null"       },
  { corp_code: "01428948", corp_name: "오아",          induty: "47320", expected_judge: "null"       },
  { corp_code: "01385005", corp_name: "리브스메드",    induty: "27112", expected_judge: "true"       },
  { corp_code: "01546101", corp_name: "아이엠티",      induty: "29299", expected_judge: "true"       },
  { corp_code: "00896753", corp_name: "에코글로우",    induty: "204",   expected_judge: "null"       },
  { corp_code: "01547933", corp_name: "미쥬",          induty: "141",   expected_judge: "null"       },
  { corp_code: "00108612", corp_name: "DS단석",        induty: "204",   expected_judge: "null"       },
  { corp_code: "00317210", corp_name: "성호전자",      induty: "26291", expected_judge: "false"      },
  { corp_code: "00563545", corp_name: "두산테스나",    induty: "739",   expected_judge: "true"       },
  { corp_code: "00475976", corp_name: "인콘",          induty: "468",   expected_judge: "null(mixed)", key_case: true,  key_assert: "not_false"  },
  { corp_code: "01669226", corp_name: "한화리츠",      induty: "68112", expected_judge: "false",       key_case: true,  key_assert: "false"      },
  { corp_code: "01307593", corp_name: "에이아이코리아",induty: "29271", expected_judge: "null"       },
];

// KEY CASE assertions:
// "not_false" = existing_business_match !== false (null 흡수 정합 검증)
// "false"     = existing_business_match === false (blacklist 임대 정합 검증)
function assertKeyCase(fix, r) {
  const signals = r.signals ?? [];
  if (fix.key_assert === "not_false") {
    for (const s of signals) {
      if (s.evidence?.existing_business_match === false) {
        throw new Error(
          `KEY CASE FAIL [${fix.corp_name}]: existing_business_match=false (null 흡수 실패). ` +
          `signal=${s.signal}, ADR-0027 §null 흡수 정책 위반. capex-signal.ts:180 if-else 재확인.`,
        );
      }
    }
  } else if (fix.key_assert === "false") {
    const hasExpected = signals.some(
      (s) => s.evidence?.existing_business_match === false,
    );
    if (!hasExpected && signals.length > 0) {
      throw new Error(
        `KEY CASE FAIL [${fix.corp_name}]: existing_business_match≠false (blacklist 임대 미매칭). ` +
        `signals=${signals.map((s) => s.signal).join(",")}. 실제 DART inh_pp 텍스트 raw 확인 필요.`,
      );
    }
  }
}

const results = [];
let passCount = 0;
let failCount = 0;
let noSignalCount = 0;

for (const fix of FIXTURES) {
  console.log(`\n[${fix.corp_name}] (${fix.corp_code}, induty=${fix.induty})`);
  let r;
  try {
    r = await capexTool.handler({ corp_code: fix.corp_code, lookback_months: 12 }, ctx);
  } catch (e) {
    console.error(`  ERROR: ${e.message}`);
    results.push({ ...fix, error: e.message });
    failCount++;
    continue;
  }

  const signals = r.signals ?? [];
  console.log(`  verdict=${r.verdict}, score=${r.opportunity_score}, signals=${signals.length}`);
  for (const s of signals) {
    const eq = s.evidence?.existing_business_match;
    const eqLabel = eq === null ? "null(absorbed)" : eq === false ? "false(blacklist)" : "true(whitelist)";
    console.log(
      `    ▸ ${s.signal}: ${s.description} | ebm=${eqLabel} | ratio=${(s.evidence.equity_ratio * 100).toFixed(1)}%`,
    );
  }

  if (r.verdict === "NO_SIGNAL") {
    console.log(`  ⚠ NO_SIGNAL — equity data 부재 또는 ratio<5% (data availability 이슈 가능)`);
    noSignalCount++;
  }

  let keyFail = null;
  if (fix.key_case) {
    try {
      assertKeyCase(fix, r);
      console.log(`  ✓ KEY CASE PASS`);
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
      keyFail = e.message;
      failCount++;
    }
    if (!keyFail) passCount++;
  } else {
    passCount++;
  }

  results.push({
    corp_code: fix.corp_code,
    corp_name: fix.corp_name,
    induty: fix.induty,
    expected_judge: fix.expected_judge,
    key_case: fix.key_case ?? false,
    verdict: r.verdict,
    opportunity_score: r.opportunity_score,
    signals: signals.map((s) => ({
      signal: s.signal,
      description: s.description,
      existing_business_match: s.evidence?.existing_business_match ?? null,
      equity_ratio: s.evidence?.equity_ratio ?? null,
    })),
    key_fail: keyFail ?? null,
  });
}

// 결과 저장
const today = new Date().toISOString().slice(0, 10);
const outDir = resolve(ROOT, "verifications", "stage30.1");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, `field-test-capex-30-1-1-${today}.json`);
writeFileSync(outPath, JSON.stringify({ date: today, results }, null, 2));
console.log(`\n[SAVED] ${outPath}`);

// Summary
const keyCaseFails = results.filter((r) => r.key_case && r.key_fail);
console.log("\n=== Stage 30.1.1 field-test-capex-30-1-1 결과 ===");
console.log(`  전체: ${FIXTURES.length}건 | PASS: ${passCount} | FAIL: ${failCount} | NO_SIGNAL: ${noSignalCount}`);
if (keyCaseFails.length === 0) {
  console.log("  KEY CASE (인콘 + 한화리츠): 전체 PASS ✓");
} else {
  console.error(`  KEY CASE FAIL ${keyCaseFails.length}건:`);
  for (const r of keyCaseFails) {
    console.error(`    ✗ ${r.corp_name}: ${r.key_fail}`);
  }
  process.exit(1);
}
if (failCount > 0) process.exit(1);
