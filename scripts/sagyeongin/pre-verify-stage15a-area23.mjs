#!/usr/bin/env node
/**
 * 15단계 (a) 사전 검증 — 영역 2+3.
 *
 * 영역 2: KSIC 70 corp 2건 DART 응답 형식 정합 확인.
 *         endpoint 4종: company.json / fnlttSinglAcnt.json /
 *                       fnlttSinglAcntAll.json / stockTotqySttus.json
 *         핵심 관찰: se 필드 값 (stockTotqySttus) — isCommonStockRow 커버 확인.
 *
 * 영역 3: extractSharesOutstanding(corp_code, ctx) 직접 호출.
 *         내부 stockTotqySttus.json → isCommonStockRow se 매칭 → 발행주식수.
 *         throw 시 data_incomplete 분류 키 여부 확인 (14단계 (b) 패일세이프).
 *
 * corp 2건 선정 우선순위:
 *   1. CORPS 환경변수 (콤마 구분, corp_code 2건 직접 지정)
 *   2. area1 JSON (STAGE15A_AREA1_OUTPUT_PATH) candidates + skipped_corps 자동 추출
 *   3. scan_execute (KSIC 70, limit=5) 재탐색
 *
 * 출력: STAGE15A_AREA23_OUTPUT_PATH JSON.
 *
 * Ref: docs/sagyeongin/verifications/2026-05-08-stage15a-pre-verify.md
 */

import "dotenv/config";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_CONFIG_DIR = join(tmpdir(), "sagyeongin-pre-verify-15a");
if (!existsSync(TEST_CONFIG_DIR)) {
  mkdirSync(TEST_CONFIG_DIR, { recursive: true });
}
process.env.SAGYEONGIN_CONFIG_DIR = TEST_CONFIG_DIR;

const { TOOL_REGISTRY } = await import("../../build/tools/index.js");
const { CorpCodeResolver } = await import("../../build/lib/corp-code.js");
const { DartClient } = await import("../../build/lib/dart-client.js");
const { extractSharesOutstanding } = await import(
  "../../build/tools/sagyeongin/_lib/financial-extractor.js"
);

const apiKey = process.env.DART_API_KEY;
if (!apiKey) {
  console.error("DART_API_KEY required in .env");
  process.exit(1);
}

const client = new DartClient({ apiKey });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };

// === corp 2건 선정 ===
let targetCorps = [];

// 우선순위 1: CORPS 환경변수
if (process.env.CORPS) {
  const codes = process.env.CORPS.split(",").map((c) => c.trim()).filter(Boolean);
  targetCorps = codes.slice(0, 2).map((corp_code) => ({ corp_code }));
  console.log(`Corp 선정 (CORPS env): ${codes.slice(0, 2).join(", ")}`);
}

// 우선순위 2: area1 JSON 자동 추출
if (targetCorps.length < 2) {
  const area1Path =
    process.env.STAGE15A_AREA1_OUTPUT_PATH ??
    join(tmpdir(), "pre-verify-15a-area1.json");
  if (existsSync(area1Path)) {
    try {
      const area1 = JSON.parse(readFileSync(area1Path, "utf8"));
      const all = [
        ...(area1.candidates ?? []),
        ...(area1.skipped_corps ?? []),
      ].filter((c) => c.corp_code);
      // 중복 제거
      const seen = new Set();
      const unique = all.filter((c) => {
        if (seen.has(c.corp_code)) return false;
        seen.add(c.corp_code);
        return true;
      });
      // corp_cls Y/K 각 1건 우선, 없으면 앞 2건
      const Y = unique.find((c) => c.corp_cls === "Y");
      const K = unique.find((c) => c.corp_cls === "K");
      if (Y) targetCorps.push(Y);
      if (K && K.corp_code !== Y?.corp_code) targetCorps.push(K);
      // 2건 미만이면 나머지로 보충
      if (targetCorps.length < 2) {
        for (const c of unique) {
          if (targetCorps.length >= 2) break;
          if (!targetCorps.some((t) => t.corp_code === c.corp_code)) {
            targetCorps.push(c);
          }
        }
      }
      console.log(
        `Corp 선정 (area1 JSON): ${targetCorps.map((c) => `${c.corp_code}(${c.corp_cls ?? "?"})` ).join(", ")}`,
      );
    } catch (e) {
      console.warn(`  area1 JSON 읽기 실패: ${e.message}`);
    }
  }
}

// 우선순위 3: scan_execute 재탐색
if (targetCorps.length < 2) {
  console.log("scan_execute (KSIC 70, limit=5) 재탐색...");
  const scanExecuteTool = TOOL_REGISTRY.find(
    (t) => t.name === "sagyeongin_scan_execute",
  );
  if (!scanExecuteTool) throw new Error("sagyeongin_scan_execute 미등록");
  const r = await scanExecuteTool.handler(
    { included_industries: ["70"], markets: ["KOSDAQ", "KOSPI"], limit: 5 },
    ctx,
  );
  const all = [
    ...(r.candidates?.map((c) => ({ corp_code: c.corp_code, corp_cls: c.corp_cls })) ?? []),
    ...(r.skipped_corps?.map((s) => ({ corp_code: s.corp_code, corp_cls: s.corp_cls })) ?? []),
  ].filter((c) => c.corp_code);
  const seen = new Set(targetCorps.map((c) => c.corp_code));
  for (const c of all) {
    if (targetCorps.length >= 2) break;
    if (!seen.has(c.corp_code)) {
      seen.add(c.corp_code);
      targetCorps.push(c);
    }
  }
  console.log(
    `Corp 선정 (scan_execute): ${targetCorps.map((c) => c.corp_code).join(", ")}`,
  );
}

