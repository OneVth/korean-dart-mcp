/**
 * field-test-config-store — config-store 통합 검증.
 *
 * 임시 디렉토리(SAGYEONGIN_CONFIG_DIR env override) 사용.
 * 실제 사용자 홈의 ~/.sagyeongin-dart/ 절대 건드리지 않음.
 * DART API는 corp_code → name 변환에서만 (resolver, SQLite 로컬 캐시 사용).
 *
 * Ref: spec §6, §10.10, §10.11, ADR-0003
 */
import "dotenv/config";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

// env var는 import 전에 설정 (config-store가 lazy 평가하지만 안전 차원)
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sagyeongin-fieldtest-"));
process.env.SAGYEONGIN_CONFIG_DIR = tmpDir;

const { DartClient } = await import("../../build/lib/dart-client.js");
const { CorpCodeResolver } = await import("../../build/lib/corp-code.js");
const { TOOL_REGISTRY } = await import("../../build/tools/index.js");
const { loadConfig } = await import("../../build/tools/sagyeongin/_lib/config-store.js");

const client = new DartClient({ apiKey: process.env.DART_API_KEY });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };

const updateWatchlist = TOOL_REGISTRY.find((t) => t.name === "sagyeongin_update_watchlist");
const updateScanPreset = TOOL_REGISTRY.find((t) => t.name === "sagyeongin_update_scan_preset");

if (!updateWatchlist || !updateScanPreset) {
  console.log(`[FATAL] 도구 등록 누락. update_watchlist=${!!updateWatchlist}, update_scan_preset=${!!updateScanPreset}`);
  process.exit(1);
}

let pass = 0;
let fail = 0;

async function run(name, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    if (result === true) {
      console.log(`[PASS] ${name}  (${ms}ms)`);
      pass++;
    } else {
      console.log(`[FAIL] ${name}  (${ms}ms): ${result}`);
      fail++;
    }
  } catch (e) {
    const ms = Date.now() - t0;
    console.log(`[FAIL] ${name}  (${ms}ms) ERROR: ${e.message}`);
    fail++;
  }
}

const SAMSUNG = "00126380";   // 삼성전자
const HYUNDAI = "00164742";   // 현대차

// 1. 시작 상태 — 빈 watchlist, default 프리셋만
await run("01-시작 상태 — config 부재 시 기본값", async () => {
  const r = await updateWatchlist.handler({ action: "list" }, ctx);
  if (r.watchlist.length !== 0) return `watchlist 비어있어야: ${r.watchlist.length}`;
  const p = await updateScanPreset.handler({ action: "list" }, ctx);
  if (p.active_preset !== "default") return `active=${p.active_preset}`;
  if (Object.keys(p.scan_presets).length !== 1) return `presets=${Object.keys(p.scan_presets)}`;
  return true;
});

