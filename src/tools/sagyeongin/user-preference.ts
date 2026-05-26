import { z } from "zod";
import { defineTool } from "../_helpers.js";
import type { ToolDef, ToolCtx } from "../_helpers.js";
import {
  loadUserPreference,
  addInduty,
  removeInduty,
  type UserPreference,
} from "./_lib/user-preference-store.js";

const Input = z.object({
  action: z.enum(["get", "add", "remove"]),
  induty_code: z.string().optional(),
  induty_list: z.enum(["whitelist", "blacklist"]).optional(),
});

type InputArgs = z.infer<typeof Input>;

export async function handleUserPreference(args: InputArgs): Promise<UserPreference> {
  switch (args.action) {
    case "get":
      return await loadUserPreference();

    case "add": {
      if (!args.induty_code || !args.induty_list) {
        throw new Error("induty_code and induty_list required for add action");
      }
      return await addInduty(args.induty_code, args.induty_list);
    }

    case "remove": {
      if (!args.induty_code || !args.induty_list) {
        throw new Error("induty_code and induty_list required for remove action");
      }
      return await removeInduty(args.induty_code, args.induty_list);
    }
  }
}

export const userPreferenceTool: ToolDef = defineTool({
  name: "sagyeongin_user_preference",
  description:
    "사용자 선호 induty 저장 / 회수 — 7부 A 사전 솎아내기. action: get (전체 회수) / add (induty 추가) / remove (induty 제거). induty_list: whitelist (선호) / blacklist (제외).",
  input: Input,
  handler: async (_ctx: ToolCtx, args: InputArgs): Promise<UserPreference> => {
    return await handleUserPreference(args);
  },
});
