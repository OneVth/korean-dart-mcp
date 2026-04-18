/**
 * XBRL 파서 — DART instance document 에서 주요 재무제표(BS/IS/CF) 추출.
 *
 * 설계:
 *   - v0.8: whitelist 기반 (핵심 50 태그 내외). presentation/calculation linkbase 무시.
 *   - v0.9: "full" 모드 추가 — presentation linkbase 기반 계층/순서, calculation
 *     linkbase 기반 합산 검증. 업종별 택소노미에 자동 대응 (taxonomy에서 직접 추출).
 *   - 라벨: 한국어(lab-ko.xml) primary role 만 사용, 없으면 tag 로 폴백.
 *   - 재무제표 본체 facts: segment 가 ConsolidatedMember/SeparateMember "만" 있는
 *     단순 context (추가 axis 를 가진 주석 facts 는 제외).
 *   - 기간: context id prefix 로 판별 (CFY=current, PFY=prior, BPFY=before-prior).
 *   - 단위: 원화(KRW) 그대로. decimals 는 표시 지침이라 별도 스케일 변환 없음.
 *
 * DART role 코드:
 *   D210=BS, D310=IS, D410=CI, D520=SE(자본변동), D610=CF.
 *   접미 00=연결, 05=별도. D8xxxxx 는 주석/공시.
 */

import { DOMParser } from "@xmldom/xmldom";
import { safeUnzipToMemory } from "../utils/safe-zip.js";

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
  taxonomy?: XbrlTaxonomy;
  /** DOM 파싱 중 누적된 경고·에러 메시지. 빈 결과와 파싱 실패를 구분하기 위함. */
  parseWarnings?: string[];
}

export interface RoleInfo {
  roleUri: string;
  statementType: "BS" | "IS" | "CI" | "SE" | "CF" | null;
  fs_div: "consolidated" | "separate" | null;
}

export interface PresentationNode {
  tag: string;
  depth: number;
  order: number;
  parent: string | null;
}

export interface RolePresentation {
  info: RoleInfo;
  nodes: PresentationNode[];
}

export interface CalcRelation {
  parent: string;
  child: string;
  weight: number;
  order: number;
}

export interface RoleCalculation {
  info: RoleInfo;
  relations: CalcRelation[];
}

export interface XbrlTaxonomy {
  presentations: RolePresentation[];
  calculations: RoleCalculation[];
}

export interface StatementRow {
  tag: string;
  label: string;
  depth?: number;
  current: number | null;
  prior: number | null;
  priorPrior: number | null;
}

export interface StatementTable {
  rows: StatementRow[];
}

export interface CalcViolation {
  parent: string;
  parent_label: string;
  expected: number;
  actual: number;
  diff: number;
  ratio: number;
  period: "current" | "prior" | "priorPrior";
}

export interface Statements {
  periods: {
    current: { end?: string; start?: string } | null;
    prior: { end?: string; start?: string } | null;
    priorPrior: { end?: string; start?: string } | null;
  };
  fs_div: "consolidated" | "separate";
  mode: "whitelist" | "full";
  statements: {
    BS?: StatementTable;
    IS?: StatementTable;
    CF?: StatementTable;
  };
  validations?: CalcViolation[];
}

// ── ZIP extraction ─────────────────────────────────────

