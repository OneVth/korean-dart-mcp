/**
 * sagyeongin_update_scan_preset — 스캔 프리셋 CRUD + active 관리.
 *
 * 5 action: create / update / delete / list / set_active.
 * update는 부분 patch (G1). active 프리셋 delete는 throw (H1).
 *
 * Ref: spec §6.2 (scan_presets 스키마), §10.11 (도구 명세), philosophy 7부 (스캔 범위 = 관심 분야 선택)
 */

import { z } from "zod";
import { defineTool } from "../_helpers.js";
import {
  loadConfig,
  saveConfig,
  type ScanPreset,
} from "./_lib/config-store.js";

const PresetConfig = z.object({
  markets: z.array(z.enum(["KOSPI", "KOSDAQ"])).optional(),
  included_industries: z.array(z.string()).optional(),
  excluded_industries: z.array(z.string()).optional(),
  excluded_name_patterns: z.array(z.string()).optional(),
});

const Input = z.object({
  action: z.enum(["create", "update", "delete", "list", "set_active"]),
  preset_name: z.string().min(1).optional(),
  config: PresetConfig.optional(),
});

export const updateScanPresetTool = defineTool({
  name: "sagyeongin_update_scan_preset",
  description:
    "스캔 프리셋을 관리한다. action: create(신규) | update(부분 갱신) | " +
    "delete(삭제) | list(목록 조회) | set_active(활성 프리셋 변경). " +
    "갱신된 scan_presets 전체를 반환한다. " +
    "Ref: spec §10.11",
  input: Input,
  handler: async (_ctx, args) => {
    const config = await loadConfig();

    switch (args.action) {
      case "list":
        return {
          scan_presets: config.scan_presets,
          active_preset: config.active_preset,
        };

      case "create": {
        if (!args.preset_name) {
          throw new Error("create는 preset_name 필수");
        }
        if (!args.config) {
          throw new Error("create는 config 필수");
        }
        if (config.scan_presets[args.preset_name] !== undefined) {
          throw new Error(
            `이미 존재하는 프리셋: ${args.preset_name}. update를 사용하세요.`,
          );
        }
        config.scan_presets[args.preset_name] = { ...args.config } as ScanPreset;
        await saveConfig(config);
        return {
          scan_presets: config.scan_presets,
          active_preset: config.active_preset,
        };
      }

      case "update": {
        if (!args.preset_name) {
          throw new Error("update는 preset_name 필수");
        }
        if (config.scan_presets[args.preset_name] === undefined) {
          throw new Error(`존재하지 않는 프리셋: ${args.preset_name}`);
        }
        if (!args.config) {
          throw new Error("update는 config 필수");
        }
        const existing = config.scan_presets[args.preset_name];
        const patched: ScanPreset = { ...existing };
        if (args.config.markets !== undefined) patched.markets = args.config.markets;
        if (args.config.included_industries !== undefined) patched.included_industries = args.config.included_industries;
        if (args.config.excluded_industries !== undefined) patched.excluded_industries = args.config.excluded_industries;
        if (args.config.excluded_name_patterns !== undefined) patched.excluded_name_patterns = args.config.excluded_name_patterns;
        config.scan_presets[args.preset_name] = patched;
        await saveConfig(config);
        return {
          scan_presets: config.scan_presets,
          active_preset: config.active_preset,
        };
      }

      case "delete": {
        if (!args.preset_name) {
          throw new Error("delete는 preset_name 필수");
        }
        if (config.scan_presets[args.preset_name] === undefined) {
          throw new Error(`존재하지 않는 프리셋: ${args.preset_name}`);
        }
        if (args.preset_name === config.active_preset) {
          throw new Error(
            `active 프리셋은 삭제 불가: ${args.preset_name}. set_active로 다른 프리셋 활성화 후 시도하세요.`,
          );
        }
        delete config.scan_presets[args.preset_name];
        await saveConfig(config);
        return {
          scan_presets: config.scan_presets,
          active_preset: config.active_preset,
        };
      }

      case "set_active": {
        if (!args.preset_name) {
          throw new Error("set_active는 preset_name 필수");
        }
        if (config.scan_presets[args.preset_name] === undefined) {
          throw new Error(
            `존재하지 않는 프리셋: ${args.preset_name}. create를 먼저 실행하세요.`,
          );
        }
        config.active_preset = args.preset_name;
        await saveConfig(config);
        return {
          scan_presets: config.scan_presets,
          active_preset: config.active_preset,
        };
      }
    }
  },
});
