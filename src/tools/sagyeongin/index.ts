/**
 * 사경인 도구 레지스트리
 *
 * 사경인 회계사 투자 철학 기반 한국 주식 스크리닝 도구.
 * 새 도구는 `src/tools/sagyeongin/<tool-name>.ts`에 1파일 평면으로 추가한다.
 *
 * Ref: docs/sagyeongin/CLAUDE.md, ADR-0001
 */

import type { ToolDef } from "../_helpers.js";
import { updateWatchlistTool } from "./update-watchlist.js";
import { updateScanPresetTool } from "./update-scan-preset.js";
import { requiredReturnTool } from "./required-return.js";
import { srimTool } from "./srim.js";
import { killerCheckTool } from "./killer-check.js";
import { cashflowCheckTool } from "./cashflow-check.js";
import { capexSignalTool } from "./capex-signal.js";
import { dividendCheckTool } from "./dividend-check.js";
import { scanPreviewTool } from "./scan-preview.js";

export const sagyeonginTools: ToolDef[] = [
  updateWatchlistTool,
  updateScanPresetTool,
  requiredReturnTool,
  srimTool,
  killerCheckTool,
  cashflowCheckTool,
  capexSignalTool,
  dividendCheckTool,
  scanPreviewTool,
];
