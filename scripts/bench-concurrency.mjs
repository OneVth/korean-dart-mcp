/**
 * search_disclosures concurrency 벤치마크
 *
 * DART rate limit: 일 20,000건. 분당 제한은 비공식이지만 1000/min 경험치.
 * 동일 쿼리를 concurrency 1/3/5/7/10 로 각각 3회 측정해 평균 + 표준편차.
 *
 * 실행: node scripts/bench-concurrency.mjs
 */
import "dotenv/config";
import { DartClient } from "../build/lib/dart-client.js";
import { CorpCodeResolver } from "../build/lib/corp-code.js";
import { TOOL_REGISTRY } from "../build/tools/index.js";

const client = new DartClient({ apiKey: process.env.DART_API_KEY });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };
const tool = TOOL_REGISTRY.find((t) => t.name === "search_disclosures");

// 여러 페이지 수집을 유도하는 쿼리: 전체시장 90일 정기공시
const baseArgs = {
  preset: "annual_report",
  days: 90,
  limit: 3000,
};

const LEVELS = [1, 3, 5, 7, 10];
const TRIALS = 3;

function stats(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  const stddev = Math.sqrt(variance);
  return { mean: Math.round(mean), stddev: Math.round(stddev), min: Math.min(...arr), max: Math.max(...arr) };
}

console.log(`Query: preset=${baseArgs.preset}, days=${baseArgs.days}, limit=${baseArgs.limit}`);
console.log(`Trials per level: ${TRIALS}\n`);

const rows = [];
for (const c of LEVELS) {
  const times = [];
  let count = 0;
  for (let i = 0; i < TRIALS; i++) {
    const t0 = Date.now();
    try {
      const out = await tool.handler({ ...baseArgs, concurrency: c }, ctx);
      times.push(Date.now() - t0);
      if (i === 0) count = out.items?.length ?? 0;
    } catch (e) {
      times.push(-1);
      console.log(`  [concurrency=${c}] trial ${i + 1} ERROR: ${e.message}`);
    }
    // 각 측정 사이 rate limit 완화를 위해 1초 대기
    await new Promise((r) => setTimeout(r, 1000));
  }
  const valid = times.filter((t) => t > 0);
  const s = valid.length > 0 ? stats(valid) : { mean: -1, stddev: 0, min: -1, max: -1 };
  rows.push({ concurrency: c, items: count, ...s, trials: times });
  console.log(
    `concurrency=${c.toString().padStart(2)}: mean ${s.mean.toString().padStart(6)}ms  ` +
      `± ${s.stddev.toString().padStart(4)}ms  (min ${s.min}ms, max ${s.max}ms)  items=${count}  trials=[${times.join(",")}]`,
  );
}

console.log("\n--- 요약 (mean ms) ---");
for (const r of rows) {
  const bar = "█".repeat(Math.max(1, Math.round(r.mean / 500)));
  console.log(`concurrency=${r.concurrency.toString().padStart(2)}: ${bar} ${r.mean}ms`);
}

// 가성비 계산: baseline(1) 대비 배수
const base = rows.find((r) => r.concurrency === 1);
if (base && base.mean > 0) {
  console.log("\n--- 가성비 (baseline=concurrency:1) ---");
  for (const r of rows) {
    if (r.mean <= 0) continue;
    const speedup = (base.mean / r.mean).toFixed(2);
    console.log(`concurrency=${r.concurrency}: ${speedup}x faster`);
  }
}
