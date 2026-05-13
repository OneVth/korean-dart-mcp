# (iii) 사용자 의사결정 흐름 실행 결과

## 실행 시점

- 실행일: YYYY-MM-DD HH:MM (KST)
- baseline: db199df
- MCP 세션: Claude Desktop (학습 #18)
- short-circuit: T1 N건 / T2 N건 / T3 N건 / T4 N건 / T5 N건 = 총 N건

---

## T1 sagyeongin_srim (years: 3)

> 10건 모두 BUY 기대. 동일 패턴 3건 정착 후 short-circuit 정합.

### 신도리코 (00135795) — 필수 (capex confluence #1)

**호출 입력**: `{ "corp_code": "00135795", "years": 3 }`

```json
{}
```

- **(A)** PASS / FAIL:
- **(B) 가독성**:
  - `verdict`:
  - `prices.valuation_gap_pct`:
  - `K_used`:
  - `weighted_roe`:
- **(B-2) scan_execute 어긋남** (`assumptions` + `sensitivity` 추가 노출):
- **(C) 7부 E 진입 노트**:

### 삼영전자공업 (00127200)

**호출 입력**: `{ "corp_code": "00127200", "years": 3 }`

```json
{}
```

- **(A)** PASS / FAIL:
- **(B) 가독성**: `verdict` / `valuation_gap_pct`:

### 세진티에스 (00406727)

**호출 입력**: `{ "corp_code": "00406727", "years": 3 }`

```json
{}
```

- **(A)** PASS / FAIL:
- **(B) 가독성**: `verdict` / `valuation_gap_pct`:

### short-circuit (3건 동일 BUY 패턴 정착 후)

> 잔여 7건 skip: 인탑스·씨유테크·LX세미콘·아이디피·파트론·파이오링크·코텍

---

## T2 sagyeongin_cashflow_check (years: 3)

> 10건 모두 CLEAN 기대. 3건 정착 후 short-circuit 정합.

### 신도리코 (00135795)

**호출 입력**: `{ "corp_code": "00135795", "years": 3 }`

```json
{}
```

- **(A)** PASS / FAIL: `verdict` / `concern_score` / `signals.length`:
- **(B-2) scan_execute 어긋남** (`yearly_data` 시계열 추가 노출):

### 삼영전자공업 (00127200)

```json
{}
```

- **(A)** PASS / FAIL:

### 세진티에스 (00406727)

```json
{}
```

- **(A)** PASS / FAIL:

### short-circuit (3건 CLEAN 정착 후)

> 잔여 7건 skip.

---

## T3 sagyeongin_capex_signal (lookback_months: 12)

> 신도리코 SIGNAL_DETECTED 필수 측정. NO_SIGNAL 1~2건 정합 후 skip 정합.

### 신도리코 (00135795) — SIGNAL_DETECTED 측정 핵심

**호출 입력**: `{ "corp_code": "00135795", "lookback_months": 12 }`

```json
{}
```

- **(A)** PASS / FAIL: `signal` / `opportunity_score`:
- **(B-2) scan_execute 어긋남** (`top_signals` 상세 — `rcept_no` / `invest_amount` / `equity_pct`):
  - `top_signals[0].rcept_no`:
  - `top_signals[0].invest_amount`:
  - `top_signals[0].equity_pct`:
  - `top_signals[0].classification`:
- **(C) 7부 E 진입**: rcept_no → DART 공시 원문 직접 view 가능:

### NO_SIGNAL 샘플 — 삼영전자공업 (00127200)

**호출 입력**: `{ "corp_code": "00127200", "lookback_months": 12 }`

```json
{}
```

- **(A)** PASS / FAIL: `signal`:

### short-circuit (NO_SIGNAL 정합 1~2건 후 skip)

> 잔여 skip.

---

## T4 sagyeongin_insider_signal

> 10건 모두 neutral/null 기대. 3건 정착 후 short-circuit 정합.
> ⚠️ 입력 필드 어긋남: 다른 도구는 `corp_code`, insider는 `corp` (회사명/종목코드/corp_code 모두 정합)

### 신도리코 — corp 필드 사용

**호출 입력**: `{ "corp": "신도리코", "cluster_threshold": 2, "reporters_topn": 5 }`

```json
{}
```

- **(A)** PASS / FAIL: `signal` / `cluster_quarter`:
- **(B-2) scan_execute 어긋남** (`quarterly_summary[*].reporters` 명단 추가 노출):

### 삼영전자공업

**호출 입력**: `{ "corp": "삼영전자공업", "cluster_threshold": 2, "reporters_topn": 5 }`

```json
{}
```

- **(A)** PASS / FAIL:

### 세진티에스

**호출 입력**: `{ "corp": "세진티에스", "cluster_threshold": 2, "reporters_topn": 5 }`

```json
{}
```

- **(A)** PASS / FAIL:

### short-circuit (3건 neutral/null 정착 후)

> 잔여 7건 skip.

---

## T5 sagyeongin_dividend_check (years: 5)

> 필수 측정: D 1건 + A 2건 (파트론·파이오링크) + N/A 1건 (코텍).

### 신도리코 (00135795) — D grade 기대

**호출 입력**: `{ "corp_code": "00135795", "years": 5 }`

```json
{}
```

- **(A)** PASS / FAIL: `grade` / `yield_pct` / `payout_ratio`:
- **(B-2) scan_execute 어긋남** (`yield_pct` + `payout_ratio` + `yearly_data` 추가 노출):
- **(C) 7부 E 진입**: 배당성향·배당률 의사결정 정합:

### 파트론 (00490151) — A grade 기대

**호출 입력**: `{ "corp_code": "00490151", "years": 5 }`

```json
{}
```

- **(A)** PASS / FAIL: `grade` / `yield_pct` / `payout_ratio`:
- `yearly_data` 시계열 (5년 연속 배당 정합):

### 파이오링크 (00492353) — A grade 기대

**호출 입력**: `{ "corp_code": "00492353", "years": 5 }`

```json
{}
```

- **(A)** PASS / FAIL: `grade` / `yield_pct` / `payout_ratio`:
- `yearly_data` 시계열:

### 코텍 (00305297) — N/A grade 기대

**호출 입력**: `{ "corp_code": "00305297", "years": 5 }`

```json
{}
```

- **(A)** PASS / FAIL: `grade`:
- N/A 사유 (`consistency_note`):

---

## 종합 매트릭스

| 도구 | PASS | FAIL | 호출건 | short-circuit |
|---|---|---|---|---|
| T1 srim | | | | |
| T2 cashflow | | | | |
| T3 capex | | | | |
| T4 insider | | | | |
| T5 dividend | | | | |
| **합계** | | | | |

---

## (B-2) surface 차이 정착

| 도구 | scan_execute embedded | 단독 호출 추가 노출 |
|---|---|---|
| T1 srim | verdict + prices | `assumptions` + `sensitivity` |
| T2 cashflow | verdict + concern_score | `yearly_data` 시계열 |
| T3 capex | signal + score + top_signals 일부 | `top_signals[*].rcept_no` + `invest_amount` + `equity_pct` |
| T4 insider | signal + cluster_quarter | `quarterly_summary[*].reporters` 명단 |
| T5 dividend | grade만 | `yield_pct` + `payout_ratio` + `yearly_data` |

실측 확인:

- T1:
- T2:
- T3:
- T4:
- T5:

---

## 17단계 baseline 비교

| 지표 | 17단계 | 본 사이클 |
|---|---|---|
| srim BUY | 10/10 | N/10 |
| cashflow CLEAN | 10/10 | N/10 |
| capex 신도리코 SIGNAL_DETECTED | 1/10 | |
| insider neutral | 10/10 | N/10 |
| dividend D | 7/10 | |
| dividend A | 2/10 (파트론·파이오링크) | |
| dividend N/A | 1/10 (코텍) | |

---

## 7부 E 진입 종합 노트
