/**
 * sagyeongin_watchlist_check — 10단계 도구.
 *
 * 관심 종목 분기 점검 — 6개 사경인 도구 통합 (killer/srim/cashflow/capex/insider/dividend).
 *
 * spec §10.9 + §9.2 워크플로우 B + philosophy 7부 F:
 * - 분기·반기 단위 점검 (매주·매월 분석 X)
 * - 10개 내외 종목 watchlist 대상 (config-store)
 * - check_level "A" (killer만, 빠른 위험 체크) vs "full" (6개 전체)
 * - corp_codes 미지정 시 watchlist 전체, 지정 시 직접 점검
 *
 * 사람 결정 영역 사전 분리 (5부):
 * - overall_flag "watchlist_remove_recommended"는 권장이지 강제가 아니다
 * - next_actions_suggested로 사용자 의사결정 안내
 *
 * Ref: spec §10.9, §9.2, philosophy 7부 F + 5부, ADR-0001
 */

import { z } from "zod";
import { defineTool, type ToolCtx } from "../_helpers.js";
import { loadConfig, type WatchlistEntry } from "./_lib/config-store.js";
import { killerCheckTool } from "./killer-check.js";
import { srimTool } from "./srim.js";
import { cashflowCheckTool } from "./cashflow-check.js";
import { capexSignalTool } from "./capex-signal.js";
import { dividendCheckTool } from "./dividend-check.js";
import { sagyeonginInsiderSignalTool } from "./insider-signal.js";

const Input = z.object({
  check_level: z.enum(["A", "full"]).default("full")
    .describe("A: killer만 (빠른 위험 체크). full: 6개 도구 전체"),
  corp_codes: z.array(
    z.string().regex(/^\d{8}$/, "corp_code must be 8 digits"),
  ).optional()
    .describe("미지정 시 watchlist 전체. 지정 시 직접 점검 (watchlist 외 corp_code도 허용)"),
});

type CheckLevel = "A" | "full";

interface KillerStage {
  verdict: "EXCLUDE" | "PASS";
  triggered_rules: unknown[];
}

interface SrimStage {
  verdict: string | null;
  prices: unknown;
  gap_to_fair: number | null;
}

interface CashflowStage {
  verdict: string;
  concern_score: number;
  top_flags: string[];
}

interface CapexStage {
  verdict: string;
  opportunity_score: number;
  top_signals: string[];
}

interface InsiderStage {
  signal: string;
  cluster_quarter: string | null;
}

interface DividendStage {
  grade: string;
}

interface Stages {
  killer: KillerStage;
  srim?: SrimStage;
  cashflow?: CashflowStage;
  capex?: CapexStage;
  insider?: InsiderStage;
  dividend?: DividendStage;
}

interface CorpResult {
  corp_code: string;
  corp_name: string;
  stages: Stages;
  overall_flag: "watchlist_remove_recommended" | "attention" | "normal";
  notes: string[];
}

/**
 * 단일 corp의 stages 산출.
 * level "A"면 killer만, "full"이면 6개 도구 모두 호출.
 *
 * 도구 호출 실패 시 notes에 기록하고 해당 stage는 skip (전체 멈추지 않음).
 * killer 호출 실패 시 default verdict는 "PASS" — 보수적 처리 (5부: 사용자 결정 영역 사전 분리).
 */