export async function extractXbrlFilesFromZip(zipBuf: Buffer): Promise<Map<string, string>> {
  const entries = await safeUnzipToMemory(zipBuf, {
    filter: (name) => /\.(xbrl|xml|xsd)$/i.test(name),
  });
  const out = new Map<string, string>();
  for (const e of entries) out.set(e.name, e.data.toString("utf8"));
  return out;
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
  errors: string[];
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

  return { facts, contexts, entityId, errors };
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

// ── Linkbase (presentation / calculation) ──────────────

// DART role URI 패턴:
//   일반: role-D{major}{3digits}{suffix2}    예: role-D210000 → major=2(BS), suffix=00(연결)
//   금융/보험: role-DX{major}{3digits}{suffix2}  예: role-DX220000 → major=2(BS)
// major: 2=BS, 3=IS, 4=CI, 5=SE, 6=CF. suffix: 00=consolidated, 05=separate.
const ROLE_RE = /role-DX?(\d)\d{3}(\d\d)/;

/** role URI → {statementType, fs_div}. 주석(D8xx)·자본변동(D52)은 제외 시 null 반환됨. */
export function classifyRole(roleUri: string): RoleInfo {
  const m = ROLE_RE.exec(roleUri);
  if (!m) return { roleUri, statementType: null, fs_div: null };
  const [, major, suffix] = m;
  const statementType: RoleInfo["statementType"] =
    major === "2" ? "BS" :
    major === "3" ? "IS" :
    major === "4" ? "CI" :
    major === "5" ? "SE" :
    major === "6" ? "CF" : null;
  const fs_div: RoleInfo["fs_div"] =
    suffix === "00" ? "consolidated" :
    suffix === "05" ? "separate" : null;
  return { roleUri, statementType, fs_div };
}

/** link:loc 엘리먼트들에서 xlink:label → tag 매핑. href="...#ifrs-full_Assets" → "ifrs-full:Assets". */
function parseLocsFromLink(linkEl: any): Map<string, string> {
  const out = new Map<string, string>();
  const locs = linkEl.getElementsByTagName("link:loc");
  for (let i = 0; i < locs.length; i++) {
    const loc = locs[i] as any;
    const label = loc.getAttribute("xlink:label");
    const href = loc.getAttribute("xlink:href") ?? "";
    if (!label) continue;
    const hashIdx = href.lastIndexOf("#");
    if (hashIdx < 0) continue;
    const frag = href.substring(hashIdx + 1);
    const us = frag.indexOf("_");
    if (us < 0) continue;
    const tag = `${frag.substring(0, us)}:${frag.substring(us + 1)}`;
    out.set(label, tag);
  }
  return out;
}

export function parsePresentationLinkbase(xml: string): RolePresentation[] {
  const errors: string[] = [];
  const doc = new DOMParser({
    onError: (_l: string, m: string) => errors.push(m),
  }).parseFromString(xml, "text/xml");
  const out: RolePresentation[] = [];
  const links = doc.getElementsByTagName("link:presentationLink");
  for (let i = 0; i < links.length; i++) {
    const link = links[i] as any;
    const role = link.getAttribute("xlink:role");
    if (!role) continue;
    const info = classifyRole(role);
    if (!info.statementType || !info.fs_div) continue;

    const locs = parseLocsFromLink(link);
    const arcs = link.getElementsByTagName("link:presentationArc");

    const children = new Map<string, { label: string; order: number }[]>();
    const isChild = new Set<string>();
    for (let j = 0; j < arcs.length; j++) {
      const arc = arcs[j] as any;
      const arcrole = arc.getAttribute("xlink:arcrole") ?? "";
      if (!/parent-child$/.test(arcrole)) continue;
      const from = arc.getAttribute("xlink:from");
      const to = arc.getAttribute("xlink:to");
      const order = parseFloat(arc.getAttribute("order") ?? "1");
      if (!from || !to) continue;
      let list = children.get(from);
      if (!list) { list = []; children.set(from, list); }
      list.push({ label: to, order });
      isChild.add(to);
    }

    const allFroms = new Set(children.keys());
    const roots = [...allFroms].filter((f) => !isChild.has(f));

    const nodes: PresentationNode[] = [];
    const visited = new Set<string>();
    const MAX_DEPTH = 100; // 비정상 taxonomy 재귀 방어 (정상 트리는 ≤10)
    const visit = (label: string, parentTag: string | null, depth: number, order: number) => {
      if (visited.has(label) || depth > MAX_DEPTH) return;
      visited.add(label);
      const tag = locs.get(label);
      if (tag) nodes.push({ tag, depth, order, parent: parentTag });
      const ch = children.get(label);
      if (!ch) return;
      ch.sort((a, b) => a.order - b.order);
      for (const c of ch) visit(c.label, tag ?? parentTag, depth + (tag ? 1 : 0), c.order);
    };
    for (const r of roots) visit(r, null, 0, 0);

    out.push({ info, nodes });
  }
  return out;
}

export function parseCalculationLinkbase(xml: string): RoleCalculation[] {
  const errors: string[] = [];
  const doc = new DOMParser({
    onError: (_l: string, m: string) => errors.push(m),
  }).parseFromString(xml, "text/xml");
  const out: RoleCalculation[] = [];
  const links = doc.getElementsByTagName("link:calculationLink");
  for (let i = 0; i < links.length; i++) {
    const link = links[i] as any;
    const role = link.getAttribute("xlink:role");
    if (!role) continue;
    const info = classifyRole(role);
    if (!info.statementType || !info.fs_div) continue;

    const locs = parseLocsFromLink(link);
    const arcs = link.getElementsByTagName("link:calculationArc");
    const relations: CalcRelation[] = [];
    for (let j = 0; j < arcs.length; j++) {
      const arc = arcs[j] as any;
      const arcrole = arc.getAttribute("xlink:arcrole") ?? "";
      if (!/summation-item$/.test(arcrole)) continue;
      const from = arc.getAttribute("xlink:from");
      const to = arc.getAttribute("xlink:to");
      const weight = parseFloat(arc.getAttribute("weight") ?? "1");
      const order = parseFloat(arc.getAttribute("order") ?? "1");
      const parent = locs.get(from);
      const child = locs.get(to);
      if (!parent || !child) continue;
      relations.push({ parent, child, weight, order });
    }
    if (relations.length > 0) out.push({ info, relations });
  }
  return out;
}

// ── Orchestration ──────────────────────────────────────

export async function parseXbrlZip(
  zipBuf: Buffer,
  opts: { loadTaxonomy?: boolean } = {},
): Promise<XbrlData> {
  const files = await extractXbrlFilesFromZip(zipBuf);

  let instanceXml: string | null = null;
  let labelXml: string | null = null;
  let preXml: string | null = null;
  let calXml: string | null = null;
  for (const [name, content] of files) {
    if (name.endsWith(".xbrl")) instanceXml = content;
    else if (/_lab-ko\.xml$/i.test(name)) labelXml = content;
    else if (opts.loadTaxonomy && /_pre\.xml$/i.test(name)) preXml = content;
    else if (opts.loadTaxonomy && /_cal\.xml$/i.test(name)) calXml = content;
  }
  if (!instanceXml) throw new Error("XBRL instance document (.xbrl) not found in ZIP");

  const { facts, contexts, entityId, errors } = parseInstance(instanceXml);
  const labels = labelXml ? parseLabels(labelXml) : new Map<string, string>();

  let taxonomy: XbrlTaxonomy | undefined;
  if (opts.loadTaxonomy) {
    taxonomy = {
      presentations: preXml ? parsePresentationLinkbase(preXml) : [],
      calculations: calXml ? parseCalculationLinkbase(calXml) : [],
    };
  }

  // instance 파싱에서 DOM 에러가 많은데 facts 가 비어있으면 parseWarnings 노출
  // (빈 결과 = 실제 데이터 없음 vs 파싱 실패 구분용)
  const parseWarnings =
    errors.length > 0 && facts.length === 0
      ? [`XBRL instance 파싱 중 ${errors.length}건 에러 발생, fact 0건 추출됨. 샘플: ${errors.slice(0, 3).join(" | ")}`]
      : undefined;

  return { facts, contexts, labels, entityId, taxonomy, parseWarnings };
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

  return { periods, fs_div: opts.fs_div, mode: "whitelist", statements };
}

// ── Full (taxonomy-driven) statement builder ───────────

const SECTION_ROLE: Record<"BS" | "IS" | "CF", RoleInfo["statementType"][]> = {
  BS: ["BS"],
  IS: ["IS", "CI"], // IS 없으면 CI(포괄손익) 로 폴백
  CF: ["CF"],
};

/** presentation linkbase 트리를 기반으로 full 재무제표 구성. 원본 항목 순서/계층 보존. */
export function buildStatementsFull(
  data: XbrlData,
  opts: { fs_div: "consolidated" | "separate"; sections: ("BS" | "IS" | "CF")[] },
): Statements {
  if (!data.taxonomy) {
    throw new Error("buildStatementsFull requires taxonomy — parse with loadTaxonomy:true");
  }
  const idx = indexCoreFacts(data, opts.fs_div);
  const periods = findPeriods(data, opts.fs_div);

  function pickPresentation(sec: "BS" | "IS" | "CF"): RolePresentation | null {
    const wantTypes = SECTION_ROLE[sec];
    // 우선 동일 fs_div & 첫 매칭 타입 — 여러 role 있을 수 있으니 첫 매치만.
    for (const t of wantTypes) {
      const hit = data.taxonomy!.presentations.find(
        (p) => p.info.statementType === t && p.info.fs_div === opts.fs_div,
      );
      if (hit) return hit;
    }
    return null;
  }

  function makeTable(pres: RolePresentation): StatementTable {
    const rows: StatementRow[] = [];
    for (const node of pres.nodes) {
      const v = idx.get(node.tag);
      if (!v) continue;
      if (v.current == null && v.prior == null && v.priorPrior == null) continue;
      rows.push({
        tag: node.tag,
        label: resolveLabel(node.tag, data.labels),
        depth: node.depth,
        current: v.current,
        prior: v.prior,
        priorPrior: v.priorPrior,
      });
    }
    return { rows };
  }

  const statements: Statements["statements"] = {};
  for (const sec of opts.sections) {
    const pres = pickPresentation(sec);
    if (pres) statements[sec] = makeTable(pres);
  }

  // calculation linkbase 검증 — 5원 이상 && 0.1% 이상 차이만 보고 (부동소수 잡음 제거)
  const validations = validateCalculations(data, idx, opts.fs_div);

  return { periods, fs_div: opts.fs_div, mode: "full", statements, validations };
}

function validateCalculations(
  data: XbrlData,
  idx: ReturnType<typeof indexCoreFacts>,
  fs_div: "consolidated" | "separate",
): CalcViolation[] {
  if (!data.taxonomy) return [];
  const out: CalcViolation[] = [];
  const byParent = new Map<string, CalcRelation[]>();
  for (const rc of data.taxonomy.calculations) {
    if (rc.info.fs_div !== fs_div) continue;
    for (const rel of rc.relations) {
      let list = byParent.get(rel.parent);
      if (!list) { list = []; byParent.set(rel.parent, list); }
      list.push(rel);
    }
  }
  const periods: ("current" | "prior" | "priorPrior")[] = ["current", "prior", "priorPrior"];
  for (const [parent, rels] of byParent) {
    const pv = idx.get(parent);
    if (!pv) continue;
    for (const period of periods) {
      const actual = pv[period];
      if (actual == null) continue;
      let expected = 0;
      let missing = 0;
      for (const r of rels) {
        const cv = idx.get(r.child);
        const v = cv?.[period];
        if (v == null) { missing++; continue; }
        expected += v * r.weight;
      }
      if (missing > 0) continue; // 하위 중 일부 결측 → 검증 스킵
      const diff = actual - expected;
      const absActual = Math.abs(actual);
      if (Math.abs(diff) < 5) continue;
      if (absActual > 0 && Math.abs(diff) / absActual < 0.001) continue;
      out.push({
        parent,
        parent_label: resolveLabel(parent, data.labels),
        expected,
        actual,
        diff,
        ratio: absActual > 0 ? diff / absActual : 0,
        period,
      });
    }
  }
  return out;
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
    const indent = r.depth && r.depth > 0 ? "&nbsp;".repeat(r.depth * 2) + " " : "";
    lines.push(`| ${indent}${r.label} | ${fmt(r.current)} | ${fmt(r.prior)} | ${fmt(r.priorPrior)} |`);
  }
  return lines.join("\n");
}

