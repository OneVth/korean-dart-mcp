# 19단계 사전 검증 — scan_execute schema gap 직접 확인

## 사이클 시점

- 검증일: 2026-05-15
- baseline: main HEAD `bc5762a` (18단계 (iii) 사이클 종결 매듭)
- 사이클 목표: scan_execute candidate enrichment schema 확장 — 학습 28 (T5 dividend) + 학습 31 (T2 cashflow) 정착
- 사이클 단계: **1단계 사전 검증** (코드 변경 0)

## 검증 본질

18단계 (iii) 사용자 의사결정 흐름 분석에서 도출된 두 gap 직접 확인:

- 학습 28: `scan_execute` candidates는 `dividend.grade`만 노출. 단독 `dividend_check` 호출 시 `metrics` + `series` 추가 노출 — scan_execute candidate enrichment 단계에서 폐기.
- 학습 31: `cashflow_check` 명세상 `yearly_data` 존재하나 단독 응답 실제 부재. scan_execute candidates도 `verdict + concern_score + top_flags`만 노출.

## (A) dividend gap 직접 확인

### A-1. 단독 응답 (dividend_check) 노출 필드

출처: `src/tools/sagyeongin/dividend-check.ts` L189~202 (return 본문)

```typescript
return {
  corp_code: args.corp_code,
  corp_name,
  sustainability_grade,
  metrics: {
    avg_payout_ratio,
    avg_dividend_yield,
    payout_stddev,
    years_of_dividend,
    recent_cut,
  },
  series,
  interpretation_notes,
};
```

- `metrics` (5 필드): avg_payout_ratio, avg_dividend_yield, payout_stddev, years_of_dividend, recent_cut
- `series` (n년, n=min(dividend.total.length, netIncomeSeries.length)): year, payout_ratio, dividend_yield, net_income, dividend_total
- `interpretation_notes` (string[]): 등급 외 보조 해석

### A-2. scan_execute candidate enrichment 추출

출처: `src/tools/sagyeongin/scan-execute.ts` L430~444

```typescript
// dividend
try {
  const r = (await deps.dividend.handler(
    { corp_code: p.corp_code },
    ctx,
  )) as {
    sustainability_grade: string;
  };
  dividendStage = { grade: r.sustainability_grade };
} catch (e) {
  ...
}
```

- 응답 본문 cast: `{ sustainability_grade: string }` 단일 필드만 명시.
- `dividendStage = { grade: r.sustainability_grade }` — 응답의 `metrics` / `series` / `interpretation_notes` 완전 폐기.

### A-3. EnrichedCandidate 타입 정의

출처: `src/tools/sagyeongin/scan-execute.ts` L167~169

```typescript
dividend: {
  grade: string;
} | null;
```

- 타입 자체가 `grade` 단일 필드 — schema 확장 시 본 타입 정의 우선 수정.

### A-4. dividend gap 확인 결과

| 필드 | 단독 응답 | scan_execute candidate | gap |
|---|---|---|---|
| sustainability_grade | ✓ | ✓ (grade로 재명명) | 0 |
| metrics.avg_payout_ratio | ✓ | ✗ | gap |
| metrics.avg_dividend_yield | ✓ | ✗ | gap |
| metrics.payout_stddev | ✓ | ✗ | gap |
| metrics.years_of_dividend | ✓ | ✗ | gap |
| metrics.recent_cut | ✓ | ✗ | gap |
| series[] | ✓ (n년) | ✗ | gap |
| interpretation_notes | ✓ | ✗ | gap |

## (B) cashflow gap 직접 확인

### B-1. 단독 응답 (cashflow_check) 노출 필드

출처: `src/tools/sagyeongin/cashflow-check.ts` L242

```typescript
return { corp_code: args.corp_code, corp_name, verdict, concern_score, flags };
```

- 노출 필드: corp_code, corp_name, verdict, concern_score, flags
- `yearly_data` **부재** — 명세 vs 실제 어긋남 학습 31 직접 확인.

### B-2. 본체 내부 CF 시계열 추출 위치

출처: `src/tools/sagyeongin/cashflow-check.ts` L208

```typescript
const cf = await extractCashflowSeries(args.corp_code, args.years, ctx);
// cf: { operating: number[]; investing: number[]; financing: number[] }
```

- L208에서 추출된 `cf`는 룰 1~4 평가에 사용되고 응답 노출 없이 폐기.
- 추가 시계열: 룰 1 oi_cf_divergence 내부에서 `extractOperatingIncomeSeries` 호출 (L73) — 영업이익 시계열.

### B-3. scan_execute candidate enrichment 추출

출처: `src/tools/sagyeongin/scan-execute.ts` L367~387

```typescript
// cashflow
try {
  const r = (await deps.cashflow.handler(
    { corp_code: p.corp_code },
    ctx,
  )) as {
    verdict: string;
    concern_score: number;
    flags: Array<{ flag: string }>;
  };
  cashflowStage = {
    verdict: r.verdict,
    concern_score: r.concern_score,
    top_flags: r.flags.slice(0, 3).map((f) => f.flag),
  };
}
```

