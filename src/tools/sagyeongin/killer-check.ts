/**
 * sagyeongin_killer_check — 상장폐지/관리종목 위험 binary 판정 (spec §10.1, philosophy 7부 A).
 *
 * 7개 룰을 financial / audit / disclosure 데이터 소스로 평가:
 * - check_financial 토글: consecutive_operating_loss + low_revenue_kosdaq
 * - check_disclosure 토글: auditor_change + non_clean_opinion + frequent_cb/bw/rights
 *
 * 데이터 소스:
 * - financial-extractor: extractOperatingIncomeSeries (4년) + extractRevenue (1년)
 * - audit-extractor: extractAuditorOpinionSeries (단일 호출 = 3년 row)
 * - corporate event 엔드포인트 직접 호출: cvbdIsDecsn / bdwtIsDecsn / piicDecsn
 *   (upstream get-corporate-event.ts 직접 import 금지 — ADR-0001)
 *
 * verdict:
 * - triggered_rules.length === 0 → PASS
 * - triggered_rules.length >= 1 → EXCLUDE
 *
 * 룰 평가 fail-safe: 각 룰 평가 throw 시 silently 미트리거 (보수적 PASS).
 * 다른 룰 결과는 보존.
 *
 * Ref: spec §10.1, philosophy 7부 A, ADR-0001
 */

import { z } from "zod";
import { defineTool } from "../_helpers.js";
import type { ToolDef, ToolCtx } from "../_helpers.js";
import {
  extractOperatingIncomeSeries,
  extractRevenue,
} from "./_lib/financial-extractor.js";
import { extractAuditorOpinionSeries } from "./_lib/audit-extractor.js";

interface TriggeredRule {
  rule: string;
  detail: string;
  evidence: Record<string, unknown>;
  dart_reference: string | null;
}

interface KillerCheckResult {
  corp_code: string;
  corp_name: string;
  verdict: "EXCLUDE" | "PASS";
  triggered_rules: TriggeredRule[];
}

interface EventCount {
  count: number;
  bgn_de: string;
  end_de: string;
}

const Input = z.object({
  corp_code: z.string().min(1),
  check_financial: z.boolean().default(true),
  check_disclosure: z.boolean().default(true),
});

function formatYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function evaluateConsecutiveOperatingLoss(
  corp_code: string,
  ctx: ToolCtx,
): Promise<TriggeredRule | null> {
  try {
    const series = await extractOperatingIncomeSeries(corp_code, 4, ctx);
    if (series.length !== 4) return null;
    if (!series.every((v) => v < 0)) return null;
    return {
      rule: "consecutive_operating_loss",
      detail: "별도재무제표 영업이익 4년 연속 음수",
      evidence: {
        years_evaluated: 4,
        operating_income: series,
        fs_div: "OFS",
      },
      dart_reference: null,
    };
  } catch {
    return null;
  }
}

async function evaluateLowRevenueKosdaq(
  corp_code: string,
  ctx: ToolCtx,
): Promise<TriggeredRule | null> {
  let corp_cls: string | undefined;
  try {
    const info = await ctx.client.getJson<{ corp_cls?: string }>("company.json", {
      corp_code,
    });
    corp_cls = info.corp_cls;
  } catch {
    return null;
  }
  if (corp_cls !== "K") return null;

  const year = new Date().getFullYear() - 1;
  let revenue: number;
  try {
    revenue = await extractRevenue(corp_code, year, ctx);
  } catch {
    return null;
  }
  if (revenue >= 3_000_000_000) return null;
  return {
    rule: "low_revenue_kosdaq",
    detail: "코스닥 + 별도재무제표 매출 30억 미만",
    evidence: {
      corp_cls: "K",
      year,
      revenue,
      threshold: 3_000_000_000,
      fs_div: "OFS",
    },
    dart_reference: null,
  };
}

