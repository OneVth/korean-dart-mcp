/**
 * scan-checkpoint 단위 테스트.
 *
 * Node built-in test runner (node --test). 빌드 후 실행.
 * SAGYEONGIN_CONFIG_DIR을 임시 디렉토리로 가리켜 격리 — config-store.test.ts와 동일 패턴.
 *
 * Ref: ADR-0014, ADR-0003
 */

import { test, beforeEach, afterEach, describe } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  generateScanId,
  saveCheckpoint,
  loadCheckpoint,
  listCheckpoints,
  deleteCheckpoint,
  type ScanCheckpointState,
} from "./scan-checkpoint.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sagyeongin-checkpoint-"));
  process.env.SAGYEONGIN_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  delete process.env.SAGYEONGIN_CONFIG_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeState(
  scan_id: string,
  overrides: Partial<ScanCheckpointState> = {},
): ScanCheckpointState {
  const now = new Date().toISOString();
  return {
    scan_id,
    created_at: now,
    updated_at: now,
    input_args: { preset: "default" },
    processed_corp_codes: [],
    pending_corp_codes: ["00126380", "00164742"],
    partial_candidates: [],
    call_count: 0,
    ...overrides,
  };
}

describe("generateScanId", () => {
  test("형식 검증 — scan_YYYY-MM-DD_xxxxxx", () => {
    const id = generateScanId();
    assert.match(id, /^scan_\d{4}-\d{2}-\d{2}_[a-z0-9]{1,6}$/);
  });

  test("연속 호출 시 서로 다른 ID — 50회 모두 unique", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      ids.add(generateScanId());
    }
    assert.equal(ids.size, 50);
  });
});

describe("saveCheckpoint + loadCheckpoint", () => {
  test("저장 후 로드 → 동일 state 복원", () => {
    const state = makeState("scan_2026-05-04_abc123", {
      input_args: { markets: ["KOSPI"], limit: 10 },
      processed_corp_codes: ["00126380"],
      pending_corp_codes: ["00164742", "00258801"],
      call_count: 42,
    });
    saveCheckpoint(state);
    const loaded = loadCheckpoint("scan_2026-05-04_abc123");
    assert.deepEqual(loaded, state);
  });

  test("미존재 scan_id → null", () => {
    const r = loadCheckpoint("scan_2026-05-04_nonexistent");
    assert.equal(r, null);
  });

  test("같은 scan_id 재저장 — INSERT OR REPLACE로 갱신", () => {
    const s1 = makeState("scan_2026-05-04_xyz999", { call_count: 10 });
    saveCheckpoint(s1);
    const s2 = makeState("scan_2026-05-04_xyz999", { call_count: 100 });
    saveCheckpoint(s2);
    const loaded = loadCheckpoint("scan_2026-05-04_xyz999");
    assert.equal(loaded?.call_count, 100);
  });

  test("partial_candidates에 unknown[] 직렬화 — 객체 라운드트립", () => {
    const state = makeState("scan_2026-05-04_part01", {
      partial_candidates: [
        { corp_code: "00126380", srim_verdict: "BUY", score: 75 },
        { corp_code: "00164742", srim_verdict: "BUY_FAIR", score: 50 },
      ],
    });
    saveCheckpoint(state);
    const loaded = loadCheckpoint("scan_2026-05-04_part01");
    assert.deepEqual(loaded?.partial_candidates, state.partial_candidates);
  });
});

describe("listCheckpoints", () => {
  test("빈 상태 → 빈 배열", () => {
    assert.deepEqual(listCheckpoints(), []);
  });

  test("여러 개 저장 후 updated_at DESC 정렬", () => {
    saveCheckpoint(
      makeState("scan_2026-05-01_old111", {
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
      }),
    );
    saveCheckpoint(
      makeState("scan_2026-05-04_new222", {
        created_at: "2026-05-04T00:00:00.000Z",
        updated_at: "2026-05-04T00:00:00.000Z",
      }),
    );
    const list = listCheckpoints();
    assert.equal(list.length, 2);
    assert.equal(list[0].scan_id, "scan_2026-05-04_new222");
    assert.equal(list[1].scan_id, "scan_2026-05-01_old111");
  });

  test("listCheckpoints 결과에 state_json 미포함 — 메타만 노출", () => {
    saveCheckpoint(makeState("scan_2026-05-04_meta01"));
    const list = listCheckpoints();
    assert.equal(list.length, 1);
    const keys = Object.keys(list[0]).sort();
    assert.deepEqual(keys, ["created_at", "scan_id", "updated_at"]);
  });
});

describe("deleteCheckpoint", () => {
  test("존재하는 scan_id → true + 실제 삭제", () => {
    saveCheckpoint(makeState("scan_2026-05-04_del001"));
    assert.equal(deleteCheckpoint("scan_2026-05-04_del001"), true);
    assert.equal(loadCheckpoint("scan_2026-05-04_del001"), null);
  });

  test("미존재 scan_id → false", () => {
    assert.equal(deleteCheckpoint("scan_2026-05-04_nonexistent"), false);
  });
});

describe("mkdir 자동 생성 (G1)", () => {
  test("중첩 미존재 경로에도 saveCheckpoint 성공 + sqlite 파일 생성", async () => {
    const nested = path.join(tmpDir, "nested", "missing");
    process.env.SAGYEONGIN_CONFIG_DIR = nested;
    saveCheckpoint(makeState("scan_2026-05-04_nested1"));
    await fs.access(path.join(nested, "scan_checkpoints.sqlite"));
  });
});
