/**
 * company-meta-extractor — DART company.json에서 corp_cls + induty_code 추출.
 * cache 우선 (ADR-0016).
 *
 * cache 진입 단일 모듈 — scan-execute.ts (대량 호출) + induty-extractor.ts
 * (단발 호출 wrapper) 모두 본 함수를 통해 induty_code/corp_cls를 추출한다.
 * cache hit 시 DART 호출 0, miss 시 fetch + cache 저장.
 *
 * cache miss 시 setCorpMeta 정책:
 * - corp_cls + induty_code: company.json 응답에서 trim 후 저장 (빈 문자열 허용)
 * - modify_date: ctx.resolver.byCorpCode(corp_code).modify_date — upstream
 *   corpCode.xml dump와 동기. resolver SQLite cache에서 lookup
 * - fetched_at: 현재 시점 ISO 8601
 *
 * cache hit 시 fetched_at 갱신 X (저장 시점 보존, 디버깅 활용).
 *
 * Ref: ADR-0016, ADR-0015, philosophy 7부 A
 */

import type { ToolCtx } from "../../_helpers.js";
import { getCorpMeta, setCorpMeta } from "./corp-meta-cache.js";

export interface CompanyMeta {
  corp_cls: string;
  induty_code: string;
}

/**
 * corp_code의 corp_cls + induty_code 추출 (cache 우선).
 *
 * cache hit → 즉시 반환 (DART 호출 0).
 * cache miss → company.json fetch + setCorpMeta + 반환.
 *
 * status !== "000" → throw (기존 흐름 정합).
 * resolver.byCorpCode 부재 → modify_date 빈 문자열로 cache 저장 (정상 흐름).
 */
export async function extractCompanyMeta(
  corp_code: string,
  ctx: ToolCtx,
): Promise<CompanyMeta> {
  // Cache hit
  const cached = getCorpMeta(corp_code);
  if (cached) {
    return {
      corp_cls: cached.corp_cls,
      induty_code: cached.induty_code,
    };
  }

  // Cache miss: fetch
  const raw = await ctx.client.getJson<{
    status: string;
    message?: string;
    corp_cls?: string;
    induty_code?: string;
  }>("company.json", { corp_code });

  if (raw.status !== "000") {
    throw new Error(
      `company.json 응답 오류 [${raw.status}]: ${raw.message ?? ""}`,
    );
  }

  const meta: CompanyMeta = {
    corp_cls: (raw.corp_cls ?? "").trim(),
    induty_code: (raw.induty_code ?? "").trim(),
  };

  // modify_date — resolver의 SQLite cache에서 lookup
  const corpRecord = ctx.resolver.byCorpCode(corp_code);
  const modify_date = corpRecord?.modify_date ?? "";

  setCorpMeta({
    corp_code,
    induty_code: meta.induty_code,
    corp_cls: meta.corp_cls,
    modify_date,
    fetched_at: new Date().toISOString(),
  });

  return meta;
}
