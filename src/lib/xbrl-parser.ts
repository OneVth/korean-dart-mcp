/**
 * XBRL 파서 — DART instance document 에서 주요 재무제표(BS/IS/CF) 추출.
 *
 * 설계:
 *   - whitelist 기반 (핵심 50 태그 내외). presentation/calculation linkbase 는 무시.
 *   - 라벨: 한국어(lab-ko.xml) primary role 만 사용, 없으면 tag 로 폴백.
 *   - 재무제표 본체 facts: segment 가 ConsolidatedMember/SeparateMember "만" 있는
 *     단순 context (추가 axis 를 가진 주석 facts 는 제외).
 *   - 기간: context id prefix 로 판별 (CFY=current, PFY=prior, BPFY=before-prior).
 *   - 단위: 원화(KRW) 그대로. decimals 는 표시 지침이라 별도 스케일 변환 없음.
 *
 * v0.8.0 범위: 마크다운 3개 표 (BS/IS/CF) 생성. 본격 파싱(taxonomy 기반, 계층,
 * 계산 관계 검증)은 v0.9.0.
 */

import yauzl from "yauzl";
import { DOMParser } from "@xmldom/xmldom";

// 한국 상장사 XBRL 주요 태그 whitelist — 재무제표 본체만. 순서가 표 출력 순서.
// IFRS-Full 과 K-IFRS(dart) 태그를 둘 다 등록해 엔티티별 사용 차이 흡수.

export const BS_TAGS: string[] = [
  "ifrs-full:Assets",
  "ifrs-full:CurrentAssets",
  "ifrs-full:CashAndCashEquivalents",
  "ifrs-full:TradeAndOtherCurrentReceivables",
  "ifrs-full:Inventories",
  "ifrs-full:NoncurrentAssets",
  "ifrs-full:PropertyPlantAndEquipment",
  "ifrs-full:IntangibleAssetsOtherThanGoodwill",
  "ifrs-full:Goodwill",
  "ifrs-full:Liabilities",
  "ifrs-full:CurrentLiabilities",
  "ifrs-full:TradeAndOtherCurrentPayables",
  "ifrs-full:NoncurrentLiabilities",
  "ifrs-full:LongtermBorrowings",
  "ifrs-full:Equity",
  "ifrs-full:EquityAttributableToOwnersOfParent",
  "ifrs-full:IssuedCapital",
  "dart:IssuedCapitalOfCommonStock",
  "dart:IssuedCapitalOfPreferredStock",
  "ifrs-full:RetainedEarnings",
  "ifrs-full:NoncontrollingInterests",
];

export const IS_TAGS: string[] = [
  "ifrs-full:Revenue",
  "ifrs-full:CostOfSales",
  "ifrs-full:GrossProfit",
  "ifrs-full:DistributionCosts",
  "ifrs-full:AdministrativeExpense",
  "dart:OperatingIncomeLoss",
  "ifrs-full:ProfitLossFromOperatingActivities",
  "ifrs-full:FinanceIncome",
  "ifrs-full:FinanceCosts",
  "ifrs-full:ProfitLossBeforeTax",
  "ifrs-full:IncomeTaxExpenseContinuingOperations",
  "ifrs-full:ProfitLoss",
  "ifrs-full:ProfitLossAttributableToOwnersOfParent",
  "ifrs-full:ProfitLossAttributableToNoncontrollingInterests",
  "ifrs-full:BasicEarningsLossPerShare",
  "ifrs-full:DilutedEarningsLossPerShare",
];

export const CF_TAGS: string[] = [
  "ifrs-full:CashFlowsFromUsedInOperatingActivities",
  "ifrs-full:CashFlowsFromUsedInInvestingActivities",
  "ifrs-full:CashFlowsFromUsedInFinancingActivities",
  "ifrs-full:IncreaseDecreaseInCashAndCashEquivalents",
  "ifrs-full:CashAndCashEquivalents",
  "dart:CashAndCashEquivalentsAtBeginningOfPeriodCf",
  "dart:CashAndCashEquivalentsAtEndOfPeriodCf",
];

