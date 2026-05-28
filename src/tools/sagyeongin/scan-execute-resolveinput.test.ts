import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { resolveInput } from "./scan-execute.js";

let tmpDir: string;

const CONFIG = {
  version: "0.1",
  watchlist: [],
  scan_presets: {
    test: {
      markets: ["KOSPI"],
      included_industries: ["10"],
      excluded_industries: ["64"],
      excluded_name_patterns: [],
    },
  },
  active_preset: "test",
  parameters: {
    insider_cluster_threshold: 2,
    srim_required_return_override: null,
    srim_buy_price_basis: "fair",
    dividend_payout_healthy_range: [0.2, 0.4],
  },
  required_return_cache: { last_fetched_at: null, value: null, source: "" },
};

const baseArgs = { min_opportunity_score: 0, limit: 10 };

async function writePref(pref: object): Promise<void> {
  await fs.writeFile(path.join(tmpDir, "user-preference.json"), JSON.stringify(pref), "utf8");
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sagyeongin-resolve-test-"));
  process.env.SAGYEONGIN_CONFIG_DIR = tmpDir;
  await fs.writeFile(path.join(tmpDir, "config.json"), JSON.stringify(CONFIG), "utf8");
});

afterEach(async () => {
  delete process.env.SAGYEONGIN_CONFIG_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("blacklist union → excluded 확대, whitelist override → included 대체", async () => {
  await writePref({ induty_whitelist: ["50"], induty_blacklist: ["68"], updated_at: "2026-05-28" });
  const r = await resolveInput({ ...baseArgs });
  assert.deepEqual(r.excluded_industries, ["64", "68"]);
  assert.deepEqual(r.included_industries, ["50"]);
});

test("empty pref (ENOENT) → preset 유지", async () => {
  const r = await resolveInput({ ...baseArgs });
  assert.deepEqual(r.excluded_industries, ["64"]);
  assert.deepEqual(r.included_industries, ["10"]);
});

test("args 우선 — args 지정 시 user_preference merge 안 함", async () => {
  await writePref({ induty_whitelist: ["50"], induty_blacklist: ["68"], updated_at: "2026-05-28" });
  const r = await resolveInput({ ...baseArgs, included_industries: ["99"], excluded_industries: ["88"] });
  assert.deepEqual(r.included_industries, ["99"]);
  assert.deepEqual(r.excluded_industries, ["88"]);
});

test("whitelist 빈 + blacklist 존재 → included preset 유지, excluded union", async () => {
  await writePref({ induty_whitelist: [], induty_blacklist: ["68"], updated_at: "2026-05-28" });
  const r = await resolveInput({ ...baseArgs });
  assert.deepEqual(r.included_industries, ["10"]);
  assert.deepEqual(r.excluded_industries, ["64", "68"]);
});
