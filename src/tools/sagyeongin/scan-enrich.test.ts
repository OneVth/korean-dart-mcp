/**
 * scan-execute Stage 4~6 enrichment 단위 테스트.
 *
 * 묶음 3C — enrichCandidates / finalizeCandidates / buildQuickSummary 매핑 검증.
 * mock 4 도구(EnrichDeps DI) + 임계값 mock RateLimitedDartClient.
 *
 * field-test에서 srim BUY/BUY_FAIR 통과 0건이라 enrichment 런타임 검증 빈 구멍을 메움.
 *
 * Ref: spec §10.8, §7.1, philosophy 5부+8부, ADR-0009/0012/0014
 */

import { test, describe } from "node:test";
import * as assert from "node:assert/strict";
import {
  enrichCandidates,
  finalizeCandidates,
  buildQuickSummary,
  type EnrichDeps,
  type EnrichedCandidate,
  type PartialCandidate,
  type ResolvedInput,
} from "./scan-execute.js";
import {
  RateLimitedDartClient,
  DartRateLimitError,
} from "./_lib/dart-rate-limit.js";

// ---- mock 헬퍼 ----

const mockCtx = {
  client: {} as unknown,
  resolver: {} as unknown,
} as Parameters<typeof enrichCandidates>[1];

/** callCount 임의값을 갖는 RateLimitedDartClient mock. */
function mockLimited(callCount: number): RateLimitedDartClient {
  return { callCount } as unknown as RateLimitedDartClient;
}

function makePartial(corp_code: string, corp_name: string): PartialCandidate {
  return {
    corp_code,
    corp_name,
    corp_cls: "K",
    induty_code: "26101",
    killer: { verdict: "PASS", triggered_rules: [] },
    srim: {
      verdict: "BUY",
      prices: { fair_value: 10000 },
      gap_to_fair: 5.5,
    },
  };
}

interface MockSpec {
  cashflowResp?: unknown;
  capexResp?: unknown;
  insiderResp?: unknown;
  dividendResp?: unknown;
  cashflowThrow?: Error;
  capexThrow?: Error;
  insiderThrow?: Error;
  dividendThrow?: Error;
  insiderInputCapture?: { input?: unknown };
  // 19단계 학습 31 — cashflow yearly_data 기본값 주입
  cashflowYearlyData?: Array<{
    year: string;
    op_profit: number | null;
    op_cf: number;
    inv_cf: number;
    fin_cf: number;
    oi_cf_ratio: number | null;
  }>;
}

function makeDeps(spec: MockSpec = {}): EnrichDeps {
  return {
    cashflow: {
      handler: async () => {
        if (spec.cashflowThrow) throw spec.cashflowThrow;
        return (
          spec.cashflowResp ?? {
            verdict: "OK",
            concern_score: 5,
            flags: [{ flag: "F1" }],
            yearly_data: spec.cashflowYearlyData ?? [],
          }
        );
      },
    },
    capex: {
      handler: async () => {
        if (spec.capexThrow) throw spec.capexThrow;
        return (
          spec.capexResp ?? {
            verdict: "STRONG",
            opportunity_score: 30,
            signals: [{ signal: "S1" }],
          }
        );
      },
    },
    insider: {
      handler: async (input) => {
        if (spec.insiderInputCapture) {
          spec.insiderInputCapture.input = input;
        }
        if (spec.insiderThrow) throw spec.insiderThrow;
        return (
          spec.insiderResp ?? {
            summary: { signal: "NORMAL", strongest_quarter: null },
          }
        );
      },
    },
    dividend: {
      handler: async () => {
        if (spec.dividendThrow) throw spec.dividendThrow;
        return (
          spec.dividendResp ?? {
            sustainability_grade: "A",
            metrics: {
              avg_payout_ratio: 0,
              avg_dividend_yield: 0,
              payout_stddev: 0,
              years_of_dividend: 0,
              recent_cut: false,
            },
            series: [],
            interpretation_notes: [],
          }
        );
      },
    },
  };
}

// ---- enrichCandidates ----

