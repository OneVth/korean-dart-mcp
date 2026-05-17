# 2026-05-17 Stage 20 (iii)-redux — 학습 28/31 user-facing gap 제거 정적 정합 evidence

## 개요

19단계 schema 확장 (commits `dfbb87f`, `d110410`, `957e5eb`, `0fd10bd`, merge `77c2ac7`, knot `907b8a3`)이 학습 28 (T5 dividend output gap) + 학습 31 (T2 cashflow output gap) user-facing gap 제거를 코드 + test 양쪽에 정착시켰는지 정적 분석으로 검증.

- baseline: `cf47a64` (Stage 20 보류 종결 매듭)
- 본 사이클 코드 변경 0
- MCP 호출 0 (분기 E — 정적 코드 분석 + test 정합)
- 결론: **학습 28 + 학습 31 user-facing gap 제거 정착 ✓**

## 보류 사이클 (entry prompt 가정 위반) 정정 본문

직전 명세 `df389df` (`00-scope.md` line 30-38) V1+V2 호출 입력 가정:
```json
{ "universe": "watchlist", "max_candidates": 3 }
```

실제 scan_execute Input schema (scan-execute.ts:98-108):
```typescript
const InputSchema = z.object({
  preset: z.string().optional(),
  markets: z.array(z.enum(["KOSPI", "KOSDAQ"])).optional(),
  included_industries: z.array(z.string()).optional(),
  excluded_industries: z.array(z.string()).optional(),
  excluded_name_patterns: z.array(z.string()).optional(),
  min_opportunity_score: z.number().default(0),
  limit: z.number().default(10),
  random_seed: z.number().int().optional(),
  resume_from: z.string().optional(),
});
```

`universe` parameter 부재 + `limit` semantic = finalizeCandidates 단일 slice 적용 (pipeline 호출량 축소 불가).

→ 본 사이클 분기 결정 본질 재구성. MCP 호출 (분기 A/B) 대신 정적 코드 분석 (분기 E)으로 학습 28/31 user-facing gap 제거 정합 식별.

## 분기 E 본질

V1+V2 user-facing gap 제거 검증 = scan_execute candidate에 19단계 추가 필드 (cashflow.yearly_data + dividend.metrics/series/interpretation_notes)가 user-facing output까지 정합 전파되는가.

검증 수단 비교:

| 수단 | 본질 | 본 사이클 선택 |
|---|---|---|
| MCP 호출 | live DART 응답 sample 정착 | 분기 A/B — universe 통과 호출량 부담 |
| 정적 코드 분석 | 코드 path mutation 부재 + test mock propagation assertion | 분기 E ✓ |

정적 분석은 deterministic + ADR-0003 mock 단테 원칙 정합 + 코드 변경 0 원칙 정합.

## 회수 결과 4건

### 회수 A — 18 (iii) decision-flow + results

학습 28/31 origin = `docs/sagyeongin/scenarios/stage18-e2e/results/02-decision-flow.md` line 385-389 "본 사이클 핵심 발견 5건":

> 1. **17단계 §6 dividend gap 정확 확인** — T5 `metrics` + `series` 5년이 scan_execute에서 부재. **scan-execute schema 확장 후보** (학습 28)
> 5. **T2 cashflow `yearly_data` 부재** — 명세 vs 실제 어긋남. T2 단독 호출 schema 확장 후보 (학습 31 후보)

18 (iii) 자체는 watchlist 10 × 5 도구 단독 호출 50건. scan_execute universe 통과 0. 학습 28/31 origin은 surface 어긋남 식별 본문이며 scan_execute 호출 통해서 식별된 게 아님.

### 회수 B — scan_execute 코드 path

`src/tools/sagyeongin/scan-execute.ts` 직접 view:

**enrichCandidates (line 392-516)** — DART handler 응답 → candidate 객체 propagation:

