import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseModifyDate,
  classifyModifyDateAge,
  judgeStaleness,
} from "./corp-code-status.js";

// === parseModifyDate ===

test("parseModifyDate: 정상 YYYYMMDD", () => {
  const d = parseModifyDate("20250115");
  assert.notEqual(d, null);
  assert.equal(d?.getUTCFullYear(), 2025);
  assert.equal(d?.getUTCMonth(), 0);
  assert.equal(d?.getUTCDate(), 15);
});

test("parseModifyDate: null 입력", () => {
  assert.equal(parseModifyDate(null), null);
});

test("parseModifyDate: undefined 입력", () => {
  assert.equal(parseModifyDate(undefined), null);
});

test("parseModifyDate: 빈 문자열", () => {
  assert.equal(parseModifyDate(""), null);
});

test("parseModifyDate: 공백 trim", () => {
  const d = parseModifyDate("  20250115  ");
  assert.notEqual(d, null);
  assert.equal(d?.getUTCFullYear(), 2025);
});

test("parseModifyDate: 형식 어긋남 — 7자리", () => {
  assert.equal(parseModifyDate("2025011"), null);
});

test("parseModifyDate: 형식 어긋남 — 9자리", () => {
  assert.equal(parseModifyDate("202501150"), null);
});

test("parseModifyDate: 형식 어긋남 — 대시 포함", () => {
  assert.equal(parseModifyDate("2025-01-15"), null);
});

test("parseModifyDate: 범위 어긋남 — 13월", () => {
  assert.equal(parseModifyDate("20251315"), null);
});

test("parseModifyDate: 범위 어긋남 — 32일", () => {
  assert.equal(parseModifyDate("20250132"), null);
});

test("parseModifyDate: 윤년 정상 — 2024년 2월 29일", () => {
  const d = parseModifyDate("20240229");
  assert.notEqual(d, null);
});

test("parseModifyDate: 윤년 오류 — 2025년 2월 30일", () => {
  assert.equal(parseModifyDate("20250230"), null);
});

// === classifyModifyDateAge ===

test("classifyModifyDateAge: null → null_or_invalid", () => {
  const now = new Date("2026-05-07T00:00:00Z").getTime();
  assert.equal(classifyModifyDateAge(null, now), "null_or_invalid");
});

test("classifyModifyDateAge: 10일 전 → within_30_days", () => {
  const now = new Date("2026-05-07T00:00:00Z").getTime();
  const date = new Date("2026-04-27T00:00:00Z");
  assert.equal(classifyModifyDateAge(date, now), "within_30_days");
});

test("classifyModifyDateAge: 100일 전 → within_1_year", () => {
  const now = new Date("2026-05-07T00:00:00Z").getTime();
  const date = new Date("2026-01-27T00:00:00Z");
  assert.equal(classifyModifyDateAge(date, now), "within_1_year");
});

test("classifyModifyDateAge: 2년 전 → within_3_years", () => {
  const now = new Date("2026-05-07T00:00:00Z").getTime();
  const date = new Date("2024-05-07T00:00:00Z");
  assert.equal(classifyModifyDateAge(date, now), "within_3_years");
});

test("classifyModifyDateAge: 5년 전 → older_than_3_years", () => {
  const now = new Date("2026-05-07T00:00:00Z").getTime();
  const date = new Date("2021-05-07T00:00:00Z");
  assert.equal(classifyModifyDateAge(date, now), "older_than_3_years");
});

// === judgeStaleness ===

test("judgeStaleness: DB 부재 → INSUFFICIENT_DATA", () => {
  const r = judgeStaleness(
    {
      db_path: "/x",
      db_exists: false,
      count: null,
      updated_at_iso: null,
      updated_at_ms: null,
      age_hours: null,
      fresh_within_ttl: null,
    },
    {
      total_corps: 0,
      within_30_days: 0,
      within_1_year: 0,
      within_3_years: 0,
      older_than_3_years: 0,
      null_or_invalid: 0,
    },
  );
  assert.equal(r.verdict, "INSUFFICIENT_DATA");
  assert.match(r.notes[0], /SQLite 파일 부재/);
});

test("judgeStaleness: meta 부재 → INSUFFICIENT_DATA", () => {
  const r = judgeStaleness(
    {
      db_path: "/x",
      db_exists: true,
      count: null,
      updated_at_iso: null,
      updated_at_ms: null,
      age_hours: null,
      fresh_within_ttl: null,
    },
    {
      total_corps: 0,
      within_30_days: 0,
      within_1_year: 0,
      within_3_years: 0,
      older_than_3_years: 0,
      null_or_invalid: 0,
    },
  );
  assert.equal(r.verdict, "INSUFFICIENT_DATA");
  assert.match(r.notes[0], /meta 테이블 영역 부재/);
});

test("judgeStaleness: fresh_within_ttl true → FRESH", () => {
  const r = judgeStaleness(
    {
      db_path: "/x",
      db_exists: true,
      count: 100,
      updated_at_iso: "2026-05-07T00:00:00Z",
      updated_at_ms: Date.now() - 1000,
      age_hours: 0.0003,
      fresh_within_ttl: true,
    },
    {
      total_corps: 100,
      within_30_days: 50,
      within_1_year: 30,
      within_3_years: 15,
      older_than_3_years: 5,
      null_or_invalid: 0,
    },
  );
  assert.equal(r.verdict, "FRESH");
});

test("judgeStaleness: fresh_within_ttl false → POTENTIALLY_STALE", () => {
  const r = judgeStaleness(
    {
      db_path: "/x",
      db_exists: true,
      count: 100,
      updated_at_iso: "2026-04-01T00:00:00Z",
      updated_at_ms: Date.now() - 30 * 24 * 60 * 60 * 1000,
      age_hours: 720,
      fresh_within_ttl: false,
    },
    {
      total_corps: 100,
      within_30_days: 10,
      within_1_year: 30,
      within_3_years: 30,
      older_than_3_years: 30,
      null_or_invalid: 0,
    },
  );
  assert.equal(r.verdict, "POTENTIALLY_STALE");
  assert.ok(r.notes.some((n) => n.includes("갱신")));
});

test("judgeStaleness: null_or_invalid > 0 → notes에 추가", () => {
  const r = judgeStaleness(
    {
      db_path: "/x",
      db_exists: true,
      count: 100,
      updated_at_iso: "2026-05-07T00:00:00Z",
      updated_at_ms: Date.now() - 1000,
      age_hours: 0.0003,
      fresh_within_ttl: true,
    },
    {
      total_corps: 100,
      within_30_days: 50,
      within_1_year: 30,
      within_3_years: 15,
      older_than_3_years: 0,
      null_or_invalid: 5,
    },
  );
  assert.equal(r.verdict, "FRESH");
  assert.ok(r.notes.some((n) => n.includes("null/invalid 5건")));
});
