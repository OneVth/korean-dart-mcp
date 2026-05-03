#!/usr/bin/env node
/**
 * 9단계 sagyeongin_insider_signal 통합 검증 — field-test.
 *
 * 분기 본질 (사용자 corp 선택 분기 영역에 따라 갈음 가능):
 * - 다수 보고자 + cluster 발생 (삼성전자 사전 검증 40건)
 * - 단일 보고자 (소형주 mixed_or_thin)
 * - 빈 list (보고 없음)
 * - 매수/매도 혼재 (mixed_or_thin)
 * + 입력 분기 (좁은 기간 / 넓은 기간 / cluster_threshold 분기 / 에러 케이스)
 *
 * 검증 항목: spec §10.12 (v0.6) 본문 정합 — schema + 처리 절차 6단계 + 분기 클러스터.
 *
 * Ref: spec §10.12, philosophy 7부 C, ADR-0011
 */

import "dotenv/config";

const { TOOL_REGISTRY } = await import("../../build/tools/index.js");
const { CorpCodeResolver } = await import("../../build/lib/corp-code.js");
const { DartClient } = await import("../../build/lib/dart-client.js");

const tool = TOOL_REGISTRY.find((t) => t.name === "sagyeongin_insider_signal");
if (!tool) {
  throw new Error("Tool registration failed: sagyeongin_insider_signal missing");
}

const client = new DartClient({ apiKey: process.env.DART_API_KEY });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };

// --- 헬퍼 ---
function assertSchema(r) {
  const required = [
    "resolved",
    "period",
    "cluster_threshold",
    "summary_text",
    "summary",
    "quarterly_clusters",
    "source",
  ];
  for (const k of required) {
    if (!(k in r)) throw new Error(`schema missing: ${k}`);
  }
  const sumKeys = [
    "reports_total",
    "buy_events",
    "sell_events",
    "unique_buyers",
    "unique_sellers",
    "net_change_shares",
    "signal",
    "strongest_quarter",
  ];
  for (const k of sumKeys) {
    if (!(k in r.summary)) throw new Error(`summary missing: ${k}`);
  }
  if (r.source !== "majorstock") throw new Error(`source mismatch: ${r.source}`);
  const validSignals = ["strong_buy_cluster", "strong_sell_cluster", "neutral_or_mixed"];
  if (!validSignals.includes(r.summary.signal)) throw new Error(`invalid signal: ${r.summary.signal}`);
  for (const q of r.quarterly_clusters) {
    if (!["buy_cluster", "sell_cluster", "mixed_or_thin"].includes(q.cluster)) {
      throw new Error(`invalid cluster: ${q.cluster}`);
    }
  }
}

function formatResult(r) {
  return (
    `corp=${r.resolved.corp_name}, reports=${r.summary.reports_total}, ` +
    `buy=${r.summary.buy_events}/${r.summary.unique_buyers}명, sell=${r.summary.sell_events}/${r.summary.unique_sellers}명, ` +
    `net=${r.summary.net_change_shares}, signal=${r.summary.signal}, ` +
    `strongest=${r.summary.strongest_quarter ?? "(없음)"}, quarters=${r.quarterly_clusters.length}`
  );
}

// --- 테스트 케이스 ---
const tests = [
  // 분기 1: 다수 보고자 + cluster 분기 (삼성전자 전체 기간)
  {
    label: "[insider_signal] 삼성전자 (00126380) — 전체 기간, 다수 보고자 cluster 분기",
    run: async () => {
      const r = await tool.handler({ corp: "00126380" }, ctx);
      assertSchema(r);
      if (r.summary.reports_total === 0) {
        throw new Error("expected reports_total > 0");
      }
      // 분기 1 상세 raw 출력 (응답 형태 어긋남 검증)
      const q0 = r.quarterly_clusters[0];
      console.log("\n  [분기 1 raw]");
      console.log(
        `    summary: reports_total=${r.summary.reports_total}, buy_events=${r.summary.buy_events}, ` +
        `sell_events=${r.summary.sell_events}, unique_buyers=${r.summary.unique_buyers}, ` +
        `unique_sellers=${r.summary.unique_sellers}, signal=${r.summary.signal}, ` +
        `strongest_quarter=${r.summary.strongest_quarter}, net_change_shares=${r.summary.net_change_shares}`
      );
      if (q0) {
        console.log(
          `    quarterly_clusters[0]: quarter=${q0.quarter}, buyers=${q0.buyers}, ` +
          `sellers=${q0.sellers}, net_change=${q0.net_change}, cluster=${q0.cluster}, ` +
          `reporters_total=${q0.reporters_total}, reporters_truncated=${q0.reporters_truncated}`
        );
        const rep0 = q0.reporters[0];
        if (rep0) {
          console.log(`    reporters[0]: name=${rep0.name}, change=${rep0.change}`);
          console.log(`    reporters[0].report_resn (raw):\n      ${JSON.stringify(rep0.report_resn)}`);
        }
      }
      return formatResult(r);
    },
  },
  // 분기 2: 좁은 기간 → 보고 없음 또는 매우 적음
  {
    label: "[insider_signal] 삼성전자 — 좁은 기간 (2025-01-01 ~ 2025-01-31)",
    run: async () => {
      const r = await tool.handler(
        { corp: "00126380", start: "2025-01-01", end: "2025-01-31" },
        ctx,
      );
      assertSchema(r);
      return formatResult(r);
    },
  },
  // 분기 3: cluster_threshold 분기 (높은 threshold → mixed_or_thin 자연)
  {
    label: "[insider_signal] 삼성전자 — cluster_threshold=10 (높은 threshold, mixed_or_thin 자연)",
    run: async () => {
      const r = await tool.handler({ corp: "00126380", cluster_threshold: 10 }, ctx);
      assertSchema(r);
      return formatResult(r);
    },
  },
  // 분기 4: 에러 케이스 — 존재 안 하는 corp
  {
    label: "[insider_signal] 존재 안 하는 corp_code (99999999) — throw 기대",
    run: async () => {
      try {
        await tool.handler({ corp: "99999999" }, ctx);
        throw new Error("expected throw, got success");
      } catch (err) {
        if (!err.message.includes("not found") && !err.message.includes("찾을 수 없")) {
          throw new Error(`unexpected error: ${err.message}`);
        }
        return `throw 처리: ${err.message.slice(0, 80)}...`;
      }
    },
  },
  // 분기 5 (선택): 사용자가 다른 corp_code 추가 — 단일 보고자 / 빈 list / 혼재 corp
  // 사용자 환경에서 분기 추가 영역 — 4 분기 분포 검증 본질 정합. 추가 corp 0 시 분기 1~4로 갈음 가능.
];

// --- 실행 루프 ---
const startMs = Date.now();
let pass = 0,
  fail = 0;

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
