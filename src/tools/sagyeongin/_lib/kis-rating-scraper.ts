/**
 * 한국신용평가(kisrating.com)에서 BBB- 등급 5년 채권 수익률 스크래핑.
 * 사경인 S-RIM K값(주주의 요구수익률) 산출의 외부 의존.
 *
 * 외부 스크래핑 — ADR-0003 40줄 영역.
 * spec §10.5 — wikidocs.net/94787 근거. spec §11.3 945줄 외부 데이터 의존성.
 *
 * 캐싱은 호출자(required-return.ts) 책임 — spec §10.5 628~632줄 24시간 캐시.
 * 이 모듈은 단일 fetch만.
 *
 * Ref: spec §10.5, philosophy 7부 D-2, ADR-0008
 */

import * as cheerio from "cheerio";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export type KisRatingResult = {
  value: number;                    // 분수, 예: 0.1036
  raw_percent: number;              // 화면 그대로 %, 예: 10.36
  fetched_at: string;               // ISO 8601
  source: "kisrating.com BBB- 5Y"; // spec §10.5 622줄 그대로
};

export async function fetchKisRatingBbbMinus5Y(): Promise<KisRatingResult> {
  const url =
    "https://www.kisrating.com/ratingsStatistics/statics_spread.do";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);

  let response: Response;
  try {
    response = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("kis-rating-scraper: request timeout (5s)");
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`kis-rating-scraper: network error: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`kis-rating-scraper: HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // 1차 셀렉터 — 정확한 인덱스 기반
  let raw = $(
    "#con_tab1 > div.table_ty1 > table > tbody > tr:nth-child(11) > td:nth-child(9)"
  )
    .text()
    .trim();
  let parsed = parseFloat(raw);

  // 2차 fallback — BBB- 텍스트 매칭 기반 (열 추가/이동 시 생존 가능성 ↑)
  if (raw === "" || isNaN(parsed)) {
    const targetTr = $("td.fc_blue_dk")
      .filter((_, el) => $(el).text().trim() === "BBB-")
      .first()
      .parent("tr");
    if (targetTr.length === 0) {
      throw new Error(
        "kisrating.com 페이지 구조 변경 감지. 수동 확인 필요."
      );
    }
    raw = targetTr.find("td").eq(8).text().trim(); // 0-indexed, 9번째 = eq(8)
    parsed = parseFloat(raw);
  }

  if (isNaN(parsed)) {
    throw new Error(
      "kisrating.com 페이지 구조 변경 감지. 수동 확인 필요."
    );
  }

  const raw_percent = parsed;
  const value = parsed / 100; // 10.36 → 0.1036

  return {
    value,
    raw_percent,
    fetched_at: new Date().toISOString(),
    source: "kisrating.com BBB- 5Y",
  };
}