- 응답 본문 cast: `verdict + concern_score + flags` — 단독 응답과 동일 (yearly_data 부재 그대로 전파).
- `top_flags` 3개 slice — flag 본문만 추출 (severity / description / evidence / investigation_hints 폐기).

### B-4. EnrichedCandidate 타입 정의

출처: `src/tools/sagyeongin/scan-execute.ts` L153~157

```typescript
cashflow: {
  verdict: string;
  concern_score: number;
  top_flags: string[];
} | null;
```

### B-5. cashflow gap 확인 결과

| 필드 | 단독 응답 | scan_execute candidate | gap |
|---|---|---|---|
| verdict | ✓ | ✓ | 0 |
| concern_score | ✓ | ✓ | 0 |
| flags | ✓ | ✗ (top_flags 3개 flag명만) | partial |
| **yearly_data** | **✗ (명세 vs 실제 어긋남)** | **✗** | **gap — cashflow_check 본체 정정 우선** |

cashflow gap 본질: scan_execute schema 확장 전에 cashflow_check 본체에 yearly_data 추가 정착 필요.

## (C) 정정 위치 식별

| 정정 위치 | 변경 본질 |
|---|---|
| `src/tools/sagyeongin/cashflow-check.ts` L242 (return) | yearly_data 노출 추가 — operating/investing/financing/operating_income/oi_cf_ratio 시계열 |
| `src/tools/sagyeongin/scan-execute.ts` L153~169 (EnrichedCandidate 타입) | cashflow.yearly_data + dividend.metrics + dividend.series + dividend.interpretation_notes 필드 추가 |
| `src/tools/sagyeongin/scan-execute.ts` L367~387 (cashflow enrichment) | r cast 확장 + cashflowStage 정착에 yearly_data 추가 |
| `src/tools/sagyeongin/scan-execute.ts` L430~444 (dividend enrichment) | r cast 확장 + dividendStage 정착에 metrics / series / interpretation_notes 추가 |

## (D) β-i 가드 검증

- `src/lib/` 0 변경 확인 — 정정 위치 4건 모두 `src/tools/sagyeongin/` 한정.
- `extractDividendSeries` / `extractNetIncomeSeries` / `extractCashflowSeries` / `extractOperatingIncomeSeries` — 모두 `src/tools/sagyeongin/_lib/financial-extractor.js` 위치 (β-i 격리 본 lib 위치). 본 추출 함수 자체 변경 없음 — 추출 결과의 노출 폭만 확장.

## (E) ADR-0019 정합 검증

- daily_limit pre-check 정책: estimate_api_calls 산수 영향 없음.
- T5 dividend / T2 cashflow 단독 호출은 candidate enrichment 단계에서 이미 발생 (현재 baseline).
- schema 확장은 응답 구조 변경 — API 호출 수 불변.
- 추가 호출 0 — pre-check 산수 갱신 불필요.

## (F) 학습 누적 정합

| 학습 | 정착 본질 |
|---|---|
| 학습 28 (T5 dividend output gap) | (A) gap 8필드 직접 확인 — 정착 우선순위 1 |
| 학습 31 (T2 cashflow output gap) | (B) yearly_data 부재 직접 확인 — cashflow_check 본체 정정 우선 |
| 학습 #18 (MCP vs file/git 별경로) | 본 사이클 1단계 (사전 검증) — file/git 경로만, MCP 호출 X |
| 학습 #27 (결정/실행 분리) | 본 단계는 결정 (gap 본문 식별) — 명세 + 구현은 2/3 단계 후속 |
| ADR-0019 (daily limit pre-check) | (E) 산수 불변 확인 |

## 사이클 후속 단계

| 단계 | 산출 |
|---|---|
| 2 (명세) | 확장 schema 명세 — yearly_data / metrics / series 필드 본문 + cast 본문 정착 |
| 3 (구현) | feature branch — cashflow-check 본체 정정 commit + scan-execute enrichment 정정 commit + 단테 commit |
| 4 ((iii)-redux) | scan_execute 재호출 후 gap 제거 검증 (별개 사이클) |

## 검증 결론

- (A) dividend gap 8 필드 직접 확인 — 정정 대상 명확.
- (B) cashflow yearly_data 부재 직접 확인 — cashflow-check 본체 정정 우선 필요.
- (C) 정정 위치 4건 식별 — β-i 격리 가드 본 lib/ 0 변경 유지.
- (E) ADR-0019 산수 불변 — pre-check 정책 영향 없음.

→ 2단계 (명세) 진입 가능.

---

Ref: 18 (iii) analysis 학습 28/31 (`docs/sagyeongin/scenarios/stage18-e2e/analysis.md`), 17단계 §6 dividend gap 초기 식별 (`verifications/2026-05-14-stage17-watchlist-add.md`), ADR-0019, philosophy 7부 B + 7부 E
