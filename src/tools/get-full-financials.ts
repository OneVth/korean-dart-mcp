/**
 * get_full_financials — 전체 재무제표 (fnlttSinglAcntAll)
 *
 * 주요계정(get_financials, 8~10개)이 아닌 전체 계정 상세. 수백~천여 행 반환 가능.
 * 연결/별도를 fs_div 로 선택.
 *
 * 참고: https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS003&apiId=2019020
 */

import { z } from "zod";
import { defineTool, resolveCorp } from "./_helpers.js";

const REPORT_CODE = {
  q1: "11013",
  half: "11012",
  q3: "11014",
  annual: "11011",
} as const;

const FS_DIV = {
  consolidated: "CFS", // 연결재무제표
  separate: "OFS", // 별도(개별)재무제표
} as const;

const Input = z.object({
  corp: z.string().min(1).describe("회사명/종목코드/corp_code"),
  year: z.number().int().min(2015),
  report: z.enum(["q1", "half", "q3", "annual"]).default("annual"),
  fs: z
    .enum(["consolidated", "separate"])
    .default("consolidated")
    .describe("consolidated(연결, CFS) / separate(별도, OFS)"),
});

export const getFullFinancialsTool = defineTool({
  name: "get_full_financials",
  description:
    "재무제표 전체 계정을 조회합니다 (BS/IS/CF/CIS/SCE 합산 수백~천여 행). " +
    "주요 계정만 필요하면 get_financials 가 더 경제적. fs_div 로 연결/별도 선택.",
  input: Input,
  handler: async (ctx, args) => {
    const record = resolveCorp(ctx.resolver, args.corp);
    const raw = await ctx.client.getJson<{
      status: string;
      message: string;
      list?: Array<Record<string, string>>;
    }>("fnlttSinglAcntAll.json", {
      corp_code: record.corp_code,
      bsns_year: String(args.year),
      reprt_code: REPORT_CODE[args.report],
      fs_div: FS_DIV[args.fs],
    });
    if (raw.status !== "000") {
      throw new Error(`DART 응답 오류 [${raw.status}]: ${raw.message}`);
    }
    return {
      resolved: record,
      year: args.year,
      report: args.report,
      fs: args.fs,
      count: raw.list?.length ?? 0,
      items: raw.list ?? [],
    };
  },
});
