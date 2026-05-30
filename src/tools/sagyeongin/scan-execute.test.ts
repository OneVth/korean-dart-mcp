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

const baseArgs = {
  state,
  candidates: [],
  skipped: [],
  srimPassedCount: 0,
  returnedCount: null as number | null,
  hasCheckpoint: false,
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
    srim: { verdict: "BUY", prices: {}, gap_to_fair: gap },
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
