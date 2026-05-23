import test from "node:test";
import assert from "node:assert/strict";
import {
  matchWhitelist,
  matchBlacklist,
  matchNullPattern,
} from "./existing-business-keywords.js";

// matchWhitelist

test("matchWhitelist: 공장 (직접 생산, case 1)", () => {
  assert.strictEqual(matchWhitelist("전기수소차 부품제조 위한 공장 매입"), true);
});

test("matchWhitelist: 양산 (글로벌 생산 거점, case 4)", () => {
  assert.strictEqual(matchWhitelist("차세대 수술 로봇 글로벌 양산 거점 구축"), true);
});

test("matchWhitelist: 제조+연구개발+공장 (case 5)", () => {
  assert.strictEqual(matchWhitelist("제조 및 연구개발 시설 확충을 위한 공장 취득"), true);
});

test("matchWhitelist: 수요 증가 대응 (기계장치, case 10)", () => {
  assert.strictEqual(matchWhitelist("테스트 수요 증가 대응"), true);
});

test("matchWhitelist: R&D 포함 (case 11 mixed, whitelist 쪽)", () => {
  assert.strictEqual(matchWhitelist("R&D센터 건립 및 신사옥 확보"), true);
});

test("matchWhitelist: blacklist 본문 → false", () => {
  assert.strictEqual(matchWhitelist("투자수익 및 임대수익"), false);
});

test("matchWhitelist: null pattern 본문 → false", () => {
  assert.strictEqual(matchWhitelist("임직원 업무 공간 취득"), false);
});

test("matchWhitelist: empty string → false", () => {
  assert.strictEqual(matchWhitelist(""), false);
});

test("matchWhitelist: whitespace only → false", () => {
  assert.strictEqual(matchWhitelist("   "), false);
});

// matchBlacklist

test("matchBlacklist: 투자수익 (case 9)", () => {
  assert.strictEqual(matchBlacklist("투자수익 및 임대수익"), true);
});

test("matchBlacklist: 임대 포괄 (case 12 — 임대수익 미포함 본문)", () => {
  assert.strictEqual(matchBlacklist("부동산 임대를 통한 수익 창출"), true);
});

test("matchBlacklist: 사업다각화", () => {
  assert.strictEqual(matchBlacklist("사업다각화 목적 시설 취득"), true);
});

test("matchBlacklist: whitelist 본문 → false", () => {
  assert.strictEqual(matchBlacklist("전기수소차 부품제조 위한 공장 매입"), false);
});

test("matchBlacklist: empty string → false", () => {
  assert.strictEqual(matchBlacklist(""), false);
});

// matchNullPattern

test("matchNullPattern: 물리적 공간 (case 2)", () => {
  assert.strictEqual(matchNullPattern("중장기적 사업 계획에 따른 물리적 공간 확보"), true);
});

test("matchNullPattern: 사옥 (case 3)", () => {
  assert.strictEqual(matchNullPattern("본사 사옥(사업확장 및 업무공간 확보)"), true);
});

test("matchNullPattern: 업무공간 축약형 (case 3)", () => {
  assert.strictEqual(matchNullPattern("업무공간 확보"), true);
});

test("matchNullPattern: 신사옥 (case 6, 8, 11 mixed)", () => {
  assert.strictEqual(matchNullPattern("영업 거점 확보 및 신사옥 확보"), true);
});

test("matchNullPattern: 업무 공간 (case 7, 13)", () => {
  assert.strictEqual(matchNullPattern("임직원 업무 공간 취득"), true);
});

test("matchNullPattern: whitelist 본문 → false", () => {
  assert.strictEqual(matchNullPattern("제조 및 연구개발 시설 확충을 위한 공장 취득"), false);
});

test("matchNullPattern: empty string → false", () => {
  assert.strictEqual(matchNullPattern(""), false);
});