describe("enrichCandidates — 4 도구 매핑", () => {
  test("정상 응답 — cashflow/capex/insider/dividend 모두 매핑", async () => {
    const deps = makeDeps({
      cashflowResp: {
        verdict: "REVIEW_REQUIRED",
        concern_score: 25,
        flags: [{ flag: "F_A" }, { flag: "F_B" }],
        yearly_data: [],
      },
      capexResp: {
        verdict: "STRONG",
        opportunity_score: 50,
        signals: [{ signal: "S_A" }],
      },
      insiderResp: {
        summary: { signal: "CLUSTER_BUY", strongest_quarter: "2024Q3" },
      },
      dividendResp: {
        sustainability_grade: "B",
        metrics: { avg_payout_ratio: 0, avg_dividend_yield: 0, payout_stddev: 0, years_of_dividend: 0, recent_cut: false },
        series: [],
        interpretation_notes: [],
      },
    });
    const result = await enrichCandidates(
      [makePartial("00001", "테스트A")],
      mockCtx,
      mockLimited(0),
      deps,
    );
    assert.equal(result.limitReachedDuringEnrich, false);
    assert.equal(result.enriched.length, 1);
    const c = result.enriched[0];
    assert.deepEqual(c.cashflow, {
      verdict: "REVIEW_REQUIRED",
      concern_score: 25,
      top_flags: ["F_A", "F_B"],
      yearly_data: [],
    });
    assert.deepEqual(c.capex, {
      verdict: "STRONG",
      opportunity_score: 50,
      top_signals: ["S_A"],
    });
    assert.deepEqual(c.insider, {
      signal: "CLUSTER_BUY",
      cluster_quarter: "2024Q3",
    });
    assert.deepEqual(c.dividend, {
      grade: "B",
      metrics: { avg_payout_ratio: 0, avg_dividend_yield: 0, payout_stddev: 0, years_of_dividend: 0, recent_cut: false },
      series: [],
      interpretation_notes: [],
    });
    assert.deepEqual(c.stage_notes, []);
  });

  test("cashflow.flags 5개 → top_flags 3개로 잘림", async () => {
    const deps = makeDeps({
      cashflowResp: {
        verdict: "OK",
        concern_score: 0,
        flags: [
          { flag: "1" },
          { flag: "2" },
          { flag: "3" },
          { flag: "4" },
          { flag: "5" },
        ],
        yearly_data: [],
      },
    });
    const result = await enrichCandidates(
      [makePartial("00002", "테스트B")],
      mockCtx,
      mockLimited(0),
      deps,
    );
    assert.equal(result.enriched[0].cashflow?.top_flags.length, 3);
    assert.deepEqual(result.enriched[0].cashflow?.top_flags, ["1", "2", "3"]);
  });

  test("capex.signals 5개 → top_signals 3개로 잘림", async () => {
    const deps = makeDeps({
      capexResp: {
        verdict: "STRONG",
        opportunity_score: 80,
        signals: [
          { signal: "a" },
          { signal: "b" },
          { signal: "c" },
          { signal: "d" },
          { signal: "e" },
        ],
      },
    });
    const result = await enrichCandidates(
      [makePartial("00003", "테스트C")],
      mockCtx,
      mockLimited(0),
      deps,
    );
    assert.equal(result.enriched[0].capex?.top_signals.length, 3);
    assert.deepEqual(result.enriched[0].capex?.top_signals, ["a", "b", "c"]);
  });

  test("insider 호출 시 input 키는 'corp' (corp_code 아님)", async () => {
    const capture: { input?: unknown } = {};
    const deps = makeDeps({ insiderInputCapture: capture });
    await enrichCandidates(
      [makePartial("00004", "테스트D")],
      mockCtx,
      mockLimited(0),
      deps,
    );
    assert.deepEqual(capture.input, { corp: "00004" });
  });

  test("cashflow 일반 throw → cashflow=null + stage_notes 누적", async () => {
    const deps = makeDeps({ cashflowThrow: new Error("재무제표 조회 실패") });
    const result = await enrichCandidates(
      [makePartial("00005", "테스트E")],
      mockCtx,
      mockLimited(0),
      deps,
    );
    assert.equal(result.enriched[0].cashflow, null);
    assert.equal(result.enriched[0].stage_notes.length, 1);
    assert.match(result.enriched[0].stage_notes[0], /cashflow 호출 실패/);
    // 나머지는 정상
    assert.notEqual(result.enriched[0].capex, null);
    assert.notEqual(result.enriched[0].insider, null);
    assert.notEqual(result.enriched[0].dividend, null);
  });

  test("capex 일반 throw → capex=null + 나머지 stage 정상", async () => {
    const deps = makeDeps({ capexThrow: new Error("CF endpoint 오류") });
    const result = await enrichCandidates(
      [makePartial("00006", "테스트F")],
      mockCtx,
      mockLimited(0),
      deps,
    );
    assert.equal(result.enriched[0].capex, null);
    assert.match(result.enriched[0].stage_notes[0], /capex 호출 실패/);
    assert.notEqual(result.enriched[0].cashflow, null);
  });

  test("cashflow DartRateLimitError → limitReachedDuringEnrich=true 즉시 반환", async () => {
    const deps = makeDeps({
      cashflowThrow: new DartRateLimitError("[020] 일일 한도 초과"),
    });
    const result = await enrichCandidates(
      [makePartial("00007", "테스트G")],
      mockCtx,
      mockLimited(0),
      deps,
    );
    assert.equal(result.limitReachedDuringEnrich, true);
    assert.equal(result.enriched.length, 0); // 첫 partial도 enriched에 포함 안 됨
  });

  test("limited.callCount >= 16000 → 진입 즉시 limitReachedDuringEnrich=true", async () => {
    const deps = makeDeps();
    const result = await enrichCandidates(
      [makePartial("00008", "테스트H")],
      mockCtx,
      mockLimited(16000),
      deps,
    );
    assert.equal(result.limitReachedDuringEnrich, true);
    assert.equal(result.enriched.length, 0);
  });

  test("partial 2개 모두 정상 enrichment — 순서 보존", async () => {
    const deps = makeDeps();
    const partial = [
      makePartial("00009", "1번"),
      makePartial("00010", "2번"),
    ];
    const result = await enrichCandidates(partial, mockCtx, mockLimited(0), deps);
    assert.equal(result.limitReachedDuringEnrich, false);
    assert.equal(result.enriched.length, 2);
    assert.equal(result.enriched[0].corp_code, "00009");
    assert.equal(result.enriched[1].corp_code, "00010");
  });

  // --- S1-S4: 19단계 yearly_data + metrics/series 전파 검증 ---

  test("S1: cashflow.yearly_data — mock response 정합 전파", async () => {
    const mockYd = [
      { year: "2023", op_profit: 80, op_cf: 100, inv_cf: -50, fin_cf: 30, oi_cf_ratio: 1.25 },
    ];
    const deps = makeDeps({
      cashflowResp: {
        verdict: "OK",
        concern_score: 0,
        flags: [],
        yearly_data: mockYd,
      },
    });
    const result = await enrichCandidates(
      [makePartial("S001", "S1법인")],
      mockCtx,
      mockLimited(0),
      deps,
    );
    assert.deepEqual(result.enriched[0].cashflow?.yearly_data, mockYd);
  });

  test("S2: dividend.metrics/series/notes — mock response 정합 전파", async () => {
    const mockMetrics = {
      avg_payout_ratio: 0.3,
      avg_dividend_yield: 0.02,
      payout_stddev: 0.05,
      years_of_dividend: 5,
      recent_cut: false,
    };
    const mockSeries = [
      { year: "2024", payout_ratio: 0.3, dividend_yield: 0.02, net_income: 1_000_000, dividend_total: 300_000 },
    ];
    const mockNotes = ["배당 안정성 양호"];
    const deps = makeDeps({
      dividendResp: {
        sustainability_grade: "A+",
        metrics: mockMetrics,
        series: mockSeries,
        interpretation_notes: mockNotes,
      },
    });
    const result = await enrichCandidates(
      [makePartial("S002", "S2법인")],
      mockCtx,
      mockLimited(0),
      deps,
    );
    assert.deepEqual(result.enriched[0].dividend?.metrics, mockMetrics);
    assert.deepEqual(result.enriched[0].dividend?.series, mockSeries);
    assert.deepEqual(result.enriched[0].dividend?.interpretation_notes, mockNotes);
  });

  test("S3: cashflow throw → cashflow=null, dividend.metrics 정상 전파", async () => {
    const mockMetrics = {
      avg_payout_ratio: 0.2,
      avg_dividend_yield: 0.01,
      payout_stddev: 0.02,
      years_of_dividend: 3,
      recent_cut: false,
    };
    const deps = makeDeps({
      cashflowThrow: new Error("CF 실패"),
      dividendResp: {
        sustainability_grade: "B",
        metrics: mockMetrics,
        series: [],
        interpretation_notes: [],
      },
    });
    const result = await enrichCandidates(
      [makePartial("S003", "S3법인")],
      mockCtx,
      mockLimited(0),
      deps,
    );
    assert.equal(result.enriched[0].cashflow, null);
    assert.deepEqual(result.enriched[0].dividend?.metrics, mockMetrics);
  });

  test("S4: dividend throw → dividend=null, cashflow.yearly_data 정상 전파", async () => {
    const mockYd = [
      { year: "2025", op_profit: 100, op_cf: 300, inv_cf: -70, fin_cf: 50, oi_cf_ratio: 3 },
    ];
    const deps = makeDeps({
      dividendThrow: new Error("배당 실패"),
      cashflowResp: {
        verdict: "CLEAN",
        concern_score: 0,
        flags: [],
        yearly_data: mockYd,
      },
    });
    const result = await enrichCandidates(
      [makePartial("S004", "S4법인")],
      mockCtx,
      mockLimited(0),
      deps,
    );
    assert.equal(result.enriched[0].dividend, null);
    assert.deepEqual(result.enriched[0].cashflow?.yearly_data, mockYd);
  });
});