async function runStages(
  corp: WatchlistEntry,
  level: CheckLevel,
  ctx: ToolCtx,
): Promise<{ stages: Stages; corp_name: string; stageNotes: string[] }> {
  const stageNotes: string[] = [];
  let corp_name = corp.name;

  // 1. killer (모든 level에서 호출)
  let killerStage: KillerStage = { verdict: "PASS", triggered_rules: [] };
  try {
    const r = await killerCheckTool.handler(
      { corp_code: corp.corp_code },
      ctx,
    ) as {
      corp_name: string;
      verdict: "EXCLUDE" | "PASS";
      triggered_rules: unknown[];
    };
    corp_name = r.corp_name;
    killerStage = {
      verdict: r.verdict,
      triggered_rules: r.triggered_rules,
    };
  } catch (e) {
    stageNotes.push(`killer 호출 실패: ${(e as Error).message}`);
  }

  const stages: Stages = { killer: killerStage };

  // check_level "A"면 killer만 반환
  if (level === "A") {
    return { stages, corp_name, stageNotes };
  }

  // 2. srim
  // ADR-0013 채택 후 srim은 비정상 케이스를 verdict null로 노출 — try/catch는 외부 K 실패 등만 잡음
  try {
    const r = await srimTool.handler(
      { corp_code: corp.corp_code },
      ctx,
    ) as {
      prices: unknown;
      verdict: string | null;
      gap_to_fair: number | null;
      note: string;
    };
    stages.srim = {
      verdict: r.verdict,
      prices: r.prices,
      gap_to_fair: r.gap_to_fair,
    };
    if (r.verdict == null && r.note.includes("ADR-0013")) {
      stageNotes.push(`srim: verdict null (note: ${r.note})`);
    }
  } catch (e) {
    stageNotes.push(`srim 호출 실패: ${(e as Error).message}`);
  }

  // 3. cashflow — flags → top_flags 변환
  try {
    const r = await cashflowCheckTool.handler(
      { corp_code: corp.corp_code },
      ctx,
    ) as {
      verdict: string;
      concern_score: number;
      flags: Array<{ flag: string }>;
    };
    stages.cashflow = {
      verdict: r.verdict,
      concern_score: r.concern_score,
      top_flags: r.flags.slice(0, 3).map((f) => f.flag),
    };
  } catch (e) {
    stageNotes.push(`cashflow 호출 실패: ${(e as Error).message}`);
  }

  // 4. capex — signals → top_signals 변환
  try {
    const r = await capexSignalTool.handler(
      { corp_code: corp.corp_code },
      ctx,
    ) as {
      verdict: string;
      opportunity_score: number;
      signals: Array<{ signal: string }>;
    };
    stages.capex = {
      verdict: r.verdict,
      opportunity_score: r.opportunity_score,
      top_signals: r.signals.slice(0, 3).map((s) => s.signal),
    };
  } catch (e) {
    stageNotes.push(`capex 호출 실패: ${(e as Error).message}`);
  }

  // 5. insider — 필드명 corp (다른 5개와 다름) + summary 매핑
  try {
    const r = await sagyeonginInsiderSignalTool.handler(
      { corp: corp.corp_code },
      ctx,
    ) as {
      summary: { signal: string; strongest_quarter: string | null };
    };
    stages.insider = {
      signal: r.summary.signal,
      cluster_quarter: r.summary.strongest_quarter,
    };
  } catch (e) {
    stageNotes.push(`insider 호출 실패: ${(e as Error).message}`);
  }

  // 6. dividend — sustainability_grade → grade 매핑
  try {
    const r = await dividendCheckTool.handler(
      { corp_code: corp.corp_code },
      ctx,
    ) as {
      sustainability_grade: string;
    };
    stages.dividend = {
      grade: r.sustainability_grade,
    };
  } catch (e) {
    stageNotes.push(`dividend 호출 실패: ${(e as Error).message}`);
  }

  return { stages, corp_name, stageNotes };
}

/**
 * overall_flag 결정 (spec §10.9 line 831).
 *
 * 우선순위:
 * 1. killer EXCLUDE → watchlist_remove_recommended (7부 A: 즉시 솎아내기)
 * 2. attention 조건 (cashflow REVIEW + capex SIGNAL + insider strong + dividend D)
 * 3. normal
 *
 * capex SIGNAL_DETECTED는 7부 C 기회 신호지만 attention에 포함한다 —
 * 분기 점검의 본래 의도가 기회·위험 양쪽 다 검토 권장이기 때문 (7부 F).
 */
function determineOverallFlag(
  stages: Stages,
): "watchlist_remove_recommended" | "attention" | "normal" {
  if (stages.killer.verdict === "EXCLUDE") {
    return "watchlist_remove_recommended";
  }

  const attentionConditions = [
    stages.cashflow?.verdict === "REVIEW_REQUIRED",
    stages.capex?.verdict === "SIGNAL_DETECTED",
    stages.insider?.signal === "strong_buy_cluster",
    stages.insider?.signal === "strong_sell_cluster",
    stages.dividend?.grade === "D",
  ];

  if (attentionConditions.some(Boolean)) {
    return "attention";
  }

  return "normal";
}

/**
 * 의미적 notes 생성 — 사용자가 overall_flag의 근거를 알 수 있게 (5부).
 */
function buildSemanticNotes(stages: Stages): string[] {
  const notes: string[] = [];

  if (stages.killer.verdict === "EXCLUDE") {
    notes.push("killer: EXCLUDE — 즉시 제거 권장 (7부 A)");
  }
  if (stages.cashflow?.verdict === "REVIEW_REQUIRED") {
    notes.push(
      `cashflow: 위험 신호 (concern_score ${stages.cashflow.concern_score}) — investigation_hints 참고 (7부 B)`,
    );
  }
  if (stages.capex?.verdict === "SIGNAL_DETECTED") {
    notes.push(
      `capex: 기회 시그널 (opportunity_score ${stages.capex.opportunity_score}) — 신규시설투자 공시 직접 확인 (7부 C)`,
    );
  }
  if (stages.insider?.signal === "strong_buy_cluster") {
    notes.push(
      `insider: 매수 클러스터 (${stages.insider.cluster_quarter ?? "분기 미상"}) — 7부 C 선행 지표`,
    );
  }
  if (stages.insider?.signal === "strong_sell_cluster") {
    notes.push(
      `insider: 매도 클러스터 (${stages.insider.cluster_quarter ?? "분기 미상"}) — 위험 신호`,
    );
  }
  if (stages.dividend?.grade === "D") {
    notes.push("dividend: 등급 D — 배당 지속성 위험 (7부 E)");
  }
  if (stages.srim?.verdict === "BUY" || stages.srim?.verdict === "BUY_FAIR") {
    notes.push(
      `srim: ${stages.srim.verdict} (gap_to_fair ${stages.srim.gap_to_fair ?? "?"}) — 매수 영역 (7부 D-2)`,
    );
  }

  return notes;
}

