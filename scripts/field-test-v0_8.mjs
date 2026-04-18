/**
 * v0.8.0 필드테스트 — 15 도구 × 실전 LLM 시나리오 (~28 케이스)
 *
 * 기준:
 *   PASS: 정상 응답 + 기대 스키마 + 합리적 데이터
 *   WARN: 동작하지만 응답 크기 과다(>500KB) / 애매한 품질
 *   FAIL: throw / 스키마 mismatch / 빈 결과(있어야 하는 경우)
 *
 * check 함수 규약: true(PASS) / false(FAIL, reason 없음) / string(FAIL reason)
 *
 * 실행: node scripts/field-test-v0_8.mjs
 */
import "dotenv/config";
import { DartClient } from "../build/lib/dart-client.js";
import { CorpCodeResolver } from "../build/lib/corp-code.js";
import { TOOL_REGISTRY } from "../build/tools/index.js";

const client = new DartClient({ apiKey: process.env.DART_API_KEY });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };
const T = (n) => TOOL_REGISTRY.find((t) => t.name === n);

const LARGE_THRESHOLD = 500_000;

const cases = [
  // ── 1. resolve_corp_code ────────────────────────────
  {
    id: "01-resolve-정상",
    tool: "resolve_corp_code",
    desc: '정확일치 "삼성전자"',
    args: { query: "삼성전자", limit: 3 },
    check: (r) => r.count > 0 && r.results[0].corp_name === "삼성전자",
  },
  {
    id: "02-resolve-종목코드",
    tool: "resolve_corp_code",
    desc: '6자리 종목코드 "005930"',
    args: { query: "005930", limit: 3 },
    check: (r) => r.count > 0 && r.results[0].stock_code === "005930",
  },
  {
    id: "03-resolve-alias",
    tool: "resolve_corp_code",
    desc: 'alias "현대차" → 현대자동차',
    args: { query: "현대차", limit: 3 },
    check: (r) => r.results[0]?.corp_name === "현대자동차",
  },

  // ── 2. search_disclosures ───────────────────────────
  {
    id: "04-search-page",
    tool: "search_disclosures",
    desc: "삼성 최근 30일 페이지모드 size=20",
    args: { corp: "삼성전자", days: 30, size: 20 },
    check: (r) =>
      Array.isArray(r.items) && r.items.length > 0 && r.items[0].rcept_no?.length === 14,
  },
  {
    id: "05-search-preset",
    tool: "search_disclosures",
    desc: "preset=annual_report 최근 90일 (전체시장 API 제한)",
    args: { preset: "annual_report", days: 90, limit: 200 },
    check: (r) => Array.isArray(r.items) && r.items.length >= 0,
    slow: true,
  },
  {
    id: "06-search-all_pages",
    tool: "search_disclosures",
    desc: "삼성 all_pages 7일",
    args: { corp: "삼성전자", days: 7, all_pages: true, limit: 500 },
    check: (r) => Array.isArray(r.items),
  },

  // ── 3. get_company ──────────────────────────────────
  {
    id: "07-company",
    tool: "get_company",
    desc: "삼성전자 개황",
    args: { corp: "삼성전자" },
    check: (r) => {
      if (!r.company) return "company 필드 누락";
      const name = r.company.corp_name ?? "";
      const stock = r.company.stock_code ?? "";
      if (!name.includes("삼성전자")) return `corp_name="${name}"`;
      if (stock !== "005930") return `stock_code="${stock}"`;
      return true;
    },
  },

  // ── 4. get_financials ───────────────────────────────
  {
    id: "08-fin-summary-단일",
    tool: "get_financials",
    desc: "삼성 2023 summary 단일",
    args: { corps: ["삼성전자"], year: 2023, scope: "summary" },
    check: (r) => r.mode === "summary_single" && Array.isArray(r.items) && r.items.length >= 5,
  },
  {
    id: "09-fin-summary-비교",
    tool: "get_financials",
    desc: "삼성/LG/SK 2023 비교",
    args: { corps: ["삼성전자", "LG전자", "SK하이닉스"], year: 2023, scope: "summary" },
    check: (r) => {
      if (r.mode !== "summary_multi") return `mode=${r.mode}`;
      if (!Array.isArray(r.items)) return "items 배열 아님";
      const corps = new Set(r.items.map((x) => x.corp_code));
      return corps.size === 3 || `3사 중 ${corps.size}사만 반환`;
    },
  },
  {
    id: "10-fin-full-BS+IS",
    tool: "get_financials",
    desc: "삼성 2023 full 디폴트(BS+IS 필터)",
    args: { corps: ["삼성전자"], year: 2023, scope: "full" },
    check: (r) =>
      r.mode === "full" && r.count > 20 && r.count < r.total_count && r.sj_div_filter?.length === 2,
  },

  // ── 5. download_document ────────────────────────────
  {
    id: "11-doc-markdown",
    tool: "download_document",
    desc: "삼성 2023 사업보고서 markdown (20k)",
    args: { rcept_no: "20240312000736", format: "markdown", truncate_at: 20000 },
    check: (r) => r.format === "markdown" && typeof r.content === "string" && r.content.startsWith("# 사업보고서"),
  },
  {
    id: "12-doc-raw",
    tool: "download_document",
    desc: "raw XML (5k)",
    args: { rcept_no: "20240312000736", format: "raw", truncate_at: 5000 },
    check: (r) =>
      r.format === "raw" && typeof r.content === "string" && r.content.length > 1000 && r.content.includes("<"),
  },
  {
    id: "13-doc-text",
    tool: "download_document",
    desc: "text (5k)",
    args: { rcept_no: "20240312000736", format: "text", truncate_at: 5000 },
    check: (r) => r.format === "text" && typeof r.content === "string" && !r.content.includes("<?xml"),
  },

  // ── 6. get_xbrl ─────────────────────────────────────
  {
    id: "14-xbrl",
    tool: "get_xbrl",
    desc: "삼성 2023 annual XBRL",
    args: { rcept_no: "20240312000736", report: "annual" },
    check: (r) =>
      Array.isArray(r.files) && r.files.length > 0 && typeof r.dir === "string" && r.dir.length > 0,
    slow: true,
  },

  // ── 7. get_periodic_report ──────────────────────────
  {
    id: "15-periodic-largest",
    tool: "get_periodic_report",
    desc: "삼성 2023 최대주주",
    args: { corp: "삼성전자", year: 2023, report_type: "largest_shareholder" },
    check: (r) => Array.isArray(r.items) && r.items.length > 0,
  },
  {
    id: "16-periodic-dividends",
    tool: "get_periodic_report",
    desc: "삼성 2023 배당",
    args: { corp: "삼성전자", year: 2023, report_type: "dividends" },
    check: (r) => Array.isArray(r.items) && r.items.length > 0,
  },
  {
    id: "17-periodic-executives",
    tool: "get_periodic_report",
    desc: "삼성 2023 임원현황",
    args: { corp: "삼성전자", year: 2023, report_type: "executives" },
    check: (r) => Array.isArray(r.items) && r.items.length > 5,
  },

  // ── 8. get_shareholders ─────────────────────────────
  {
    id: "18-shareholders",
    tool: "get_shareholders",
    desc: "삼성 2023 지배구조 4섹션",
    args: { corp: "삼성전자", year: 2023 },
    check: (r) => {
      const sections = r.sections ?? r.results ?? r;
      if (!sections || typeof sections !== "object") return "섹션 객체 없음";
      const validKeys = Object.keys(sections).filter(
        (k) => !["resolved", "year", "report", "corp"].includes(k),
      );
      return validKeys.length >= 3 || `섹션 ${validKeys.length}개`;
    },
  },

  // ── 9. get_executive_compensation ───────────────────
  {
    id: "19-exec-comp",
    tool: "get_executive_compensation",
    desc: "삼성 2023 보수 6섹션",
    args: { corp: "삼성전자", year: 2023 },
    check: (r) => {
      const sections = r.sections ?? r.results ?? r;
      if (!sections || typeof sections !== "object") return "섹션 객체 없음";
      const validKeys = Object.keys(sections).filter(
        (k) => !["resolved", "year", "report", "corp"].includes(k),
      );
      return validKeys.length >= 3 || `섹션 ${validKeys.length}개`;
    },
  },

  // ── 10. get_major_holdings ──────────────────────────
  {
    id: "20-major-holdings",
    tool: "get_major_holdings",
    desc: "삼성 지분공시 (디폴트 3년)",
    args: { corp: "삼성전자" },
    check: (r) => typeof r === "object" && r !== null,
  },

  // ── 11. get_corporate_event ─────────────────────────
  {
    id: "21-event-single",
    tool: "get_corporate_event",
    desc: "삼성 자기주식 취득 단건",
    args: { corp: "삼성전자", mode: "single", event_type: "treasury_acquisition" },
    check: (r) => {
      const arr = r.list ?? r.items ?? r.events;
      return Array.isArray(arr);
    },
  },
  {
    id: "22-event-timeline",
    tool: "get_corporate_event",
    desc: "삼성 자본이벤트 타임라인 최근 3년",
    args: {
      corp: "삼성전자",
      mode: "timeline",
      start: "2023-01-01",
      end: "2026-04-18",
    },
    check: (r) => {
      if (!r || typeof r !== "object") return "응답 아님";
      const hasAny = "timeline" in r || "events" in r || "list" in r || "items" in r;
      return hasAny || `필드: ${Object.keys(r).join(",")}`;
    },
    slow: true,
  },

  // ── 12. insider_signal ──────────────────────────────
  {
    id: "23-insider-signal",
    tool: "insider_signal",
    desc: "삼성 최근 1년 내부자 거래 신호",
    args: { corp: "삼성전자", start: "2025-04-18", end: "2026-04-18" },
    check: (r) => r.summary && typeof r.summary === "object",
    slow: true,
  },

  // ── 13. disclosure_anomaly ──────────────────────────
  {
    id: "24-anomaly",
    tool: "disclosure_anomaly",
    desc: "삼성 3년 이상 징후",
    args: { corp: "삼성전자" },
    check: (r) => {
      if (typeof r.score !== "number") return "score 누락";
      if (typeof r.verdict !== "string") return "verdict 누락";
      if (!Array.isArray(r.flags)) return "flags 배열 아님";
      return true;
    },
    slow: true,
  },

  // ── 14. buffett_quality_snapshot ────────────────────
  {
    id: "25-buffett-단일",
    tool: "buffett_quality_snapshot",
    desc: "삼성 5년 스냅샷",
    args: { corps: ["삼성전자"], years: 5 },
    check: (r) => {
      if (r.mode !== "single") return `mode=${r.mode}`;
      if (!r.ratios || !r.overall_score) return "ratios/overall_score 누락";
      return true;
    },
    slow: true,
  },
  {
    id: "26-buffett-비교",
    tool: "buffett_quality_snapshot",
    desc: "삼성/SK하이닉스 5년 비교",
    args: { corps: ["삼성전자", "SK하이닉스"], years: 5 },
    check: (r) => {
      if (r.mode !== "compare") return `mode=${r.mode}`;
      if (!Array.isArray(r.rows) || r.rows.length !== 2) return `rows.length=${r.rows?.length}`;
      if (!r.rankings) return "rankings 누락";
      return true;
    },
    slow: true,
  },

  // ── 15. get_attachments ─────────────────────────────
  {
    id: "27-attach-list",
    tool: "get_attachments",
    desc: "삼성 사보 첨부 목록",
    args: { rcept_no: "20240312000736", mode: "list" },
    check: (r) => Array.isArray(r.attachments) && r.attachments.length > 0,
  },
  {
    id: "28-attach-extract-pdf",
    tool: "get_attachments",
    desc: "삼성 PDF 첨부 outline (index=0)",
    args: {
      rcept_no: "20240312000736",
      mode: "extract",
      index: 0,
      outline_max_items: 10,
      truncate_at: 3000,
    },
    check: (r) => {
      const hasOutline = r.outline && typeof r.outline === "object" && Array.isArray(r.outline.items);
      const hasContent = typeof r.content === "string" && r.content.length > 0;
      const hasMd = typeof r.markdown === "string" && r.markdown.length > 0;
      return hasOutline || hasContent || hasMd || `필드: ${Object.keys(r).join(",")}`;
    },
    slow: true,
  },
];

