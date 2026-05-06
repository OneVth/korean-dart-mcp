/**
 * scan-checkpoint — 11단계 인프라 (ADR-0014).
 *
 * scan_execute의 transient state(분할 실행 중간 상태)를 저장한다.
 * settings는 config.json에 그대로 두고(ADR-0007), checkpoint만 별도 SQLite로 분리.
 *
 * 저장 위치: ~/.sagyeongin-dart/scan_checkpoints.sqlite
 * 환경 변수 SAGYEONGIN_CONFIG_DIR로 오버라이드 가능 (테스트 격리).
 *
 * 인터페이스 5개:
 * - generateScanId: scan_YYYY-MM-DD_xxxxxx 형식 ID 생성
 * - saveCheckpoint: 신규/갱신 (INSERT OR REPLACE)
 * - loadCheckpoint: scan_id로 조회 (미존재 시 null)
 * - listCheckpoints: 전체 목록 (updated_at DESC)
 * - deleteCheckpoint: scan_id로 삭제 (존재 시 true / 부재 시 false)
 *
 * Ref: ADR-0014, ADR-0007 (settings — config.json은 그대로),
 *      spec §10.8 (scan_execute checkpoint/resume)
 */

import Database from "better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

/**
 * scan_execute 분할 실행 중간 상태.
 *
 * partial_candidates는 묶음 2B에서 구체 타입 정의 — 묶음 2A는 unknown[]로 직렬화/역직렬화만 책임.
 */
export interface ScanCheckpointState {
  scan_id: string;
  created_at: string;        // ISO 8601
  updated_at: string;        // ISO 8601
  input_args: Record<string, unknown>;
  processed_corp_codes: string[];
  pending_corp_codes: string[];
  partial_candidates: unknown[];
  call_count: number;
}

/** listCheckpoints 반환 — state_json은 제외하고 메타만 노출. */
export interface ScanCheckpointSummary {
  scan_id: string;
  created_at: string;
  updated_at: string;
}

function getCheckpointDir(): string {
  return (
    process.env.SAGYEONGIN_CONFIG_DIR ??
    join(homedir(), ".sagyeongin-dart")
  );
}

function getCheckpointDbPath(): string {
  return join(getCheckpointDir(), "scan_checkpoints.sqlite");
}

/**
 * SQLite 연결 + 스키마 ensure.
 *
 * mkdir recursive: 중첩 디렉토리 자동 생성 (config-store G1과 동일).
 * CREATE TABLE IF NOT EXISTS: 첫 호출에서만 실제 생성, 이후 호출은 no-op.
 */
function openDb(): Database.Database {
  const dir = getCheckpointDir();
  mkdirSync(dir, { recursive: true });
  const db = new Database(getCheckpointDbPath());
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_checkpoints (
      scan_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      state_json TEXT NOT NULL
    );
  `);
  return db;
}

/**
 * scan_id 생성 — `scan_YYYY-MM-DD_xxxxxx` 형식.
 *
 * 사용자가 list()에서 직접 보게 되므로 사람 읽기 좋은 형식 채택 (ADR 합의).
 * 무작위 6자리는 base36(0-9 + a-z)로 36^6 = 약 21억 가지.
 */
export function generateScanId(): string {
  const date = new Date().toISOString().slice(0, 10);
  const random = Math.random().toString(36).substring(2, 8);
  return `scan_${date}_${random}`;
}

/**
 * checkpoint 저장. 같은 scan_id 재저장 시 갱신(INSERT OR REPLACE).
 * state 전체를 JSON 직렬화해서 state_json 컬럼에 보관.
 */
export function saveCheckpoint(state: ScanCheckpointState): void {
  const db = openDb();
  try {
    db.prepare(
      `INSERT OR REPLACE INTO scan_checkpoints
       (scan_id, created_at, updated_at, state_json)
       VALUES (?, ?, ?, ?)`,
    ).run(
      state.scan_id,
      state.created_at,
      state.updated_at,
      JSON.stringify(state),
    );
  } finally {
    db.close();
  }
}

/**
 * scan_id로 조회. 미존재 시 null.
 * state_json 역직렬화 결과를 그대로 반환.
 */
export function loadCheckpoint(scan_id: string): ScanCheckpointState | null {
  const db = openDb();
  try {
    const row = db
      .prepare(`SELECT state_json FROM scan_checkpoints WHERE scan_id = ?`)
      .get(scan_id) as { state_json: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.state_json) as ScanCheckpointState;
  } finally {
    db.close();
  }
}

/**
 * 전체 checkpoint 목록 (updated_at DESC).
 * state_json은 제외 — 큰 데이터를 한 번에 로드하지 않는다.
 */
export function listCheckpoints(): ScanCheckpointSummary[] {
  const db = openDb();
  try {
    return db
      .prepare(
        `SELECT scan_id, created_at, updated_at
         FROM scan_checkpoints
         ORDER BY updated_at DESC`,
      )
      .all() as ScanCheckpointSummary[];
  } finally {
    db.close();
  }
}

/**
 * scan_id로 삭제. 존재 → true, 부재 → false.
 */
export function deleteCheckpoint(scan_id: string): boolean {
  const db = openDb();
  try {
    const r = db
      .prepare(`DELETE FROM scan_checkpoints WHERE scan_id = ?`)
      .run(scan_id);
    return r.changes > 0;
  } finally {
    db.close();
  }
}