function renderValidations(vs: CalcViolation[]): string {
  if (vs.length === 0) return "## 계산 검증\n\n✅ 모든 합계 일치 (calculation linkbase 기준).";
  const lines: string[] = ["## 계산 검증", "", `⚠️ ${vs.length}건 불일치 (0.1% 또는 5원 초과).`, ""];
  lines.push("| 계정 | 기간 | 기재값 | 합산기대값 | 차이 | 비율 |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: |");
  for (const v of vs.slice(0, 20)) {
    lines.push(
      `| ${v.parent_label} | ${v.period} | ${fmt(v.actual)} | ${fmt(v.expected)} | ${fmt(v.diff)} | ${(v.ratio * 100).toFixed(2)}% |`,
    );
  }
  if (vs.length > 20) lines.push(`| ...(+${vs.length - 20}건) | | | | | |`);
  return lines.join("\n");
}

export function renderMarkdown(st: Statements): string {
  const parts: string[] = [];
  const modeLabel = st.mode === "full" ? "full" : "whitelist";
  parts.push(
    `# 재무제표 (${st.fs_div === "consolidated" ? "연결" : "별도"}, ${modeLabel})`,
    "",
    "※ 값 단위: 원. 표시되지 않은 계정과 모든 기간이 공시에 기재되지 않은 경우 생략.",
    "",
  );
  if (st.statements.BS) parts.push(renderTable("재무상태표 (BS)", st.statements.BS, st.periods), "");
  if (st.statements.IS)
    parts.push(renderTable("손익계산서 (IS)", st.statements.IS, st.periods), "");
  if (st.statements.CF)
    parts.push(renderTable("현금흐름표 (CF)", st.statements.CF, st.periods), "");
  if (st.validations) parts.push(renderValidations(st.validations), "");
  return parts.join("\n");
}