async function evaluateAuditRules(
  corp_code: string,
  ctx: ToolCtx,
): Promise<TriggeredRule[]> {
  let series: Array<{ bsns_year: string; auditor_name: string; opinion: string }>;
  try {
    series = await extractAuditorOpinionSeries(corp_code, ctx);
  } catch {
    return [];
  }
  if (series.length === 0) return [];

  const result: TriggeredRule[] = [];

  // Rule 3: auditor_change
  const auditors = series.map((r) => r.auditor_name);
  const uniqueAuditors = new Set(auditors.filter((a) => a !== ""));
  if (uniqueAuditors.size >= 2) {
    result.push({
      rule: "auditor_change",
      detail: "3년 안 감사인 2회 이상 변경",
      evidence: {
        years: series.map((r) => r.bsns_year),
        auditors,
        unique_count: uniqueAuditors.size,
        period: "최근 사업보고서 1회 호출 (3년 row)",
      },
      dart_reference: null,
    });
  }

  // Rule 4: non_clean_opinion
  const latest = series[0];
  if (latest.opinion !== "적정" && latest.opinion !== "") {
    result.push({
      rule: "non_clean_opinion",
      detail: "감사의견 적정 외",
      evidence: {
        year: latest.bsns_year,
        opinion: latest.opinion,
        expected: "적정",
      },
      dart_reference: null,
    });
  }

  return result;
}

async function countEventsLast3Years(
  endpoint: string,
  corp_code: string,
  ctx: ToolCtx,
): Promise<EventCount> {
  const today = new Date();
  const threeYearsAgo = new Date(today);
  threeYearsAgo.setFullYear(today.getFullYear() - 3);
  const bgn_de = formatYYYYMMDD(threeYearsAgo);
  const end_de = formatYYYYMMDD(today);

  try {
    const raw = await ctx.client.getJson<{ status: string; list?: unknown[] }>(
      `${endpoint}.json`,
      { corp_code, bgn_de, end_de },
    );
    const count = raw.status === "000" ? (raw.list?.length ?? 0) : 0;
    return { count, bgn_de, end_de };
  } catch {
    return { count: 0, bgn_de, end_de };
  }
}

async function evaluateFrequentEvent(
  endpoint: string,
  rule: string,
  detail: string,
  threshold: number,
  corp_code: string,
  ctx: ToolCtx,
): Promise<TriggeredRule | null> {
  const { count, bgn_de, end_de } = await countEventsLast3Years(
    endpoint,
    corp_code,
    ctx,
  );
  if (count < threshold) return null;
  return {
    rule,
    detail,
    evidence: {
      event_count: count,
      threshold,
      period_years: 3,
      period_start: bgn_de,
      period_end: end_de,
      endpoint,
    },
    dart_reference: null,
  };
}

async function handleKillerCheck(
  ctx: ToolCtx,
  args: { corp_code: string; check_financial: boolean; check_disclosure: boolean },
): Promise<KillerCheckResult> {
  const corp = ctx.resolver.byCorpCode(args.corp_code);
  if (!corp) {
    throw new Error(`killer-check: corp_code ${args.corp_code} not found`);
  }

  const triggered: TriggeredRule[] = [];

  if (args.check_financial) {
    const r1 = await evaluateConsecutiveOperatingLoss(args.corp_code, ctx);
    if (r1) triggered.push(r1);
    const r2 = await evaluateLowRevenueKosdaq(args.corp_code, ctx);
    if (r2) triggered.push(r2);
  }

  if (args.check_disclosure) {
    const auditRules = await evaluateAuditRules(args.corp_code, ctx);
    triggered.push(...auditRules);

    const r5 = await evaluateFrequentEvent(
      "cvbdIsDecsn",
      "frequent_cb_issuance",
      "3년 안 CB 발행 2회 이상",
      2,
      args.corp_code,
      ctx,
    );
    if (r5) triggered.push(r5);

    const r6 = await evaluateFrequentEvent(
      "bdwtIsDecsn",
      "frequent_bw_issuance",
      "3년 안 BW 발행 2회 이상",
      2,
      args.corp_code,
      ctx,
    );
    if (r6) triggered.push(r6);

    const r7 = await evaluateFrequentEvent(
      "piicDecsn",
      "frequent_rights_offering",
      "3년 안 유상증자 3회 이상",
      3,
      args.corp_code,
      ctx,
    );
    if (r7) triggered.push(r7);
  }

  return {
    corp_code: args.corp_code,
    corp_name: corp.corp_name,
    verdict: triggered.length > 0 ? "EXCLUDE" : "PASS",
    triggered_rules: triggered,
  };
}

export const killerCheckTool: ToolDef = defineTool({
  name: "sagyeongin_killer_check",
  description:
    "상장폐지/관리종목 위험 binary 판정 (사경인 7부 A). 재무 + 공시 통합 룰 7개 평가.",
  input: Input,
  handler: async (ctx, args) => handleKillerCheck(ctx, args),
});