// ── 실행 ─────────────────────────────────────────────
const results = { pass: 0, warn: 0, fail: 0, details: [] };

for (const c of cases) {
  const tool = T(c.tool);
  if (!tool) {
    console.log(`[FAIL] ${c.id} ${c.tool} — 도구 없음`);
    results.fail++;
    results.details.push({ ...c, status: "FAIL", reason: "tool not found" });
    continue;
  }

  const t0 = Date.now();
  try {
    const out = await tool.handler(c.args, ctx);
    const ms = Date.now() - t0;
    const size = JSON.stringify(out).length;
    const checkResult = c.check(out);

    if (checkResult !== true) {
      results.fail++;
      const reason = typeof checkResult === "string" ? checkResult : "check returned false";
      results.details.push({ ...c, status: "FAIL", reason, ms, size });
      console.log(`[FAIL] ${c.id} ${c.tool} — ${c.desc}  (${ms}ms, ${size}B)  reason: ${reason}`);
      continue;
    }

    let warn = null;
    if (size > LARGE_THRESHOLD) warn = `응답 > ${(size / 1024).toFixed(0)}KB`;

    if (warn) {
      results.warn++;
      results.details.push({ ...c, status: "WARN", reason: warn, ms, size });
      console.log(`[WARN] ${c.id} ${c.tool} — ${c.desc}  (${ms}ms, ${size}B)  ${warn}`);
    } else {
      results.pass++;
      results.details.push({ ...c, status: "PASS", ms, size });
      console.log(`[PASS] ${c.id} ${c.tool} — ${c.desc}  (${ms}ms, ${size}B)`);
    }
  } catch (e) {
    const ms = Date.now() - t0;
    results.fail++;
    results.details.push({ ...c, status: "FAIL", reason: e.message, ms });
    console.log(`[FAIL] ${c.id} ${c.tool} — ${c.desc}  (${ms}ms)  ERROR: ${e.message}`);
  }
}

console.log(`\n=== ${results.pass} PASS / ${results.warn} WARN / ${results.fail} FAIL (총 ${cases.length}) ===`);

if (results.fail > 0 || results.warn > 0) {
  console.log("\n--- 이슈 상세 ---");
  for (const d of results.details) {
    if (d.status === "PASS") continue;
    console.log(`[${d.status}] ${d.id} ${d.tool}: ${d.reason} (size=${d.size ?? "?"}B, ${d.ms ?? "?"}ms)`);
  }
}

process.exit(results.fail > 0 ? 1 : 0);
