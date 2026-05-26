import { test, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadUserPreference,
  saveUserPreference,
  addInduty,
  removeInduty,
  type UserPreference,
  type IndutyList,
} from "./user-preference-store.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sagyeongin-pref-test-"));
  process.env.SAGYEONGIN_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  delete process.env.SAGYEONGIN_CONFIG_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// 1. ENOENT → default 반환
test("loadUserPreference — ENOENT 시 default 반환", async () => {
  const pref = await loadUserPreference();
  assert.deepEqual(pref.induty_whitelist, []);
  assert.deepEqual(pref.induty_blacklist, []);
  assert.equal(pref.updated_at, null);
});

// 2. invalid JSON → throw
test("loadUserPreference — invalid JSON → throw", async () => {
  await fs.writeFile(path.join(tmpDir, "user-preference.json"), "not-json", "utf8");
  await assert.rejects(
    async () => loadUserPreference(),
    (e: Error) => {
      assert.ok(e.message.includes("파싱 실패"), `메시지 확인: ${e.message}`);
      return true;
    },
  );
});

// 3. 누락 필드 (induty_whitelist 부재) → throw
test("loadUserPreference — induty_whitelist 누락 → throw schema validation", async () => {
  await fs.writeFile(
    path.join(tmpDir, "user-preference.json"),
    JSON.stringify({ induty_blacklist: [], updated_at: null }),
    "utf8",
  );
  await assert.rejects(
    async () => loadUserPreference(),
    (e: Error) => {
      assert.ok(
        e.message.includes("induty_whitelist"),
        `메시지 확인: ${e.message}`,
      );
      return true;
    },
  );
});

// 4. type 불일치 (induty_whitelist = string) → throw
test("loadUserPreference — induty_whitelist type 불일치 → throw schema validation", async () => {
  await fs.writeFile(
    path.join(tmpDir, "user-preference.json"),
    JSON.stringify({ induty_whitelist: "not-array", induty_blacklist: [], updated_at: null }),
    "utf8",
  );
  await assert.rejects(
    async () => loadUserPreference(),
    (e: Error) => {
      assert.ok(
        e.message.includes("induty_whitelist"),
        `메시지 확인: ${e.message}`,
      );
      return true;
    },
  );
});

// 5. save + load roundtrip + updated_at set
test("saveUserPreference — roundtrip 정합 + updated_at 자동 set", async () => {
  const pref: UserPreference = {
    induty_whitelist: ["64"],
    induty_blacklist: [],
    updated_at: null,
  };
  await saveUserPreference(pref);

  const loaded = await loadUserPreference();
  assert.deepEqual(loaded.induty_whitelist, ["64"]);
  assert.deepEqual(loaded.induty_blacklist, []);
  assert.notEqual(loaded.updated_at, null, "updated_at 자동 set 정합");
  assert.ok(typeof loaded.updated_at === "string");
});

// 6. addInduty 신설 — whitelist 등록
test("addInduty — whitelist 신설 등록", async () => {
  const result = await addInduty("123456", "whitelist");
  assert.deepEqual(result.induty_whitelist, ["123456"]);
  assert.deepEqual(result.induty_blacklist, []);

  const loaded = await loadUserPreference();
  assert.deepEqual(loaded.induty_whitelist, ["123456"]);
});

// 7. addInduty 중복 → idempotent
test("addInduty — 중복 호출 idempotent (list 길이 1 유지)", async () => {
  await addInduty("123456", "whitelist");
  const result = await addInduty("123456", "whitelist");
  assert.equal(result.induty_whitelist.length, 1);
});

// 8. whitelist + blacklist 동시 등록 (case 8 α)
test("addInduty — 양쪽 list 동시 등록 허용 (case 8 α)", async () => {
  await addInduty("123456", "whitelist");
  const result = await addInduty("123456", "blacklist");
  assert.equal(result.induty_whitelist.length, 1);
  assert.equal(result.induty_blacklist.length, 1);
  assert.equal(result.induty_whitelist[0], "123456");
  assert.equal(result.induty_blacklist[0], "123456");
});

// 9. removeInduty 부재 → idempotent
test("removeInduty — 부재 code idempotent", async () => {
  const result = await removeInduty("999999", "whitelist");
  assert.deepEqual(result.induty_whitelist, []);
});

// 10. removeInduty 정상 제거
test("removeInduty — 정상 제거", async () => {
  await addInduty("123456", "whitelist");
  const result = await removeInduty("123456", "whitelist");
  assert.deepEqual(result.induty_whitelist, []);

  const loaded = await loadUserPreference();
  assert.deepEqual(loaded.induty_whitelist, []);
});

// 11. addInduty empty code → throw
test("addInduty — empty code → throw", async () => {
  await assert.rejects(
    async () => addInduty("", "whitelist"),
    (e: Error) => {
      assert.ok(e.message.includes("Invalid induty_code"), `메시지 확인: ${e.message}`);
      return true;
    },
  );
});

// 12. addInduty invalid list → throw
test("addInduty — invalid list → throw", async () => {
  await assert.rejects(
    async () => addInduty("123456", "invalid" as IndutyList),
    (e: Error) => {
      assert.ok(e.message.includes("Invalid induty_list"), `메시지 확인: ${e.message}`);
      return true;
    },
  );
});