export const watchlistCheckTool = defineTool({
  name: "sagyeongin_watchlist_check",
  description:
    "관심 종목 분기 점검 — 6개 사경인 도구 통합 (killer/srim/cashflow/capex/insider/dividend). " +
    "philosophy 7부 F (10개 내외, 분기·반기 단위 점검). " +
    "check_level: A=killer만 (빠른 위험 체크), full=전체. " +
    "corp_codes 미지정 시 watchlist 전체. " +
    "overall_flag: watchlist_remove_recommended (killer EXCLUDE) / attention (검토 권장) / normal. " +
    "Ref: spec §10.9, §9.2",
  input: Input,
  handler: async (ctx, args) => {
    const checkedAt = new Date().toISOString();
    const config = await loadConfig();

    // 점검 대상 결정
    let targets: WatchlistEntry[];
    if (args.corp_codes !== undefined && args.corp_codes.length > 0) {
      // corp_codes 직접 지정 — watchlist에 없는 corp_code는 entry 합성
      targets = args.corp_codes.map((cc) => {
        const found = config.watchlist.find((e) => e.corp_code === cc);
        if (found) return found;
        return {
          corp_code: cc,
          name: "(unregistered)",
          added_at: "",
          tags: [],
        };
      });
    } else {
      targets = config.watchlist;
    }

    // 빈 watchlist 처리
    if (targets.length === 0) {
      return {
        checked_at: checkedAt,
        summary: {
          total: 0,
          A_excluded: 0,
          srim_buy_zone: 0,
          B_review_required: 0,
          C_signal_detected: 0,
        },
        results: [],
        next_actions_suggested: [
          "watchlist가 비어 있음 — sagyeongin_update_watchlist로 종목 추가",
          "또는 corp_codes 파라미터로 직접 지정",
        ],
      };
    }

    // 6 도구 호출 — 순차 (DART daily limit 고려해 Promise.all 사용 안 함)
    const results: CorpResult[] = [];
    for (const corp of targets) {
      const { stages, corp_name, stageNotes } = await runStages(
        corp,
        args.check_level,
        ctx,
      );
      const overall_flag = determineOverallFlag(stages);
      const semanticNotes = buildSemanticNotes(stages);

      results.push({
        corp_code: corp.corp_code,
        corp_name,
        stages,
        overall_flag,
        notes: [...stageNotes, ...semanticNotes],
      });
    }

    // summary 집계 (spec §10.9 line 820-826)
    const summary = {
      total: results.length,
      A_excluded: results.filter(
        (r) => r.stages.killer.verdict === "EXCLUDE",
      ).length,
      srim_buy_zone: results.filter(
        (r) =>
          r.stages.srim?.verdict === "BUY" ||
          r.stages.srim?.verdict === "BUY_FAIR",
      ).length,
      B_review_required: results.filter(
        (r) => r.stages.cashflow?.verdict === "REVIEW_REQUIRED",
      ).length,
      C_signal_detected: results.filter(
        (r) => r.stages.capex?.verdict === "SIGNAL_DETECTED",
      ).length,
    };

    // next_actions_suggested (5부: 사람 결정 영역 사전 분리)
    const nextActions: string[] = [];
    if (summary.A_excluded > 0) {
      nextActions.push(
        `A_excluded ${summary.A_excluded}개 — sagyeongin_update_watchlist로 제거 검토`,
      );
    }
    if (summary.B_review_required > 0) {
      nextActions.push(
        `B_review_required ${summary.B_review_required}개 — 종목별 investigation_hints 점검`,
      );
    }
    if (summary.C_signal_detected > 0) {
      nextActions.push(
        `C_signal_detected ${summary.C_signal_detected}개 — 신규시설투자 공시 직접 확인`,
      );
    }
    if (summary.srim_buy_zone > 0) {
      nextActions.push(
        `srim_buy_zone ${summary.srim_buy_zone}개 — 추가 매수 검토`,
      );
    }
    if (nextActions.length === 0) {
      nextActions.push("이상 신호 없음 — 다음 분기 점검까지 유지");
    }

    return {
      checked_at: checkedAt,
      summary,
      results,
      next_actions_suggested: nextActions,
    };
  },
});
