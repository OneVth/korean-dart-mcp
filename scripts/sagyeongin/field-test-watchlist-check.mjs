#!/usr/bin/env node
/**
 * 10단계 sagyeongin_watchlist_check 통합 검증 — field-test.
 *
 * 4개 케이스:
 * - 1: corp_codes 직접 지정 + check_level "A" (killer만 stages 포함되는지)
 * - 2: corp_codes 직접 지정 + check_level "full" (6 도구 통합 + stages 매핑)
 * - 3: 존재 안 하는 corp_code (notes에 실패 기록되는지)
 * - 4: 빈 watchlist + corp_codes 미지정 (empty results + next_actions)
 *
 * 임시 SAGYEONGIN_CONFIG_DIR 사용 — 4단계 (killer) 패턴 따름.
 * 실제 사용자 watchlist에 영향 안 감.
 *
 * 샘플 corp (위임자 환경에서 검증):
 *   - 삼성전자 (005930)
 *   - 현대차 (005380)
 *   - 카카오 (035720)
 *   - LG화학 (051910)
 *
 * stock_code → corp_code 변환은 resolver.byStockCode 메서드 사용.
 * 메서드 이름이 fork 환경에 따라 다를 수 있으니 위임자가 확인.
 *
 * Ref: spec §10.9, §9.2, philosophy 7부 F + 5부, ADR-0001
 */

import "dotenv/config";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 임시 config 디렉토리 (4단계 패턴) — 사용자 watchlist 보호
const TEST_CONFIG_DIR = join(tmpdir(), "sagyeongin-field-test-watchlist-check");
if (existsSync(TEST_CONFIG_DIR)) {
  rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
}
mkdirSync(TEST_CONFIG_DIR, { recursive: true });
process.env.SAGYEONGIN_CONFIG_DIR = TEST_CONFIG_DIR;

// 빌드 산물 import (env 설정 후)
const { TOOL_REGISTRY } = await import("../../build/tools/index.js");
const { CorpCodeResolver } = await import("../../build/lib/corp-code.js");
const { DartClient } = await import("../../build/lib/dart-client.js");

const tool = TOOL_REGISTRY.find((t) => t.name === "sagyeongin_watchlist_check");
if (!tool) {
  throw new Error("Tool registration failed: sagyeongin_watchlist_check missing");
}

const client = new DartClient({ apiKey: process.env.DART_API_KEY });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };

// --- 헬퍼 ---
function assertSchema(r) {
  const required = ["checked_at", "summary", "results", "next_actions_suggested"];
  for (const k of required) {
    if (!(k in r)) throw new Error(`schema missing: ${k}`);
  }
  const sumKeys = [
    "total",
    "A_excluded",
    "srim_buy_zone",
    "B_review_required",
    "C_signal_detected",
  ];
  for (const k of sumKeys) {
    if (!(k in r.summary)) throw new Error(`summary missing: ${k}`);
  }
  for (const item of r.results) {
    const itemKeys = ["corp_code", "corp_name", "stages", "overall_flag", "notes"];
    for (const k of itemKeys) {
      if (!(k in item)) throw new Error(`result item missing: ${k}`);
    }
    if (!("killer" in item.stages)) {
      throw new Error(`stages.killer missing for ${item.corp_code}`);
    }
    const validFlags = ["watchlist_remove_recommended", "attention", "normal"];
    if (!validFlags.includes(item.overall_flag)) {
      throw new Error(`invalid overall_flag: ${item.overall_flag}`);
    }
  }
}

function formatResult(r) {
  const flagCounts = r.results.reduce((acc, item) => {
    acc[item.overall_flag] = (acc[item.overall_flag] ?? 0) + 1;
    return acc;
  }, {});
  return (
    `total=${r.summary.total}, A_excl=${r.summary.A_excluded}, ` +
    `srim_buy=${r.summary.srim_buy_zone}, B_rev=${r.summary.B_review_required}, ` +
    `C_sig=${r.summary.C_signal_detected}, flags=${JSON.stringify(flagCounts)}, ` +
    `actions=${r.next_actions_suggested.length}`
  );
}

// 위임자 환경: stock_code → corp_code 변환 (메서드 이름 환경마다 다를 수 있음)
const sampleStockCodes = ["005930", "005380", "035720", "051910"];
const sampleCorps = sampleStockCodes
  .map((sc) => {
    const r = typeof resolver.byStockCode === "function"
      ? resolver.byStockCode(sc)
      : resolver.resolve?.(sc);
    return r;
  })
  .filter((r) => r != null)
  .map((r) => r.corp_code);

if (sampleCorps.length !== 4) {
  console.warn(
    `[warn] 샘플 corp 4개 못 채움 — 실제 ${sampleCorps.length}개. resolver 메서드 이름 확인 필요.`,
  );
}

