/**
 * corp-meta-cache — 16(c) 인프라 (ADR-0016).
 *
 * DART company.json의 induty_code + corp_cls per-corp_code 영구 cache.
 * 본 본질 영역: 측정 자격 보장 — 매 측정 사이클마다 동일 ~3,963 corp에 대해 동일
 * 호출 반복 영역 해소.
 *
 * 저장 위치: ~/.sagyeongin-dart/corp_meta_cache.sqlite (scan-checkpoint 정합)
 * 환경 변수 SAGYEONGIN_CONFIG_DIR로 오버라이드 가능 (테스트 격리).
 *
 * β-ii 영역 (ADR-0001 §B2 사경인 코드 100% 단일 디렉토리) — upstream src/lib/
 * 0 touch. corp-meta-cache는 cache store만 + 외부 호출 0 — DartClient 호출은
 * 외부 영역 (scan-execute / induty-extractor 묶음 1B)에서만.
 *
 * invalidate 정책: corp_code dump 갱신 시점에 CorpRecord.modify_date와 비교 →
 * 갱신된 corp만 invalidate. cache TTL 자체 없음 (영구 cache + modify_date
 * 단일 트리거).
 *
 * 인터페이스 5개:
 * - getCorpMeta(corp_code) — cache 조회 (미존재 → null)
 * - setCorpMeta(record) — 신규/갱신 (INSERT OR REPLACE)
 * - invalidateCorpMeta(corp_code) — 단일 삭제 (존재 → true / 부재 → false)
 * - corpMetaSize() — 전체 cache 영역 카운트
 * - invalidateStale(modifyDateMap) — modify_date 갱신 corp 일괄 삭제 (반환 = 삭제 개수)
 *
 * Ref: ADR-0016, ADR-0001 §B2, ADR-0015, philosophy 7부 A + 5부
 */

import Database from "better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

/**
 * corp_meta cache 레코드.
 *
 * modify_date는 CorpRecord.modify_date (upstream `corpCode.xml` dump) 영역 정합 —
 * invalidate 트리거 영역.
 * fetched_at은 ISO 8601 — cache 영역 시점 (디버깅 / 향후 TTL 영역 정착 영역).
 */
export interface CorpMetaCacheRecord {
  corp_code: string;
  induty_code: string;
  corp_cls: string;
  modify_date: string;
  fetched_at: string;
}

function getCacheDir(): string {
  return (
    process.env.SAGYEONGIN_CONFIG_DIR ??
    join(homedir(), ".sagyeongin-dart")
  );
}

function getCacheDbPath(): string {
  return join(getCacheDir(), "corp_meta_cache.sqlite");
}

/**
 * SQLite 연결 + 스키마 ensure.
 *
 * scan-checkpoint.ts openDb() 패턴 정합:
 * - mkdirSync recursive (config-store G1 동일 영역)
 * - CREATE TABLE IF NOT EXISTS (첫 호출 영역만 본격 생성)
 */
function openDb(): Database.Database {
  const dir = getCacheDir();
  mkdirSync(dir, { recursive: true });
  const db = new Database(getCacheDbPath());
  db.exec(`
    CREATE TABLE IF NOT EXISTS corp_meta (
      corp_code   TEXT PRIMARY KEY,
      induty_code TEXT NOT NULL,
      corp_cls    TEXT NOT NULL,
      modify_date TEXT NOT NULL,
      fetched_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_modify_date ON corp_meta(modify_date);
  `);
  return db;
}

/**
 * corp_code로 cache 조회. 미존재 → null.
 */
export function getCorpMeta(corp_code: string): CorpMetaCacheRecord | null {
  const db = openDb();
  try {
    const row = db
      .prepare(
        `SELECT corp_code, induty_code, corp_cls, modify_date, fetched_at
         FROM corp_meta WHERE corp_code = ?`,
      )
      .get(corp_code) as CorpMetaCacheRecord | undefined;
    return row ?? null;
  } finally {
    db.close();
  }
}

/**
 * cache 저장. 같은 corp_code 재저장 시 갱신 (INSERT OR REPLACE).
 */
export function setCorpMeta(record: CorpMetaCacheRecord): void {
  const db = openDb();
  try {
    db.prepare(
      `INSERT OR REPLACE INTO corp_meta
       (corp_code, induty_code, corp_cls, modify_date, fetched_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      record.corp_code,
      record.induty_code,
      record.corp_cls,
      record.modify_date,
      record.fetched_at,
    );
  } finally {
    db.close();
  }
}

/**
 * corp_code 단일 삭제. 존재 → true, 부재 → false.
 */
export function invalidateCorpMeta(corp_code: string): boolean {
  const db = openDb();
  try {
    const r = db
      .prepare(`DELETE FROM corp_meta WHERE corp_code = ?`)
      .run(corp_code);
    return r.changes > 0;
  } finally {
    db.close();
  }
}

/**
 * 전체 cache 영역 카운트.
 */
export function corpMetaSize(): number {
  const db = openDb();
  try {
    const row = db
      .prepare(`SELECT COUNT(*) AS n FROM corp_meta`)
      .get() as { n: number };
    return row.n;
  } finally {
    db.close();
  }
}

/**
 * modify_date 갱신 corp 일괄 삭제.
 *
 * 입력: corp_code → 현재 dump의 modify_date 매핑.
 * 본 매핑 영역과 cache 영역의 modify_date 비교 → 다른 영역 (또는 매핑에 corp_code
 * 부재) 영역 삭제. 반환 = 삭제된 영역 개수.
 *
 * corp_code dump 갱신 시점 영역에서 호출 (묶음 2 또는 묶음 1B 영역). 본 묶음
 * 1A 영역에서는 단테 영역만 정착.
 */
export function invalidateStale(
  modifyDateMap: Map<string, string>,
): number {
  const db = openDb();
  try {
    const allRows = db
      .prepare(`SELECT corp_code, modify_date FROM corp_meta`)
      .all() as Array<{ corp_code: string; modify_date: string }>;

    const staleCorpCodes = allRows
      .filter((row) => {
        const currentModifyDate = modifyDateMap.get(row.corp_code);
        // 매핑 영역에 부재 → stale 영역 (dump 영역에서 corp 영역 삭제 정황) OR
        // modify_date 다른 영역 → stale (dump 영역 갱신 정황)
        return (
          currentModifyDate === undefined ||
          currentModifyDate !== row.modify_date
        );
      })
      .map((row) => row.corp_code);

    if (staleCorpCodes.length === 0) return 0;

    const stmt = db.prepare(`DELETE FROM corp_meta WHERE corp_code = ?`);
    const tx = db.transaction((codes: string[]) => {
      let count = 0;
      for (const code of codes) {
        const r = stmt.run(code);
        count += r.changes;
      }
      return count;
    });
    return tx(staleCorpCodes);
  } finally {
    db.close();
  }
}