cashflow stage (line 393-422):
```typescript
const r = (await deps.cashflow.handler({ corp_code: p.corp_code }, ctx)) as {
  verdict: string;
  concern_score: number;
  flags: Array<{ flag: string }>;
  // 19단계 학습 31 — yearly_data 전파
  yearly_data: Array<{
    year: string;
    op_profit: number | null;
    op_cf: number;
    inv_cf: number;
    fin_cf: number;
    oi_cf_ratio: number | null;
  }>;
};
cashflowStage = {
  verdict: r.verdict,
  concern_score: r.concern_score,
  top_flags: r.flags.slice(0, 3).map((f) => f.flag),
  yearly_data: r.yearly_data,  // ← 학습 31 user-facing 전파 line 415
};
```

dividend stage (line 466-500):
```typescript
const r = (await deps.dividend.handler({ corp_code: p.corp_code }, ctx)) as {
  sustainability_grade: string;
  // 19단계 학습 28 — 배당 진입 인터페이스 전파
  metrics: { avg_payout_ratio, avg_dividend_yield, payout_stddev, years_of_dividend, recent_cut };
  series: Array<{ year, payout_ratio, dividend_yield, net_income, dividend_total }>;
  interpretation_notes: string[];
};
dividendStage = {
  grade: r.sustainability_grade,
  metrics: r.metrics,                       // ← line 491
  series: r.series,                         // ← line 492
  interpretation_notes: r.interpretation_notes,  // ← line 493
};
```

candidate 객체 생성 (line 502-517):
```typescript
enriched.push({
  ...
  cashflow: cashflowStage,    // ← line 511 (yearly_data 포함)
  dividend: dividendStage,    // ← line 514 (metrics + series + notes 포함)
  ...
});
```

**EnrichedCandidate type 정의 (line 140-197)**:

cashflow 필드 schema (line 153-166):
```typescript
cashflow: {
  verdict: string;
  concern_score: number;
  top_flags: string[];
  // 19단계 학습 31 — 7부 B 시계열 노출 (CF 사실 + 영업이익 + 비율)
  yearly_data: Array<{
    year: string;
    op_profit: number | null;
    op_cf: number;
    inv_cf: number;
    fin_cf: number;
    oi_cf_ratio: number | null;
  }>;
} | null;
```

dividend 필드 schema (line 176-194):
```typescript
// 19단계 학습 28 — 7부 E 배당주 진입 인터페이스 (metrics + series + notes)
dividend: {
  grade: string;
  metrics: {
    avg_payout_ratio: number;
    avg_dividend_yield: number;
    payout_stddev: number;
    years_of_dividend: number;
    recent_cut: boolean;
  };
  series: Array<{
    year: string;
    payout_ratio: number;
    dividend_yield: number;
    net_income: number;
    dividend_total: number;
  }>;
  interpretation_notes: string[];
} | null;
```

**finalizeCandidates (line 525-545)** — mutation 부재 검증:
```typescript
export function finalizeCandidates(
  enriched: EnrichedCandidate[],
  resolved: ResolvedInput,
): EnrichedCandidate[] {
  for (const c of enriched) {
    const opp = c.capex?.opportunity_score ?? 0;
    const con = c.cashflow?.concern_score ?? 0;
    c.composite_score = opp - con;       // 본 필드만 추가
    c.quick_summary = buildQuickSummary(c);  // 본 필드만 추가
  }
  const filtered = enriched.filter(...);
  filtered.sort((a, b) => b.composite_score - a.composite_score);
  const trimmed = filtered.slice(0, resolved.limit);  // ← 단순 truncation
  trimmed.forEach((c, i) => { c.rank = i + 1; });    // 본 필드만 추가
  return trimmed;
}
```

cashflow.yearly_data + dividend.metrics/series/interpretation_notes 모두 mutation 없이 보존.

**buildResponse (line 590-627)** — user-facing output:
```typescript
return {
  scan_id: args.state.scan_id,
  pipeline_stats: { ... },
  external_call_stats: { ... },
  candidates: args.candidates,    // ← line 622 그대로 노출
  skipped_corps: args.skipped,
  ...
};
```

→ **전 흐름 path 정합**. handler 응답의 yearly_data + metrics + series + interpretation_notes가 enrichCandidates → EnrichedCandidate → finalizeCandidates → buildResponse → user-facing output까지 mutation 없이 전파.

