import { test, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadConfig,
  saveConfig,
  type SagyeonginConfig,
} from "./config-store.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sagyeongin-test-"));
  process.env.SAGYEONGIN_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  delete process.env.SAGYEONGIN_CONFIG_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("첫 호출 — 디렉토리 부재 시 기본값 반환, 파일 미생성(H2)", async () => {
  const config = await loadConfig();
  assert.equal(config.version, "0.1");
  assert.deepEqual(config.watchlist, []);
  assert.equal(config.active_preset, "default");

  let exists = false;
  try {
    await fs.access(path.join(tmpDir, "config.json"));
    exists = true;
  } catch {
    // ENOENT — 정상
  }
  assert.equal(exists, false, "loadConfig는 파일을 생성하면 안 됨");
});

test("save 후 load — 저장된 데이터 복원", async () => {
  const config = await loadConfig();
  config.watchlist.push({
    corp_code: "00126380",
    name: "삼성전자",
    added_at: "2026-04-28",
    tags: ["대형", "반도체"],
  });
  await saveConfig(config);

  const loaded = await loadConfig();
  assert.equal(loaded.watchlist.length, 1);
  assert.equal(loaded.watchlist[0].corp_code, "00126380");
  assert.equal(loaded.watchlist[0].name, "삼성전자");
  assert.deepEqual(loaded.watchlist[0].tags, ["대형", "반도체"]);
});

test("mkdir 자동 생성(G1) — 중첩 미존재 경로에도 saveConfig 성공", async () => {
  const nestedDir = path.join(tmpDir, "nested", "missing");
  process.env.SAGYEONGIN_CONFIG_DIR = nestedDir;

  const config = await loadConfig();
  await saveConfig(config);

  await fs.access(path.join(nestedDir, "config.json")); // 예외 없으면 존재
});

test("부분 결손 보강 — 최상위 키 누락 시 기본값으로 보강", async () => {
  await fs.writeFile(
    path.join(tmpDir, "config.json"),
    JSON.stringify({ version: "0.1", watchlist: [] }) + "\n",
    "utf8",
  );

  const config = await loadConfig();
  assert.deepEqual(config.watchlist, []);
  assert.ok(config.scan_presets.default !== undefined, "scan_presets.default 보강됨");
  assert.equal(config.active_preset, "default");
  assert.equal(config.parameters.insider_cluster_threshold, 2);
  assert.equal(config.required_return_cache.source, "kisrating.com BBB- 5Y");
});

test("부분 결손 보강 — parameters 내 특정 키만 누락 시 해당 키만 기본값", async () => {
  await fs.writeFile(
    path.join(tmpDir, "config.json"),
    JSON.stringify({
      version: "0.1",
      parameters: { insider_cluster_threshold: 5 },
    }) + "\n",
    "utf8",
  );

  const config = await loadConfig();
  assert.equal(config.parameters.insider_cluster_threshold, 5);
  assert.equal(config.parameters.srim_required_return_override, null);
  assert.equal(config.parameters.srim_buy_price_basis, "fair");
  assert.deepEqual(config.parameters.dividend_payout_healthy_range, [0.20, 0.40]);
});

test("빈 객체 유지 — scan_presets:{} 는 사용자 의도로 보강 안 함", async () => {
  await fs.writeFile(
    path.join(tmpDir, "config.json"),
    JSON.stringify({ version: "0.1", scan_presets: {} }) + "\n",
    "utf8",
  );

  const config = await loadConfig();
  assert.deepEqual(config.scan_presets, {});
  assert.equal(config.active_preset, "default"); // 누락된 키는 보강됨
});

test("지원 안 되는 version — throw, 메시지에 버전 포함", async () => {
  await fs.writeFile(
    path.join(tmpDir, "config.json"),
    JSON.stringify({ version: "0.2", watchlist: [] }) + "\n",
    "utf8",
  );

  await assert.rejects(
    async () => loadConfig(),
    (e: Error) => {
      assert.ok(e.message.includes("0.2"), `에러 메시지에 "0.2" 포함 필요: ${e.message}`);
      return true;
    },
  );
});

test("JSON 파싱 실패 — throw, 메시지에 파일 경로 포함", async () => {
  await fs.writeFile(path.join(tmpDir, "config.json"), "not-json-text", "utf8");

  await assert.rejects(
    async () => loadConfig(),
    (e: Error) => {
      assert.ok(
        e.message.includes(tmpDir),
        `에러 메시지에 파일 경로 포함 필요: ${e.message}`,
      );
      return true;
    },
  );
});

test("반환값 격리 — 반환된 config 변형이 다음 loadConfig에 영향 없음(structuredClone)", async () => {
  const config1 = await loadConfig();
  config1.watchlist.push({
    corp_code: "00000000",
    name: "테스트",
    added_at: "2026-04-28",
    tags: [],
  });

  const config2 = await loadConfig();
  assert.deepEqual(config2.watchlist, [], "첫 번째 변형이 두 번째 loadConfig에 영향 없어야 함");
});
