/**
 * 네이버 금융에서 종목 현재가 스크래핑.
 *
 * 외부 스크래핑 — ADR-0003 40줄 영역 (단위 테스트 대상 아님, smoke로 검증).
 * spec §11.3 946줄 외부 데이터 의존성: 실패 시 srim 결과의 current_price: null.
 *
 * 호출 패턴 정책 (rate limit, 캐시):
 * - 이 모듈은 단일 fetch 책임만. 호출자(srim, scan-execute, watchlist-check)가 책임.
 * - 11단계 scan-execute 시작 전 ADR-0009 (예정)에서 정책 확정.
 *
 * Ref: spec §11.3, ADR-0008 (cheerio), ADR-0001 (_lib 정신)
 */

import * as cheerio from "cheerio";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export type NaverPriceResult = {
  symbol: string;     // 입력 종목코드 그대로 (6자리)
  price: number;      // 원/주, 정수
  fetched_at: string; // ISO 8601
};

export async function fetchNaverPrice(symbol: string): Promise<NaverPriceResult> {
  if (!/^\d{6}$/.test(symbol)) {
    throw new Error(
      `naver-price: invalid symbol format (expected 6 digits): ${symbol}`
    );
  }

  const url = `https://finance.naver.com/item/main.naver?code=${symbol}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);

  let response: Response;
  try {
    response = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`naver-price: request timeout (5s) for ${symbol}`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`naver-price: network error: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`naver-price: HTTP ${response.status} for ${symbol}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const raw = $("#rate_info_krx p.no_today .blind").first().text().trim();
  const price = parseInt(raw.replace(/[^\d]/g, ""), 10);

  if (isNaN(price) || price === 0) {
    throw new Error(
      "finance.naver.com 페이지 구조 변경 감지. 수동 확인 필요. (#rate_info_krx p.no_today)"
    );
  }

  return {
    symbol,
    price,
    fetched_at: new Date().toISOString(),
  };
}
