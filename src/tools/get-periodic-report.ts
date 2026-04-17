/**
 * get_periodic_report — 정기보고서 주요정보 (DS002, 29개 엔드포인트 enum 압축)
 *
 * MCP 도구 폭발 방지를 위해 정기보고서 내 29개 섹션 조회를 `report_type` 파라미터로 단일화.
 * 매핑 출처: FinanceData/OpenDartReader (https://github.com/FinanceData/OpenDartReader/blob/master/dart_report.py)
 */

import { z } from "zod";
import { defineTool, resolveCorp } from "./_helpers.js";

const REPORT_CODE = {
  q1: "11013",
  half: "11012",
  q3: "11014",
  annual: "11011",
} as const;

// report_type → OpenDART 엔드포인트 파일 (확장자 .json 은 클라이언트에서 붙임)
const ENDPOINT: Record<string, string> = {
  // 주주/지분
  largest_shareholder: "hyslrSttus", // 최대주주 현황
  largest_shareholder_changes: "hyslrChgSttus", // 최대주주 변동
  minority_shareholders: "mrhlSttus", // 소액주주 현황
  total_stocks: "stockTotqySttus", // 주식의 총수 현황

  // 임직원
  executives: "exctvSttus", // 임원 현황
  employees: "empSttus", // 직원 현황
  outside_director_changes: "outcmpnyDrctrNdChangeSttus", // 사외이사·변동

  // 보수
  executive_compensation_total: "hmvAuditAllSttus", // 임원·감사 전체 보수
  executive_compensation_individual: "hmvAuditIndvdlBySttus", // 개인별 5억 이상
  individual_pay_top5: "indvdlByPay", // 상위 5명 개인별 보수
  unregistered_executive_comp: "unrstExctvMendngSttus", // 미등기임원 보수
  director_total_comp_approval: "drctrAdtAllMendngSttusGmtsckConfmAmount", // 주총 승인금액
  director_total_comp_by_type: "drctrAdtAllMendngSttusMendngPymntamtTyCl", // 유형별 지급금액

  // 회계감사
  auditor_opinion: "accnutAdtorNmNdAdtOpinion", // 회계감사인 및 의견
  audit_service_contract: "adtServcCnclsSttus", // 감사용역 체결현황
  non_audit_service_contract: "accnutAdtorNonAdtServcCnclsSttus", // 비감사용역 체결

  // 자본/주식
  capital_increase_decrease: "irdsSttus", // 증자(감자) 현황
  dividends: "alotMatter", // 배당
  treasury_stock: "tesstkAcqsDspsSttus", // 자기주식 취득·처분

  // 자금사용
  private_placement_fund_use: "prvsrpCptalUseDtls", // 사모자금 사용내역
  public_offering_fund_use: "pssrpCptalUseDtls", // 공모자금 사용내역

  // 타법인 출자
  other_company_investment: "otrCprInvstmntSttus", // 타법인 출자현황

  // 채무증권 발행/잔액
  debt_securities_issuance: "detScritsIsuAcmslt", // 채무증권 발행실적
  cp_unredeemed: "entrprsBilScritsNrdmpBlce", // 기업어음 미상환
  short_term_bond_unredeemed: "srtpdPsndbtNrdmpBlce", // 단기사채 미상환
  corp_bond_unredeemed: "cprndNrdmpBlce", // 회사채 미상환
  hybrid_capital_unredeemed: "newCaplScritsNrdmpBlce", // 신종자본증권 미상환
  contingent_capital_unredeemed: "cndlCaplScritsNrdmpBlce", // 조건부자본증권 미상환
};

const REPORT_TYPES = Object.keys(ENDPOINT) as [string, ...string[]];

const Input = z.object({
  corp: z.string().min(1).describe("회사명/종목코드/corp_code"),
  year: z.number().int().min(2015),
  report: z.enum(["q1", "half", "q3", "annual"]).default("annual"),
  report_type: z
    .enum(REPORT_TYPES)
    .describe(
      "섹션 29종: 주주(largest_shareholder·largest_shareholder_changes·minority_shareholders·total_stocks) / " +
        "임직원(executives·employees·outside_director_changes) / " +
        "보수(executive_compensation_total·executive_compensation_individual·individual_pay_top5·unregistered_executive_comp·director_total_comp_approval·director_total_comp_by_type) / " +
        "회계감사(auditor_opinion·audit_service_contract·non_audit_service_contract) / " +
        "자본(capital_increase_decrease·dividends·treasury_stock) / " +
        "자금사용(private_placement_fund_use·public_offering_fund_use) / " +
        "타법인출자(other_company_investment) / " +
        "채무증권(debt_securities_issuance·cp_unredeemed·short_term_bond_unredeemed·corp_bond_unredeemed·hybrid_capital_unredeemed·contingent_capital_unredeemed)",
    ),
});

export const getPeriodicReportTool = defineTool({
  name: "get_periodic_report",
  description:
    "사업보고서 내 29개 세부 섹션을 report_type enum 으로 단일 도구 호출. " +
    "예: 최대주주 현황·임원 보수·감사인·배당·자기주식·회사채 미상환 등. " +
    "(정기보고서 전체 원문이 필요하면 download_document.)",
  input: Input,
  handler: async (ctx, args) => {
    const endpoint = ENDPOINT[args.report_type];
    if (!endpoint) {
      throw new Error(`알 수 없는 report_type: ${args.report_type}`);
    }
    const record = resolveCorp(ctx.resolver, args.corp);
    const raw = await ctx.client.getJson<{
      status: string;
      message: string;
      list?: Array<Record<string, string>>;
    }>(`${endpoint}.json`, {
      corp_code: record.corp_code,
      bsns_year: String(args.year),
      reprt_code: REPORT_CODE[args.report],
    });
    if (raw.status !== "000") {
      throw new Error(`DART 응답 오류 [${raw.status}]: ${raw.message}`);
    }
    return {
      resolved: record,
      year: args.year,
      report: args.report,
      report_type: args.report_type,
      endpoint,
      count: raw.list?.length ?? 0,
      items: raw.list ?? [],
    };
  },
});
