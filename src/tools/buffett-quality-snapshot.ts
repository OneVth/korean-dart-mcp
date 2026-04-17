/**
 * buffett_quality_snapshot — 버핏·그레이엄 식 퀄리티 체크리스트
 *
 * 기업 1개 → N년 시계열 + 체크리스트 + CAGR
 * 기업 2+ → 기업별 스냅샷 + 지표별 랭킹 (기존 quality_compare 통합)
 *
 * DART 주요계정(fnlttSinglAcnt) 를 base year 3년 간격으로 호출해 요율 절약.
 * 여러 기업은 기업별 병렬 실행.
 */

import { z } from "zod";
import { defineTool, resolveCorp } from "./_helpers.js";
import type { ToolCtx } from "./_helpers.js";
import type { CorpRecord } from "../lib/corp-code.js";

const Input = z.object({
  corps: z
    .array(z.string().min(1))
    .min(1)
    .max(10)
    .describe("회사 1~10개. 1개면 시계열+체크리스트, 2+면 비교+랭킹 추가"),
  years: z.number().int().min(3).max(15).default(10).describe("과거 N년 (기본 10)"),
  end_year: z.number().int().min(2016).optional().describe("기준연도 (미지정=작년)"),
  prefer_consolidated: z.boolean().default(true).describe("연결재무제표 우선"),
});

interface AccountItem {
  account_nm: string;
  fs_div?: string;
  sj_div?: string;
  thstrm_amount?: string;
  frmtrm_amount?: string;
  bfefrmtrm_amount?: string;
  [k: string]: string | undefined;
}

interface DartResp {
  status: string;
  message: string;
  list?: AccountItem[];
}

