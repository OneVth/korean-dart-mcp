/**
 * 사경인 corp_code_status 도구 — corp_code SQLite 덤프 진단.
 *
 * philosophy 7부 A "매매·관리 종목 즉시 제외" 영역에서 corp_code 덤프 stale 시
 * 폐지 회사 잔존 → killer 우회 가능 → "즉시 제외" 무력화 가설.
 *
 * 11단계 묶음 2B field-test (2026-05-02)에서 Stage 1 company.json 호출 3963회
 * 중 2607회 (65.8%) 실패 발견 — 본 도구로 corp_code 덤프 메타 + modify_date
 * 분포 + staleness verdict 진단.
 *
 * β-i 격리: src/lib/corp-code.ts 287줄 변경 0. 도구가 SQLite 파일 경로
 * (~/.korean-dart-mcp/corp_code.sqlite)를 재구성 → better-sqlite3 readonly
 * mode open. CorpCodeResolver public 인터페이스 변경 0.
 *
 * 경로 중복: corp-code.ts와 동일 경로가 두 곳에 중복 — ADR-0001 β-i 정합
 * (도구 격리 우선, 경로 상수 중복 비용 < src/lib/ 변경 비용).
 *
 * Ref: spec §10.13, philosophy 7부 A, ADR-0001 β-i
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import Database from "better-sqlite3";
import { defineTool } from "../_helpers.js";
import type { ToolDef, ToolCtx } from "../_helpers.js";

/** TTL 24h — corp-code.ts DEFAULT_TTL_MS와 동일 (경로 중복 의도적). */
const TTL_MS = 24 * 60 * 60 * 1000;

/** SQLite 파일 경로 — corp-code.ts와 동일 (경로 중복 의도적). */
function resolveDbPath(): string {
  return join(homedir(), ".korean-dart-mcp", "corp_code.sqlite");
}

interface CacheMeta {
  db_path: string;
  db_exists: boolean;
  count: number | null;
  updated_at_iso: string | null;
  updated_at_ms: number | null;
  age_hours: number | null;
  fresh_within_ttl: boolean | null;
}

interface ModifyDateDistribution {
  total_corps: number;
  within_30_days: number;
  within_1_year: number;
  within_3_years: number;
  older_than_3_years: number;
  null_or_invalid: number;
}

interface StalenessJudgment {
  verdict: "FRESH" | "POTENTIALLY_STALE" | "INSUFFICIENT_DATA";
  notes: string[];
}

interface CorpCodeStatusResult {
  cache_meta: CacheMeta;
  modify_date_distribution: ModifyDateDistribution;
  staleness_judgment: StalenessJudgment;
}

/**
 * YYYYMMDD 문자열 → Date 변환. parse 실패 시 null.
 *
 * DART corpCode.xml의 modify_date 형식 — 가정 형식 YYYYMMDD (8자리 숫자).
 * 형식 어긋남 시 null_or_invalid 분류로 자연 처리.
 */
export function parseModifyDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!/^\d{8}$/.test(trimmed)) return null;
  const y = Number(trimmed.slice(0, 4));
  const m = Number(trimmed.slice(4, 6));
  const d = Number(trimmed.slice(6, 8));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  // 윤년 오류 감지 (예: 20250230 → 20250302로 rollover됨)
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

type AgeBucket =
  | "within_30_days"
  | "within_1_year"
  | "within_3_years"
  | "older_than_3_years"
  | "null_or_invalid";

/** modify_date → 5구간 분류. now는 Date.now() ms. */
export function classifyModifyDateAge(modifyDate: Date | null, now: number): AgeBucket {
  if (!modifyDate) return "null_or_invalid";
  const ageMs = now - modifyDate.getTime();
  const DAY = 24 * 60 * 60 * 1000;
  if (ageMs < 30 * DAY) return "within_30_days";
  if (ageMs < 365 * DAY) return "within_1_year";
  if (ageMs < 3 * 365 * DAY) return "within_3_years";
  return "older_than_3_years";
}

/**
 * staleness verdict 산출.
 *
 * - INSUFFICIENT_DATA: DB 파일 부재 또는 meta 테이블 부재
 * - FRESH: fresh_within_ttl == true (cache age < 24h)
 * - POTENTIALLY_STALE: fresh_within_ttl == false
 */