// K-IFRS 태그 한국어 대안 라벨 (instance 라벨이 영문이거나 없을 때 폴백)
const KO_FALLBACK: Record<string, string> = {
  "ifrs-full:Assets": "자산총계",
  "ifrs-full:CurrentAssets": "유동자산",
  "ifrs-full:NoncurrentAssets": "비유동자산",
  "ifrs-full:CashAndCashEquivalents": "현금및현금성자산",
  "ifrs-full:Inventories": "재고자산",
  "ifrs-full:PropertyPlantAndEquipment": "유형자산",
  "ifrs-full:Goodwill": "영업권",
  "ifrs-full:Liabilities": "부채총계",
  "ifrs-full:CurrentLiabilities": "유동부채",
  "ifrs-full:NoncurrentLiabilities": "비유동부채",
  "ifrs-full:LongtermBorrowings": "장기차입금",
  "ifrs-full:Equity": "자본총계",
  "ifrs-full:EquityAttributableToOwnersOfParent": "지배기업 소유주 지분",
  "ifrs-full:IssuedCapital": "자본금",
  "ifrs-full:RetainedEarnings": "이익잉여금",
  "ifrs-full:NoncontrollingInterests": "비지배지분",
  "ifrs-full:Revenue": "매출액",
  "ifrs-full:CostOfSales": "매출원가",
  "ifrs-full:GrossProfit": "매출총이익",
  "ifrs-full:ProfitLossFromOperatingActivities": "영업이익",
  "dart:OperatingIncomeLoss": "영업이익",
  "ifrs-full:ProfitLossBeforeTax": "법인세차감전이익",
  "ifrs-full:IncomeTaxExpenseContinuingOperations": "법인세비용",
  "ifrs-full:ProfitLoss": "당기순이익",
  "ifrs-full:ProfitLossAttributableToOwnersOfParent": "지배기업 소유주 귀속 순이익",
  "ifrs-full:BasicEarningsLossPerShare": "기본주당이익",
  "ifrs-full:CashFlowsFromUsedInOperatingActivities": "영업활동 현금흐름",
  "ifrs-full:CashFlowsFromUsedInInvestingActivities": "투자활동 현금흐름",
  "ifrs-full:CashFlowsFromUsedInFinancingActivities": "재무활동 현금흐름",
  "ifrs-full:IncreaseDecreaseInCashAndCashEquivalents": "현금 증감",
};

export interface XbrlFact {
  tag: string;
  contextRef: string;
  unitRef?: string;
  decimals?: string;
  value: string;
}

export interface XbrlContext {
  id: string;
  consolidated: boolean | null;
  dimensionCount: number;
  periodType: "instant" | "duration";
  instant?: string;
  startDate?: string;
  endDate?: string;
  periodBucket: "current" | "prior" | "priorPrior" | null;
  pointType: "instant" | "duration";
}

export interface XbrlData {
  facts: XbrlFact[];
  contexts: Map<string, XbrlContext>;
  labels: Map<string, string>;
  entityId: string | null;
}

export interface StatementRow {
  tag: string;
  label: string;
  current: number | null;
  prior: number | null;
  priorPrior: number | null;
}

export interface StatementTable {
  rows: StatementRow[];
}

export interface Statements {
  periods: {
    current: { end?: string; start?: string } | null;
    prior: { end?: string; start?: string } | null;
    priorPrior: { end?: string; start?: string } | null;
  };
  fs_div: "consolidated" | "separate";
  statements: {
    BS?: StatementTable;
    IS?: StatementTable;
    CF?: StatementTable;
  };
}

// ── ZIP extraction ─────────────────────────────────────