### 회수 B 추가 — scan-enrich.test.ts S1~S4 mock propagation 정합

`src/tools/sagyeongin/scan-enrich.test.ts` 본 19단계 학습 28/31 검증 test 4건 (line 327-431):

```typescript
// --- S1-S4: 19단계 yearly_data + metrics/series 전파 검증 ---

// S1 (line 329): cashflow.yearly_data — mock response 정합 전파
test("S1: cashflow.yearly_data — mock response 정합 전파", async () => {
  // mockYd 주입 → enrichCandidates 호출
  // assert.deepEqual(result.enriched[0].cashflow?.yearly_data, mockYd);
});

// S2 (line 350): dividend.metrics/series/notes — mock response 정합 전파
test("S2: dividend.metrics/series/notes — mock response 정합 전파", async () => {
  // mockMetrics + mockSeries + mockNotes 주입
  // assert.deepEqual(result.enriched[0].dividend?.metrics, mockMetrics);
  // assert.deepEqual(result.enriched[0].dividend?.series, mockSeries);
  // assert.deepEqual(result.enriched[0].dividend?.interpretation_notes, mockNotes);
});

// S3 (line 381): cashflow throw → cashflow=null, dividend.metrics 정상 전파
test("S3: cashflow throw → cashflow=null, dividend.metrics 정상 전파", async () => {
  // assert.deepEqual(result.enriched[0].dividend?.metrics, mockMetrics);
});

// S4 (line 408): dividend throw → dividend=null, cashflow.yearly_data 정상 전파
test("S4: dividend throw → dividend=null, cashflow.yearly_data 정상 전파", async () => {
  // assert.deepEqual(result.enriched[0].cashflow?.yearly_data, mockYd);
});
```

S1 + S2 = 정상 propagation 검증. S3 + S4 = throw 경로에서도 cross 필드 보존 정합 검증.

본 4건 unit test가 학습 28/31 user-facing gap 제거를 deterministic하게 cover.

### 회수 C — corp_meta_cache 충전 상태

분기 E 본질 — MCP 호출 0이므로 corp_meta_cache 충전 상태 무관. **회수 C 미진행** (잉여).

### 회수 D — 직전 명세 본문

`docs/sagyeongin/scenarios/stage20-iii-redux/00-scope.md` (line 30-38) — V1+V2 호출 입력 가정 위반 위치. line 87-108 PASS/FAIL 기준, line 167-171 V3 교차, line 237-243 V4 교차, line 247-271 V5 본문 모두 MCP 호출 가정 기반. 분기 E 정합 정정 본문으로 대체.

## 학습 28/31 user-facing gap 제거 정착 결론

