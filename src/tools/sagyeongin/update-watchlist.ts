/**
 * sagyeongin_update_watchlist — 관심 종목 watchlist CRUD.
 *
 * 4 action: add / remove / list / update_tags.
 * corp_code → name 변환은 ctx.resolver.byCorpCode 직접 호출 (격리 정합).
 *
 * Ref: spec §6.2 (watchlist 스키마), §10.10 (도구 명세), philosophy 7부 G (자산 형성기 관심 종목)
 */

import { z } from "zod";
import { defineTool } from "../_helpers.js";
import {
  loadConfig,
  saveConfig,
  type WatchlistEntry,
} from "./_lib/config-store.js";

const Input = z.object({
  action: z.enum(["add", "remove", "list", "update_tags"]),
  corp_codes: z.array(z.string().regex(/^\d{8}$/)).optional()
    .describe("8자리 corp_code 배열. add/remove/update_tags에서 필수."),
  tags: z.array(z.string()).optional()
    .describe("태그 배열. add/update_tags에서 사용."),
  notes: z.string().optional()
    .describe("메모. add/update_tags에서 사용."),
});

export const updateWatchlistTool = defineTool({
  name: "sagyeongin_update_watchlist",
  description:
    "관심 종목 watchlist를 관리한다. action: add(종목 추가) | " +
    "remove(종목 제거) | list(목록 조회) | update_tags(태그·메모 갱신). " +
    "갱신된 watchlist 전체를 반환한다. " +
    "Ref: spec §10.10",
  input: Input,
  handler: async (ctx, args) => {
    const config = await loadConfig();

    switch (args.action) {
      case "list":
        return { watchlist: config.watchlist };

      case "add": {
        if (!args.corp_codes || args.corp_codes.length === 0) {
          throw new Error("add는 corp_codes가 필수입니다");
        }
        // 전수 검증 후 일괄 push — 부분 실패 방지
        const toAdd: WatchlistEntry[] = [];
        for (const corp_code of args.corp_codes) {
          const alreadyExists = config.watchlist.some(
            (entry) => entry.corp_code === corp_code,
          );
          if (alreadyExists) {
            throw new Error(
              `이미 watchlist에 있습니다: ${corp_code}. update_tags로 갱신하세요.`,
            );
          }
          const record = ctx.resolver.byCorpCode(corp_code);
          if (!record) {
            throw new Error(`corp_code를 찾을 수 없습니다: ${corp_code}`);
          }
          const entry: WatchlistEntry = {
            corp_code,
            name: record.corp_name,
            added_at: new Date().toISOString().slice(0, 10),
            tags: args.tags ?? [],
            ...(args.notes !== undefined ? { notes: args.notes } : {}),
          };
          toAdd.push(entry);
        }
        config.watchlist.push(...toAdd);
        await saveConfig(config);
        return { watchlist: config.watchlist };
      }

      case "remove": {
        if (!args.corp_codes || args.corp_codes.length === 0) {
          throw new Error("remove는 corp_codes가 필수입니다");
        }
        const removeSet = new Set(args.corp_codes);
        config.watchlist = config.watchlist.filter(
          (entry) => !removeSet.has(entry.corp_code),
        );
        await saveConfig(config);
        return { watchlist: config.watchlist };
      }

      case "update_tags": {
        if (!args.corp_codes || args.corp_codes.length === 0) {
          throw new Error("update_tags는 corp_codes가 필수입니다");
        }
        if (args.tags === undefined && args.notes === undefined) {
          throw new Error("update_tags는 tags 또는 notes 중 하나 이상 필요");
        }
        // 전수 존재 검증 후 일괄 갱신 — 부분 실패 방지
        const entries = args.corp_codes.map((corp_code) => {
          const entry = config.watchlist.find((e) => e.corp_code === corp_code);
          if (!entry) {
            throw new Error(
              `watchlist에 없습니다: ${corp_code}. add를 먼저 실행하세요.`,
            );
          }
          return entry;
        });
        for (const entry of entries) {
          if (args.tags !== undefined) entry.tags = args.tags;
          if (args.notes !== undefined) entry.notes = args.notes;
        }
        await saveConfig(config);
        return { watchlist: config.watchlist };
      }
    }
  },
});