export function extractXbrlFilesFromZip(zipBuf: Buffer): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(zipBuf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("zip open failed"));
      const out = new Map<string, string>();
      zip.on("entry", (entry: yauzl.Entry) => {
        if (/\/$/.test(entry.fileName) || !/\.(xbrl|xml|xsd)$/i.test(entry.fileName)) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (err2, stream) => {
          if (err2 || !stream) return reject(err2 ?? new Error("stream open failed"));
          const chunks: Buffer[] = [];
          stream.on("data", (c: Buffer) => chunks.push(c));
          stream.on("end", () => {
            out.set(entry.fileName, Buffer.concat(chunks).toString("utf8"));
            zip.readEntry();
          });
          stream.on("error", reject);
        });
      });
      zip.on("end", () => resolve(out));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

// ── Instance parsing ───────────────────────────────────

const CONTEXT_ID_PREFIX_RE = /^(BPFY|PFY|CFY)\d+([ed])FY(?:_(.+))?$/;

/** context id 에서 period bucket + pointType 추정. */
function classifyContextId(id: string): {
  periodBucket: XbrlContext["periodBucket"];
  pointType: "instant" | "duration";
  axisTail: string | null;
} {
  const m = CONTEXT_ID_PREFIX_RE.exec(id);
  if (!m) return { periodBucket: null, pointType: "duration", axisTail: null };
  const [, prefix, type, tail] = m;
  const periodBucket =
    prefix === "CFY" ? "current" : prefix === "PFY" ? "prior" : "priorPrior";
  return {
    periodBucket,
    pointType: type === "e" ? "instant" : "duration",
    axisTail: tail ?? null,
  };
}

/** axisTail 이 ConsolidatedMember/SeparateMember "만" 있으면 재무제표 본체 context. */
function classifyConsolidation(axisTail: string | null): {
  consolidated: boolean | null;
  dimensionCount: number;
} {
  if (!axisTail) return { consolidated: null, dimensionCount: 0 };
  const parts = axisTail.split("_");
  const joined = axisTail;
  const hasConsolidated = /ifrs-full_ConsolidatedMember/.test(joined);
  const hasSeparate = /ifrs-full_SeparateMember/.test(joined);
  const axisMatches = axisTail.match(/Axis/g) ?? [];
  const dimensionCount = axisMatches.length;
  if (hasConsolidated) return { consolidated: true, dimensionCount };
  if (hasSeparate) return { consolidated: false, dimensionCount };
  return { consolidated: null, dimensionCount };
}

export function parseInstance(xml: string): {
  facts: XbrlFact[];
  contexts: Map<string, XbrlContext>;
  entityId: string | null;
} {
  const errors: string[] = [];
  const doc = new DOMParser({
    onError: (_level: string, msg: string) => errors.push(msg),
  }).parseFromString(xml, "text/xml");

  const contexts = new Map<string, XbrlContext>();
  let entityId: string | null = null;

  // context 추출
  const ctxEls = doc.getElementsByTagName("xbrli:context");
  for (let i = 0; i < ctxEls.length; i++) {
    const el = ctxEls[i] as any;
    const id = el.getAttribute("id");
    if (!id) continue;

    if (!entityId) {
      const idf = el.getElementsByTagName("xbrli:identifier")[0] as any;
      if (idf) entityId = (idf.textContent ?? "").trim();
    }

    const periodEl = el.getElementsByTagName("xbrli:period")[0] as any;
    if (!periodEl) continue;

    const instantEl = periodEl.getElementsByTagName("xbrli:instant")[0] as any;
    const startEl = periodEl.getElementsByTagName("xbrli:startDate")[0] as any;
    const endEl = periodEl.getElementsByTagName("xbrli:endDate")[0] as any;

    const periodType = instantEl ? "instant" : "duration";
    const classified = classifyContextId(id);
    const cons = classifyConsolidation(classified.axisTail);

    contexts.set(id, {
      id,
      consolidated: cons.consolidated,
      dimensionCount: cons.dimensionCount,
      periodType,
      instant: instantEl?.textContent?.trim(),
      startDate: startEl?.textContent?.trim(),
      endDate: endEl?.textContent?.trim(),
      periodBucket: classified.periodBucket,
      pointType: classified.pointType,
    });
  }

  // fact 추출 — xbrli:xbrl 루트 직접 자식 중 context/unit 이 아닌 것들
  const facts: XbrlFact[] = [];
  const root = doc.documentElement as any;
  const children = root?.childNodes;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (!node || node.nodeType !== 1) continue; // ELEMENT_NODE
      const el = node as any;
      const name: string = el.nodeName ?? el.tagName ?? "";
      if (
        !name ||
        name.startsWith("xbrli:") ||
        name.startsWith("link:") ||
        name === "xbrli:unit" ||
        name === "xbrli:context"
      ) {
        continue;
      }
      const contextRef = el.getAttribute("contextRef");
      if (!contextRef) continue;
      const value = (el.textContent ?? "").trim();
      facts.push({
        tag: name,
        contextRef,
        unitRef: el.getAttribute("unitRef") ?? undefined,
        decimals: el.getAttribute("decimals") ?? undefined,
        value,
      });
    }
  }

  return { facts, contexts, entityId };
}

