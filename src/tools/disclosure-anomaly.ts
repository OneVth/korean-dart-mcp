/**
 * disclosure_anomaly — 공시·회계 이상 징후 탐지 (킬러 포인트)
 *
 * 공시 이력과 감사인·감사의견 이력을 교차해 회계·거버넌스 위험 신호를 점수화.
 *
 * 시그널:
 *   1. 정정공시 비율 — report_nm 에 "[기재정정]"/"[첨부정정]" 포함 비율
 *   2. 감사인 교체 — 지정 연도 범위의 감사인 이름이 바뀌면 +
 *   3. 감사의견 비적정 — "적정" 이외 의견(한정/부적정/의견거절)
 *   4. 자본 스트레스 — 유상증자·CB·자사주 처분 공시 빈도
 *
 * 점수 0-100. 해석은 LLM 에게 위임하되, 핵심 flag 와 evidence 를 구조화해서 제공.
 */

import { z } from "zod";
import { defineTool, normalizeDate, resolveCorp } from "./_helpers.js";

const Input = z.object({
  corp: z.string().min(1).describe("회사명/종목코드/corp_code"),
  start: z.string().optional().describe("기간 시작 (기본: 3년 전)"),
  end: z.string().optional().describe("기간 종료 (기본: 오늘)"),
  audit_years: z
    .array(z.number().int().min(2015))
    .optional()
    .describe("감사인·의견 비교할 연도 (미지정 시 기간의 최근 3년)"),
});

