/**
 * get_shareholders — 지배구조 4개 섹션을 병렬로 합성해 단일 뷰로 반환
 *
 * 정기보고서 내 지배구조 관련 4개 섹션을 한 번의 도구 호출로 수집.
 *  - 최대주주 현황 (hyslrSttus)
 *  - 최대주주 변동 (hyslrChgSttus)
 *  - 소액주주 현황 (mrhlSttus)
 *  - 주식의 총수 (stockTotqySttus)
 *
 * 같은 기간을 get_periodic_report 로 4번 호출하는 것 대비 1/4 왕복.
 * 섹션 단일 조회가 필요하면 get_periodic_report.
 */

import { z } from "zod";
import { defineTool, resolveCorp } from "./_helpers.js";

const REPORT_CODE = {
  q1: "11013",
  half: "11012",
  q3: "11014",
  annual: "11011",
} as const;

const SECTIONS = {
  largest_shareholder: "hyslrSttus",
  largest_shareholder_changes: "hyslrChgSttus",
  minority_shareholders: "mrhlSttus",
  total_stocks: "stockTotqySttus",
} as const;

type SectionKey = keyof typeof SECTIONS;

const Input = z.object({
  corp: z.string().min(1).describe("회사명/종목코드/corp_code"),
  year: z.number().int().min(2015),
  report: z.enum(["q1", "half", "q3", "annual"]).default("annual"),
  sections: z
    .array(z.enum(Object.keys(SECTIONS) as [SectionKey, ...SectionKey[]]))
    .optional()
    .describe("조회할 섹션 (미지정 시 4개 모두)"),
});

interface DartListResp {
  status: string;
  message: string;
  list?: Array<Record<string, string>>;
}

export const getShareholdersTool = defineTool({
  name: "get_shareholders",
  description:
    "지배구조 스냅샷: 최대주주·변동·소액주주·주식총수 4개 섹션을 한 번에 합성 조회. " +
    "(특정 섹션만 필요하면 get_periodic_report 로 단일 조회 가능.)",
  input: Input,
  handler: async (ctx, args) => {
    const record = resolveCorp(ctx.resolver, args.corp);
    const reprt_code = REPORT_CODE[args.report];
    const bsns_year = String(args.year);
    const targets = (args.sections ?? (Object.keys(SECTIONS) as SectionKey[]));

    const results = await Promise.all(
      targets.map(async (key) => {
        const endpoint = SECTIONS[key];
        try {
          const raw = await ctx.client.getJson<DartListResp>(`${endpoint}.json`, {
            corp_code: record.corp_code,
            bsns_year,
            reprt_code,
          });
          if (raw.status !== "000") {
            return {
              section: key,
              endpoint,
              status: raw.status,
              message: raw.message,
              items: [] as Array<Record<string, string>>,
            };
          }
          return {
            section: key,
            endpoint,
            status: raw.status,
            count: raw.list?.length ?? 0,
            items: raw.list ?? [],
          };
        } catch (e) {
          return {
            section: key,
            endpoint,
            error: e instanceof Error ? e.message : String(e),
            items: [] as Array<Record<string, string>>,
          };
        }
      }),
    );

    return {
      resolved: record,
      year: args.year,
      report: args.report,
      sections: results,
    };
  },
});