function parseAmount(v: string | undefined): number | null {
  if (!v) return null;
  const cleaned = v.replace(/[,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const ACCOUNT_MATCHERS: Record<string, RegExp[]> = {
  revenue: [/^(매출액|영업수익|수익\(매출액\))$/, /^수익$/, /매출/],
  operating_income: [/^영업이익(\([손실]*\))?$/, /영업이익/],
  net_income: [/^당기순이익(\([손실]*\))?$/, /당기순이익/],
  assets: [/^자산총계$/],
  liabilities: [/^부채총계$/],
  equity: [/^자본총계$/],
};

function pickAccount(
  items: AccountItem[],
  key: keyof typeof ACCOUNT_MATCHERS,
  period: "thstrm" | "frmtrm" | "bfefrmtrm",
): number | null {
  for (const pat of ACCOUNT_MATCHERS[key]) {
    const hit = items.find((it) => pat.test(it.account_nm ?? ""));
    if (hit) {
      const field = `${period}_amount` as keyof AccountItem;
      return parseAmount(hit[field] as string | undefined);
    }
  }
  return null;
}

interface YearMetrics {
  year: number;
  source_base_year?: number;
  source_period?: "thstrm" | "frmtrm" | "bfefrmtrm";
  revenue: number | null;
  operating_income: number | null;
  net_income: number | null;
  assets: number | null;
  liabilities: number | null;
  equity: number | null;
  roe_pct: number | null;
  op_margin_pct: number | null;
  debt_to_equity_pct: number | null;
}

function computeRatios(m: YearMetrics): YearMetrics {
  if (m.net_income != null && m.equity && m.equity !== 0) {
    m.roe_pct = Number(((m.net_income / m.equity) * 100).toFixed(2));
  }
  if (m.operating_income != null && m.revenue && m.revenue !== 0) {
    m.op_margin_pct = Number(((m.operating_income / m.revenue) * 100).toFixed(2));
  }
  if (m.liabilities != null && m.equity && m.equity !== 0) {
    m.debt_to_equity_pct = Number(((m.liabilities / m.equity) * 100).toFixed(2));
  }
  return m;
}

function filterFsDiv(items: AccountItem[], preferConsolidated: boolean): AccountItem[] {
  const primary = preferConsolidated ? "CFS" : "OFS";
  const secondary = preferConsolidated ? "OFS" : "CFS";
  const hitPrimary = items.filter((i) => i.fs_div === primary);
  if (hitPrimary.length) return hitPrimary;
  const hitSecondary = items.filter((i) => i.fs_div === secondary);
  if (hitSecondary.length) return hitSecondary;
  return items;
}

function cagr(first: number | null, last: number | null, periods: number): number | null {
  if (first == null || last == null || first <= 0 || last <= 0 || periods < 1) return null;
  return Number(((Math.pow(last / first, 1 / periods) - 1) * 100).toFixed(2));
}

function stddev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

interface Snapshot {
  resolved: CorpRecord;
  window: { start_year: number; end_year: number; years: number };
  fs_preference: string;
  api_calls: number;
  series: YearMetrics[];
  ratios: {
    avg_roe_pct: number | null;
    min_roe_pct: number | null;
    max_roe_pct: number | null;
    roe_stddev: number;
    latest_debt_to_equity_pct: number | null;
    avg_debt_to_equity_pct: number | null;
    revenue_cagr_pct: number | null;
    net_income_cagr_pct: number | null;
  };
  checklist: Record<string, { pass: boolean; rule: string; evidence: unknown }>;
  overall_score: string;
}

async function computeSnapshot(
  ctx: ToolCtx,
  corp: string,
  years: number,
  endYearArg: number | undefined,
  preferConsolidated: boolean,
): Promise<Snapshot> {
  const record = resolveCorp(ctx.resolver, corp);
  const endYear = endYearArg ?? new Date().getFullYear() - 1;
  const startYear = endYear - years + 1;

  const baseYears: number[] = [];
  for (let y = endYear; y >= startYear; y -= 3) baseYears.push(y);

  const responses = await Promise.all(
    baseYears.map(async (year) => {
      try {
        const raw = await ctx.client.getJson<DartResp>("fnlttSinglAcnt.json", {
          corp_code: record.corp_code,
          bsns_year: String(year),
          reprt_code: "11011",
        });
        return { base_year: year, items: raw.status === "000" ? raw.list ?? [] : [] };
      } catch {
        return { base_year: year, items: [] as AccountItem[] };
      }
    }),
  );

  const byYear = new Map<number, YearMetrics>();
  for (const r of responses.sort((a, b) => a.base_year - b.base_year)) {
    if (!r.items.length) continue;
    const filtered = filterFsDiv(r.items, preferConsolidated);
    const periods: Array<["thstrm" | "frmtrm" | "bfefrmtrm", number]> = [
      ["thstrm", r.base_year],
      ["frmtrm", r.base_year - 1],
      ["bfefrmtrm", r.base_year - 2],
    ];
    for (const [period, y] of periods) {
      if (y < startYear || y > endYear) continue;
      const m: YearMetrics = {
        year: y,
        source_base_year: r.base_year,
        source_period: period,
        revenue: pickAccount(filtered, "revenue", period),
        operating_income: pickAccount(filtered, "operating_income", period),
        net_income: pickAccount(filtered, "net_income", period),
        assets: pickAccount(filtered, "assets", period),
        liabilities: pickAccount(filtered, "liabilities", period),
        equity: pickAccount(filtered, "equity", period),
        roe_pct: null,
        op_margin_pct: null,
        debt_to_equity_pct: null,
      };
      computeRatios(m);
      byYear.set(y, m);
    }
  }

  const series = Array.from(byYear.values()).sort((a, b) => a.year - b.year);
  const roes = series.map((s) => s.roe_pct).filter((v): v is number => v != null);
  const debtRatios = series
    .map((s) => s.debt_to_equity_pct)
    .filter((v): v is number => v != null);
  const first = series[0];
  const last = series[series.length - 1];
  const periodsLen = series.length > 1 ? last.year - first.year : 0;
  const revenue_cagr = first && last ? cagr(first.revenue, last.revenue, periodsLen) : null;
  const net_income_cagr = first && last ? cagr(first.net_income, last.net_income, periodsLen) : null;
  const avg_roe = roes.length ? Number((roes.reduce((a, b) => a + b, 0) / roes.length).toFixed(2)) : null;
  const latest_debt = last?.debt_to_equity_pct ?? null;

  const checklist = {
    consistent_high_roe: {
      pass: roes.length >= 3 && roes.every((r) => r >= 15),
      rule: "모든 연도 ROE ≥ 15%",
      evidence: { roes, years_observed: roes.length },
    },
    low_debt: {
      pass: latest_debt != null && latest_debt <= 100,
      rule: "최근 부채비율 ≤ 100%",
      evidence: { latest_debt_to_equity_pct: latest_debt },
    },
    growing_revenue: {
      pass: revenue_cagr != null && revenue_cagr >= 5,
      rule: "매출 CAGR ≥ 5%",
      evidence: { revenue_cagr_pct: revenue_cagr, periods: periodsLen },
    },
    growing_earnings: {
      pass: net_income_cagr != null && net_income_cagr >= 5,
      rule: "순이익 CAGR ≥ 5%",
      evidence: { net_income_cagr_pct: net_income_cagr, periods: periodsLen },
    },
  };
  const passed = Object.values(checklist).filter((c) => c.pass).length;

  return {
    resolved: record,
    window: { start_year: startYear, end_year: endYear, years },
    fs_preference: preferConsolidated ? "CFS>OFS" : "OFS>CFS",
    api_calls: baseYears.length,
    series,
    ratios: {
      avg_roe_pct: avg_roe,
      min_roe_pct: roes.length ? Math.min(...roes) : null,
      max_roe_pct: roes.length ? Math.max(...roes) : null,
      roe_stddev: Number(stddev(roes).toFixed(2)),
      latest_debt_to_equity_pct: latest_debt,
      avg_debt_to_equity_pct: debtRatios.length
        ? Number((debtRatios.reduce((a, b) => a + b, 0) / debtRatios.length).toFixed(2))
        : null,
      revenue_cagr_pct: revenue_cagr,
      net_income_cagr_pct: net_income_cagr,
    },
    checklist,
    overall_score: `${passed}/4`,
  };
}

function rankBy(
  rows: Array<{ corp_name: string } & Record<string, unknown>>,
  key: string,
  dir: "asc" | "desc",
): string[] {
  const withValue = rows
    .map((r) => ({ r, v: r[key] as number | null | undefined }))
    .filter((x): x is { r: (typeof rows)[number]; v: number } =>
      typeof x.v === "number" && Number.isFinite(x.v),
    );
  withValue.sort((a, b) => (dir === "desc" ? b.v - a.v : a.v - b.v));
  return withValue.map((x) => `${x.r.corp_name}(${x.v})`);
}

export const buffettQualitySnapshotTool = defineTool({
  name: "buffett_quality_snapshot",
  description:
    "버핏 퀄리티 체크리스트. corps 1개 → N년 ROE/부채/CAGR 시계열 + 체크 4종. " +
    "corps 2~10개 → 각 기업 스냅샷 + 5지표별 랭킹 (기존 quality_compare 통합). 기업별 병렬 실행.",
  input: Input,
  handler: async (ctx, args) => {
    const snapshots = await Promise.all(
      args.corps.map(async (corp) => {
        try {
          const snap = await computeSnapshot(
            ctx,
            corp,
            args.years,
            args.end_year,
            args.prefer_consolidated,
          );
          return { corp_input: corp, snap, error: null as string | null };
        } catch (e) {
          return {
            corp_input: corp,
            snap: null,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }),
    );

    if (args.corps.length === 1) {
      const r = snapshots[0];
      if (!r.snap) throw new Error(`snapshot 실패 [${r.corp_input}]: ${r.error}`);
      return { mode: "single", ...r.snap };
    }

    const successful = snapshots.filter(
      (s): s is { corp_input: string; snap: Snapshot; error: null } => s.snap !== null,
    );
    const rows = successful.map((s) => ({
      corp_name: s.snap.resolved.corp_name,
      corp_code: s.snap.resolved.corp_code,
      window: s.snap.window,
      avg_roe_pct: s.snap.ratios.avg_roe_pct,
      roe_stddev: s.snap.ratios.roe_stddev,
      latest_debt_to_equity_pct: s.snap.ratios.latest_debt_to_equity_pct,
      revenue_cagr_pct: s.snap.ratios.revenue_cagr_pct,
      net_income_cagr_pct: s.snap.ratios.net_income_cagr_pct,
      overall_score: s.snap.overall_score,
      checklist_pass: Object.entries(s.snap.checklist)
        .filter(([, v]) => v.pass)
        .map(([k]) => k),
    }));

    const errors = snapshots.filter((s) => s.error).map((s) => ({
      corp_input: s.corp_input,
      error: s.error,
    }));

    return {
      mode: "compare",
      inputs: args.corps,
      years: args.years,
      end_year: args.end_year ?? new Date().getFullYear() - 1,
      rows,
      rankings: {
        by_avg_roe_desc: rankBy(rows, "avg_roe_pct", "desc"),
        by_debt_ratio_asc: rankBy(rows, "latest_debt_to_equity_pct", "asc"),
        by_revenue_cagr_desc: rankBy(rows, "revenue_cagr_pct", "desc"),
        by_net_income_cagr_desc: rankBy(rows, "net_income_cagr_pct", "desc"),
        by_roe_stability_asc: rankBy(rows, "roe_stddev", "asc"),
      },
      individuals: successful.map((s) => ({ corp_input: s.corp_input, snapshot: s.snap })),
      errors,
      note:
        "체크리스트는 휴리스틱. 업종·경기 고려 필수. insider_signal·disclosure_anomaly 로 질적 시그널 보완.",
    };
  },
});
