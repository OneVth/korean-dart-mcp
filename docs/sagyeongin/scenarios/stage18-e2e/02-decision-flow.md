# (iii) 사용자 의사결정 흐름 명세 — 단독 MCP 호출 surface

## 본질

17단계 watchlist 10개 종목 × 사경인 본격 도구 5건 (srim, cashflow_check, capex_signal, insider_signal, dividend_check) **단독 MCP 호출** → 출력 본문 사용자 가독성 + 의사결정 정합 본격 측정.

**(ii) 통합 흐름과의 본질 차이**:
- (ii) scan_execute/watchlist_check 내부 handler 호출 — 출력은 batch 단위 aggregate (각 도구 일부 필드만 노출)
- (iii) 단독 MCP 호출 — 각 도구의 *완전한 출력 schema* 노출 (사용자 surface 본격 영역)

→ 동일 도구 동일 입력이라도 surface 본문 어긋남 가능 (e.g. scan_execute의 srim 본문은 verdict + prices만, 단독 srim은 assumptions + sensitivity 본격 포함).

## 측정 본문

| 영역 | 기준 |
|---|---|
| (A) PASS/FAIL | error 부재 + schema 정합 + 핵심 필드 본문 존재 |
| (B) 출력 가독성 | 사용자가 출력 한눈 파악 — verdict 명확성, 근거 추적 가능성 |
| (B-2) batch surface 어긋남 | scan_execute embedded 출력 vs 단독 호출 출력의 *추가 본문* 영역 정착 |
| (C) 7부 E 진입 정합 | 출력이 사용자의 7부 E 수동 분석 진입 결정 본문 정합 |

## 측정 대상

10개 × 5개 = **50 MCP 호출**.

**short-circuit 정합**: 동일 도구 결과 본문 패턴이 3건 정착 후 명확 시 잔여 종목 skip 정합 (사이클 규모 통제). Onev 판단 영역.

### 10 종목 (17단계 watchlist)

| rank | corp_code | corp_name | induty |
|---|---|---|---|
| 1 | 00135795 | 신도리코 | 263 |
| 2 | 00127200 | 삼영전자공업 | 26291 |
| 3 | 00406727 | 세진티에스 | 26211 |
| 4 | 00226866 | 인탑스 | 2642 |
| 5 | 00575106 | 씨유테크 | 26224 |
| 6 | 00525934 | LX세미콘 | 2612 |
| 7 | 01213586 | 아이디피 | 26329 |
| 8 | 00490151 | 파트론 | 2629 |
| 9 | 00492353 | 파이오링크 | 26410 |
| 10 | 00305297 | 코텍 | 26519 |

---

## [T1] sagyeongin_srim (7부 D 2단계)

### MCP 호출 (per corp)

```json
{
  "tool": "sagyeongin_srim",
  "input": {
    "corp_code": "00135795",
    "years": 3
  }
}
```

**입력 본문**: `corp_code` 8자리 + `years: 3` (기본값). `override_K` 미지정 (도구 자동 계산 정합).

### 기대 응답 핵심 필드

```ts
{
  corp_code, corp_name,
  verdict: "BUY" | "FAIR" | "SELL" | null,
  prices: {
    current_price: number,
    fair_value_per_share: number,
    buy_price: number,
    sell_price: number,
    valuation_gap_pct: number,
  },
  K_used: number,                     // 자기자본비용 (CAPM 또는 override)
  weighted_roe: number,                // 가중 ROE
  assumptions: { ... },
  sensitivity?: { ... },
  source_notes: string[],
}
```

### 측정 영역

| 영역 | 기준 |
|---|---|
| (A) PASS | error X + `verdict` 본문 정착 + `prices.*` 4개 가격 본문 존재 |
| (B) 가독성 | verdict 한눈 파악 + valuation_gap_pct 음수 본문 = BUY 영역 정합 |
| (B-2) scan_execute 어긋남 | 단독 호출은 `assumptions` + `sensitivity` 본문 추가 노출 (의사결정 본문 영역 본격) |
| (C) 7부 E 진입 | weighted_roe + K_used 본문이 *순환주 보정* (E "과거 고점 × 60~70%") 수동 분석 진입 정합 |

### 종목별 기대 본문

