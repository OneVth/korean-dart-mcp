/**
 * buffett_quality_snapshot — 워렌 버핏·벤 그레이엄 식 퀄리티 체크리스트 (킬러 포인트)
 *
 * DART 주요계정(fnlttSinglAcnt)을 N년치 병렬 수집해 핵심 지표를 시계열로 산출.
 *
 *   - ROE, 영업이익률, 부채비율 시계열
 *   - 매출 CAGR, 순이익 CAGR
 *   - 체크리스트 4종 (consistent ROE / low debt / growing revenue / growing earnings)
 *
 * 기존 Python 래퍼는 raw 테이블만 제공. 여기서는 "지난 10년 ROE 평균 18%, 부채비율 40%" 처럼
 * LLM 이 즉시 스토리를 구성할 수 있는 수치 프레임을 반환.
 *
 * 참고: DART fnlttSinglAcnt 는 한 번 호출에 당기/전기/전전기 3년치를 제공.
 *       N년 요청 시 필요한 base year 만 호출하여 요율 절약.
 */

import { z } from "zod";
import { defineTool, resolveCorp } from "./_helpers.js";

const Input = z.object({
  corp: z.string().min(1).describe("회사명/종목코드/corp_code"),
  years: z
    .number()
    .int()
    .min(3)
    .max(15)
    .default(10)
    .describe("과거 몇 년치? (기본 10년)"),
  end_year: z
    .number()
    .int()
    .min(2016)
    .optional()
    .describe("기준 연도 (미지정 시 작년)"),
  prefer_consolidated: z
    .boolean()
    .default(true)
    .describe("연결재무제표 우선 (없으면 별도). false 면 별도 우선."),
});

interface AccountItem {
  account_nm: string;
  fs_div?: string; // CFS/OFS
  fs_nm?: string;
  sj_div?: string; // BS/IS
  sj_nm?: string;
  thstrm_amount?: string;
  frmtrm_amount?: string;
  bfefrmtrm_amount?: string;
  thstrm_nm?: string;
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

/** 계정명 매칭 — 포함 우선. 각 지표별 후보 배열. */
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
  const patterns = ACCOUNT_MATCHERS[key];
  for (const pat of patterns) {
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
  source_base_year?: number; // 어느 호출의 어느 period 에서 가져왔는지
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
  if (hitPrimary.length > 0) return hitPrimary;
  const hitSecondary = items.filter((i) => i.fs_div === secondary);
  if (hitSecondary.length > 0) return hitSecondary;
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

export const buffettQualitySnapshotTool = defineTool({
  name: "buffett_quality_snapshot",
  description:
    "버핏 스타일 퀄리티 체크리스트: N년 ROE·영업이익률·부채비율 시계열 + 매출/순이익 CAGR + 4개 체크 판정. " +
    "DART 주요계정을 N/3 회 호출로 수집해 LLM 이 바로 스토리 구성 가능한 프레임 제공.",
  input: Input,
  handler: async (ctx, args) => {
    const record = resolveCorp(ctx.resolver, args.corp);
    const endYear = args.end_year ?? new Date().getFullYear() - 1;
    const startYear = endYear - args.years + 1;

    // 한 번 호출로 3년치 얻음 → base year 를 3년 간격으로
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
          if (raw.status !== "000") {
            return { base_year: year, status: raw.status, message: raw.message, items: [] };
          }
          return { base_year: year, status: raw.status, items: raw.list ?? [] };
        } catch (e) {
          return {
            base_year: year,
            error: e instanceof Error ? e.message : String(e),
            items: [] as AccountItem[],
          };
        }
      }),
    );

    // 연도별 metrics 맵 (중복 시 base_year 가 더 큰 호출의 값 유지 = 최신 재무제표 반영)
    const byYear = new Map<number, YearMetrics>();
    for (const r of responses.sort((a, b) => a.base_year - b.base_year)) {
      if (!r.items.length) continue;
      const filtered = filterFsDiv(r.items, args.prefer_consolidated);
      const periods: Array<["thstrm" | "frmtrm" | "bfefrmtrm", number]> = [
        ["thstrm", r.base_year],
        ["frmtrm", r.base_year - 1],
        ["bfefrmtrm", r.base_year - 2],
      ];
      for (const [period, y] of periods) {
        if (y < startYear || y > endYear) continue;
        const metrics: YearMetrics = {
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
        computeRatios(metrics);
        byYear.set(y, metrics);
      }
    }

    const series = Array.from(byYear.values()).sort((a, b) => a.year - b.year);

    // 집계
    const roes = series.map((s) => s.roe_pct).filter((v): v is number => v != null);
    const debtRatios = series.map((s) => s.debt_to_equity_pct).filter((v): v is number => v != null);

    const first = series[0];
    const last = series[series.length - 1];
    const periods = series.length > 1 ? series[series.length - 1].year - series[0].year : 0;
    const revenue_cagr = first && last ? cagr(first.revenue, last.revenue, periods) : null;
    const net_income_cagr = first && last ? cagr(first.net_income, last.net_income, periods) : null;

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
        evidence: { revenue_cagr_pct: revenue_cagr, periods },
      },
      growing_earnings: {
        pass: net_income_cagr != null && net_income_cagr >= 5,
        rule: "순이익 CAGR ≥ 5%",
        evidence: { net_income_cagr_pct: net_income_cagr, periods },
      },
    };

    const passed = Object.values(checklist).filter((c) => c.pass).length;

    return {
      resolved: record,
      window: { start_year: startYear, end_year: endYear, years: args.years },
      fs_preference: args.prefer_consolidated ? "CFS>OFS" : "OFS>CFS",
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
      note: "버핏 체크리스트는 휴리스틱. 경기순환·업종 특성 고려 필수. 더 깊은 분석은 get_full_financials·get_xbrl.",
    };
  },
});
