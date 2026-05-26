import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleUserPreference } from "./user-preference.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "user-preference-test-"));
  process.env.SAGYEONGIN_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  delete process.env.SAGYEONGIN_CONFIG_DIR;
  await rm(tmpDir, { recursive: true, force: true });
});

test("handleUserPreference get returns default empty preference", async () => {
  const result = await handleUserPreference({ action: "get" });
  assert.deepEqual(result.induty_whitelist, []);
  assert.deepEqual(result.induty_blacklist, []);
  assert.equal(result.updated_at, null);
});

test("handleUserPreference add registers induty to whitelist", async () => {
  const result = await handleUserPreference({
    action: "add",
    induty_code: "123456",
    induty_list: "whitelist",
  });
  assert.deepEqual(result.induty_whitelist, ["123456"]);
  assert.deepEqual(result.induty_blacklist, []);
  assert.notEqual(result.updated_at, null);
});

test("handleUserPreference add throws when induty_list missing", async () => {
  await assert.rejects(
    handleUserPreference({ action: "add", induty_code: "123456" }),
    /induty_code and induty_list required/
  );
});

test("handleUserPreference add throws when induty_code missing", async () => {
  await assert.rejects(
    handleUserPreference({ action: "add", induty_list: "whitelist" }),
    /induty_code and induty_list required/
  );
});

test("handleUserPreference remove deletes induty from whitelist", async () => {
  await handleUserPreference({
    action: "add",
    induty_code: "123456",
    induty_list: "whitelist",
  });
  const result = await handleUserPreference({
    action: "remove",
    induty_code: "123456",
    induty_list: "whitelist",
  });
  assert.deepEqual(result.induty_whitelist, []);
});

test("handleUserPreference remove throws when induty_list missing", async () => {
  await assert.rejects(
    handleUserPreference({ action: "remove", induty_code: "123456" }),
    /induty_code and induty_list required/
  );
});
