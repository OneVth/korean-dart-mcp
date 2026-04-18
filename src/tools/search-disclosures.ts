/**
 * search_disclosures — 공시 검색 + 프리셋 배치 + 페이지 병렬화
 *
 * 세 모드 지원:
 *   1. 페이지 모드 (기본): 단일 페이지 (page+size)
 *   2. 프리셋 모드: `preset` 지정 → DART pblntf_ty + report_nm 정규식 자동 + 전량 수집
 *   3. 전량 모드: `all_pages: true` → 필터 없이 기간 전체 병렬 수집
 *
 * 페이지 병렬화: 1페이지 먼저 → total_page 확인 → 나머지 병렬 (동시 5개)
 * 기존 list_recent_filings 는 이 도구의 preset 모드로 흡수.
 *
 * 참고: https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019018
 */

import { z } from "zod";
import { defineTool, normalizeDate, resolveCorp } from "./_helpers.js";
import type { DartClient } from "../lib/dart-client.js";

// OpenDART 공시유형 (pblntf_ty) — enum 노출용 별칭
const KIND_MAP = {
  periodic: "A",
  major: "B",
  issuance: "C",
  holdings: "D",
  other: "E",
  audit: "F",
  fund: "G",
  abs: "H",
  exchange: "I",
  ftc: "J",
} as const;

interface Preset {
  kind: string | null;
  keyword: RegExp | null;
  label: string;
}

const PRESETS: Record<string, Preset> = {
  // 자기주식
  treasury_buy: { kind: "B", keyword: /자기주식.*취득/, label: "자기주식 취득 결정" },
  treasury_sell: { kind: "B", keyword: /자기주식.*처분/, label: "자기주식 처분 결정" },
  treasury_trust: { kind: "B", keyword: /자기주식.*신탁/, label: "자기주식 신탁 계약" },
  // 사채 발행
  cb_issue: { kind: "B", keyword: /전환사채/, label: "전환사채(CB) 발행결정" },
  bw_issue: { kind: "B", keyword: /신주인수권부사채/, label: "신주인수권부사채(BW) 발행결정" },
  eb_issue: { kind: "B", keyword: /교환사채/, label: "교환사채(EB) 발행결정" },
  // 자본 증감
  rights_offering: { kind: "B", keyword: /유상증자/, label: "유상증자 결정" },
  bonus_issue: { kind: "B", keyword: /무상증자/, label: "무상증자 결정" },
  capital_reduction: { kind: "B", keyword: /감자/, label: "감자 결정" },
  // 지배구조
  merger: { kind: "B", keyword: /합병/, label: "합병 결정" },
  split: { kind: "B", keyword: /분할/, label: "분할 결정" },
  stock_exchange: { kind: "B", keyword: /주식교환|주식이전/, label: "주식교환·이전" },
  // 양수도
  business_transfer: { kind: "B", keyword: /영업양도/, label: "영업양도" },
  business_acquisition: { kind: "B", keyword: /영업양수/, label: "영업양수" },
  // 지분
  large_holding_5pct: { kind: "D", keyword: null, label: "지분공시 전체(5%룰+임원지분)" },
  // 정기공시
  annual_report: { kind: "A", keyword: /사업보고서/, label: "사업보고서" },
  half_report: { kind: "A", keyword: /반기보고서/, label: "반기보고서" },
  quarterly_report: { kind: "A", keyword: /분기보고서/, label: "분기보고서" },
  // 감사
  audit_report: { kind: "F", keyword: null, label: "외부감사 관련 공시 전체" },
  // 정정
  correction_all: {
    kind: null,
    keyword: /\[기재정정\]|\[첨부정정\]|\[첨부추가\]/,
    label: "정정공시 전체",
  },
  // 부실/소송
  insolvency: {
    kind: "B",
    keyword: /부도발생|영업정지|회생절차|해산사유|채권은행/,
    label: "부실·법적 리스크",
  },
  litigation: { kind: "B", keyword: /소송/, label: "소송 제기" },
};
const PRESET_KEYS = Object.keys(PRESETS) as [string, ...string[]];

