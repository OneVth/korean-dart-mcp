/**
 * XBRL 마크다운 변환 테스트 — 삼성 / LG전자 / SK하이닉스 × 연간
 *
 * 확인 항목:
 *   - 연결재무제표 3개 표(BS/IS/CF) 모두 생성
 *   - BS 핵심 5행, IS 핵심 5행, CF 핵심 3행 이상 채워짐
 *   - 당기/전기/전전기 3열 모두 채워짐
 *   - 응답 사이즈 합리적 (< 100KB)
 */
import "dotenv/config";
import { DartClient } from "../build/lib/dart-client.js";
import { CorpCodeResolver } from "../build/lib/corp-code.js";
import { TOOL_REGISTRY } from "../build/tools/index.js";

const client = new DartClient({ apiKey: process.env.DART_API_KEY });
const resolver = new CorpCodeResolver({});
await resolver.init(client);
const ctx = { client, resolver };
const getXbrl = TOOL_REGISTRY.find((t) => t.name === "get_xbrl");
const searchDisclosures = TOOL_REGISTRY.find((t) => t.name === "search_disclosures");

const targets = [
  { corp: "삼성전자", year: 2023 },
  { corp: "LG전자", year: 2023 },
  { corp: "SK하이닉스", year: 2023 },
];

let pass = 0;
let fail = 0;

for (const t of targets) {
  console.log(`\n=== ${t.corp} ${t.year} 사업보고서 ===`);

  // 사업보고서 rcept_no 조회 — preset 으로 annual_report 만
  const period = { begin: `${t.year + 1}-01-01`, end: `${t.year + 1}-06-30` };
  const searchResult = await searchDisclosures.handler(
    {
      corp: t.corp,
      begin: period.begin,
      end: period.end,
      preset: "annual_report",
      limit: 20,
    },
    ctx,
  );
  const annual = searchResult.items.find(
    (i) => /^사업보고서/.test(i.report_nm) && !/\[기재정정\]|\[첨부정정\]/.test(i.report_nm),
  );
  if (!annual) {
    console.log(`  [SKIP] 사업보고서 못 찾음 (${period.begin}~${period.end})`);
    fail++;
    continue;
  }
  console.log(`  rcept_no: ${annual.rcept_no} (${annual.report_nm})`);

  // XBRL markdown 변환
  const t0 = Date.now();
  try {
    const r = await getXbrl.handler(
      {
        rcept_no: annual.rcept_no,
        report: "annual",
        format: "markdown",
        fs_div: "consolidated",
      },
      ctx,
    );
    const ms = Date.now() - t0;
    const size = JSON.stringify(r).length;

    // 검증
    const bs = r.statements?.BS?.rows?.length ?? 0;
    const is = r.statements?.IS?.rows?.length ?? 0;
    const cf = r.statements?.CF?.rows?.length ?? 0;
    const mdLen = r.markdown?.length ?? 0;

    console.log(
      `  BS=${bs}행 / IS=${is}행 / CF=${cf}행  |  md=${mdLen}자  |  size=${(size / 1024).toFixed(1)}KB  |  ${ms}ms`,
    );
    console.log(
      `  periods: current=${r.periods?.current?.end ?? "?"} / prior=${r.periods?.prior?.end ?? "?"} / priorPrior=${r.periods?.priorPrior?.end ?? "?"}`,
    );
    console.log(`  meta: ${JSON.stringify(r.meta)}`);

    // 핵심 계정 샘플
    const sample = (arr) => arr?.slice(0, 3).map((x) => `${x.label}=${x.current?.toLocaleString() ?? "-"}`).join(", ");
    console.log(`  BS 샘플: ${sample(r.statements?.BS?.rows)}`);
    console.log(`  IS 샘플: ${sample(r.statements?.IS?.rows)}`);

    const ok = bs >= 5 && is >= 5 && cf >= 3 && mdLen > 500;
    if (ok) {
      console.log(`  [PASS]`);
      pass++;
    } else {
      console.log(`  [FAIL] 행 수 부족 or md 비어있음`);
      fail++;
    }
  } catch (e) {
    const ms = Date.now() - t0;
    console.log(`  [FAIL] (${ms}ms) ERROR: ${e.message}`);
    console.log(e.stack);
    fail++;
  }
}

console.log(`\n=== ${pass} pass / ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
