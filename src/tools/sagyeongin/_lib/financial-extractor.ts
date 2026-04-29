/**
 * DART 재무 데이터 추출기 — 사경인 도구 공유 _lib.
 *
 * spec §12.2 정신 — buffett-quality-snapshot.ts의 계정명 변형 매핑을 추출 후
 * 사경인 영역에 포팅. 원본 도구 직접 import 금지 (ADR-0001 격리).
 *
 * 책임:
 * - 계정명 변형 처리 (자본총계 / 자기자본 합계 / Total Equity / 등)
 * - CFS(연결) → OFS(별도) 폴백
 * - OFS 강제 영역 (룰 본질이 별도재무제표 요구 시 — 7부 A consecutive_operating_loss / low_revenue_kosdaq)
 * - 연도 폴백 (사업보고서 미공시 시 가능한 만큼)
 *
 * 단위 정책 (G1):
 * - equity: 원
 * - ROE: 분수 (당기순이익 / 자본총계)
 * - shares: 주
 *
 * Ref: spec §12.1, §12.2, ADR-0001 (격리), ADR-0003 (단위 테스트 영역)
 */

import type { ToolCtx } from "../../_helpers.js";

interface AccountItem {
  account_nm: string;
  fs_div?: string;
  sj_div?: string;  // 5단계 현금흐름표 분기 (buffett-quality-snapshot.ts 정합)
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

// DART 응답의 금액 문자열을 number로 변환.
// 괄호 음수 표기 처리: "(123,456)" → -123456.
// buffett-quality-snapshot.ts의 parseAmount는 괄호 처리 없음 — 이 구현이 보완.
function parseAccountAmount(v: string | null | undefined): number | null {
  if (!v) return null;
  const cleaned = v.replace(/,/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    const inner = cleaned.slice(1, -1);
    const n = Number(inner);
    return Number.isFinite(n) ? -n : null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// candidates의 계정명을 순위 순으로 순회하며 첫 유효 매칭 반환.
// amount null/빈 문자열이면 다음 후보 시도. 모두 실패 → null.
export function pickAccountValue(
  accounts: Array<{ account_nm: string; thstrm_amount?: string | null }>,
  candidates: string[],
): number | null {
  for (const candidate of candidates) {
    const account = accounts.find((a) => a.account_nm === candidate);
    if (!account) continue;
    const v = parseAccountAmount(account.thstrm_amount);
    if (v !== null) return v;
  }
  return null;
}

// CFS(연결) 우선, 부재 시 OFS(별도) 폴백. 둘 다 없으면 원본 반환.
function filterCfsOfs(items: AccountItem[]): AccountItem[] {
  const cfs = items.filter((i: AccountItem) => i.fs_div === "CFS");
  if (cfs.length) return cfs;
  const ofs = items.filter((i: AccountItem) => i.fs_div === "OFS");
  if (ofs.length) return ofs;
  return items;
}

const OPERATING_CF_CANDIDATES = [
  "영업활동현금흐름",
  "영업활동으로인한현금흐름",
  "영업활동 현금흐름",
];
const INVESTING_CF_CANDIDATES = [
  "투자활동현금흐름",
  "투자활동으로인한현금흐름",
  "투자활동 현금흐름",
];
const FINANCING_CF_CANDIDATES = [
  "재무활동현금흐름",
  "재무활동으로인한현금흐름",
  "재무활동 현금흐름",
];

// 자본총계 추출 (원). 최근 사업보고서 기준. CFS 우선 → OFS 폴백.
export async function extractEquityCurrent(corp_code: string, ctx: ToolCtx): Promise<number> {
  const year = new Date().getFullYear() - 1;
  const raw = await ctx.client.getJson<DartResp>("fnlttSinglAcnt.json", {
    corp_code,
    bsns_year: String(year),
    reprt_code: "11011",
  });
  const items = raw.status === "000" ? (raw.list ?? []) : [];

  const cfsItems = items.filter((i) => i.fs_div === "CFS");
  if (cfsItems.length) {
    const v = pickAccountValue(cfsItems, ["자본총계", "자기자본 합계", "자본총계(연결)"]);
    if (v !== null) return v;
  }

  const ofsItems = items.filter((i) => i.fs_div === "OFS");
  if (ofsItems.length) {
    const v = pickAccountValue(ofsItems, ["자본총계", "자기자본 합계"]);
    if (v !== null) return v;
  }

  throw new Error(`financial-extractor: equity_current not found for ${corp_code}`);
}

// N년 ROE 시계열 (오래된→최근, 분수). N년 안 다 못 채우면 가능한 만큼.
// 각 연도 ROE = 당기순이익 / 자본총계 (분수).
// buffett 패턴: 3년 간격 base year → 1 API 호출 = 3년 데이터 (요율 절약).
// 빈 배열 가능 (미공시) — 호출자 책임으로 throw 처리.
export async function extractRoeSeries(
  corp_code: string,
  years: number,
  ctx: ToolCtx,
): Promise<number[]> {
  const endYear = new Date().getFullYear() - 1;
  const startYear = endYear - years + 1;

  const baseYears: number[] = [];
  for (let y = endYear; y >= startYear; y -= 3) baseYears.push(y);

  const responses = await Promise.all(
    baseYears.map(async (baseYear) => {
      try {
        const raw = await ctx.client.getJson<DartResp>("fnlttSinglAcnt.json", {
          corp_code,
          bsns_year: String(baseYear),
          reprt_code: "11011",
        });
        return { baseYear, items: raw.status === "000" ? (raw.list ?? []) : [] };
      } catch {
        return { baseYear, items: [] as AccountItem[] };
      }
    }),
  );

  const byYear = new Map<number, number>();
  for (const { baseYear, items } of responses) {
    if (!items.length) continue;
    const filtered = filterCfsOfs(items);
    const periods = [
      ["thstrm", baseYear],
      ["frmtrm", baseYear - 1],
      ["bfefrmtrm", baseYear - 2],
    ] as const;
    for (const [period, y] of periods) {
      if (y < startYear || y > endYear || byYear.has(y)) continue;
      const periodItems = filtered.map((item) => ({
        account_nm: item.account_nm,
        thstrm_amount: (item[`${period}_amount`] as string | undefined) ?? null,
      }));
      const equity = pickAccountValue(periodItems, ["자본총계", "자기자본 합계", "자본총계(연결)"]);
      const netIncome = pickAccountValue(periodItems, [
        "당기순이익",
        "당기순이익(손실)",
        "연결당기순이익",
        "Net Income",
      ]);
      if (equity !== null && equity !== 0 && netIncome !== null) {
        byYear.set(y, netIncome / equity);
      }
    }
  }

  return Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, roe]) => roe);
}