// --- 테스트 케이스 ---
const tests = [
  // 케이스 1: check_level "A"
  {
    label: `[watchlist_check] 케이스 1 — corp_codes ${sampleCorps.length}개 + check_level "A" (killer만)`,
    run: async () => {
      const r = await tool.handler(
        { check_level: "A", corp_codes: sampleCorps },
        ctx,
      );
      assertSchema(r);
      if (r.summary.total !== sampleCorps.length) {
        throw new Error(`expected total=${sampleCorps.length}, got ${r.summary.total}`);
      }
      // level A: stages는 killer만 있어야 함
      for (const item of r.results) {
        const stageKeys = Object.keys(item.stages);
        if (stageKeys.length !== 1 || !stageKeys.includes("killer")) {
          throw new Error(
            `expected stages={killer} for level A, got ${JSON.stringify(stageKeys)} (${item.corp_code})`,
          );
        }
      }
      console.log("\n  [케이스 1 raw]");
      for (const item of r.results) {
        console.log(
          `    ${item.corp_code} (${item.corp_name}): killer=${item.stages.killer.verdict}, ` +
          `flag=${item.overall_flag}, notes=${item.notes.length}`,
        );
      }
      return formatResult(r);
    },
  },
  // 케이스 2: check_level "full"
  {
    label: `[watchlist_check] 케이스 2 — corp_codes ${sampleCorps.length}개 + check_level "full" (6 도구)`,
    run: async () => {
      const r = await tool.handler(
        { check_level: "full", corp_codes: sampleCorps },
        ctx,
      );
      assertSchema(r);
      if (r.summary.total !== sampleCorps.length) {
        throw new Error(`expected total=${sampleCorps.length}, got ${r.summary.total}`);
      }
      console.log("\n  [케이스 2 raw]");
      for (const item of r.results) {
        const stages = item.stages;
        console.log(
          `    ${item.corp_code} (${item.corp_name}): flag=${item.overall_flag}`,
        );
        console.log(
          `      killer=${stages.killer?.verdict ?? "?"}, ` +
          `srim=${stages.srim?.verdict ?? "?"} (gap_to_fair=${stages.srim?.gap_to_fair ?? "?"}), ` +
          `cashflow=${stages.cashflow?.verdict ?? "?"} (concern=${stages.cashflow?.concern_score ?? "?"}, top_flags=${JSON.stringify(stages.cashflow?.top_flags ?? [])})`,
        );
        console.log(
          `      capex=${stages.capex?.verdict ?? "?"} (opp=${stages.capex?.opportunity_score ?? "?"}, top_signals=${JSON.stringify(stages.capex?.top_signals ?? [])}), ` +
          `insider=${stages.insider?.signal ?? "?"} (cluster_quarter=${stages.insider?.cluster_quarter ?? "?"}), ` +
          `dividend=${stages.dividend?.grade ?? "?"}`,
        );
        console.log(`      notes: ${JSON.stringify(item.notes)}`);
      }
      console.log(`    next_actions: ${JSON.stringify(r.next_actions_suggested)}`);
      return formatResult(r);
    },
  },
  // 케이스 3: 존재 안 하는 corp_code
  {
    label: `[watchlist_check] 케이스 3 — 존재 안 하는 corp_code (99999999) — notes 기록 검증`,
    run: async () => {
      const r = await tool.handler(
        { check_level: "full", corp_codes: ["99999999"] },
        ctx,
      );
      assertSchema(r);
      if (r.summary.total !== 1) {
        throw new Error(`expected total=1, got ${r.summary.total}`);
      }
      const item = r.results[0];
      if (item.notes.length === 0) {
        throw new Error(`expected notes (도구 호출 실패 기록), got empty`);
      }
      console.log("\n  [케이스 3 raw]");
      console.log(`    corp_name=${item.corp_name}, flag=${item.overall_flag}`);
      console.log(`    notes: ${JSON.stringify(item.notes)}`);
      console.log(`    stages keys: ${JSON.stringify(Object.keys(item.stages))}`);
      return formatResult(r);
    },
  },
  // 케이스 4: 빈 watchlist + corp_codes 미지정
  {
    label: `[watchlist_check] 케이스 4 — 빈 watchlist + corp_codes 미지정`,
    run: async () => {
      // 임시 config라 watchlist 비어있음 (init 안 했으니)
      const r = await tool.handler({}, ctx);
      assertSchema(r);
      if (r.summary.total !== 0) {
        throw new Error(`expected total=0 (빈 watchlist), got ${r.summary.total}`);
      }
      if (r.results.length !== 0) {
        throw new Error(`expected results=[], got length ${r.results.length}`);
      }
      if (r.next_actions_suggested.length === 0) {
        throw new Error(`expected next_actions (빈 watchlist 안내), got empty`);
      }
      console.log("\n  [케이스 4 raw]");
      console.log(`    next_actions: ${JSON.stringify(r.next_actions_suggested)}`);
      return formatResult(r);
    },
  },
];

// --- 실행 루프 ---
const startMs = Date.now();
let pass = 0, fail = 0;

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