// 2. add 2종목
await run("02-add 2종목 — corp_code → name 자동 조회", async () => {
  const r = await updateWatchlist.handler({
    action: "add",
    corp_codes: [SAMSUNG, HYUNDAI],
    tags: ["대형"],
    notes: "field test",
  }, ctx);
  if (r.watchlist.length !== 2) return `len=${r.watchlist.length}`;
  const samsung = r.watchlist.find((x) => x.corp_code === SAMSUNG);
  if (!samsung || !samsung.name.includes("삼성전자")) return `name=${samsung?.name}`;
  if (samsung.tags[0] !== "대형") return `tags=${samsung.tags}`;
  if (samsung.notes !== "field test") return `notes=${samsung.notes}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(samsung.added_at)) return `added_at=${samsung.added_at}`;
  return true;
});

// 3. add 중복 — D1
await run("03-add 중복 — throw (D1)", async () => {
  try {
    await updateWatchlist.handler({ action: "add", corp_codes: [SAMSUNG] }, ctx);
    return "throw 안 됨";
  } catch (e) {
    if (!e.message.includes(SAMSUNG)) return `메시지에 corp_code 없음: ${e.message}`;
    return true;
  }
});

// 4. update_tags — E1 부분 갱신
await run("04-update_tags — tags만 갱신, notes 보존", async () => {
  const r = await updateWatchlist.handler({
    action: "update_tags",
    corp_codes: [SAMSUNG],
    tags: ["대형", "반도체"],
  }, ctx);
  const samsung = r.watchlist.find((x) => x.corp_code === SAMSUNG);
  if (samsung.tags.length !== 2 || !samsung.tags.includes("반도체")) return `tags=${samsung.tags}`;
  if (samsung.notes !== "field test") return `notes 보존 실패: ${samsung.notes}`;
  return true;
});

// 5. remove 1종목 — F2 멱등 (없는 코드 섞어도 통과)
await run("05-remove 1+가짜 — 멱등 (F2)", async () => {
  const r = await updateWatchlist.handler({
    action: "remove",
    corp_codes: [HYUNDAI, "99999999"],
  }, ctx);
  if (r.watchlist.length !== 1) return `len=${r.watchlist.length}`;
  if (r.watchlist[0].corp_code !== SAMSUNG) return `남은 종목=${r.watchlist[0].corp_code}`;
  return true;
});

// 6. preset create
await run("06-preset create tech_focus", async () => {
  const r = await updateScanPreset.handler({
    action: "create",
    preset_name: "tech_focus",
    config: {
      markets: ["KOSDAQ"],
      included_industries: ["26", "62", "63"],
    },
  }, ctx);
  if (!r.scan_presets.tech_focus) return "tech_focus 생성 실패";
  if (r.scan_presets.tech_focus.markets[0] !== "KOSDAQ") return "markets 저장 실패";
  return true;
});

// 7. preset update — G1 부분 patch
await run("07-preset update — markets만 변경, included_industries 보존 (G1)", async () => {
  const r = await updateScanPreset.handler({
    action: "update",
    preset_name: "tech_focus",
    config: { markets: ["KOSPI", "KOSDAQ"] },
  }, ctx);
  const t = r.scan_presets.tech_focus;
  if (t.markets.length !== 2) return `markets=${t.markets}`;
  if (!t.included_industries || t.included_industries.length !== 3) return `included_industries 사라짐: ${t.included_industries}`;
  return true;
});

// 8. set_active + delete 보호 — H1
await run("08-set_active tech_focus → delete 시 throw (H1)", async () => {
  await updateScanPreset.handler({ action: "set_active", preset_name: "tech_focus" }, ctx);
  try {
    await updateScanPreset.handler({ action: "delete", preset_name: "tech_focus" }, ctx);
    return "active 프리셋이 삭제됨";
  } catch (e) {
    if (!e.message.includes("tech_focus")) return `메시지: ${e.message}`;
    return true;
  }
});

// 9. set_active 다른 프리셋 후 delete 성공
await run("09-active를 default로 옮긴 후 tech_focus 삭제", async () => {
  await updateScanPreset.handler({ action: "set_active", preset_name: "default" }, ctx);
  const r = await updateScanPreset.handler({ action: "delete", preset_name: "tech_focus" }, ctx);
  if (r.scan_presets.tech_focus) return "삭제 실패";
  if (r.active_preset !== "default") return `active=${r.active_preset}`;
  return true;
});

// 10. 디스크 파일 직접 검증 — spec §6.2 스키마 정합
await run("10-디스크 파일 spec §6.2 스키마 정합", async () => {
  const config = await loadConfig();
  if (config.version !== "0.1") return `version=${config.version}`;
  const required = ["version", "watchlist", "scan_presets", "active_preset", "parameters", "required_return_cache"];
  for (const k of required) {
    if (!(k in config)) return `필드 누락: ${k}`;
  }
  const pkeys = ["insider_cluster_threshold", "srim_required_return_override", "srim_buy_price_basis", "dividend_payout_healthy_range"];
  for (const k of pkeys) {
    if (!(k in config.parameters)) return `parameters.${k} 누락`;
  }
  return true;
});

// teardown
await fs.rm(tmpDir, { recursive: true, force: true });

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
