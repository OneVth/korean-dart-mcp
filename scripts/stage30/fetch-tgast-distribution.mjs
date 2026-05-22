#!/usr/bin/env node
/**
 * Stage 30.0 회수 F — DART tgastInhDecsn (DS005) 응답 분포 회수
 *
 * 목적: ast_sen + inh_pp 텍스트 분포 baseline 영역 ADR-0027 + spec §10.16
 *       의사결정 근거 데이터 영구 보존.
 *
 * 회수 단위: loadListedCompanies() 영역 상장사 전수 + shuffleWithSeed(42) 결정론 shuffle.
 * 기간: 최근 3개월 (bgn_de: 20260222, end_de: 20260522).
 * 정책: RateLimitedDartClient (ADR-0015 A2 + ADR-0017 200ms inter-call delay).
 * 종결: RateLimitedDartClient throw 영역 catch → partial JSON 저장 + 종결 (ADR-0015 D1).
 *
 * 실행: node scripts/stage30/fetch-tgast-distribution.mjs
 * 전제: build/ 최신 + DART_API_KEY in .env
 *
 * Ref: ADR-0015, ADR-0017, Stage 30.0 위임 명세, verifications/run-corp-meta-refresh.mjs 패턴
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// .env 수동 로드 (dotenv 없이, run-corp-meta-refresh.mjs 패턴 정합)
const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..", "..");
const envPath = resolve(root, ".env");
const envLines = readFileSync(envPath, "utf8").split("\n");
for (const line of envLines) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const apiKey = process.env.DART_API_KEY;
if (!apiKey) {
  console.error("✗ DART_API_KEY 부재");
  process.exit(1);
}

// build/ 직접 import (verifications/run-corp-meta-refresh.mjs 패턴 정합)
const { DartClient } = await import(`file://${root}/build/lib/dart-client.js`);
const { RateLimitedDartClient, DartRateLimitError } = await import(
  `file://${root}/build/tools/sagyeongin/_lib/dart-rate-limit.js`
);
const { loadListedCompanies, shuffleWithSeed } = await import(
  `file://${root}/build/tools/sagyeongin/_lib/scan-helpers.js`
);
const { getCorpMeta } = await import(
  `file://${root}/build/tools/sagyeongin/_lib/corp-meta-cache.js`
);

// 본 회수 baseline
const BGN_DE = "20260222"; // 최근 3개월 시작
const END_DE = "20260522"; // 본 회수 일자
const SHUFFLE_SEED = 42;   // ADR-0015 B1 결정론 (replication 가능)
const PROGRESS_INTERVAL = 100; // 매 100 corp마다 진행 log

// inner client + rate-limited wrapper (ADR-0017 200ms default 정합)
const inner = new DartClient({ apiKey });
const limited = new RateLimitedDartClient(inner);

// 상장사 전수 + shuffle (ADR-0015 B1)
const allCorps = loadListedCompanies();
const corps = shuffleWithSeed(allCorps, SHUFFLE_SEED);
console.log(`[INFO] 상장사 전수: ${corps.length}건 (shuffle seed=${SHUFFLE_SEED})`);

// 회수 누적
const results = []; // { corp_code, corp_name, stock_code, induty_code, item, fetched_at }
const stats = {
  total_corps: corps.length,
  fetched_corps: 0,
  empty_response_corps: 0,    // status "000" + list 0
  non_zero_response_corps: 0, // status "000" + list >= 1
  error_status_corps: 0,       // status !== "000" (013 등)
  total_items: 0,
  started_at: new Date().toISOString(),
  ended_at: null,
  terminated_reason: null,    // null | "completed" | "rate_limit_error" | "fetch_error"
};

// 종결 baseline (ADR-0015 D1 즉시 종결)
async function saveAndExit(reason) {
  stats.ended_at = new Date().toISOString();
  stats.terminated_reason = reason;
  stats.call_count = limited.callCount;

  const outDir = resolve(root, "verifications", "stage30");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const today = END_DE; // 20260522
  const rawPath = resolve(outDir, `tgast-inh-decsn-raw-${today.slice(0,4)}-${today.slice(4,6)}-${today.slice(6,8)}.json`);
  writeFileSync(rawPath, JSON.stringify({ stats, results }, null, 2));
  console.log(`\n[DONE] reason=${reason} | callCount=${limited.callCount} | items=${stats.total_items} | corps_with_data=${stats.non_zero_response_corps}`);
  console.log(`[DONE] raw 저장: ${rawPath}`);
}

// 회수 loop
try {
  for (let i = 0; i < corps.length; i++) {
    const corp = corps[i];
    let raw;
    try {
      raw = await limited.getJson("tgastInhDecsn.json", {
        corp_code: corp.corp_code,
        bgn_de: BGN_DE,
        end_de: END_DE,
      });
    } catch (e) {
      if (e instanceof DartRateLimitError) {
        console.error(`[RATE_LIMIT] callCount=${limited.callCount} at corp ${corp.corp_code} (${corp.corp_name})`);
        await saveAndExit("rate_limit_error");
        process.exit(2);
      }
      // 비-rate-limit error → 본 corp skip + 누적 log
      console.warn(`[ERROR] corp ${corp.corp_code} (${corp.corp_name}): ${e.message}`);
      continue;
    }

    stats.fetched_corps++;

    if (raw.status !== "000") {
      stats.error_status_corps++;
      continue;
    }

    const list = raw.list ?? [];
    if (list.length === 0) {
      stats.empty_response_corps++;
    } else {
      stats.non_zero_response_corps++;
      // induty_code lookup (cross-reference baseline)
      const meta = getCorpMeta(corp.corp_code);
      const induty_code = meta?.induty_code ?? null;

      for (const item of list) {
        results.push({
          corp_code: corp.corp_code,
          corp_name: corp.corp_name,
          stock_code: corp.stock_code,
          induty_code,
          item, // 응답 raw 영역 전체 보존 (ast_sen, inh_pp, inh_af, inhdtl_inhprc, inhdtl_tast, inhdtl_tast_vs, bddd, rcept_no, ...)
          fetched_at: new Date().toISOString(),
        });
        stats.total_items++;
      }
    }

    if ((i + 1) % PROGRESS_INTERVAL === 0) {
      console.log(
        `[PROGRESS] ${i + 1}/${corps.length} | callCount=${limited.callCount} | items=${stats.total_items} | corps_with_data=${stats.non_zero_response_corps}`,
      );
    }
  }

  await saveAndExit("completed");
} catch (e) {
  console.error(`[FATAL] unexpected error: ${e.message}`);
  await saveAndExit("fetch_error");
  process.exit(3);
}