// ── Label parsing ──────────────────────────────────────

const LABEL_ID_RE = /^Label_label_(.+?)(?:_ko|_en)?(?:_\d+)?$/;

export function parseLabels(xml: string): Map<string, string> {
  const errors: string[] = [];
  const doc = new DOMParser({
    onError: (_level: string, msg: string) => errors.push(msg),
  }).parseFromString(xml, "text/xml");
  const labels = new Map<string, string>();
  const labelEls = doc.getElementsByTagName("link:label");
  for (let i = 0; i < labelEls.length; i++) {
    const el = labelEls[i] as any;
    const role = el.getAttribute("xlink:role");
    if (role && role !== "http://www.xbrl.org/2003/role/label") continue;
    const id = el.getAttribute("id") ?? el.getAttribute("xlink:label");
    if (!id) continue;
    const m = LABEL_ID_RE.exec(id);
    if (!m) continue;
    // m[1] 예: "ifrs-full_Assets" → "ifrs-full:Assets"
    const rawTag = m[1];
    const idx = rawTag.indexOf("_");
    if (idx < 0) continue;
    const tag = `${rawTag.substring(0, idx)}:${rawTag.substring(idx + 1)}`;
    const text = (el.textContent ?? "").trim();
    if (!text) continue;
    if (!labels.has(tag)) labels.set(tag, text); // 첫 primary 만 채택
  }
  return labels;
}

// ── Orchestration ──────────────────────────────────────

export async function parseXbrlZip(zipBuf: Buffer): Promise<XbrlData> {
  const files = await extractXbrlFilesFromZip(zipBuf);

  let instanceXml: string | null = null;
  let labelXml: string | null = null;
  for (const [name, content] of files) {
    if (name.endsWith(".xbrl")) instanceXml = content;
    else if (/_lab-ko\.xml$/i.test(name)) labelXml = content;
  }
  if (!instanceXml) throw new Error("XBRL instance document (.xbrl) not found in ZIP");

  const { facts, contexts, entityId } = parseInstance(instanceXml);
  const labels = labelXml ? parseLabels(labelXml) : new Map<string, string>();

  return { facts, contexts, labels, entityId };
}

// ── Statement building ─────────────────────────────────

function resolveLabel(tag: string, labels: Map<string, string>): string {
  const fromFile = labels.get(tag);
  if (fromFile) return fromFile;
  const fallback = KO_FALLBACK[tag];
  if (fallback) return fallback;
  return tag;
}

/** 재무제표 본체 fact 만 골라 bucket 별로 인덱싱. */
function indexCoreFacts(
  data: XbrlData,
  fs_div: "consolidated" | "separate",
): Map<string, { current: number | null; prior: number | null; priorPrior: number | null }> {
  const want = fs_div === "consolidated";
  const idx = new Map<
    string,
    { current: number | null; prior: number | null; priorPrior: number | null }
  >();
  for (const fact of data.facts) {
    const ctx = data.contexts.get(fact.contextRef);
    if (!ctx) continue;
    if (ctx.dimensionCount > 1) continue; // 주석 제외
    if (ctx.consolidated === null) continue; // segment 없는 것 제외
    if (ctx.consolidated !== want) continue;
    if (!ctx.periodBucket) continue;
    const num = Number(fact.value.replace(/,/g, ""));
    if (!Number.isFinite(num)) continue;
    const row = idx.get(fact.tag) ?? { current: null, prior: null, priorPrior: null };
    row[ctx.periodBucket] = num;
    idx.set(fact.tag, row);
  }
  return idx;
}

