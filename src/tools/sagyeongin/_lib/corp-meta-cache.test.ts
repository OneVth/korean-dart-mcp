/**
 * corp-meta-cache 단위 테스트.
 *
 * Node built-in test runner (node --test). 빌드 후 실행.
 * SAGYEONGIN_CONFIG_DIR을 임시 디렉토리로 가리켜 격리 — scan-checkpoint.test.ts
 * 패턴 정합.
 *
 * Ref: ADR-0016, ADR-0003
 */

import { test, beforeEach, afterEach, describe } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  getCorpMeta,
  setCorpMeta,
  invalidateCorpMeta,
  corpMetaSize,
  invalidateStale,
  type CorpMetaCacheRecord,
} from "./corp-meta-cache.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sagyeongin-corp-meta-"));
  process.env.SAGYEONGIN_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  delete process.env.SAGYEONGIN_CONFIG_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeRecord(
  corp_code: string,
  overrides: Partial<CorpMetaCacheRecord> = {},
): CorpMetaCacheRecord {
  return {
    corp_code,
    induty_code: "26110",
    corp_cls: "Y",
    modify_date: "20260101",
    fetched_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("getCorpMeta + setCorpMeta", () => {
  test("미존재 corp_code → null", () => {
    assert.equal(getCorpMeta("00000000"), null);
  });

  test("저장 후 로드 → 동일 record 복원", () => {
    const rec = makeRecord("00126380", {
      induty_code: "26429",
      corp_cls: "Y",
      modify_date: "20260315",
      fetched_at: "2026-05-11T12:00:00.000Z",
    });
    setCorpMeta(rec);
    const loaded = getCorpMeta("00126380");
    assert.deepEqual(loaded, rec);
  });

  test("같은 corp_code 재저장 — INSERT OR REPLACE로 갱신", () => {
    const r1 = makeRecord("00126380", { induty_code: "26110" });
    setCorpMeta(r1);
    const r2 = makeRecord("00126380", {
      induty_code: "26429",
      modify_date: "20260601",
    });
    setCorpMeta(r2);
    const loaded = getCorpMeta("00126380");
    assert.equal(loaded?.induty_code, "26429");
    assert.equal(loaded?.modify_date, "20260601");
  });
});

describe("invalidateCorpMeta", () => {
  test("존재하는 corp_code → true + 실제 삭제", () => {
    setCorpMeta(makeRecord("00126380"));
    assert.equal(invalidateCorpMeta("00126380"), true);
    assert.equal(getCorpMeta("00126380"), null);
  });

  test("미존재 corp_code → false", () => {
    assert.equal(invalidateCorpMeta("00000000"), false);
  });
});

describe("corpMetaSize", () => {
  test("빈 상태 → 0", () => {
    assert.equal(corpMetaSize(), 0);
  });

  test("3건 저장 후 → 3", () => {
    setCorpMeta(makeRecord("00126380"));
    setCorpMeta(makeRecord("00164742"));
    setCorpMeta(makeRecord("00258801"));
    assert.equal(corpMetaSize(), 3);
  });

  test("저장 후 1건 삭제 → 카운트 격감", () => {
    setCorpMeta(makeRecord("00126380"));
    setCorpMeta(makeRecord("00164742"));
    invalidateCorpMeta("00126380");
    assert.equal(corpMetaSize(), 1);
  });
});

describe("invalidateStale", () => {
  test("빈 cache → 0", () => {
    const map = new Map<string, string>();
    assert.equal(invalidateStale(map), 0);
  });

  test("modify_date 모두 일치 → 0 삭제", () => {
    setCorpMeta(makeRecord("00126380", { modify_date: "20260101" }));
    setCorpMeta(makeRecord("00164742", { modify_date: "20260201" }));
    const map = new Map([
      ["00126380", "20260101"],
      ["00164742", "20260201"],
    ]);
    assert.equal(invalidateStale(map), 0);
    assert.equal(corpMetaSize(), 2);
  });

  test("modify_date 갱신 corp만 삭제", () => {
    setCorpMeta(makeRecord("00126380", { modify_date: "20260101" }));
    setCorpMeta(makeRecord("00164742", { modify_date: "20260201" }));
    setCorpMeta(makeRecord("00258801", { modify_date: "20260301" }));
    const map = new Map([
      ["00126380", "20260101"], // 동일
      ["00164742", "20260601"], // 갱신
      ["00258801", "20260301"], // 동일
    ]);
    assert.equal(invalidateStale(map), 1);
    assert.notEqual(getCorpMeta("00126380"), null);
    assert.equal(getCorpMeta("00164742"), null);
    assert.notEqual(getCorpMeta("00258801"), null);
  });

  test("dump 영역에 부재한 corp_code → 삭제 (dump 영역 삭제 정황)", () => {
    setCorpMeta(makeRecord("00126380"));
    setCorpMeta(makeRecord("99999999"));
    const map = new Map([
      ["00126380", "20260101"],
      // 99999999 부재 → stale 영역
    ]);
    assert.equal(invalidateStale(map), 1);
    assert.equal(getCorpMeta("99999999"), null);
  });

  test("대량 영역 (50건 중 10건 갱신) — 정확히 10건 삭제", () => {
    for (let i = 0; i < 50; i++) {
      const corp_code = String(i).padStart(8, "0");
      setCorpMeta(
        makeRecord(corp_code, { modify_date: "20260101" }),
      );
    }
    const map = new Map<string, string>();
    for (let i = 0; i < 50; i++) {
      const corp_code = String(i).padStart(8, "0");
      // 첫 10건만 갱신 영역
      map.set(corp_code, i < 10 ? "20260601" : "20260101");
    }
    assert.equal(invalidateStale(map), 10);
    assert.equal(corpMetaSize(), 40);
  });
});

describe("mkdir 자동 생성 (G1)", () => {
  test("중첩 미존재 경로에도 setCorpMeta 성공 + sqlite 파일 생성", async () => {
    const nested = path.join(tmpDir, "nested", "missing");
    process.env.SAGYEONGIN_CONFIG_DIR = nested;
    setCorpMeta(makeRecord("00126380"));
    await fs.access(path.join(nested, "corp_meta_cache.sqlite"));
  });
});
