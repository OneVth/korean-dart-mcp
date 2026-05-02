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

// field-test 확정 (묶음 2): DART fnlttSinglAcntAll.json CF 항목 account_nm 실측값
// 확인된 변형: "현금흐름" / "순현금흐름" / "인한 현금흐름" (공백/접속사 차이)
// 로마자 접두어 변형(Ⅰ./Ⅱ./Ⅲ.) 종목은 현재 미지원 — spec-pending-edits 누적
const OPERATING_CF_CANDIDATES = [
  "영업활동현금흐름",            // 삼성전자, 젬백스
  "영업활동으로 인한 순현금흐름",  // 헬릭스미스
  "영업활동으로 인한 현금흐름",   // 현대자동차
  "영업활동으로인한현금흐름",      // 기존 후보 유지
  "영업활동 현금흐름",
];
const INVESTING_CF_CANDIDATES = [
  "투자활동현금흐름",            // 삼성전자, 젬백스
  "투자활동으로 인한 순현금흐름",  // 헬릭스미스
  "투자활동으로 인한 현금흐름",   // 현대자동차
  "투자활동으로인한현금흐름",      // 기존 후보 유지
  "투자활동 현금흐름",
];
const FINANCING_CF_CANDIDATES = [
  "재무활동현금흐름",            // 삼성전자, 젬백스
  "재무활동으로인한 순현금흐름",  // 헬릭스미스 (공백 위치 고유)
  "재무활동으로 인한 순현금흐름",  // 변형 대비
  "재무활동으로 인한 현금흐름",   // 현대자동차
  "재무활동으로인한현금흐름",      // 기존 후보 유지
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

interface AlotRow {
  se?: string;
  thstrm?: string;     // ※ AccountItem의 thstrm_amount와 다름 (_amount 없음)
  frmtrm?: string;
  lwfr?: string;       // field-test 확정: bfefrmtrm 아님 — alotMatter는 lwfr 사용 (2026-05-02)
  [k: string]: string | undefined;
}

interface AlotResp {
  status: string;
  message: string;
  list?: AlotRow[];
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
 * fnlttSinglAcntAll.json 필수 (fnlttSinglAcnt.json은 BS+IS만 반환).
 * CF 항목(sj_div="CF")은 fs_div 미설정 — CFS/OFS 구분은 API fs_div 파라미터로 처리.
 * CFS call로 CF 항목 없으면 OFS 폴백 (연결재무제표 미작성 법인 대응).
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
        // CFS 우선 — 연결현금흐름표 (7부 B: 그룹 전체 사실)
        // CF 항목은 fs_div 미설정이므로 filterCfsOfs 미사용 — API 파라미터로 분기
        let raw = await ctx.client.getJson<DartResp>("fnlttSinglAcntAll.json", {
          corp_code,
          bsns_year: String(baseYear),
          reprt_code: "11011",
          fs_div: "CFS",
        });
        let cfItems = (raw.status === "000" ? (raw.list ?? []) : []).filter(
          (i) => i.sj_div === "CF",
        );
        if (!cfItems.length) {
          // OFS 폴백 — 연결재무제표 미작성 법인
          raw = await ctx.client.getJson<DartResp>("fnlttSinglAcntAll.json", {
            corp_code,
            bsns_year: String(baseYear),
            reprt_code: "11011",
            fs_div: "OFS",
          });
          cfItems = (raw.status === "000" ? (raw.list ?? []) : []).filter(
            (i) => i.sj_div === "CF",
          );
        }
        return { baseYear, items: cfItems };
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

    const periods = [
      ["thstrm", baseYear],
      ["frmtrm", baseYear - 1],
      ["bfefrmtrm", baseYear - 2],
    ] as const;

    for (const [period, y] of periods) {
      if (y < startYear || y > endYear) continue;
      const periodItems = items.map((item) => ({
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

/**
 * 자산총계 단일 연도 추출 (원). CFS 우선 → OFS 폴백.
 *
 * 5단계 negative_ocf_with_active_icf 룰의 "자산총계 10%+" 비교 영역.
 * 비교 시점은 분석 윈도 가장 최근 연도 — 룰 본질이 "현재 자산 규모 대비 투자 강도"
 * (spec §10.2 명시 누락 영역, 묶음 2 spec-pending-edits 누적).
 *
 * extractEquityCurrent 패턴 정합. account_nm 매처 단일 ("자산총계") —
 * buffett-quality-snapshot.ts ACCOUNT_MATCHERS 정합. 부재 시 throw —
 * 호출자(cashflow-check.ts)가 try/catch로 룰 미트리거 처리.
 *
 * Ref: spec §10.2 negative_ocf_with_active_icf, philosophy 7부 B
 */
export async function extractTotalAssets(
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

  const cfsItems = items.filter((i) => i.fs_div === "CFS");
  if (cfsItems.length) {
    const v = pickAccountValue(cfsItems, ["자산총계"]);
    if (v !== null) return v;
  }

  const ofsItems = items.filter((i) => i.fs_div === "OFS");
  if (ofsItems.length) {
    const v = pickAccountValue(ofsItems, ["자산총계"]);
    if (v !== null) return v;
  }

  throw new Error(
    `financial-extractor: total_assets not found for ${corp_code} (year=${year})`,
  );
}

// alotMatter 행에서 se 키로 첫 유효 매칭 값 반환.
// AccountItem의 account_nm 구조 다름 — se 필드 사용, _amount suffix 없음.
// parseAccountAmount 재사용 (괄호 음수, "-" 플레이스홀더, 콤마 제거 포함).
function pickAlotValue(
  rows: AlotRow[],
  candidates: string[],
  period: "thstrm" | "frmtrm" | "lwfr",
): number | null {
  for (const candidate of candidates) {
    const row = rows.find((r) => r.se === candidate);
    if (!row) continue;
    const v = parseAccountAmount(row[period]);
    if (v !== null) return v;
  }
  return null;
}

/**
 * N년 당기순이익 시계열 (오래된→최근, 원).
 *
 * dividend_check의 배당성향(배당금총액 / 당기순이익) 계산용.
 * extractRoeSeries 패턴 그대로 — 3년 간격 base year로 API 호출 절약.
 * CFS 우선 → OFS 폴백 (filterCfsOfs 정합).
 *
 * 빈 배열 가능 (미공시) — 호출자 책임으로 throw 처리.
 *
 * Ref: spec §10.6 dividend_check, philosophy 7부 E
 */
export async function extractNetIncomeSeries(
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
      const netIncome = pickAccountValue(periodItems, [
        "당기순이익",
        "당기순이익(손실)",
        "연결당기순이익",
        "Net Income",
      ]);
      if (netIncome !== null) {
        byYear.set(y, netIncome);
      }
    }
  }

  return Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v);
}

/**
 * N년 배당 시계열 (오래된→최근).
 *
 * DART alotMatter.json (배당에 관한 사항) 사용.
 * extractRoeSeries 패턴 그대로 — 3년 간격 base year로 API 호출 절약.
 *
 * total: 현금배당금총액 (원). 배당 없는 연도는 0. 전 응답 빈 시 빈 배열.
 *   se 후보: ["현금배당금총액(백만원)", "현금배당총액(백만원)"] — 단위 ×1,000,000
 * yield_market: 시가배당률 (분수). 해당 필드 있는 연도만. 없으면 빈 배열.
 *   se 후보: ["시가배당률(%)", "현금배당수익률(%)"] — 단위 ÷100
 *
 * alotMatter 응답 필드 가정 (field-test 확정 영역 — 묶음 2에서 검증 예정):
 *   행 구분: se 필드. 기간: thstrm/frmtrm/bfefrmtrm (_amount suffix 없음).
 *
 * CFS/OFS 구분 없음 — 배당 결정 자체 (별도/연결 구분 무의미).
 *
 * Ref: spec §10.6 dividend_check, philosophy 7부 E
 */
export async function extractDividendSeries(
  corp_code: string,
  years: number,
  ctx: ToolCtx,
): Promise<{
  total: number[];
  yield_market: number[];
}> {
  const endYear = new Date().getFullYear() - 1;
  const startYear = endYear - years + 1;

  const baseYears: number[] = [];
  for (let y = endYear; y >= startYear; y -= 3) baseYears.push(y);

  const responses = await Promise.all(
    baseYears.map(async (baseYear) => {
      try {
        const raw = await ctx.client.getJson<AlotResp>("alotMatter.json", {
          corp_code,
          bsns_year: String(baseYear),
          reprt_code: "11011",
        });
        return { baseYear, rows: raw.status === "000" ? (raw.list ?? []) : [] };
      } catch {
        return { baseYear, rows: [] as AlotRow[] };
      }
    }),
  );

  // 전 응답 항목 0 → 배당 이력 데이터 자체 없음 — total 빈 배열 반환
  const anyRows = responses.some((r) => r.rows.length > 0);

  // field-test 확정 (묶음 2): 실측 se 값 검증 예정
  const DIVIDEND_TOTAL_CANDIDATES = [
    "현금배당금총액(백만원)",
    "현금배당총액(백만원)",
  ];
  const DIVIDEND_YIELD_CANDIDATES = [
    "시가배당률(%)",
    "현금배당수익률(%)",
  ];

  const totalByYear = new Map<number, number>();
  const yieldByYear = new Map<number, number>();

  for (const { baseYear, rows } of responses) {
    if (!rows.length) continue;
    // field-test 확정: alotMatter는 3번째 기간에 bfefrmtrm 아닌 lwfr 사용 (2026-05-02)
    const periods = [
      ["thstrm", baseYear],
      ["frmtrm", baseYear - 1],
      ["lwfr", baseYear - 2],
    ] as const;
    for (const [period, y] of periods) {
      if (y < startYear || y > endYear) continue;

      if (!totalByYear.has(y)) {
        const raw = pickAlotValue(rows, DIVIDEND_TOTAL_CANDIDATES, period);
        // null = 응답 있으나 해당 연도 배당 행 미존재 → 무배당 연도 (0)
        totalByYear.set(y, raw !== null ? raw * 1_000_000 : 0);
      }

      if (!yieldByYear.has(y)) {
        const raw = pickAlotValue(rows, DIVIDEND_YIELD_CANDIDATES, period);
        if (raw !== null) yieldByYear.set(y, raw / 100);
      }
    }
  }

  const sortedTotal = Array.from(totalByYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v);

  const sortedYield = Array.from(yieldByYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v);

  return {
    total: anyRows ? sortedTotal : [],
    yield_market: sortedYield,
  };
}
