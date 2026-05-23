import test from "node:test";
import assert from "node:assert/strict";
import { judgeExistingBusinessMatch } from "./capex-signal.js";

/**
 * Stage 30.1 phase 1 — judgeExistingBusinessMatch 통합 테스트
 *
 * 회수 F 13건 regression: verifications/stage30/tgast-inh-decsn-distribution-2026-05-22.md
 * corner case 5건: mixed / empty / whitespace / locale / blacklist priority
 *
 * text = ast_sen + " " + inh_pp 합본 (classifySignal 영역 정합)
 */

// 회수 F 13건 regression

test("회수 F #1 영화테크 (3033) — 공장 매입 → true", () => {
  const text = "토지 및 건물 전기수소차 부품제조 위한 공장 매입";
  assert.strictEqual(judgeExistingBusinessMatch(text, "3033"), true);
});

test("회수 F #2 아이언디바이스 (26112) — 물리적 공간 확보 → null", () => {
  const text = "토지 및 건물 중장기적 사업 계획에 따른 물리적 공간 확보";
  assert.strictEqual(judgeExistingBusinessMatch(text, "26112"), null);
});

test("회수 F #3 오아 (47320) — 사옥+업무공간 → null", () => {
  const text = "토지 및 건물 본사 사옥(사업확장 및 업무공간 확보)";
  assert.strictEqual(judgeExistingBusinessMatch(text, "47320"), null);
});

test("회수 F #4 리브스메드 (27112) — 양산 거점 → true", () => {
  const text = "토지 및 건물 차세대 수술 로봇 글로벌 양산 거점 구축";
  assert.strictEqual(judgeExistingBusinessMatch(text, "27112"), true);
});

test("회수 F #5 아이엠티 (29299) — 제조+연구개발+공장 → true", () => {
  const text = "토지 및 건물 제조 및 연구개발 시설 확충을 위한 공장 취득";
  assert.strictEqual(judgeExistingBusinessMatch(text, "29299"), true);
});

test("회수 F #6 에코글로우 (204) — 신사옥 확보 → null", () => {
  const text = "토지 및 건물 영업 거점 확보 및 신사옥 확보";
  assert.strictEqual(judgeExistingBusinessMatch(text, "204"), null);
});

test("회수 F #7 미쥬 (141) — 업무 공간 → null", () => {
  const text = "토지 및 건물 임직원 업무 공간 취득";
  assert.strictEqual(judgeExistingBusinessMatch(text, "141"), null);
});

test("회수 F #8 DS단석 (204) — 신규 사옥 → null", () => {
  const text = "토지 및 건물 신규 사옥 부지 확보";
  assert.strictEqual(judgeExistingBusinessMatch(text, "204"), null);
});

test("회수 F #9 성호전자 (26291) — 투자수익+임대수익 → false", () => {
  const text = "토지 및 건물 투자수익 및 임대수익";
  assert.strictEqual(judgeExistingBusinessMatch(text, "26291"), false);
});

test("회수 F #10 두산테스나 (739) — 수요 증가 대응 → true", () => {
  const text = "기계장치 테스트 수요 증가 대응";
  assert.strictEqual(judgeExistingBusinessMatch(text, "739"), true);
});

test("회수 F #11 인콘 (468) — R&D+신사옥 mixed → null (ADR-0027 §null 3)", () => {
  const text = "토지 및 건물 R&D센터 건립 및 신사옥 확보";
  assert.strictEqual(judgeExistingBusinessMatch(text, "468"), null);
});

test("회수 F #12 한화리츠 (68112) — 부동산 임대 수익 → false", () => {
  const text = "토지 및 건물 부동산 임대를 통한 수익 창출";
  assert.strictEqual(judgeExistingBusinessMatch(text, "68112"), false);
});

test("회수 F #13 에이아이코리아 (29271) — 업무 공간 확보 → null", () => {
  const text = "토지 및 건물 사업 확장에 따른 업무 공간 확보 및 본사 이전";
  assert.strictEqual(judgeExistingBusinessMatch(text, "29271"), null);
});

// corner case

test("corner case: empty string → null", () => {
  assert.strictEqual(judgeExistingBusinessMatch(""), null);
});

test("corner case: whitespace only → null", () => {
  assert.strictEqual(judgeExistingBusinessMatch("   "), null);
});

test("corner case: blacklist + whitelist 동시 → blacklist 우선 false (ADR-0027 calibration)", () => {
  // "신규 사업 진출 공장 매입" — blacklist 없음 (신규 사업은 blacklist 미등록)
  // "임대 + 공장" — blacklist `임대` 우선
  const text = "부동산 임대 목적 공장 취득";
  assert.strictEqual(judgeExistingBusinessMatch(text), false);
});

test("corner case: whitelist 단독 (null pattern 미포함) → true", () => {
  assert.strictEqual(judgeExistingBusinessMatch("제조 시설 확충"), true);
});

test("corner case: default (키워드 없음) → null", () => {
  assert.strictEqual(judgeExistingBusinessMatch("부지 취득"), null);
});
