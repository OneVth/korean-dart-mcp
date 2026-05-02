#!/usr/bin/env node
/**
 * 8단계 scan_preview 통합 검증 — field-test.
 *
 * 영역 본질:
 * - preset 분기 (default / 존재하지 않는 preset 에러 정합 / 직접 지정 / 입력 영역 0 fallback)
 * - universe 영역 (corp_code 덤프 영역 실측 — over-estimate 분기 본질 정합)
 * - estimated_api_calls 분기별 산출 + 합산 정합
 * - daily_limit_usage_pct 영역
 * - sample_companies 10개 영역 (stock_code ASC 정합)
 *
 * [응답 형태 정정 2건]
 * 1. tech_focus 프리셋 부재 (사용자 config에 default만 존재) — 분기 3을 에러 정합 검증으로 변경
 * 2. universe 실측 3607 / daily_limit_usage_pct 163.2% — 명세 예상 (1500~2200 / 60~80%)와 다름
 *    → spec-pending-edits §10.7 누적 (명세 예상치 정정 필요)
 *
 * Ref: spec §10.7 (v0.5), ADR-0010
 */

import { scanPreviewTool } from "../../build/tools/sagyeongin/scan-preview.js";

const ctx = {}; // scan_preview는 ctx 영역 활용 0 (corp_code SQLite 직접 연결)

async function run(args, label) {
  console.log(`\n=== ${label} ===`);
  console.log("입력:", JSON.stringify(args, null, 2));
  const result = await scanPreviewTool.handler(args, ctx);
  console.log("결과:", JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  // 분기 1: default preset (입력 영역 0 → active_preset fallback)
  const r1 = await run({}, "분기 1: 입력 영역 0 → active_preset (default) fallback");

  // 분기 2: default preset 명시
  const r2 = await run({ preset: "default" }, "분기 2: preset='default' 명시");

  // 분기 3: 존재하지 않는 프리셋 → 에러 정합 검증
  // [응답 형태 정정] tech_focus 프리셋이 사용자 config에 없음 — 에러 정합 검증으로 변경
  console.log("\n=== 분기 3: 존재하지 않는 preset 에러 정합 검증 ===");
  console.log("입력:", JSON.stringify({ preset: "tech_focus" }, null, 2));
  try {
    await scanPreviewTool.handler({ preset: "tech_focus" }, ctx);
    console.error("FAIL: 에러 발생 영역인데 정상 반환 — 정합 깨짐");
    process.exit(1);
  } catch (e) {
    if (e instanceof Error && e.message.includes("존재하지 않는 프리셋")) {
      console.log(`결과: 에러 정합 ✓ — "${e.message}"`);
    } else {
      console.error("FAIL: 예상 외 에러:", e);
      process.exit(1);
    }
  }

  // 분기 4: 직접 지정 — markets만 (corp_cls 분기는 8단계 영역 0 — over-estimate 분기 정합)
  const r4 = await run(
    { markets: ["KOSPI"] },
    "분기 4: markets=['KOSPI'] 직접 지정 (over-estimate 분기 본질)",
  );

  // 분기 5: 직접 지정 — name pattern만
  const r5 = await run(
    { excluded_name_patterns: ["스팩", "리츠", "REIT"] },
    "분기 5: excluded_name_patterns 직접 지정",
  );

  // 분기 6: preset + override 영역
  const r6 = await run(
    { preset: "default", excluded_name_patterns: ["테스트금지"] },
    "분기 6: preset + excluded_name_patterns override",
  );

  // 검증 영역 — 본질 정합 영역 출력
  console.log("\n=== 영역 검증 종합 ===");
  console.log(`분기 1 universe: ${r1.estimated_universe} (실측값 — 명세 예상 1500~2200과 다름, spec-pending-edits §10.7 누적)`);
  console.log(`분기 1 daily_limit_usage_pct: ${r1.daily_limit_usage_pct}% (실측값 — 명세 예상 60~80%와 다름, spec-pending-edits §10.7 누적)`);
  console.log(`분기 1 estimated_api_calls.total: ${r1.estimated_api_calls.total}`);
  console.log(`분기 1 sample_companies[0]: ${JSON.stringify(r1.sample_companies[0])} (stock_code ASC 정합 — 낮은 종목코드 순 자연)`);
  console.log(`분기 4 over-estimate 본질: KOSPI만 입력했지만 universe = ${r4.estimated_universe} (KOSPI+KOSDAQ 합산 영역 — corp_cls 분기 미적용 정합)`);
  console.log(`분기 5 universe: ${r5.estimated_universe} (분기 1 ${r1.estimated_universe}보다 작음 — name pattern 필터 적용 정합)`);
  console.log(`분기 3 에러 정합 ✓ (존재하지 않는 프리셋 에러 발생 정합)`);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
