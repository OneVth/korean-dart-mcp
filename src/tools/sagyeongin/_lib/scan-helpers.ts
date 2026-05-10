/**
 * scan_preview 헬퍼 — 8단계 영역.
 *
 * 책임:
 * - corp_code 덤프 SQLite 영역에서 상장사 row 누적 (loadListedCompanies)
 * - name pattern 필터 적용 (filterUniverse — pure 함수, corp_cls + induty_code 분기 0)
 * - estimated_api_calls 산출 (estimateApiCalls — pure 함수)
 *
 * ADR-0010 옵션 D 정합 — corp_cls + induty_code 분기는 11단계 stage1 영역.
 * 8단계는 stock_code 부재 row 제외 + name pattern 제외만 적용.
 *
 * Ref: spec §10.7 (v0.5), ADR-0010, ADR-0001 (격리 — sagyeongin _lib 안 SQLite 읽기 전용 연결)
 */

import Database from "better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";

export const KILLER_PASS_RATE_DEFAULT = 0.8;
export const SRIM_PASS_RATE_DEFAULT = 0.33;
export const STAGE1_CALLS_PER_COMPANY = 1;
export const STAGE2_CALLS_PER_COMPANY = 3;
export const STAGE3_CALLS_PER_COMPANY = 4;
export const STAGE4_5_6_CALLS_PER_COMPANY = 7;
export const DAILY_LIMIT = 20000;

export interface ListedCompany {
  corp_code: string;
  corp_name: string;
  stock_code: string;
}

/**
 * corp_code 덤프 SQLite 영역에서 상장사 row 누적.
 * stock_code 부재 row 제외 (`stock_code IS NOT NULL AND stock_code != ''`).
 *
 * I/O 영역 — 단위 테스트 영역 0, field-test 영역 검증.
 */
export function loadListedCompanies(): ListedCompany[] {
  const dbPath = join(homedir(), ".korean-dart-mcp", "corp_code.sqlite");
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .prepare(
        `SELECT corp_code, corp_name, stock_code
         FROM corps
         WHERE stock_code IS NOT NULL AND stock_code != ''
         ORDER BY stock_code ASC`,
      )
      .all() as ListedCompany[];
    return rows;
  } finally {
    db.close();
  }
}

export interface FilterConfig {
  excluded_name_patterns?: string[];
  // markets / included_industries / excluded_industries는 8단계 영역 0
  // (corp_cls + induty_code 분기는 11단계 stage1 영역 — ADR-0010 옵션 D)
}

/**
 * pure 함수 — name pattern 제외 적용.
 * markets 영역은 8단계 적용 0 (corp_cls 부재 — over-estimate 분기 ADR-0010).
 *
 * 매칭 본질: corp_name이 pattern (substring) 포함 시 제외.
 */
export function filterUniverse(
  records: ListedCompany[],
  config: FilterConfig,
): ListedCompany[] {
  const patterns = config.excluded_name_patterns ?? [];
  if (patterns.length === 0) return records;
  return records.filter((r) => !patterns.some((p) => r.corp_name.includes(p)));
}

export interface ApiCallEstimate {
  stage1_company_resolution: number;
  stage2_killer: number;
  stage3_srim: number;
  stage4_5_6_tags: number;
  total: number;
}

/**
 * pure 함수 — estimated_api_calls 산출.
 *
 * 분기 본질:
 * - stage1_company_resolution: universe × 1 (corp_cls + induty_code 합산 — company.json 단일 호출)
 * - stage2_killer: universe × 3 (4단계 killer-check 호출 영역)
 * - stage3_srim: (universe × killerPassRate) × 4 (3단계 srim 호출 영역)
 * - stage4_5_6_tags: (universe × killerPassRate × srimPassRate) × 7 (5·6·7단계 합산 호출 영역)
 *
 * Math.round 적용 — 정수 영역 자연.
 */
export function estimateApiCalls(
  universeCount: number,
  killerPassRate: number = KILLER_PASS_RATE_DEFAULT,
  srimPassRate: number = SRIM_PASS_RATE_DEFAULT,
): ApiCallEstimate {
  const stage1 = universeCount * STAGE1_CALLS_PER_COMPANY;
  const stage2 = universeCount * STAGE2_CALLS_PER_COMPANY;
  const killerPassed = universeCount * killerPassRate;
  const stage3 = killerPassed * STAGE3_CALLS_PER_COMPANY;
  const srimPassed = killerPassed * srimPassRate;
  const stage4_5_6 = srimPassed * STAGE4_5_6_CALLS_PER_COMPANY;
  const total = stage1 + stage2 + stage3 + stage4_5_6;
  return {
    stage1_company_resolution: Math.round(stage1),
    stage2_killer: Math.round(stage2),
    stage3_srim: Math.round(stage3),
    stage4_5_6_tags: Math.round(stage4_5_6),
    total: Math.round(total),
  };
}

/**
 * pure 함수 — daily_limit_usage_pct 산출.
 * 분모 영역: DAILY_LIMIT (20000) — spec §10.7 line 730 정합.
 * 정수 영역 0 — 소수 1자리 영역 (예: 12.3).
 */
export function calculateDailyLimitUsagePct(totalCalls: number): number {
  return Math.round((totalCalls / DAILY_LIMIT) * 1000) / 10;
}

/**
 * Fisher-Yates shuffle — seed 기반 결정론 또는 무작위 (ADR-0015 B1).
 *
 * seed 미지정 (undefined): Math.random() 디폴트 — 무작위
 * seed 지정 (number): mulberry32 PRNG 결정론 — 디버깅 + resume 시 동일 순서 복원
 *
 * 외부 의존 0. 입력 배열 변경 X (새 배열 반환).
 *
 * Ref: ADR-0015 B1, verifications/2026-05-09-stage16-pre-verify.md 영역 6
 */
export function shuffleWithSeed<T>(arr: T[], seed?: number): T[] {
  const result = arr.slice();
  const rand = seed === undefined ? Math.random : mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * mulberry32 PRNG — 32-bit seed 기반 결정론 난수 생성기.
 *
 * 외부 의존 0. 동일 seed → 동일 시퀀스.
 *
 * Ref: https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32 (public domain)
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