export function judgeStaleness(
  cacheMeta: CacheMeta,
  distribution: ModifyDateDistribution,
): StalenessJudgment {
  const notes: string[] = [];

  if (!cacheMeta.db_exists) {
    notes.push("SQLite 파일 부재 — 서버 init 미완 또는 캐시 삭제됨");
    return { verdict: "INSUFFICIENT_DATA", notes };
  }

  if (cacheMeta.updated_at_ms === null) {
    notes.push("meta 테이블 영역 부재 — 서버 init 미완");
    return { verdict: "INSUFFICIENT_DATA", notes };
  }

  if (cacheMeta.fresh_within_ttl === true) {
    notes.push(`cache age ${cacheMeta.age_hours?.toFixed(1)}h < TTL 24h — FRESH`);
  } else {
    notes.push(`cache age ${cacheMeta.age_hours?.toFixed(1)}h ≥ TTL 24h — 갱신 권유`);
  }

  if (distribution.total_corps > 0) {
    const olderRatio = distribution.older_than_3_years / distribution.total_corps;
    notes.push(
      `modify_date 3년 초과 비율 ${(olderRatio * 100).toFixed(1)}% (${distribution.older_than_3_years}/${distribution.total_corps})`,
    );
  }

  if (distribution.null_or_invalid > 0) {
    notes.push(
      `modify_date null/invalid ${distribution.null_or_invalid}건 — 가정 형식(YYYYMMDD) 어긋남`,
    );
  }

  return {
    verdict: cacheMeta.fresh_within_ttl ? "FRESH" : "POTENTIALLY_STALE",
    notes,
  };
}

async function corpCodeStatusHandler(_ctx: ToolCtx): Promise<CorpCodeStatusResult> {
  const dbPath = resolveDbPath();
  const dbExists = existsSync(dbPath);

  const cacheMeta: CacheMeta = {
    db_path: dbPath,
    db_exists: dbExists,
    count: null,
    updated_at_iso: null,
    updated_at_ms: null,
    age_hours: null,
    fresh_within_ttl: null,
  };

  const distribution: ModifyDateDistribution = {
    total_corps: 0,
    within_30_days: 0,
    within_1_year: 0,
    within_3_years: 0,
    older_than_3_years: 0,
    null_or_invalid: 0,
  };

  if (!dbExists) {
    return {
      cache_meta: cacheMeta,
      modify_date_distribution: distribution,
      staleness_judgment: judgeStaleness(cacheMeta, distribution),
    };
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    let updatedAtMs: number | null = null;
    let count: number | null = null;
    try {
      const updatedRow = db
        .prepare("SELECT value FROM meta WHERE key = 'updated_at'")
        .get() as { value: string } | undefined;
      const countRow = db
        .prepare("SELECT value FROM meta WHERE key = 'count'")
        .get() as { value: string } | undefined;
      if (updatedRow) updatedAtMs = Number(updatedRow.value);
      if (countRow) count = Number(countRow.value);
    } catch {
      // meta 테이블 부재 — INSUFFICIENT_DATA 경로
    }

    if (updatedAtMs !== null && Number.isFinite(updatedAtMs)) {
      cacheMeta.updated_at_ms = updatedAtMs;
      cacheMeta.updated_at_iso = new Date(updatedAtMs).toISOString();
      const ageMs = Date.now() - updatedAtMs;
      cacheMeta.age_hours = ageMs / (60 * 60 * 1000);
      cacheMeta.fresh_within_ttl = ageMs < TTL_MS;
    }
    if (count !== null && Number.isFinite(count)) {
      cacheMeta.count = count;
    }

    try {
      const rows = db
        .prepare("SELECT modify_date FROM corps")
        .all() as Array<{ modify_date: string | null }>;
      const now = Date.now();
      for (const row of rows) {
        distribution.total_corps += 1;
        const date = parseModifyDate(row.modify_date);
        const bucket = classifyModifyDateAge(date, now);
        distribution[bucket] += 1;
      }
    } catch {
      // corps 테이블 부재 — total_corps 0 그대로
    }
  } finally {
    db.close();
  }

  return {
    cache_meta: cacheMeta,
    modify_date_distribution: distribution,
    staleness_judgment: judgeStaleness(cacheMeta, distribution),
  };
}

export const corpCodeStatusTool: ToolDef = defineTool({
  name: "sagyeongin_corp_code_status",
  description:
    "corp_code SQLite 덤프 메타 + modify_date 분포 + staleness 진단 (7부 A killer의 stale 가설 검증)",
  input: z.object({}),
  handler: async (ctx, _args) => corpCodeStatusHandler(ctx),
});