interface ListItem {
  rcept_no: string;
  corp_name: string;
  report_nm: string;
  rcept_dt: string;
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

interface AuditItem {
  adt_adtor?: string; // 감사인
  adt_opinion?: string; // 감사의견
  em_ph?: string; // 강조사항
  bsis_erodt?: string;
  [k: string]: string | undefined;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function defaultRange(args: { start?: string; end?: string }): { bgn_de: string; end_de: string } {
  const end = args.end ? normalizeDate(args.end) : ymd(new Date());
  let bgn: string;
  if (args.start) {
    bgn = normalizeDate(args.start);
  } else {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 3);
    bgn = ymd(d);
  }
  return { bgn_de: bgn, end_de: end };
}

export const disclosureAnomalyTool = defineTool({
  name: "disclosure_anomaly",
  description:
    "회계·거버넌스 이상 징후 스코어: 정정공시 비율, 감사인 교체, 감사의견 비적정, 자본 스트레스. " +
    "점수 0-100 + 개별 flag 와 evidence 를 구조화해 반환. " +
    "LLM 이 판단을 내릴 수 있는 데이터 프레임 제공 (직접 권고하지 않음).",
  input: Input,
  handler: async (ctx, args) => {
    const record = resolveCorp(ctx.resolver, args.corp);
    const { bgn_de, end_de } = defaultRange(args);

    // 1. 공시 목록 수집 (페이지 순회)
    const disclosures: ListItem[] = [];
    let page_no = 1;
    while (true) {
      const raw = await ctx.client.getJson<DartListResp>("list.json", {
        corp_code: record.corp_code,
        bgn_de,
        end_de,
        page_no,
        page_count: 100,
      });
      if (raw.status !== "000") {
        if (raw.status === "013") break; // 검색 결과 없음
        throw new Error(`DART list 오류 [${raw.status}]: ${raw.message}`);
      }
      disclosures.push(...(raw.list ?? []));
      if (!raw.total_page || page_no >= raw.total_page) break;
      page_no++;
      if (page_no > 20) break; // 상한
    }

    // 정정공시 비율
    const amendments = disclosures.filter((d) =>
      /\[(기재정정|첨부정정|첨부추가)\]/.test(d.report_nm),
    );
    const amendment_ratio = disclosures.length
      ? amendments.length / disclosures.length
      : 0;

    // 자본 스트레스 공시 (이벤트 키워드)
    const capitalStress = disclosures.filter((d) =>
      /(유상증자|전환사채|신주인수권부사채|교환사채|자기주식 처분)/.test(d.report_nm),
    );

    // 2. 감사인·의견 시계열
    const endYear = parseInt(end_de.slice(0, 4), 10);
    const years =
      args.audit_years && args.audit_years.length > 0
        ? args.audit_years.slice().sort((a, b) => a - b)
        : [endYear - 2, endYear - 1, endYear];

    const auditResults = await Promise.all(
      years.map(async (year) => {
        try {
          const raw = await ctx.client.getJson<{
            status: string;
            message: string;
            list?: AuditItem[];
          }>("accnutAdtorNmNdAdtOpinion.json", {
            corp_code: record.corp_code,
            bsns_year: String(year),
            reprt_code: "11011",
          });
          if (raw.status !== "000") {
            return { year, status: raw.status, message: raw.message, items: [] as AuditItem[] };
          }
          return { year, status: raw.status, items: raw.list ?? [] };
        } catch (e) {
          return {
            year,
            error: e instanceof Error ? e.message : String(e),
            items: [] as AuditItem[],
          };
        }
      }),
    );

    const auditTimeline = auditResults.map((r) => ({
      year: r.year,
      auditor: r.items[0]?.adt_adtor ?? null,
      opinion: r.items[0]?.adt_opinion ?? null,
      emphasis: r.items[0]?.em_ph ?? null,
      status: r.status ?? null,
      message: (r as { message?: string }).message ?? null,
    }));

    const auditors = auditTimeline.map((a) => a.auditor).filter(Boolean);
    const uniqueAuditors = Array.from(new Set(auditors));
    const auditor_changes = Math.max(0, uniqueAuditors.length - 1);

    const nonCleanOpinions = auditTimeline.filter(
      (a) => a.opinion && !/(적정|unqualified)/i.test(a.opinion),
    );

    // 3. 점수 계산 (0-100)
    let score = 0;
    const flags: Array<{ flag: string; points: number; evidence: unknown }> = [];

    if (amendment_ratio > 0.2) {
      flags.push({
        flag: "high_amendment_ratio",
        points: 30,
        evidence: { ratio: amendment_ratio, total: disclosures.length, amended: amendments.length },
      });
      score += 30;
    } else if (amendment_ratio > 0.1) {
      flags.push({
        flag: "elevated_amendment_ratio",
        points: 15,
        evidence: { ratio: amendment_ratio, total: disclosures.length, amended: amendments.length },
      });
      score += 15;
    }

    if (auditor_changes >= 1) {
      const pts = auditor_changes >= 2 ? 30 : 20;
      flags.push({
        flag: "auditor_change",
        points: pts,
        evidence: { changes: auditor_changes, timeline: auditTimeline },
      });
      score += pts;
    }

    if (nonCleanOpinions.length > 0) {
      flags.push({
        flag: "non_clean_audit_opinion",
        points: 40,
        evidence: nonCleanOpinions,
      });
      score += 40;
    }

    if (capitalStress.length >= 3) {
      flags.push({
        flag: "capital_stress_cluster",
        points: 10,
        evidence: {
          count: capitalStress.length,
          samples: capitalStress.slice(0, 5).map((d) => ({
            rcept_no: d.rcept_no,
            report_nm: d.report_nm,
            rcept_dt: d.rcept_dt,
          })),
        },
      });
      score += 10;
    }

    score = Math.min(100, score);

    const verdict =
      score >= 70 ? "red_flag" : score >= 40 ? "warning" : score >= 15 ? "watch" : "clean";

    return {
      resolved: record,
      period: { start: bgn_de, end: end_de },
      audit_years: years,
      score,
      verdict,
      flags,
      stats: {
        disclosures_total: disclosures.length,
        amendments: amendments.length,
        amendment_ratio: Number(amendment_ratio.toFixed(3)),
        capital_stress_filings: capitalStress.length,
        auditor_changes,
        unique_auditors: uniqueAuditors,
      },
      audit_timeline: auditTimeline,
      note: "verdict 는 휴리스틱. 실제 투자 판단은 원문(download_document) 확인 필수.",
    };
  },
});