interface StockRow {
  se?: string;
  istc_totqy?: string;
}

interface StockResp {
  status: string;
  message: string;
  list?: StockRow[];
}

// 발행주식수 추출 (주). 최근 사업보고서 기준.
// stockTotqySttus (주식총수 현황) 사용 — fnlttSinglAcnt에 발행주식수 계정 미포함.
// 보통주(se="보통주") istc_totqy 반환. 우선주 제외.
export async function extractSharesOutstanding(corp_code: string, ctx: ToolCtx): Promise<number> {
  const year = new Date().getFullYear() - 1;
  const raw = await ctx.client.getJson<StockResp>("stockTotqySttus.json", {
    corp_code,
    bsns_year: String(year),
    reprt_code: "11011",
  });
  const rows = raw.status === "000" ? (raw.list ?? []) : [];
  const common = rows.find((r) => r.se === "보통주");
  if (!common?.istc_totqy) {
    throw new Error(`financial-extractor: shares_outstanding not found for ${corp_code}`);
  }
  const shares = parseAccountAmount(common.istc_totqy);
  if (shares !== null && shares > 0) return shares;
  throw new Error(`financial-extractor: shares_outstanding not found for ${corp_code}`);
}

/**
 * N년 영업이익 시계열 (오래된→최근, 원).
 *
 * fs_div_policy 분기:
 * - "OFS": 별도재무제표 강제. philosophy 7부 A consecutive_operating_loss 룰의
 *   "별도재무제표 4년 연속 영업손실" 규정 정합. CFS 폴백 0 — OFS 부재 시 해당
 *   연도는 배열에서 누락 (partial array). 호출자(killer-check.ts)가 length === years 검증.
 * - "CFS_FIRST": CFS 우선 → OFS 폴백. philosophy 7부 B oi_cf_divergence 룰의
 *   "이익(수치) vs 영업CF(사실) 어긋남" 검증. 그룹 전체 사실 영역 정합.
 *   호출자(cashflow-check.ts)가 length 검증 + 룰별 처리.
 *
 * extractRoeSeries 패턴 그대로: 3년 간격 base year로 API 호출 절약.
 * 빈 배열 가능 (미공시) — 호출자 책임으로 throw 처리.
 *
 * Ref: spec §10.1 consecutive_operating_loss (OFS), §10.2 oi_cf_divergence (CFS_FIRST),
 *      philosophy 7부 A·B
 */
