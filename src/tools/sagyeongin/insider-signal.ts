/**
 * sagyeongin_insider_signal — 9단계 도구.
 *
 * 사경인 7부 C "내부자 매수 시그널" 자동화. DART majorstock.json (DS003 대량보유 5%+)
 * raw items의 stkqy_irds 부호 기반으로 5%+ 보고자의 매수/매도 분기 + 분기 클러스터 집계.
 *
 * 사경인 본문 정합 (philosophy 7부 C line 195):
 * - "최대주주 매수 > 임원 매수" — 5%+ 단독이라 임원 노이즈 자동 회피
 * - "2명 이상 동시 매수는 강한 신호" — cluster_threshold 기본 2
 * - "임원 변동 의무공시는 노이즈" — DS003 단독으로 주체 분리 자연 회피
 * - "상속/증여 노이즈" — DART API 자동 식별 0 (raw에 변동사유 필드 부재).
 *   report_resn 자유 텍스트 raw 보존 → LLM 후속 조사 영역
 *
 * verdict 0: 시그널 데이터 단독 (8단계 scan_preview 정합). 결정은 사용자 또는
 * scan_execute (11단계) / watchlist_check (10단계). philosophy 5부 정합.
 *
 * 사전 검증 (2026-05-03): elestock + majorstock 양쪽 모두 chg_rsn 계열 부재
 * 실측 (삼성전자 2,615 + 40건 전수). β-iii 폐기 → β-i 격리 회복 (ADR-0011).
 *
 * Ref: spec §10.12 (v0.6), philosophy 7부 C line 195, ADR-0011, ADR-0001 β-i
 */

import { z } from "zod";
import { defineTool, normalizeDate, resolveCorp } from "../_helpers.js";

const Input = z.object({
  corp: z.string().min(1).describe("회사명/종목코드/corp_code"),
  start: z.string().optional().describe("기간 시작 (YYYY-MM-DD / YYYYMMDD)"),
  end: z.string().optional().describe("기간 종료"),
  cluster_threshold: z
    .number()
    .int()
    .min(2)
    .default(2)
    .describe(
      "cluster 인정 최소 인원 (기본 2 — 사경인 '2명 이상 동시 매수는 강한 신호'). " +
        "upstream insider_signal과 분기 — upstream은 임원+주요주주 통합이라 기본 3 (노이즈 흡수), " +
        "본 도구는 5%+ 단독이라 노이즈 자연 회피 → 기본 2가 사경인 본문 직접 정합.",
    ),
  reporters_topn: z
    .number()
    .int()
    .min(0)
    .max(50)
    .default(5)
    .describe("분기별 reporters 명단 상위 N (절대값 큰 순). 0=빈 배열."),
});

interface MajorStockItem {
  rcept_no?: string;
  rcept_dt?: string;
  corp_code?: string;
  corp_name?: string;
  report_tp?: string;
  repror?: string;
  stkqy?: string;
  stkqy_irds?: string;
  stkrt?: string;
  stkrt_irds?: string;
  ctr_stkqy?: string;
  ctr_stkrt?: string;
  report_resn?: string;
  [k: string]: string | undefined;
}

interface DartListResp {
  status: string;
  message: string;
  list?: MajorStockItem[];
}