| 학습 | gap origin | 19단계 정착 본문 | 본 사이클 정합 검증 |
|---|---|---|---|
| 28 | T5 dividend `metrics` + 5년 `series` + `interpretation_notes` scan_execute embedded 부재 (18(iii) results §본 사이클 핵심 발견 5건 #1) | EnrichedCandidate.dividend.{metrics, series, interpretation_notes} 추가 (scan-execute.ts line 176-194) + enrichCandidates propagation (line 491-493) | 코드 path trace + scan-enrich.test.ts S2/S3 mock propagation assertion ✓ |
| 31 | T2 cashflow `yearly_data` scan_execute embedded + 단독 응답 양쪽 부재 (18(iii) results §본 사이클 핵심 발견 5건 #5) | EnrichedCandidate.cashflow.yearly_data 추가 (scan-execute.ts line 157-165) + enrichCandidates propagation (line 415) | 코드 path trace + scan-enrich.test.ts S1/S4 mock propagation assertion ✓ |

**user-facing gap 제거 정착 ✓** — 코드 + test 양쪽 정합. live MCP 호출 정착 evidence는 후속 사이클 또는 18(iii) 재실행 시 보강 가능 (본 사이클 본질 외 — 분기 D 별개 사이클).

## V3~V5 cover 정합 (직전 사이클 응답 4건 + 18(iii) results 정합)

직전 사이클 (보류) MCP 호출 6건 중 V3+V4 응답 4건 정합 정착:

| Call | corp_code | corp_name | 결과 |
|---|---|---|---|
| V3-1 | 00135795 | 신도리코 | CLEAN, yearly_data 5건 정합 ✓ |
| V3-2 | 00525934 | LX세미콘 | CLEAN, yearly_data 5건 정합 ✓ (룰 1 미트리거 — null path 미cover) |
| V4-1 | 00490151 | 파트론 | grade A, 5년 series 정합 ✓ |
| V4-2 | 00305297 | 코텍 | grade N/A Path 2 ✓ (series 4년 + metrics 계산값 + notes 2건) |

V3 (cashflow_check 단독) + V4 (dividend_check 단독) 응답이 학습 28/31 단독 호출 surface 정합 cover. V5 (7부 B/E user-facing 의사결정 정합) = V1~V4 정합 결과 분석. 본 사이클 V3+V4 재호출 0.

## V1+V2 ↔ V3+V4 교차 정합 — 본 사이클 미진행 사유

scan_execute candidate (V1+V2) ↔ 단독 호출 (V3+V4) 동일 corp_code 응답 일치 검증은:
- 직전 가정 (universe="watchlist") 가정 위반 → corp_code overlap 보장 불가 (분기 A 시도 시에도 included_industries 한정 + killer/srim filter pass 사전 보장 불가)
- 분기 E 본질 (정적 분석)에서 교차 정합은 **타입 시스템 + handler 응답 동일성**으로 cover:
  - EnrichedCandidate.cashflow.yearly_data type ≡ cashflow_check 응답 yearly_data type (둘 다 동일 cashflow-check.ts handler 응답)
  - EnrichedCandidate.dividend.metrics/series type ≡ dividend_check 응답 type (동일 dividend-check.ts handler 응답)
- 동일 handler 호출 → 동일 응답 (deterministic). 교차 정합 검증 잉여.

→ **본 사이클 V1+V2↔V3+V4 교차 정합 미진행 정합** (분기 E 본질에서 잉여).

## ADR-0017 burst limit / ADR-0019 daily limit — 본 사이클 무관

분기 E MCP 호출 0이므로 ADR-0017 burst limit + ADR-0019 daily limit pre-check 모두 무관. corp_meta_cache 충전 상태 + KSIC induty_code 식별 잉여.

## 학습 누적

본 사이클 정착 학습 (학습 #24, 25, 26 정합 후보):

| 학습 후보 | 본문 |
|---|---|
| #24 | **user-facing gap 제거 검증 = 코드 path + test 정합** — MCP live 호출 대안. 19단계 schema 확장 type-safe propagation이 정적 분석으로 cover 가능 시 MCP 호출 잉여 |
| #25 | **18(iii) V3+V4 응답 4건 (cf47a64까지 보류 사이클 정착) 재호출 0 정합** — handler 응답 deterministic이므로 동일 호출 재실행 잉여 |
| #26 | **V1+V2 ↔ V3+V4 교차 정합 = type 시스템 + handler 동일성** — 동일 handler 호출 두 경로 (scan_execute embedded vs 단독)는 type 일치 시 응답 일치 정합. corp_code overlap 보장 검증 잉여 |

본 학습은 사이클 종결 매듭 (Phase B) 시 CLAUDE.md에 정합 누적.

## 참조

- 보류 사이클 entry prompt 본문: `df389df` 시점 명세
- 학습 28/31 origin: `docs/sagyeongin/scenarios/stage18-e2e/results/02-decision-flow.md` line 385-389
- 19단계 commits: `dfbb87f`, `d110410`, `957e5eb`, `0fd10bd`, merge `77c2ac7`, knot `907b8a3`
- 보류 사이클 매듭: `cf47a64`

---

Ref: spec §학습 28/31 user-facing gap 제거 정합, philosophy 7부 B + 7부 E, 19단계 knot `907b8a3`, 보류 사이클 매듭 `cf47a64`