- 신도리코 (#1): srim BUY (gap_pct -38.77 — 17단계 시점)
- 세진티에스 (#3): srim BUY (gap_pct -40.71)
- 씨유테크 (#5): srim BUY (gap_pct -42.49)
- 나머지 7건: srim BUY (gap_pct -10 ~ -31)

→ 10건 모두 BUY 정합. 시간 격증 시 fair value 변경 가능 (current_price 변동).

---

## [T2] sagyeongin_cashflow_check (7부 B)

### MCP 호출 (per corp)

```json
{
  "tool": "sagyeongin_cashflow_check",
  "input": {
    "corp_code": "00135795",
    "years": 3
  }
}
```

### 기대 응답 핵심 필드

```ts
{
  corp_code, corp_name,
  verdict: "CLEAN" | "CONCERN",
  concern_score: number,               // 0~100, 0=CLEAN
  signals: Array<{
    type: "op_cf_negative_streak" | "op_profit_cf_mismatch" | "external_funding_dependency" | ...,
    severity: "low" | "medium" | "high",
    detail: string,
  }>,
  yearly_data: Array<{ year, op_profit, op_cf, ... }>,
  source_notes: string[],
}
```

### 측정 영역

| 영역 | 기준 |
|---|---|
| (A) PASS | error X + `verdict` 본문 정착 + `signals` 배열 본문 존재 (빈 배열 정합) |
| (B) 가독성 | concern_score 0 = CLEAN 직관 정합 + yearly_data 시계열 본문 추적 가능 |
| (B-2) scan_execute 어긋남 | 단독 호출은 `yearly_data` 시계열 본문 추가 노출 (scan_execute embedded는 verdict/score만) |
| (C) 7부 E 진입 | yearly_data 본문이 *FCF 계산* (E "유형자산 재투자 빼야 진짜 현금") 진입 정합 |

### 종목별 기대 본문

- 10건 모두 CLEAN, concern_score 0, signals [] (17단계 baseline)

---

## [T3] sagyeongin_capex_signal (7부 C)

### MCP 호출 (per corp)

```json
{
  "tool": "sagyeongin_capex_signal",
  "input": {
    "corp_code": "00135795",
    "lookback_months": 12
  }
}
```

### 기대 응답 핵심 필드

```ts
{
  corp_code, corp_name,
  signal: "SIGNAL_DETECTED" | "NO_SIGNAL",
  opportunity_score: number,           // 0~100
  top_signals: Array<{
    rcept_no: string,
    rcept_dt: string,
    title: string,
    invest_amount: number,
    equity_pct: number,                // 자기자본 대비
    classification: "major_capex_existing_business" | "new_business_expansion" | ...,
  }>,
  total_disclosures: number,
  source_notes: string[],
}
```

### 측정 영역

| 영역 | 기준 |
|---|---|
| (A) PASS | error X + `signal` 본문 정착 + `top_signals` 배열 본문 |
| (B) 가독성 | classification 본문이 7부 B "신규 분야 확장은 부정" vs C "기존 사업 케파 증설은 긍정" 직접 분리 영역 확인 가능 |
| (B-2) scan_execute 어긋남 | 단독 호출은 `top_signals[*].rcept_no` + `invest_amount` + `equity_pct` 본문 노출 (scan_execute embedded는 signal + score + top_signals 일부만) |
| (C) 7부 E 진입 | rcept_no 본문이 *DART 공시 원문 직접 view* 진입 정합 |

### 종목별 기대 본문

- **신도리코 (#1)**: SIGNAL_DETECTED, score 80, top_signals 본격 본문 (major_capex_existing_business)
- 나머지 9건: NO_SIGNAL, score 0

→ 신도리코 본격 본문 측정이 본 도구 surface 측정 핵심 영역.

---

## [T4] sagyeongin_insider_signal (7부 C)

### MCP 호출 (per corp)

```json
{
  "tool": "sagyeongin_insider_signal",
  "input": {
    "corp": "신도리코",
    "cluster_threshold": 2,
    "reporters_topn": 5
  }
}
```

**입력 본문 어긋남 가드**:
- 다른 4 도구는 `corp_code: "00135795"` 영역
- **insider_signal은 `corp: "신도리코"`** (회사명/종목코드/corp_code 모두 정합) — 입력 필드명 본격 분리

### 기대 응답 핵심 필드

```ts
{
  corp_name,
  signal: "strong_buy_cluster" | "neutral_or_mixed" | ...,
  cluster_quarter: string | null,      // 본 사이클 신호 분기 (e.g. "2025Q4")
  quarterly_summary: Array<{
    quarter: string,
    reporters: Array<{ name, role, net_change_shares }>,
    cluster_detected: boolean,
  }>,
  cluster_threshold: number,
  source_notes: string[],
}
```

### 측정 영역

| 영역 | 기준 |
|---|---|
| (A) PASS | error X + `signal` 본문 정착 + `quarterly_summary` 배열 본문 |
| (B) 가독성 | signal + cluster_quarter 한눈 파악 (null = 신호 부재 본격 정합) |
| (B-2) scan_execute 어긋남 | 단독 호출은 `quarterly_summary[*].reporters` 명단 본문 노출 (scan_execute embedded는 signal + cluster_quarter만) |
| (C) 7부 C 본질 정합 | "2명 이상 동시 매수" cluster_threshold 본문 정착 + 5%+ 단독 본격 영역 (philosophy 본문 정합) |

### 종목별 기대 본문

- 10건 모두 `signal: "neutral_or_mixed"`, `cluster_quarter: null` (17단계 baseline)

---

## [T5] sagyeongin_dividend_check (7부 E 배당)

### MCP 호출 (per corp)

```json
{
  "tool": "sagyeongin_dividend_check",
  "input": {
    "corp_code": "00135795",
    "years": 5
  }
}
```

### 기대 응답 핵심 필드

```ts
{
  corp_code, corp_name,
  grade: "A" | "B" | "C" | "D" | "N/A",
  yield_pct: number | null,
  payout_ratio: number | null,
  yearly_data: Array<{
    year: string,
    dividend_per_share: number,
    net_income: number,
    payout_ratio: number,
    yield_pct: number,
  }>,
  consistency_note: string,            // "지속성 정합" / "삭감 본문" 등
  source_notes: string[],
}
```

### 측정 영역

| 영역 | 기준 |
|---|---|
| (A) PASS | error X + `grade` 본문 정착 + `yearly_data` 시계열 본문 |
| (B) 가독성 | grade A~D/N/A 한눈 파악 + yield_pct + payout_ratio 본문 의사결정 정합 |
| (B-2) scan_execute 어긋남 | **본 영역 본격** — scan_execute schema는 `dividend.grade`만 노출, 단독 호출은 `yield_pct` + `payout_ratio` + `yearly_data` 본격 노출 (17단계 §6 데이터 본문 영역) |
| (C) 7부 E 본질 정합 | "배당성향 20~30% 낮으면서 배당률 높으면 지속 가능" (E 본문) 의사결정 정합 |

### 종목별 기대 본문 (17단계 baseline)

| corp | grade |
|---|---|
| 신도리코, 삼영전자공업, 세진티에스, 인탑스, 씨유테크, LX세미콘, 아이디피 | D |
| 파트론, 파이오링크 | A |
| 코텍 | N/A |

→ A grade 2건 (파트론, 파이오링크) 본격 본문 측정이 7부 E 진입 정합 영역.

---

## 50 호출 측정 본문 정합 영역

### 본격 측정 본문 (Onev 회신 시 정착)

1. **각 도구 × 각 종목 단독 호출 PASS/FAIL** — 50 cell 본격 정합
2. **scan_execute embedded vs 단독 호출 surface 어긋남** — 5 도구 본문 (B-2 영역)
3. **17단계 baseline 정합** — verdict/grade/signal 본문 변화 부재 정합 (분기 점검 신호 변화 없음 전제)
4. **7부 E 진입 정합** — 출력 본문이 수동 분석 진입 결정 본격 정합

### Short-circuit 영역

동일 도구 결과 본문 패턴이 3건 정착 후 명확 시 잔여 종목 skip 정합:
- T2 cashflow_check: 10건 모두 CLEAN 본문 → 3건 정착 후 skip 정합
- T4 insider_signal: 10건 모두 neutral/null → 3건 정착 후 skip 정합
- T3 capex_signal: 신도리코 (#1) 본격 측정 + 1~2건 NO_SIGNAL 정합 후 skip 정합
- T5 dividend_check: D grade 1건 + A grade 2건 (파트론, 파이오링크) + N/A 1건 (코텍) 본격 측정 정합

→ 본격 호출 영역 ≈ **20~25건** (50건 → short-circuit 후).

### 실행 영역 시간 본문

- 단독 srim 호출 1건: ~30s~1분 (DART + Naver + KIS 호출 chain)
- cashflow: ~20s
- capex: ~10s
- insider: ~30s+ (DS003 vs 5%+ 본문 영역)
- dividend: ~20s

→ 20~25건 short-circuit 영역 ≈ **15~25분** 본격 실행 시간.

## 결과 정착 영역

→ `results/02-decision-flow.md`

per-call:
- 호출 입력 본문
- 응답 본문 (전체 JSON 또는 핵심 필드 발췌)
- 가독성 노트 + scan_execute 어긋남 본문
- 7부 E 진입 정합 본문

종합:
- 50 (또는 20~25 short-circuit) cell 매트릭스 PASS/FAIL
- 도구별 surface 어긋남 본격 본문
- 17단계 baseline 정합 본격 본문

---

Ref: spec §10.4 (srim) §10.5 (cashflow) §10.6 (capex) §10.7 (insider) §10.8 (dividend), philosophy 7부 B + C + D + E, 17단계 매듭 `e26dbbf`
