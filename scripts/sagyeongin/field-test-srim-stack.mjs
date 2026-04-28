// field-test: srim + required-return 통합 검증.
// SAGYEONGIN_CONFIG_DIR을 /tmp 격리 디렉토리로 설정 → 사용자 실제 config 무관.

import "dotenv/config";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_CONFIG_DIR = join(tmpdir(), "sagyeongin-field-test-srim");
if (existsSync(TEST_CONFIG_DIR)) rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
mkdirSync(TEST_CONFIG_DIR, { recursive: true });
process.env.SAGYEONGIN_CONFIG_DIR = TEST_CONFIG_DIR;

// 빌드 산물 import (env 설정 후)
const { TOOL_REGISTRY } = await import("../../build/tools/index.js");
const { CorpCodeResolver } = await import("../../build/lib/corp-code.js");
const { DartClient } = await import("../../build/lib/dart-client.js");
const { SAMSUNG, HYUNDAI } = await import("./fixtures.mjs");

// 도구 lookup
const srimTool = TOOL_REGISTRY.find((t) => t.name === "sagyeongin_srim");
const requiredReturnTool = TOOL_REGISTRY.find((t) => t.name === "sagyeongin_required_return");
if (!srimTool || !requiredReturnTool) {
  throw new Error("Tool registration failed: srim or required-return missing");
}

// ToolCtx 준비 (field-test-v0_9.mjs 패턴)
const client = new DartClient({ apiKey: process.env.DART_API_KEY });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };

// --- 헬퍼 ---

function assertCorpName(r, expected) {
  if (r.corp_name !== expected) {
    throw new Error(`corp_name mismatch: ${r.corp_name} (expected ${expected})`);
  }
}

function assertSanity(r) {
  if (!(r.inputs.equity_current > 0))
    throw new Error(`equity_current not positive: ${r.inputs.equity_current}`);
  if (!(r.inputs.avg_roe >= -50 && r.inputs.avg_roe <= 100))
    throw new Error(`avg_roe out of range: ${r.inputs.avg_roe}`);
  if (!(r.inputs.required_return_K >= 0.001 && r.inputs.required_return_K <= 0.50))
    throw new Error(`K out of range: ${r.inputs.required_return_K}`);
  if (!(r.inputs.shares_outstanding > 0))
    throw new Error(`shares not positive: ${r.inputs.shares_outstanding}`);
  // ROE<K(적자 국면)이면 buy>fair>sell 역전이 정상 — 양수 여부만 검증
  if (!(r.prices.buy_price > 0 && r.prices.fair_price > 0 && r.prices.sell_price > 0))
    throw new Error(
      `prices not positive: ${r.prices.buy_price} / ${r.prices.fair_price} / ${r.prices.sell_price}`,
    );
  if (r.prices.current_price !== null && !(r.prices.current_price > 0))
    throw new Error(`current_price not positive: ${r.prices.current_price}`);
  const allowedVerdicts = ["BUY", "BUY_FAIR", "HOLD", "SELL", null];
  if (!allowedVerdicts.includes(r.verdict))
    throw new Error(`verdict invalid: ${r.verdict}`);
  if (!r.note.includes("K_source="))
    throw new Error(`note missing K_source: ${r.note}`);
}

function formatPass(r) {
  return (
    `K=${r.inputs.required_return_K.toFixed(4)}, ` +
    `avg_roe=${r.inputs.avg_roe.toFixed(2)}%, ` +
    `prices=[buy ${r.prices.buy_price}, fair ${r.prices.fair_price}, sell ${r.prices.sell_price}], ` +
    `current=${r.prices.current_price}, verdict=${r.verdict}`
  );
}

// --- 테스트 케이스 ---

const tests = [
  {
    label: "[srim] 삼성전자 (00126380, default K)",
    run: async () => {
      const r = await srimTool.handler({ corp_code: SAMSUNG.corp_code }, ctx);
      assertCorpName(r, SAMSUNG.expected_corp_name);
      assertSanity(r);
      return formatPass(r);
    },
  },
  {
    label: "[srim] 삼성전자 override_K=0.10",
    run: async () => {
      const r = await srimTool.handler(
        { corp_code: SAMSUNG.corp_code, override_K: 0.10 },
        ctx,
      );
      if (Math.abs(r.inputs.required_return_K - 0.10) > 1e-9)
        throw new Error(`K mismatch: ${r.inputs.required_return_K}`);
      if (!r.note.includes("K_source=input_override"))
        throw new Error(`note missing K_source: ${r.note}`);
      return `K=${r.inputs.required_return_K}, ${r.note}`;
    },
  },
  {
    label: "[srim] 현대자동차 (00164742, default K)",
    run: async () => {
      const r = await srimTool.handler({ corp_code: HYUNDAI.corp_code }, ctx);
      assertCorpName(r, HYUNDAI.expected_corp_name);
      assertSanity(r);
      return formatPass(r);
    },
  },
  {
    label: "[required_return] force_refresh=true (첫 호출)",
    run: async () => {
      const r = await requiredReturnTool.handler({ force_refresh: true }, ctx);
      if (!(r.value >= 0.001 && r.value <= 0.50))
        throw new Error(`value out of range: ${r.value}`);
      if (r.from_cache !== false)
        throw new Error(`expected from_cache: false`);
      return `value=${r.value}, from_cache=false`;
    },
  },
  {
    label: "[required_return] 두 번째 호출 (캐시 신선)",
    run: async () => {
      const r = await requiredReturnTool.handler({}, ctx);
      if (r.from_cache !== true)
        throw new Error(`expected from_cache: true`);
      if (r.cache_age_hours !== 0)
        throw new Error(`expected cache_age_hours: 0, got ${r.cache_age_hours}`);
      return `value=${r.value}, from_cache=true, cache_age_hours=0`;
    },
  },
  {
    label: "[required_return] force_refresh=true",
    run: async () => {
      const r = await requiredReturnTool.handler({ force_refresh: true }, ctx);
      if (r.from_cache !== false)
        throw new Error(`expected from_cache: false on force_refresh`);
      return `value=${r.value}, from_cache=false`;
    },
  },
  {
    label: "[srim] 99999999 (존재 안 하는 corp_code)",
    run: async () => {
      try {
        await srimTool.handler({ corp_code: "99999999" }, ctx);
        throw new Error("expected throw, got success");
      } catch (err) {
        if (!err.message.includes("not found"))
          throw new Error(`unexpected error: ${err.message}`);
        return `throw 처리: ${err.message}`;
      }
    },
  },
];

// --- 실행 루프 ---

const startMs = Date.now();
let pass = 0;
let fail = 0;

for (const t of tests) {
  console.log(`${t.label}...`);
  try {
    const detail = await t.run();
    console.log(`  PASS  ${detail}`);
    pass++;
  } catch (err) {
    console.log(`  FAIL  ${err.message ?? err}`);
    fail++;
  }
}

const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
console.log();
console.log(`Summary: ${pass} PASS / ${fail} FAIL (${elapsedSec}s)`);
process.exit(fail > 0 ? 1 : 0);
