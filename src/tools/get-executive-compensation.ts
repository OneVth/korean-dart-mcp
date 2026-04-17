/**
 * get_executive_compensation — 임원 보수 6개 섹션 병렬 합성
 *
 *  - 전체 보수 (hmvAuditAllSttus)
 *  - 개인별 5억 이상 (hmvAuditIndvdlBySttus)
 *  - 상위 5명 (indvdlByPay)
 *  - 미등기 임원 (unrstExctvMendngSttus)
 *  - 주총 승인금액 (drctrAdtAllMendngSttusGmtsckConfmAmount)
 *  - 유형별 지급금액 (drctrAdtAllMendngSttusMendngPymntamtTyCl)
 *
 * "이 회사 연봉 구조 다 보여줘" 를 1회 호출로.
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
  total: "hmvAuditAllSttus",
  individual_5eok: "hmvAuditIndvdlBySttus",
  top5: "indvdlByPay",
  unregistered: "unrstExctvMendngSttus",
  approval_limit: "drctrAdtAllMendngSttusGmtsckConfmAmount",
  by_type: "drctrAdtAllMendngSttusMendngPymntamtTyCl",
} as const;

type SectionKey = keyof typeof SECTIONS;

const Input = z.object({
  corp: z.string().min(1).describe("회사명/종목코드/corp_code"),
  year: z.number().int().min(2015),
  report: z.enum(["q1", "half", "q3", "annual"]).default("annual"),
  sections: z
    .array(z.enum(Object.keys(SECTIONS) as [SectionKey, ...SectionKey[]]))
    .optional()
    .describe(
      "조회할 섹션 (미지정 시 6개 모두). total=전체 평균, individual_5eok=개인별 5억↑, top5=상위 5인, unregistered=미등기 임원, approval_limit=주총 승인한도, by_type=직책별 지급금액",
    ),
});

interface DartListResp {
  status: string;
  message: string;
  list?: Array<Record<string, string>>;
}

export const getExecutiveCompensationTool = defineTool({
  name: "get_executive_compensation",
  description:
    "임원 보수 6개 섹션을 한 번에 합성 조회: 전체·개인별 5억 이상·상위 5인·미등기·주총 승인금액·유형별. " +
    "(단일 섹션은 get_periodic_report 로도 조회 가능.)",
  input: Input,
  handler: async (ctx, args) => {
    const record = resolveCorp(ctx.resolver, args.corp);
    const reprt_code = REPORT_CODE[args.report];
    const bsns_year = String(args.year);
    const targets = args.sections ?? (Object.keys(SECTIONS) as SectionKey[]);

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
