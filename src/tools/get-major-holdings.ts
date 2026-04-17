/**
 * get_major_holdings — DS004 지분공시 2개 엔드포인트 합성
 *
 *  - majorstock.json : 대량보유 상황보고 (5% 룰)
 *  - elestock.json   : 임원·주요주주 소유보고
 *
 * 두 테이블 모두 특정 사업연도·보고서 코드 파라미터 없이 corp_code 만으로 동작.
 * 두 관점(외부 5%+ 주주 vs 임원 본인 보유)을 한 번에 묶어 지분 구조 전체 뷰 제공.
 */

import { z } from "zod";
import { defineTool, resolveCorp } from "./_helpers.js";

const Input = z.object({
  corp: z.string().min(1).describe("회사명/종목코드/corp_code"),
  include: z
    .array(z.enum(["majorstock", "elestock"]))
    .optional()
    .describe("조회 대상 (미지정 시 둘 다). majorstock=대량보유 5%룰, elestock=임원·주요주주 본인 보유"),
});

interface DartListResp {
  status: string;
  message: string;
  list?: Array<Record<string, string>>;
}

export const getMajorHoldingsTool = defineTool({
  name: "get_major_holdings",
  description:
    "지분공시 2종 합성 조회: 대량보유(5%룰) + 임원·주요주주 본인 소유. " +
    "내부자·외부 대주주 지분 이력을 한 번에 스냅샷.",
  input: Input,
  handler: async (ctx, args) => {
    const record = resolveCorp(ctx.resolver, args.corp);
    const targets = args.include ?? (["majorstock", "elestock"] as const);

    const results = await Promise.all(
      targets.map(async (kind) => {
        try {
          const raw = await ctx.client.getJson<DartListResp>(`${kind}.json`, {
            corp_code: record.corp_code,
          });
          if (raw.status !== "000") {
            return {
              kind,
              status: raw.status,
              message: raw.message,
              items: [] as Array<Record<string, string>>,
            };
          }
          return {
            kind,
            status: raw.status,
            count: raw.list?.length ?? 0,
            items: raw.list ?? [],
          };
        } catch (e) {
          return {
            kind,
            error: e instanceof Error ? e.message : String(e),
            items: [] as Array<Record<string, string>>,
          };
        }
      }),
    );

    return {
      resolved: record,
      results,
    };
  },
});
