import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getConfigDir } from "./config-store.js";

export type IndutyList = "whitelist" | "blacklist";

export interface UserPreference {
  induty_whitelist: string[];
  induty_blacklist: string[];
  updated_at: string | null; // ISO8601
}

function getUserPreferencePath(): string {
  return path.join(getConfigDir(), "user-preference.json");
}

export async function loadUserPreference(): Promise<UserPreference> {
  const p = getUserPreferencePath();

  let raw: string;
  try {
    raw = await fs.readFile(p, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return { induty_whitelist: [], induty_blacklist: [], updated_at: null };
    }
    throw e;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`user-preference.json 파싱 실패: ${e}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid user preference schema: not an object");
  }
  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj["induty_whitelist"])) {
    throw new Error("Invalid user preference schema: induty_whitelist");
  }
  if (!Array.isArray(obj["induty_blacklist"])) {
    throw new Error("Invalid user preference schema: induty_blacklist");
  }
  if ((obj["induty_whitelist"] as unknown[]).some((x) => typeof x !== "string")) {
    throw new Error("Invalid user preference schema: induty_whitelist item type");
  }
  if ((obj["induty_blacklist"] as unknown[]).some((x) => typeof x !== "string")) {
    throw new Error("Invalid user preference schema: induty_blacklist item type");
  }
  if (!("updated_at" in obj) || (typeof obj["updated_at"] !== "string" && obj["updated_at"] !== null)) {
    throw new Error("Invalid user preference schema: updated_at");
  }

  return {
    induty_whitelist: obj["induty_whitelist"] as string[],
    induty_blacklist: obj["induty_blacklist"] as string[],
    updated_at: obj["updated_at"] as string | null,
  };
}

export async function saveUserPreference(pref: UserPreference): Promise<void> {
  pref.updated_at = new Date().toISOString();
  await fs.mkdir(getConfigDir(), { recursive: true });
  const p = getUserPreferencePath();
  await fs.writeFile(p + ".tmp", JSON.stringify(pref, null, 2) + "\n", "utf8");
  await fs.rename(p + ".tmp", p);
}

export async function addInduty(code: string, list: IndutyList): Promise<UserPreference> {
  if (code.trim().length === 0) {
    throw new Error("Invalid induty_code: empty");
  }
  if (list !== "whitelist" && list !== "blacklist") {
    throw new Error("Invalid induty_list");
  }

  const pref = await loadUserPreference();
  const key = list === "whitelist" ? "induty_whitelist" : "induty_blacklist";

  if (pref[key].includes(code)) {
    return pref;
  }
  pref[key].push(code);
  await saveUserPreference(pref);
  return pref;
}

export async function removeInduty(code: string, list: IndutyList): Promise<UserPreference> {
  if (code.trim().length === 0) {
    throw new Error("Invalid induty_code: empty");
  }
  if (list !== "whitelist" && list !== "blacklist") {
    throw new Error("Invalid induty_list");
  }

  const pref = await loadUserPreference();
  const key = list === "whitelist" ? "induty_whitelist" : "induty_blacklist";

  if (!pref[key].includes(code)) {
    return pref;
  }
  pref[key] = pref[key].filter((x) => x !== code);
  await saveUserPreference(pref);
  return pref;
}
