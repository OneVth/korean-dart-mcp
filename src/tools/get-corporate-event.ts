/**
 * get_corporate_event — DS005 주요사항보고서 36개 이벤트 enum + timeline 모드
 *
 * ## mode: "single"
 *   단일 event_type 조회. OpenDartReader dart_event 와 동일한 매핑.
 *
 * ## mode: "timeline"  ← 킬러 포인트
 *   지정 기간 동안 **자본 관련 주요 이벤트 전부**를 병렬 조회해 날짜순 통합.
 *   기존 Python 래퍼(단일 조회만 가능)에서는 불가능한 "자본 스트레스 내러티브" 뷰.
 *   LLM 가 바로 "최근 3년 CB 2회 + 자사주 처분 → 조달 압박" 스토리 생성 가능.
 *
 * 매핑 출처: FinanceData/OpenDartReader dart_event.py
 */

import { z } from "zod";
import { defineTool, normalizeDate, resolveCorp } from "./_helpers.js";

const EVENT: Record<string, { endpoint: string; ko: string; capital: boolean }> = {
  // 부실/법적 이슈
  default_occurrence: { endpoint: "dfOcr", ko: "부도발생", capital: false },
  business_suspension: { endpoint: "bsnSp", ko: "영업정지", capital: false },
  rehabilitation_filing: { endpoint: "ctrcvsBgrq", ko: "회생절차 개시신청", capital: false },
  dissolution_cause: { endpoint: "dsRsOcr", ko: "해산사유 발생", capital: false },
  bank_management_start: { endpoint: "bnkMngtPcbg", ko: "채권은행 관리절차 개시", capital: false },
  bank_management_stop: { endpoint: "bnkMngtPcsp", ko: "채권은행 관리절차 중단", capital: false },
  litigation: { endpoint: "lwstLg", ko: "소송 등 제기", capital: false },

  // 자본 증감
  rights_offering: { endpoint: "piicDecsn", ko: "유상증자 결정", capital: true },
  bonus_issue: { endpoint: "fricDecsn", ko: "무상증자 결정", capital: true },
  rights_bonus_combo: { endpoint: "pifricDecsn", ko: "유무상증자 결정", capital: true },
  capital_reduction: { endpoint: "crDecsn", ko: "감자 결정", capital: true },

  // 사채 발행
  cb_issuance: { endpoint: "cvbdIsDecsn", ko: "전환사채(CB) 발행결정", capital: true },
  bw_issuance: { endpoint: "bdwtIsDecsn", ko: "신주인수권부사채(BW) 발행결정", capital: true },
  eb_issuance: { endpoint: "exbdIsDecsn", ko: "교환사채(EB) 발행결정", capital: true },
  cocobond_issuance: { endpoint: "wdCocobdIsDecsn", ko: "상각형 조건부자본증권 발행결정", capital: true },

  // 자기주식
  treasury_acquisition: { endpoint: "tsstkAqDecsn", ko: "자기주식 취득 결정", capital: true },
  treasury_disposal: { endpoint: "tsstkDpDecsn", ko: "자기주식 처분 결정", capital: true },
  treasury_trust_contract: { endpoint: "tsstkAqTrctrCnsDecsn", ko: "자기주식취득 신탁계약 체결", capital: true },
  treasury_trust_cancel: { endpoint: "tsstkAqTrctrCcDecsn", ko: "자기주식취득 신탁계약 해지", capital: true },

  // 지배구조 변경 (합병·분할·교환)
  stock_exchange: { endpoint: "stkExtrDecsn", ko: "주식교환·이전 결정", capital: true },
  company_split_merger: { endpoint: "cmpDvmgDecsn", ko: "회사분할합병 결정", capital: true },
  company_split: { endpoint: "cmpDvDecsn", ko: "회사분할 결정", capital: true },
  company_merger: { endpoint: "cmpMgDecsn", ko: "회사합병 결정", capital: true },

  // 자산·영업 양수도
  asset_transfer_etc: { endpoint: "astInhtrfEtcPtbkOpt", ko: "자산양수도(기타)·풋백옵션", capital: true },
  tangible_asset_transfer: { endpoint: "tgastTrfDecsn", ko: "유형자산 양도 결정", capital: true },
  tangible_asset_acquisition: { endpoint: "tgastInhDecsn", ko: "유형자산 양수 결정", capital: true },
  other_corp_stock_transfer: { endpoint: "otcprStkInvscrTrfDecsn", ko: "타법인 주식·출자증권 양도", capital: true },
  other_corp_stock_acquisition: { endpoint: "otcprStkInvscrInhDecsn", ko: "타법인 주식·출자증권 양수", capital: true },
  business_transfer: { endpoint: "bsnTrfDecsn", ko: "영업양도 결정", capital: true },
  business_acquisition: { endpoint: "bsnInhDecsn", ko: "영업양수 결정", capital: true },
  bond_with_stock_right_acquisition: { endpoint: "stkrtbdInhDecsn", ko: "주권관련 사채권 양수", capital: true },
  bond_with_stock_right_transfer: { endpoint: "stkrtbdTrfDecsn", ko: "주권관련 사채권 양도", capital: true },

  // 해외 상장
  overseas_listing_decision: { endpoint: "ovLstDecsn", ko: "해외상장 결정", capital: false },
  overseas_delisting_decision: { endpoint: "ovDlstDecsn", ko: "해외상장폐지 결정", capital: false },
  overseas_listing: { endpoint: "ovLst", ko: "해외상장", capital: false },
  overseas_delisting: { endpoint: "ovDlst", ko: "해외상장폐지", capital: false },
};