/** "-1,234" 또는 "1234" 같은 문자열 → 숫자. 파싱 실패 시 0. 부호 보존. */
function toInt(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(v.replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** rcept_dt를 8자리 숫자(YYYYMMDD)로 정규화. 형식 다르면 null. */
function normalizeRcept(s: string | undefined): string | null {
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  return /^\d{8}$/.test(digits) ? digits : null;
}

function quarterOf(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) return "unknown";
  const y = yyyymmdd.slice(0, 4);
  const m = parseInt(yyyymmdd.slice(4, 6), 10);
  const q = Math.ceil(m / 3);
  return `${y}Q${q}`;
}

function buildSummary(p: {
  corpName: string;
  reports: number;
  buyCount: number;
  sellCount: number;
  buyers: number;
  sellers: number;
  netChange: number;
  signal: string;
  strongestCluster: { quarter: string; buyers: number; sellers: number; net_change: number } | null;
  startYmd: string | null;
  endYmd: string | null;
}): string {
  const periodStr =
    p.startYmd || p.endYmd
      ? `${p.startYmd ?? "처음"}~${p.endYmd ?? "현재"}`
      : "전체 보고 기간";
  if (p.reports === 0) return `${p.corpName}: ${periodStr} 5%+ 대량보유 보고 없음.`;

  const netStr =
    p.netChange === 0
      ? "순증감 0"
      : p.netChange > 0
        ? `순매수 +${p.netChange.toLocaleString("ko-KR")}주`
        : `순매도 ${p.netChange.toLocaleString("ko-KR")}주`;

  const signalStr =
    p.signal === "strong_buy_cluster"
      ? "→ 5%+ 매수 클러스터 시그널"
      : p.signal === "strong_sell_cluster"
        ? "→ 5%+ 매도 클러스터 시그널"
        : "→ 중립/혼조";

  const clusterStr = p.strongestCluster
    ? ` 최강 클러스터: ${p.strongestCluster.quarter} (매수 ${p.strongestCluster.buyers}명/매도 ${p.strongestCluster.sellers}명).`
    : "";

  return `${p.corpName} ${periodStr}: ${p.reports}건 보고 (매수 ${p.buyCount} / 매도 ${p.sellCount}). 고유 매수자 ${p.buyers}명 / 매도자 ${p.sellers}명, ${netStr}. ${signalStr}.${clusterStr}`;
}

export const sagyeonginInsiderSignalTool = defineTool({
  name: "sagyeongin_insider_signal",
  description:
    "5%+ 대량보유자(DS003 majorstock) stkqy_irds 부호 기반 매수/매도 시그널. " +
    "분기 클러스터 + 전체 시그널 산출. " +
    "사경인 7부 C '최대주주 매수 > 임원 매수' 정합 — 임원 노이즈 자동 회피. " +
    "verdict 0 (시그널 데이터 단독). " +
    "Ref: spec §10.12, philosophy 7부 C, ADR-0011",
  input: Input,
  handler: async (ctx, args) => {
    const record = resolveCorp(ctx.resolver, args.corp);
    const startYmd = args.start ? normalizeDate(args.start) : null;
    const endYmd = args.end ? normalizeDate(args.end) : null;

    const raw = await ctx.client.getJson<DartListResp>("majorstock.json", {
      corp_code: record.corp_code,
    });
    if (raw.status !== "000" && raw.status !== "013") {
      throw new Error(`DART majorstock 오류 [${raw.status}]: ${raw.message}`);
    }
    const all = raw.list ?? [];

    // 기간 필터
    const filtered = all
      .map((it) => ({ it, ymd: normalizeRcept(it.rcept_dt) }))
      .filter(({ ymd }) => {
        if (!ymd) return false;
        if (startYmd && ymd < startYmd) return false;
        if (endYmd && ymd > endYmd) return false;
        return true;
      })
      .map(({ it, ymd }) => ({ ...it, rcept_dt: ymd as string }));

    // 집계
    let buyCount = 0;
    let sellCount = 0;
    let netChange = 0;
    const buyers = new Set<string>();
    const sellers = new Set<string>();
    const byQuarter: Record<
      string,
      {
        buyers: Set<string>;
        sellers: Set<string>;
        netChange: number;
        reporters: Array<{ name: string; change: number; report_resn: string }>;
      }
    > = {};

    for (const item of filtered) {
      const delta = toInt(item.stkqy_irds);
      if (delta === 0) continue; // spec §10.12 line 919 — 0 무시
      const name = item.repror ?? "(unknown)";
      const reportResn = item.report_resn ?? "";
      const q = quarterOf(item.rcept_dt ?? "");
      byQuarter[q] ??= {
        buyers: new Set(),
        sellers: new Set(),
        netChange: 0,
        reporters: [],
      };
      byQuarter[q].netChange += delta;
      byQuarter[q].reporters.push({ name, change: delta, report_resn: reportResn });
      netChange += delta;
      if (delta > 0) {
        buyCount++;
        buyers.add(name);
        byQuarter[q].buyers.add(name);
      } else {
        sellCount++;
        sellers.add(name);
        byQuarter[q].sellers.add(name);
      }
    }

    const clusters = Object.entries(byQuarter)
      .map(([quarter, agg]) => {
        const buyers_n = agg.buyers.size;
        const sellers_n = agg.sellers.size;
        const direction =
          buyers_n >= args.cluster_threshold && buyers_n > sellers_n
            ? "buy_cluster"
            : sellers_n >= args.cluster_threshold && sellers_n > buyers_n
              ? "sell_cluster"
              : "mixed_or_thin";
        const sortedReporters = [...agg.reporters].sort(
          (a, b) => Math.abs(b.change) - Math.abs(a.change),
        );
        const topReporters = sortedReporters.slice(0, args.reporters_topn);
        return {
          quarter,
          buyers: buyers_n,
          sellers: sellers_n,
          net_change: agg.netChange,
          cluster: direction,
          reporters_total: agg.reporters.length,
          reporters_truncated: agg.reporters.length > args.reporters_topn,
          reporters: topReporters,
        };
      })
      .sort((a, b) => b.quarter.localeCompare(a.quarter));

    const strongestCluster =
      clusters.find((c) => c.cluster === "buy_cluster") ??
      clusters.find((c) => c.cluster === "sell_cluster") ??
      null;

    const signal: "strong_buy_cluster" | "strong_sell_cluster" | "neutral_or_mixed" =
      buyers.size >= args.cluster_threshold && buyers.size > sellers.size * 2
        ? "strong_buy_cluster"
        : sellers.size >= args.cluster_threshold && sellers.size > buyers.size * 2
          ? "strong_sell_cluster"
          : "neutral_or_mixed";

    const summary_text = buildSummary({
      corpName: record.corp_name,
      reports: filtered.length,
      buyCount,
      sellCount,
      buyers: buyers.size,
      sellers: sellers.size,
      netChange,
      signal,
      strongestCluster,
      startYmd,
      endYmd,
    });

    return {
      resolved: record,
      period: { start: startYmd, end: endYmd },
      cluster_threshold: args.cluster_threshold,
      summary_text,
      summary: {
        reports_total: filtered.length,
        buy_events: buyCount,
        sell_events: sellCount,
        unique_buyers: buyers.size,
        unique_sellers: sellers.size,
        net_change_shares: netChange,
        signal,
        strongest_quarter: strongestCluster?.quarter ?? null,
      },
      quarterly_clusters: clusters,
      source: "majorstock",
    };
  },
});
