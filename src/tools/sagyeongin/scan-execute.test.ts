/**
 * scan-execute buildResponse 단위 테스트.
 *
 * override_applied + interpretation_notes 동작 검증 (ADR-0019 후속 결정).
 * Node built-in test runner (node --test). 실 DART 호출 0 (ADR-0003).
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";
import { buildResponse } from "./scan-execute.js";
import { type ScanCheckpointState } from "./_lib/scan-checkpoint.js";

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