export async function extractOperatingIncomeSeries(
  corp_code: string,
  years: number,
  ctx: ToolCtx,
  fs_div_policy: "OFS" | "CFS_FIRST",
): Promise<number[]> {
  const endYear = new Date().getFullYear() - 1;
  const startYear = endYear - years + 1;

  const baseYears: number[] = [];
  for (let y = endYear; y >= startYear; y -= 3) baseYears.push(y);

  const responses = await Promise.all(
    baseYears.map(async (baseYear) => {
      try {
        const raw = await ctx.client.getJson<DartResp>("fnlttSinglAcnt.json", {
          corp_code,
          bsns_year: String(baseYear),
          reprt_code: "11011",
        });
        return { baseYear, items: raw.status === "000" ? (raw.list ?? []) : [] };
      } catch {
        return { baseYear, items: [] as AccountItem[] };
      }
    }),
  );

  const byYear = new Map<number, number>();
  for (const { baseYear, items } of responses) {
    if (!items.length) continue;
    const filtered = fs_div_policy === "OFS"
      ? items.filter((i) => i.fs_div === "OFS")
      : filterCfsOfs(items);
    if (!filtered.length) continue;
    const periods = [
      ["thstrm", baseYear],
      ["frmtrm", baseYear - 1],
      ["bfefrmtrm", baseYear - 2],
    ] as const;
    for (const [period, y] of periods) {
      if (y < startYear || y > endYear || byYear.has(y)) continue;
      const periodItems = filtered.map((item) => ({
        account_nm: item.account_nm,
        thstrm_amount: (item[`${period}_amount`] as string | undefined) ?? null,
      }));
      const operatingIncome = pickAccountValue(periodItems, [
        "영업이익",
        "영업이익(손실)",
        "영업손실",
      ]);
      if (operatingIncome !== null) {
        byYear.set(y, operatingIncome);
      }
    }
  }

  return Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v);
}

// 단일 연도 매출 추출 (원). OFS 강제 — 코스닥 관리종목 규정 매출(별도재무제표) 기준.
// philosophy 7부 A: "매출 30억 미만 (코스닥 관리종목 기준)" — 코스닥시장 상장규정의
// "최근 사업연도 매출액 30억원 미만" 규정이 별도재무제표 기준. CFS 폴백 시 룰 의미 깨짐.
//
// OFS 부재 시 throw — extractEquityCurrent 패턴이지만 OFS-only 영역.
// 호출자(killer-check.ts)는 try/catch로 감싸 룰 미트리거 처리.
//
// Ref: spec §10.1 low_revenue_kosdaq, philosophy 7부 A
export async function extractRevenue(
  corp_code: string,
  year: number,
  ctx: ToolCtx,
): Promise<number> {
  const raw = await ctx.client.getJson<DartResp>("fnlttSinglAcnt.json", {
    corp_code,
    bsns_year: String(year),
    reprt_code: "11011",
  });
  const items = raw.status === "000" ? (raw.list ?? []) : [];
  const ofsItems = items.filter((i) => i.fs_div === "OFS");
  const revenue = pickAccountValue(ofsItems, [
    "매출액",
    "수익(매출액)",
    "영업수익",
    "Revenue",
    "Sales",
  ]);
  if (revenue === null) {
    throw new Error(
      `financial-extractor: revenue not found for ${corp_code} (year=${year}, OFS only)`,
    );
  }
  return revenue;
}