function findPeriods(
  data: XbrlData,
  fs_div: "consolidated" | "separate",
): Statements["periods"] {
  const want = fs_div === "consolidated";
  const byBucket: Record<
    "current" | "prior" | "priorPrior",
    { end?: string; start?: string } | null
  > = { current: null, prior: null, priorPrior: null };
  for (const ctx of data.contexts.values()) {
    if (ctx.dimensionCount > 1) continue;
    if (ctx.consolidated === null || ctx.consolidated !== want) continue;
    if (!ctx.periodBucket) continue;
    if (byBucket[ctx.periodBucket]) continue;
    byBucket[ctx.periodBucket] = {
      end: ctx.endDate ?? ctx.instant,
      start: ctx.startDate,
    };
  }
  return byBucket;
}

export function buildStatements(
  data: XbrlData,
  opts: { fs_div: "consolidated" | "separate"; sections: ("BS" | "IS" | "CF")[] },
): Statements {
  const idx = indexCoreFacts(data, opts.fs_div);
  const periods = findPeriods(data, opts.fs_div);

  function makeTable(tags: string[]): StatementTable {
    const rows: StatementRow[] = [];
    for (const tag of tags) {
      const v = idx.get(tag);
      if (!v) continue;
      if (v.current == null && v.prior == null && v.priorPrior == null) continue;
      rows.push({
        tag,
        label: resolveLabel(tag, data.labels),
        current: v.current,
        prior: v.prior,
        priorPrior: v.priorPrior,
      });
    }
    return { rows };
  }

  const statements: Statements["statements"] = {};
  if (opts.sections.includes("BS")) statements.BS = makeTable(BS_TAGS);
  if (opts.sections.includes("IS")) statements.IS = makeTable(IS_TAGS);
  if (opts.sections.includes("CF")) statements.CF = makeTable(CF_TAGS);

  return { periods, fs_div: opts.fs_div, statements };
}

// ── Markdown rendering ─────────────────────────────────

function fmt(n: number | null): string {
  if (n == null) return "-";
  return n.toLocaleString("ko-KR");
}

function renderTable(title: string, table: StatementTable, periods: Statements["periods"]): string {
  const head1 = periods.current?.end ?? "당기";
  const head2 = periods.prior?.end ?? "전기";
  const head3 = periods.priorPrior?.end ?? "전전기";
  const lines: string[] = [
    `## ${title}`,
    "",
    `| 계정과목 | ${head1} | ${head2} | ${head3} |`,
    "| --- | ---: | ---: | ---: |",
  ];
  for (const r of table.rows) {
    lines.push(`| ${r.label} | ${fmt(r.current)} | ${fmt(r.prior)} | ${fmt(r.priorPrior)} |`);
  }
  return lines.join("\n");
}

export function renderMarkdown(st: Statements): string {
  const parts: string[] = [];
  parts.push(
    `# 재무제표 (${st.fs_div === "consolidated" ? "연결" : "별도"})`,
    "",
    "※ 값 단위: 원. 표시되지 않은 계정과 모든 기간이 공시에 기재되지 않은 경우 생략.",
    "",
  );
  if (st.statements.BS) parts.push(renderTable("재무상태표 (BS)", st.statements.BS, st.periods), "");
  if (st.statements.IS)
    parts.push(renderTable("손익계산서 (IS)", st.statements.IS, st.periods), "");
  if (st.statements.CF)
    parts.push(renderTable("현금흐름표 (CF)", st.statements.CF, st.periods), "");
  return parts.join("\n");
}