const EVENT_TYPES = Object.keys(EVENT) as [string, ...string[]];

const Input = z
  .object({
    corp: z.string().min(1).describe("회사명/종목코드/corp_code"),
    mode: z
      .enum(["single", "timeline"])
      .default("single")
      .describe(
        "single: 단일 event_type 조회. timeline: 여러 자본 관련 이벤트를 날짜순 통합 (킬러 모드)",
      ),
    event_type: z
      .enum(EVENT_TYPES)
      .optional()
      .describe("single 모드 필수. 36개 이벤트 중 하나"),
    event_types: z
      .array(z.enum(EVENT_TYPES))
      .optional()
      .describe(
        "timeline 모드용 수동 선택. 미지정 시 자본 관련 이벤트(capital=true) 전체 자동 선택",
      ),
    start: z.string().optional().describe("시작일 (YYYY-MM-DD / YYYYMMDD)"),
    end: z.string().optional().describe("종료일 (YYYY-MM-DD / YYYYMMDD)"),
  })
  .refine(
    (v) => v.mode !== "single" || !!v.event_type,
    { message: "mode=single 일 때 event_type 필수" },
  );

interface DartListResp {
  status: string;
  message: string;
  list?: Array<Record<string, string>>;
}

async function fetchEvent(
  ctx: Parameters<Parameters<typeof defineTool>[0]["handler"]>[0],
  corp_code: string,
  type: string,
  bgn_de?: string,
  end_de?: string,
) {
  const meta = EVENT[type];
  try {
    const raw = await ctx.client.getJson<DartListResp>(`${meta.endpoint}.json`, {
      corp_code,
      bgn_de,
      end_de,
    });
    if (raw.status !== "000") {
      return { type, endpoint: meta.endpoint, status: raw.status, message: raw.message, items: [] };
    }
    return {
      type,
      endpoint: meta.endpoint,
      status: raw.status,
      count: raw.list?.length ?? 0,
      items: raw.list ?? [],
    };
  } catch (e) {
    return {
      type,
      endpoint: meta.endpoint,
      error: e instanceof Error ? e.message : String(e),
      items: [] as Array<Record<string, string>>,
    };
  }
}

/** DART 응답 rcept_dt (접수일자) 을 YYYY-MM-DD 로 변환. YYYYMMDD / YYYY-MM-DD 모두 수용. */
function pickEventDate(item: Record<string, string>): string {
  const d = item.rcept_dt || item.ctrt_cnsdt || item.fd_dcsn_cnsdt || "";
  const digits = d.replace(/\D/g, "");
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(digits);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : d;
}

export const getCorporateEventTool = defineTool({
  name: "get_corporate_event",
  description:
    "DS005 주요사항보고서 36종 이벤트 조회. " +
    "mode='single' 은 단일 event_type 상세, " +
    "mode='timeline' 은 자본 관련 이벤트(증자·감자·CB/BW/EB·자사주·합병분할·영업양수도 등)를 지정 기간 병렬 수집 후 날짜순 통합. " +
    "timeline 은 '최근 N년 자본 스트레스 내러티브' 를 한 번에 뽑기 위한 킬러 모드.",
  input: Input,
  handler: async (ctx, args) => {
    const record = resolveCorp(ctx.resolver, args.corp);
    const bgn_de = args.start ? normalizeDate(args.start) : undefined;
    const end_de = args.end ? normalizeDate(args.end) : undefined;

    if (args.mode === "single") {
      const result = await fetchEvent(ctx, record.corp_code, args.event_type!, bgn_de, end_de);
      return {
        mode: "single",
        resolved: record,
        period: { start: bgn_de ?? null, end: end_de ?? null },
        ...result,
      };
    }

    // timeline 모드
    const targets =
      args.event_types ??
      (Object.entries(EVENT)
        .filter(([, meta]) => meta.capital)
        .map(([k]) => k) as string[]);

    const sections = await Promise.all(
      targets.map((t) => fetchEvent(ctx, record.corp_code, t, bgn_de, end_de)),
    );

    // 통합 타임라인: 각 item 에 event_type/ko 메타 주입하고 날짜 역순 정렬
    const timeline: Array<Record<string, unknown>> = [];
    for (const section of sections) {
      if (!section.items) continue;
      for (const item of section.items) {
        timeline.push({
          event_type: section.type,
          event_ko: EVENT[section.type].ko,
          date: pickEventDate(item as Record<string, string>),
          ...item,
        });
      }
    }
    timeline.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const typeCounts: Record<string, number> = {};
    for (const entry of timeline) {
      const t = String(entry.event_type);
      typeCounts[t] = (typeCounts[t] ?? 0) + 1;
    }

    return {
      mode: "timeline",
      resolved: record,
      period: { start: bgn_de ?? null, end: end_de ?? null },
      event_types: targets,
      total_events: timeline.length,
      event_type_counts: typeCounts,
      timeline,
      sections_meta: sections.map((s) => ({
        type: s.type,
        endpoint: s.endpoint,
        status: s.status ?? null,
        count: s.count ?? 0,
        message: (s as { message?: string }).message ?? null,
        error: (s as { error?: string }).error ?? null,
      })),
    };
  },
});