if (targetCorps.length === 0) {
  console.error(
    "KSIC 70 corp 선정 실패. CORPS env 직접 지정 필요 (예: CORPS=00000000,00000001).",
  );
  process.exit(1);
}
targetCorps = targetCorps.slice(0, 2);
console.log(
  `\n영역 2+3 대상: ${targetCorps.map((c) => c.corp_code).join(", ")}\n`,
);

const corpResults = [];
const startedAt = new Date().toISOString();

for (const { corp_code } of targetCorps) {
  console.log(`\n========== Corp: ${corp_code} ==========`);
  const cr = { corp_code };

  // --- company.json ---
  console.log("  [company.json]");
  try {
    const data = await client.getJson("company.json", { corp_code });
    cr.company = {
      status: data.status,
      corp_cls: data.corp_cls,
      induty_code: data.induty_code,
      corp_name: data.corp_name,
    };
    console.log(
      `    status=${data.status} corp_cls=${data.corp_cls} induty_code=${data.induty_code} corp_name=${data.corp_name}`,
    );
  } catch (e) {
    cr.company = { error: e.message };
    console.error(`    FAIL: ${e.message}`);
  }

  // --- fnlttSinglAcnt.json (BS+IS 단순) ---
  console.log("  [fnlttSinglAcnt.json] bsns_year=2024, reprt_code=11011");
  try {
    const data = await client.getJson("fnlttSinglAcnt.json", {
      corp_code,
      bsns_year: "2024",
      reprt_code: "11011",
    });
    const rows = data.list ?? [];
    cr.fnlttSinglAcnt = {
      status: data.status,
      total_rows: rows.length,
      sj_div_values: [...new Set(rows.map((r) => r.sj_div).filter(Boolean))],
      sample_5: rows.slice(0, 5).map((r) => ({
        account_nm: r.account_nm,
        sj_div: r.sj_div,
      })),
    };
    console.log(
      `    status=${data.status} rows=${rows.length} sj_div=${JSON.stringify(cr.fnlttSinglAcnt.sj_div_values)}`,
    );
  } catch (e) {
    cr.fnlttSinglAcnt = { error: e.message };
    console.error(`    FAIL: ${e.message}`);
  }

  // --- fnlttSinglAcntAll.json (전체 재무) ---
  console.log("  [fnlttSinglAcntAll.json] bsns_year=2024, reprt_code=11011");
  try {
    const data = await client.getJson("fnlttSinglAcntAll.json", {
      corp_code,
      bsns_year: "2024",
      reprt_code: "11011",
    });
    const rows = data.list ?? [];
    cr.fnlttSinglAcntAll = {
      status: data.status,
      total_rows: rows.length,
      sj_div_values: [...new Set(rows.map((r) => r.sj_div).filter(Boolean))],
      sample_5: rows.slice(0, 5).map((r) => ({
        account_nm: r.account_nm,
        sj_div: r.sj_div,
      })),
    };
    console.log(
      `    status=${data.status} rows=${rows.length} sj_div=${JSON.stringify(cr.fnlttSinglAcntAll.sj_div_values)}`,
    );
  } catch (e) {
    cr.fnlttSinglAcntAll = { error: e.message };
    console.error(`    FAIL: ${e.message}`);
  }

  // --- stockTotqySttus.json (se 필드 실제 관찰) ---
  console.log("  [stockTotqySttus.json] bsns_year=2024, reprt_code=11011");
  try {
    const data = await client.getJson("stockTotqySttus.json", {
      corp_code,
      bsns_year: "2024",
      reprt_code: "11011",
    });
    const rows = data.list ?? [];
    const seValues = rows.map((r) => r.se).filter(Boolean);
    cr.stockTotqySttus = {
      status: data.status,
      total_rows: rows.length,
      se_values: seValues,
      sample_rows: rows.map((r) => ({ se: r.se, istc_totqy: r.istc_totqy })),
    };
    console.log(`    status=${data.status} rows=${rows.length}`);
    console.log(`    se values: ${JSON.stringify(seValues)}`);
  } catch (e) {
    cr.stockTotqySttus = { error: e.message };
    console.error(`    FAIL: ${e.message}`);
  }

  // --- 영역 3: extractSharesOutstanding 직접 호출 ---
  console.log(`  [영역 3] extractSharesOutstanding(${corp_code}, ctx)`);
  try {
    const shares = await extractSharesOutstanding(corp_code, ctx);
    cr.extractSharesOutstanding = { result: "success", shares };
    console.log(`    => success: ${shares.toLocaleString()} 주`);
  } catch (e) {
    const msg = e.message ?? "";
    const isKnownFailsafe =
      msg.includes("shares_outstanding not found") ||
      msg.includes("data_incomplete");
    cr.extractSharesOutstanding = {
      result: "throw",
      message: msg,
      known_failsafe: isKnownFailsafe,
    };
    console.log(`    => throw: ${msg}`);
    console.log(
      `    14단계 (b) 패일세이프 분류 여부: ${isKnownFailsafe}`,
    );
  }

  corpResults.push(cr);
}

const output = {
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  target_corps: targetCorps.map((c) => c.corp_code),
  results: corpResults,
};

const outputPath =
  process.env.STAGE15A_AREA23_OUTPUT_PATH ??
  join(tmpdir(), "pre-verify-15a-area23.json");
writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(`\n=== 결과 저장: ${outputPath} ===`);
console.log("PASS");
