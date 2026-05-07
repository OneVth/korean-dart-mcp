import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySkipReason } from "./skip-reason.js";

test("classifySkipReason: DART status 013 — 조회 데이터 없음", () => {
  const e = new Error(
    "company.json 실패: company.json 응답 오류 [013]: 조회된 데이타가 없습니다.",
  );
  assert.equal(classifySkipReason(e), "status_013");
});

test("classifySkipReason: DART status 014 — 파일 없음", () => {
  const e = new Error("company.json 응답 오류 [014]: 파일이 존재하지 않습니다");
  assert.equal(classifySkipReason(e), "status_014");
});

test("classifySkipReason: DART status 100 — 기타", () => {
  const e = new Error("company.json 응답 오류 [100]: 필드 누락");
  assert.equal(classifySkipReason(e), "status_other");
});

test("classifySkipReason: DART status 010 — 기타", () => {
  const e = new Error("company.json 응답 오류 [010]: 미등록 키");
  assert.equal(classifySkipReason(e), "status_other");
});

test("classifySkipReason: corp_not_found — resolveCorp throw", () => {
  const e = new Error('회사를 찾을 수 없습니다: "00000000".');
  assert.equal(classifySkipReason(e), "corp_not_found");
});

test("classifySkipReason: network_error — timeout", () => {
  const e = new Error("ETIMEDOUT: connection timed out");
  assert.equal(classifySkipReason(e), "network_error");
});

test("classifySkipReason: network_error — fetch failed", () => {
  const e = new Error("fetch failed");
  assert.equal(classifySkipReason(e), "network_error");
});

test("classifySkipReason: parse_error — JSON", () => {
  const e = new Error("Unexpected token < in JSON at position 0");
  assert.equal(classifySkipReason(e), "parse_error");
});

test("classifySkipReason: unknown — 분류 미일치", () => {
  const e = new Error("어떤 분기에도 매칭 0인 메시지");
  assert.equal(classifySkipReason(e), "unknown");
});
