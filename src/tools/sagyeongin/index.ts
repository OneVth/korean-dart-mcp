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

export const sagyeonginTools: ToolDef[] = [
  updateWatchlistTool,
];