// ---- finalizeCandidates ----

describe("finalizeCandidates — composite_score + sort + limit + rank", () => {
  function makeEnriched(
    corp_code: string,
    opp: number | null,
    con: number | null,
  ): EnrichedCandidate {
    return {
      rank: 0,
      corp_code,
      corp_name: corp_code,
      corp_cls: "K",
      induty_code: "26",
      composite_score: 0,
      killer: { verdict: "PASS", triggered_rules: [] },
      srim: { verdict: "BUY", prices: {}, gap_to_fair: 5.0 },
      cashflow:
        con == null ? null : { verdict: "OK", concern_score: con, top_flags: [], yearly_data: [] },
      capex:
        opp == null
          ? null
          : { verdict: "STRONG", opportunity_score: opp, top_signals: [] },
      insider: null,
      dividend: null,
      stage_notes: [],
      quick_summary: "",
    };
  }

  test("composite_score = capex.opp - cashflow.con", () => {
    const resolved: ResolvedInput = { min_opportunity_score: 0, limit: 10 };
    const out = finalizeCandidates([makeEnriched("A", 50, 10)], resolved);
    assert.equal(out[0].composite_score, 40);
  });

  test("DESC 정렬 + rank 1부터", () => {
    const resolved: ResolvedInput = { min_opportunity_score: 0, limit: 10 };
    const out = finalizeCandidates(
      [
        makeEnriched("low", 10, 0), // composite 10
        makeEnriched("high", 80, 0), // composite 80
        makeEnriched("mid", 40, 0), // composite 40
      ],
      resolved,
    );
    assert.deepEqual(
      out.map((c) => c.corp_code),
      ["high", "mid", "low"],
    );
    assert.deepEqual(
      out.map((c) => c.rank),
      [1, 2, 3],
    );
  });

  test("min_opportunity_score 필터 — opp 미만 제외", () => {
    const resolved: ResolvedInput = { min_opportunity_score: 30, limit: 10 };
    const out = finalizeCandidates(
      [
        makeEnriched("a", 20, 0), // 제외
        makeEnriched("b", 50, 0), // 통과
        makeEnriched("c", 30, 0), // 통과 (>=)
      ],
      resolved,
    );
    assert.deepEqual(
      out.map((c) => c.corp_code),
      ["b", "c"],
    );
  });

  test("limit 적용 — 정렬 후 상위 N", () => {
    const resolved: ResolvedInput = { min_opportunity_score: 0, limit: 2 };
    const out = finalizeCandidates(
      [
        makeEnriched("d", 10, 0),
        makeEnriched("a", 90, 0),
        makeEnriched("c", 30, 0),
        makeEnriched("b", 60, 0),
      ],
      resolved,
    );
    assert.equal(out.length, 2);
    assert.deepEqual(
      out.map((c) => c.corp_code),
      ["a", "b"],
    );
  });

  test("capex/cashflow null → composite_score 0 가정", () => {
    const resolved: ResolvedInput = { min_opportunity_score: 0, limit: 10 };
    const out = finalizeCandidates([makeEnriched("nullboth", null, null)], resolved);
    assert.equal(out[0].composite_score, 0);
  });
});