const Input = z.object({
  corp: z.string().optional().describe("회사명/종목코드/corp_code. 생략 시 전체"),
  begin: z.string().optional().describe("시작일 YYYY-MM-DD (생략 시 기본값)"),
  end: z.string().optional().describe("종료일 (생략 시 오늘)"),
  days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe("begin 대신 오늘 기준 과거 N일 (preset 모드 기본 7, 일반 90)"),
  kind: z
    .enum(Object.keys(KIND_MAP) as [keyof typeof KIND_MAP, ...(keyof typeof KIND_MAP)[]])
    .optional()
    .describe(
      "공시유형: periodic/major/issuance/holdings/audit/other/fund/abs/exchange/ftc",
    ),
  preset: z
    .enum(PRESET_KEYS)
    .optional()
    .describe(
      "프리셋 22종: treasury_buy/sell/trust · cb/bw/eb_issue · rights_offering/bonus_issue/capital_reduction · merger/split/stock_exchange · business_transfer/acquisition · large_holding_5pct · annual_report/half_report/quarterly_report · audit_report · correction_all · insolvency · litigation. 지정 시 kind·키워드 자동 + 전량 페이지 병렬 수집.",
    ),
  final_only: z.boolean().default(false).describe("최종보고서만 (정정공시 제외)"),
  include_corrections: z
    .boolean()
    .default(false)
    .describe("정정공시 포함 (preset 모드 전용). correction_all 은 자동 true."),
  all_pages: z
    .boolean()
    .default(false)
    .describe("preset 없이도 기간 전체를 병렬 수집. true 시 page/size 대신 limit 적용."),
  page: z.number().int().min(1).default(1).describe("페이지 모드 시 페이지 번호"),
  size: z.number().int().min(1).max(100).default(20).describe("페이지 모드 시 페이지 크기"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(3000)
    .default(500)
    .describe("배치 모드 최종 반환 개수 상한"),
  concurrency: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .describe(
      "배치 모드 페이지 병렬 동시성 (1~10, 기본 5). 높이면 빠르지만 DART 일일 20,000건 한도/분당 쿼터 근접 위험.",
    ),
});

interface ListItem {
  rcept_no: string;
  corp_cls: string;
  corp_name: string;
  corp_code: string;
  report_nm: string;
  rcept_dt: string;
  flr_nm?: string;
  rm?: string;
  [k: string]: string | undefined;
}

interface DartListResp {
  status: string;
  message: string;
  page_no?: number;
  page_count?: number;
  total_count?: number;
  total_page?: number;
  list?: ListItem[];
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
}

/** total_page 파악 후 2..N 페이지 병렬 수집 (동시성 제한). */
async function fetchAllPages(
  client: DartClient,
  baseParams: Record<string, string | number | undefined>,
  concurrency = 5,
): Promise<{ items: ListItem[]; totalPages: number }> {
  const first = await client.getJson<DartListResp>("list.json", {
    ...baseParams,
    page_no: 1,
    page_count: 100,
  });
  if (first.status === "013") return { items: [], totalPages: 0 };
  if (first.status !== "000") {
    throw new Error(`DART list 오류 [${first.status}]: ${first.message}`);
  }
  const items: ListItem[] = [...(first.list ?? [])];
  const totalPages = Math.min(first.total_page ?? 1, 30); // 상한 30 페이지(=3000건)
  if (totalPages <= 1) return { items, totalPages };

  const pages: number[] = [];
  for (let p = 2; p <= totalPages; p++) pages.push(p);

  for (let i = 0; i < pages.length; i += concurrency) {
    const batch = pages.slice(i, i + concurrency);
    const responses = await Promise.all(
      batch.map((p) =>
        client.getJson<DartListResp>("list.json", {
          ...baseParams,
          page_no: p,
          page_count: 100,
        }),
      ),
    );
    for (const r of responses) {
      if (r.status === "000") items.push(...(r.list ?? []));
    }
  }
  return { items, totalPages };
}

export const searchDisclosuresTool = defineTool({
  name: "search_disclosures",
  description:
    "DART 공시 검색 (3 모드): " +
    "기본(단일 페이지, page+size), preset(22개 프리셋 자동 필터+전량 병렬), all_pages(프리셋 없이 기간 전체 병렬). " +
    "rcp_no(rcept_no) 로 download_document / get_attachments 연동.",
  input: Input,
  handler: async (ctx, args) => {
    const isBatch = Boolean(args.preset) || args.all_pages;

    // 기간 기본값
    const defaultDays = args.preset ? 7 : 90;
    const end_de = args.end ? normalizeDate(args.end) : ymd(new Date());
    const bgn_de = args.begin
      ? normalizeDate(args.begin)
      : daysAgo(args.days ?? defaultDays);

    // corp 해석
    let corp_code: string | undefined;
    let resolved: { corp_code: string; corp_name: string } | null = null;
    if (args.corp) {
      const r = resolveCorp(ctx.resolver, args.corp);
      corp_code = r.corp_code;
      resolved = { corp_code: r.corp_code, corp_name: r.corp_name };
    }

    // 프리셋 적용 → kind 자동
    const preset = args.preset ? PRESETS[args.preset] : null;
    const pblntf_ty =
      preset?.kind ?? (args.kind ? KIND_MAP[args.kind] : undefined);

    const baseParams: Record<string, string | number | undefined> = {
      corp_code,
      bgn_de,
      end_de,
      pblntf_ty,
      last_reprt_at: args.final_only ? "Y" : undefined,
    };

    if (!isBatch) {
      // === 단일 페이지 모드 ===
      const raw = await ctx.client.getJson<DartListResp>("list.json", {
        ...baseParams,
        page_no: args.page,
        page_count: args.size,
      });
      if (raw.status === "013") {
        return {
          mode: "page",
          period: { start: bgn_de, end: end_de },
          corp: resolved,
          total_count: 0,
          page: args.page,
          total_pages: 0,
          items: [],
        };
      }
      if (raw.status !== "000") {
        throw new Error(`DART 응답 오류 [${raw.status}]: ${raw.message}`);
      }
      return {
        mode: "page",
        period: { start: bgn_de, end: end_de },
        corp: resolved,
        total_count: raw.total_count ?? 0,
        page: raw.page_no ?? args.page,
        total_pages: raw.total_page ?? 1,
        items: raw.list ?? [],
      };
    }

    // === 배치 모드 (preset 또는 all_pages) ===
    const { items: collected, totalPages } = await fetchAllPages(
      ctx.client,
      baseParams,
      args.concurrency,
    );

    const includeCorrections =
      args.include_corrections || args.preset === "correction_all";

    const filtered = collected.filter((item) => {
      if (!includeCorrections && /\[(기재정정|첨부정정|첨부추가)\]/.test(item.report_nm)) {
        return false;
      }
      if (preset?.keyword && !preset.keyword.test(item.report_nm)) return false;
      return true;
    });
    const limited = filtered.slice(0, args.limit);

    return {
      mode: "batch",
      preset: args.preset ?? null,
      preset_label: preset?.label ?? null,
      period: { start: bgn_de, end: end_de },
      corp: resolved,
      include_corrections: includeCorrections,
      pages_fetched: totalPages,
      total_fetched: collected.length,
      matched: filtered.length,
      returned: limited.length,
      items: limited.map((it) => ({
        rcept_no: it.rcept_no,
        rcept_dt: it.rcept_dt,
        corp_name: it.corp_name,
        corp_code: it.corp_code,
        corp_cls: it.corp_cls,
        report_nm: it.report_nm,
        flr_nm: it.flr_nm ?? null,
      })),
    };
  },
});