/**
 * N년 현금흐름표 시계열 (영업/투자/재무, 오래된→최근, 원).
 *
 * philosophy 7부 B "수익은 수치, 현금흐름은 사실" + 6부 "초보자에게는 현금흐름표".
 * 그룹 전체 사실 영역이라 CFS 우선 → OFS 폴백 (extractEquityCurrent 정합).
 *
 * 3년 간격 base year 절약 패턴 (extractRoeSeries / extractOperatingIncomeSeries 정합).
 * 항목별 독립 누락 — 한 항목 부재 시 그 연도 그 항목만 누락. 5단계 룰들이 항목별
 * 다른 영역 사용 (negative_ocf_persistent는 영업CF만, cf_pattern_risky는 3 항목 동시).
 *
 * sj_div="CF" 분기 가정 — 묶음 2 field-test 확정 영역. 어긋날 시 정정 +
 * spec-pending-edits 누적 (CLAUDE.md "DART 응답 형태 가정" 영역 정합).
 *
 * 영업CF 음수가 7부 B 본질 시그널이라 parseAccountAmount 괄호/부호 음수 처리 핵심.
 *
 * Ref: spec §10.2 cashflow_check, philosophy 7부 B + 6부
 */
export async function extractCashflowSeries(
  corp_code: string,
  years: number,
  ctx: ToolCtx,
): Promise<{ operating: number[]; investing: number[]; financing: number[] }> {
  const endYear = new Date().getFullYear() - 1;
  const startYear = endYear - years + 1;

  const baseYears: number[] = [];
  for (let y = endYear; y >= startYear; y -= 3) baseYears.push(y);

  const responses = await Promise.all(
    baseYears.map(async (baseYear) => {
      try {
        const raw = await ctx.client.getJson<DartResp>("fnlttSinglAcnt.json", {
          corp_code,
          bsns_year: String(baseYear),
          reprt_code: "11011",
        });
        return { baseYear, items: raw.status === "000" ? (raw.list ?? []) : [] };
      } catch {
        return { baseYear, items: [] as AccountItem[] };
      }
    }),
  );

  const operatingByYear = new Map<number, number>();
  const investingByYear = new Map<number, number>();
  const financingByYear = new Map<number, number>();

  for (const { baseYear, items } of responses) {
    if (!items.length) continue;
    const cfItems = items.filter((i) => i.sj_div === "CF");
    if (!cfItems.length) continue;
    const filtered = filterCfsOfs(cfItems);
    if (!filtered.length) continue;

    const periods = [
      ["thstrm", baseYear],
      ["frmtrm", baseYear - 1],
      ["bfefrmtrm", baseYear - 2],
    ] as const;

    for (const [period, y] of periods) {
      if (y < startYear || y > endYear) continue;
      const periodItems = filtered.map((item) => ({
        account_nm: item.account_nm,
        thstrm_amount: (item[`${period}_amount`] as string | undefined) ?? null,
      }));

      if (!operatingByYear.has(y)) {
        const v = pickAccountValue(periodItems, OPERATING_CF_CANDIDATES);
        if (v !== null) operatingByYear.set(y, v);
      }
      if (!investingByYear.has(y)) {
        const v = pickAccountValue(periodItems, INVESTING_CF_CANDIDATES);
        if (v !== null) investingByYear.set(y, v);
      }
      if (!financingByYear.has(y)) {
        const v = pickAccountValue(periodItems, FINANCING_CF_CANDIDATES);
        if (v !== null) financingByYear.set(y, v);
      }
    }
  }

  const sortAndExtract = (m: Map<number, number>) =>
    Array.from(m.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v);

  return {
    operating: sortAndExtract(operatingByYear),
    investing: sortAndExtract(investingByYear),
    financing: sortAndExtract(financingByYear),
  };
}