// ---- buildQuickSummary ----

describe("buildQuickSummary — 8부 사용자 직관 보조", () => {
  function makeFull(
    overrides: Partial<EnrichedCandidate> = {},
  ): EnrichedCandidate {
    return {
      rank: 1,
      corp_code: "X",
      corp_name: "X",
      corp_cls: "K",
      induty_code: "26",
      composite_score: 30,
      killer: { verdict: "PASS", triggered_rules: [] },
      srim: { verdict: "BUY", prices: {}, gap_to_fair: 12.5 },
      cashflow: { verdict: "OK", concern_score: 5, top_flags: [], yearly_data: [] },
      capex: { verdict: "STRONG", opportunity_score: 35, top_signals: [] },
      insider: { signal: "NORMAL", cluster_quarter: null },
      dividend: {
        grade: "A",
        metrics: { avg_payout_ratio: 0, avg_dividend_yield: 0, payout_stddev: 0, years_of_dividend: 0, recent_cut: false },
        series: [],
        interpretation_notes: [],
      },
      stage_notes: [],
      quick_summary: "",
      ...overrides,
    };
  }

  test("정상 — srim verdict + gap + capex score + dividend grade 포함", () => {
    const s = buildQuickSummary(makeFull());
    assert.match(s, /srim BUY/);
    assert.match(s, /gap 12\.5/); // toFixed(1)
    assert.match(s, /capex 35/);
    assert.match(s, /dividend A/);
  });

  test("insider NORMAL → summary에 insider 표시 안 함", () => {
    const s = buildQuickSummary(
      makeFull({ insider: { signal: "NORMAL", cluster_quarter: null } }),
    );
    assert.doesNotMatch(s, /insider/);
  });

  test("insider CLUSTER_BUY → summary에 표시", () => {
    const s = buildQuickSummary(
      makeFull({ insider: { signal: "CLUSTER_BUY", cluster_quarter: "2024Q3" } }),
    );
    assert.match(s, /insider CLUSTER_BUY/);
  });

  test("cashflow REVIEW_REQUIRED → REVIEW(score) 표시", () => {
    const s = buildQuickSummary(
      makeFull({
        cashflow: {
          verdict: "REVIEW_REQUIRED",
          concern_score: 30,
          top_flags: [],
          yearly_data: [],
        },
      }),
    );
    assert.match(s, /cashflow REVIEW\(30\)/);
  });

  test("cashflow null → cashflow N\\/A 표시", () => {
    const s = buildQuickSummary(makeFull({ cashflow: null }));
    assert.match(s, /cashflow N\/A/);
  });

  test("dividend N/A grade → dividend 표시 생략", () => {
    const s = buildQuickSummary(makeFull({
      dividend: {
        grade: "N/A",
        metrics: { avg_payout_ratio: 0, avg_dividend_yield: 0, payout_stddev: 0, years_of_dividend: 0, recent_cut: false },
        series: [],
        interpretation_notes: [],
      },
    }));
    assert.doesNotMatch(s, /dividend/);
  });

  test("gap_to_fair null → gap 표시 생략", () => {
    const s = buildQuickSummary(
      makeFull({
        srim: { verdict: "BUY_FAIR", prices: {}, gap_to_fair: null },
      }),
    );
    assert.doesNotMatch(s, /gap/);
    assert.match(s, /srim BUY_FAIR/);
  });
});
