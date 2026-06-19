/**
 * scan-execute buildResponse + finalizeCandidates 단위 테스트.
 *
 * override_applied + interpretation_notes 동작 검증 (ADR-0019 후속 결정).
 * finalizeCandidates composite_score 산식 검증 (ADR-0029 — srim 갭 주도, capex tie-breaker).
 * Node built-in test runner (node --test). 실 DART 호출 0 (ADR-0003).
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  buildResponse,
  finalizeCandidates,
  buildKillerStopResponse,
  buildListOnlyResponse,
  SRIM_GAP_WEIGHT,
  type EnrichedCandidate,
  type ResolvedInput,
} from "./scan-execute.js";
import { type ScanCheckpointState } from "./_lib/scan-checkpoint.js";

// ─── buildResponse fixtures ───────────────────────────────────────────────────

const state: ScanCheckpointState = {
  scan_id: "scan_2026-05-29_test01",
  created_at: "2026-05-29T00:00:00Z",
  updated_at: "2026-05-29T00:00:00Z",
  input_args: {},
  processed_corp_codes: [],
  pending_corp_codes: [],
  partial_candidates: [],
  call_count: 0,
};

const baseFilterSummary = {
  markets: ["KOSPI" as const],
  included_industries: null,
  excluded_industries: ["64"],
  excluded_industries_count: 1,
  excluded_name_patterns: [],
};

const baseArgs = {
  state,
  candidates: [],
  skipped: [],
  srimPassedCount: 0,
  returnedCount: null as number | null,
  hasCheckpoint: false,
  preset_used: "test",
  filter_summary: baseFilterSummary,
  externalCallStats: { dart: 0, naver: 0, kis: 0 },
};

test("overrideApplied: true → override_applied=true + interpretation_notes 1건 이상", () => {
  const result = buildResponse({ ...baseArgs, overrideApplied: true });
  assert.equal(result.pipeline_stats.override_applied, true);
  assert.ok(result.interpretation_notes.length >= 1);
  assert.match(result.interpretation_notes[0], /allow_over_daily_limit/);
});

test("overrideApplied 미전달 → override_applied=false + interpretation_notes 빈 배열", () => {
  const result = buildResponse({ ...baseArgs });
  assert.equal(result.pipeline_stats.override_applied, false);
  assert.equal(result.interpretation_notes.length, 0);
});

// ─── finalizeCandidates fixtures (ADR-0029) ───────────────────────────────────

function makeCandidate(
  corp_code: string,
  gap: number | null,
  opp: number,
  con: number,
): EnrichedCandidate {
  return {
    rank: 0,
    corp_code,
    corp_name: `테스트_${corp_code}`,
    corp_cls: "Y",
    induty_code: "C",
    composite_score: 0,
    killer: { verdict: "PASS", triggered_rules: [] },
    srim: { verdict: "BUY", prices: {}, gap_to_fair: gap, avg_roe: null, required_return_K: null },
    cashflow: con > 0
      ? { verdict: "REVIEW_REQUIRED", concern_score: con, top_flags: [], yearly_data: [] }
      : null,
    capex: opp > 0
      ? { verdict: "ACTIVE", opportunity_score: opp, top_signals: [] }
      : null,
    insider: null,
    dividend: null,
    stage_notes: [],
    quick_summary: "",
  };
}

const baseResolved: ResolvedInput = {
  preset_used: "test",
  min_opportunity_score: 0,
  limit: 100,
  allow_over_daily_limit: false,
};

test("finalize: gap=−30(저평가 30%), opp=0, con=0 → composite=45 (저평가 폭 주도)", () => {
  const [c] = finalizeCandidates([makeCandidate("A", -30, 0, 0)], baseResolved);
  assert.equal(c.composite_score, 30 * SRIM_GAP_WEIGHT);
});

test("finalize: gap=−30, opp=80, con=0 → composite=125 (capex 가산)", () => {
  const [c] = finalizeCandidates([makeCandidate("A", -30, 80, 0)], baseResolved);
  assert.equal(c.composite_score, 30 * SRIM_GAP_WEIGHT + 80);
});

test("finalize: gap 동일(−30), opp 차이 → opp 큰 쪽 rank=1 (tie-breaker 정렬)", () => {
  const candidates = [
    makeCandidate("LOW", -30, 0, 0),
    makeCandidate("HIGH", -30, 80, 0),
  ];
  const result = finalizeCandidates(candidates, baseResolved);
  assert.equal(result[0].corp_code, "HIGH");
  assert.equal(result[0].rank, 1);
});

test("finalize: gap=null, opp=30, con=0 → composite=30 (null 폴백)", () => {
  const [c] = finalizeCandidates([makeCandidate("A", null, 30, 0)], baseResolved);
  assert.equal(c.composite_score, 30);
});

test("finalize: gap=−10, opp=0, con=40 → composite=−25 (concern 하향)", () => {
  const [c] = finalizeCandidates([makeCandidate("A", -10, 0, 40)], baseResolved);
  assert.equal(c.composite_score, 10 * SRIM_GAP_WEIGHT - 40);
});

test("finalize: 전원 opp=0이어도 저평가 폭 차이로 순위 분별 (0 사태 회귀 가드)", () => {
  const candidates = [
    makeCandidate("A", -10, 0, 0),
    makeCandidate("B", -30, 0, 0),
    makeCandidate("C", -5, 0, 0),
  ];
  const result = finalizeCandidates(candidates, baseResolved);
  assert.ok(
    result.every((c) => c.composite_score !== 0),
    "전원 composite_score 0이면 안 됨",
  );
  assert.equal(result[0].corp_code, "B");
  assert.equal(result[2].corp_code, "C");
});

test("finalize: min_opportunity_score 필터 — capex opp 미만 제외", () => {
  const resolved: ResolvedInput = { ...baseResolved, min_opportunity_score: 30 };
  const result = finalizeCandidates(
    [
      makeCandidate("a", -10, 20, 0), // opp 20 < 30 → 제외
      makeCandidate("b", -10, 50, 0), // opp 50 ≥ 30 → 통과
      makeCandidate("c", -10, 30, 0), // opp 30 ≥ 30 → 통과 (경계)
    ],
    resolved,
  );
  assert.deepEqual(result.map((c) => c.corp_code), ["b", "c"]);
});

test("finalize: limit 적용 — 정렬 후 상위 N", () => {
  const resolved: ResolvedInput = { ...baseResolved, limit: 2 };
  const result = finalizeCandidates(
    [
      makeCandidate("d", -10, 0, 0),  // composite 15  (discount 10×1.5)
      makeCandidate("a", -90, 0, 0),  // composite 135 (discount 90×1.5)
      makeCandidate("c", -30, 0, 0),  // composite 45  (discount 30×1.5)
      makeCandidate("b", -60, 0, 0),  // composite 90  (discount 60×1.5)
    ],
    resolved,
  );
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((c) => c.corp_code), ["a", "b"]);
});

test("finalize: 고평가(양수 gap) → discount 0 (저평가분만 가점, 부호 회귀 가드)", () => {
  const [c] = finalizeCandidates([makeCandidate("A", 20, 0, 0)], baseResolved);
  assert.equal(c.composite_score, 0); // gap +20(고평가) → max(-20,0)=0
});

// ─── buildResponse preset_used + filter_summary ──────────────────────────────

test("buildResponse: preset_used + filter_summary 반환 — 키 존재 + 구조 정합", () => {
  const result = buildResponse({ ...baseArgs });
  assert.equal(result.preset_used, "test");
  assert.ok(result.filter_summary, "filter_summary 존재");
  assert.ok(Array.isArray(result.filter_summary.markets), "markets 배열");
  assert.ok(Array.isArray(result.filter_summary.excluded_industries), "excluded_industries 배열");
  assert.equal(typeof result.filter_summary.excluded_industries_count, "number");
  assert.ok(Array.isArray(result.filter_summary.excluded_name_patterns), "excluded_name_patterns 배열");
});

test("buildResponse: filter_summary 내용 일치 — excluded_industries_count = excluded_industries.length", () => {
  const result = buildResponse({ ...baseArgs });
  assert.equal(
    result.filter_summary.excluded_industries_count,
    result.filter_summary.excluded_industries.length,
  );
});

// ─── buildKillerStopResponse (ADR-0032 Phase 2a) ─────────────────────────────

function makeUniverse(
  codes: string[],
): Array<{ corp_code: string; corp_name: string }> {
  return codes.map((code, i) => ({ corp_code: code, corp_name: `테스트${i + 1}` }));
}

function makeKillerStopState(scan_id: string): import("./_lib/scan-checkpoint.js").ScanCheckpointState {
  return {
    scan_id,
    created_at: "2026-06-18T00:00:00Z",
    updated_at: "2026-06-18T00:00:00Z",
    input_args: {},
    processed_corp_codes: [],
    pending_corp_codes: [],
    partial_candidates: [],
    call_count: 0,
    phase: "awaiting_choice",
    initial_universe: 100,
    after_static_filter: 50,
    killer_passed_cumulative: 3,
  };
}

const baseKillerResolved: ResolvedInput = {
  preset_used: "test",
  min_opportunity_score: 0,
  limit: 10,
  allow_over_daily_limit: false,
};

test("buildKillerStopResponse: mode=killer_stop + scan_id 보존", () => {
  const result = buildKillerStopResponse({
    killerPassedCodes: ["A", "B", "C"],
    universe: makeUniverse(["A", "B", "C"]),
    state: makeKillerStopState("scan_2026-06-18_abc001"),
    resolved: baseKillerResolved,
  });
  assert.equal(result.mode, "killer_stop");
  assert.equal(result.scan_id, "scan_2026-06-18_abc001");
});

test("buildKillerStopResponse: N=3 ≤ 10 → list 포함 + corp_name 있음", () => {
  const codes = ["A01", "B02", "C03"];
  const result = buildKillerStopResponse({
    killerPassedCodes: codes,
    universe: makeUniverse(codes),
    state: makeKillerStopState("scan_test_n3"),
    resolved: baseKillerResolved,
  });
  assert.equal(result.killer_passed.count, 3);
  assert.ok(Array.isArray(result.killer_passed.list), "list는 배열이어야 함");
  assert.equal(result.killer_passed.list!.length, 3);
  assert.equal(result.killer_passed.list![0].corp_code, "A01");
  assert.ok(result.killer_passed.list![0].corp_name.length > 0);
});

test("buildKillerStopResponse: N=15 > 10 → list=null, count=15", () => {
  const codes = Array.from({ length: 15 }, (_, i) => `CORP${i.toString().padStart(2, "0")}`);
  const result = buildKillerStopResponse({
    killerPassedCodes: codes,
    universe: makeUniverse(codes),
    state: makeKillerStopState("scan_test_n15"),
    resolved: baseKillerResolved,
  });
  assert.equal(result.killer_passed.count, 15);
  assert.equal(result.killer_passed.list, null);
});

test("buildKillerStopResponse: options 3개 항상 존재 (all/selected/list_only)", () => {
  const result = buildKillerStopResponse({
    killerPassedCodes: ["X"],
    universe: makeUniverse(["X"]),
    state: makeKillerStopState("scan_test_opts"),
    resolved: baseKillerResolved,
  });
  assert.equal(result.options.length, 3);
  const actions = result.options.map((o) => o.action);
  assert.ok(actions.includes("all"));
  assert.ok(actions.includes("selected"));
  assert.ok(actions.includes("list_only"));
});

test("buildKillerStopResponse: pipeline_stats.after_killer_check = killerPassedCodes.length", () => {
  const codes = ["P", "Q"];
  const result = buildKillerStopResponse({
    killerPassedCodes: codes,
    universe: makeUniverse(codes),
    state: makeKillerStopState("scan_test_stats"),
    resolved: baseKillerResolved,
  });
  assert.equal(result.pipeline_stats.after_killer_check, 2);
  assert.equal(result.pipeline_stats.after_srim_filter, null);
  assert.equal(result.pipeline_stats.returned_candidates, null);
});

test("buildKillerStopResponse: N=10 경계 → list 포함 (≤ 10 경계 확인)", () => {
  const codes = Array.from({ length: 10 }, (_, i) => `CORP${i}`);
  const result = buildKillerStopResponse({
    killerPassedCodes: codes,
    universe: makeUniverse(codes),
    state: makeKillerStopState("scan_test_n10"),
    resolved: baseKillerResolved,
  });
  assert.ok(Array.isArray(result.killer_passed.list));
  assert.equal(result.killer_passed.list!.length, 10);
});

test("buildKillerStopResponse: N=11 경계 → list=null (> 10 경계 확인)", () => {
  const codes = Array.from({ length: 11 }, (_, i) => `CORP${i}`);
  const result = buildKillerStopResponse({
    killerPassedCodes: codes,
    universe: makeUniverse(codes),
    state: makeKillerStopState("scan_test_n11"),
    resolved: baseKillerResolved,
  });
  assert.equal(result.killer_passed.list, null);
});

// ─── buildListOnlyResponse (ADR-0032 Phase 2b) ───────────────────────────────

test("buildListOnlyResponse: mode=list_only + scan_id 보존", () => {
  const state = makeKillerStopState("scan_list_test");
  state.killer_passed_corp_codes = ["A", "B"];
  const nameMap = new Map([["A", "현대"], ["B", "기아"]]);
  const result = buildListOnlyResponse({ state, nameMap });
  assert.equal(result.mode, "list_only");
  assert.equal(result.scan_id, "scan_list_test");
});

test("buildListOnlyResponse: 가나다순 정렬 (localeCompare ko)", () => {
  const state = makeKillerStopState("scan_list_sort");
  state.killer_passed_corp_codes = ["A", "B", "C"];
  const nameMap = new Map([["A", "현대"], ["B", "삼성"], ["C", "기아"]]);
  const result = buildListOnlyResponse({ state, nameMap });
  assert.equal(result.killer_list[0].corp_name, "기아");
  assert.equal(result.killer_list[1].corp_name, "삼성");
  assert.equal(result.killer_list[2].corp_name, "현대");
});

test("buildListOnlyResponse: killer_list.length = killer_passed_corp_codes.length", () => {
  const state = makeKillerStopState("scan_list_len");
  state.killer_passed_corp_codes = ["X", "Y", "Z"];
  const nameMap = new Map([["X", "나"], ["Y", "가"], ["Z", "다"]]);
  const result = buildListOnlyResponse({ state, nameMap });
  assert.equal(result.killer_list.length, 3);
});

test("buildListOnlyResponse: pipeline_stats 정합 — after_killer_check/after_srim_filter=null", () => {
  const state = makeKillerStopState("scan_list_stats");
  state.killer_passed_corp_codes = ["P", "Q"];
  const nameMap = new Map([["P", "가"], ["Q", "나"]]);
  const result = buildListOnlyResponse({ state, nameMap });
  assert.equal(result.pipeline_stats.after_killer_check, 2);
  assert.equal(result.pipeline_stats.after_srim_filter, null);
  assert.equal(result.pipeline_stats.returned_candidates, null);
});

test("buildListOnlyResponse: 빈 명단 → killer_list=[]", () => {
  const state = makeKillerStopState("scan_list_empty");
  state.killer_passed_corp_codes = [];
  const result = buildListOnlyResponse({ state, nameMap: new Map() });
  assert.equal(result.killer_list.length, 0);
});
