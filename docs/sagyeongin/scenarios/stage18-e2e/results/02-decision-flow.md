# (iii) 사용자 의사결정 흐름 실행 결과

## 실행 시점

- 실행일: 2026-05-14 (KST)
- baseline: bca2af3 (Stage 18.5 종결 — watchlist 정착)
- MCP 세션: Claude Code (`sagyeongin-mcp` 등록)
- 진행 종목: 10/10 완료
- 에러: 0건 (50/50 정상 응답)
- short-circuit: 미적용 — 전 50건 호출 진행

---

## T1 sagyeongin_srim (years: 3)

> 10건 모두 BUY (17 baseline 정합). 단 K=10.54% 고정, ROE 격차로 valuation_gap 분포 큼.

### 신도리코 (00135795) — capex confluence #1

```json
{
  "verdict": "BUY",
  "prices": { "buy_price": 88224, "fair_price": 76308, "sell_price": 41779, "current_price": 47350 },
  "gap_to_buy": -46.33, "gap_to_fair": -37.95, "gap_to_sell": 13.34,
  "inputs": { "equity_current": 10678.63, "avg_roe": 4.16, "required_return_K": 0.1054, "shares_outstanding": 10080029 },
  "note": "K_source=auto_cached, roe_method=weighted, price_source=naver"
}
```

- **(A) PASS** ✓ — verdict + prices 4개 가격 + inputs 4 필드
- **(B) 가독성**:
  - verdict: BUY 직관
  - gap_to_fair: -37.95% — fair 대비 큰 할인
- **(B-2) scan_execute 어긋남**: `inputs` 본문 (equity_current/avg_roe/K/shares) 단독 호출에서만 노출. scan_execute는 prices + verdict + gap만 노출 → **K 계산 근거 + ROE 본문 추적 가능** (의사결정 큰 변화)
- **(C) 7부 E 진입**: `avg_roe 4.16%` < `K 10.54%` — 정상 srim 가정 위반 (ROE < K). 단 가격 BUY → "신도리코는 ROE 낮으나 자기자본 본 큰 잉여로 BUY" 해석 또는 K 보정 필요 신호. 수동 분석 진입 영역 명확

### 삼영전자공업 (00127200)

```json
{
  "verdict": "BUY",
  "prices": { "buy_price": 20222, "fair_price": 15661, "sell_price": 2444, "current_price": 14100 },
  "gap_to_buy": -30.27, "gap_to_fair": -9.96, "gap_to_sell": 476.88,
  "inputs": { "avg_roe": 0.954, "required_return_K": 0.1054 },
  "note": "roe_method=recent_only"
}
```

- **(A) PASS** ✓
- **(B)**: gap_to_sell 476.88% — sell 대비 큰 안전마진
- **(B-2)**: `roe_method=recent_only` 본문 — weighted 불가 시 fallback 노출 (scan_execute 영역 외)
- **(C)**: avg_roe 0.95% 극저 → 본질적 BUY 의문. K 보정 또는 7부 D 1단계 재검토 진입

### 세진티에스 (00406727)

```json
{
  "verdict": "BUY",
  "prices": { "buy_price": 4456, "fair_price": 3644, "sell_price": 1293, "current_price": 2070 },
  "gap_to_fair": -43.2,
  "inputs": { "avg_roe": 2.41 }
}
```

- **(A) PASS** — gap_to_fair -43.2% 큰 할인
- **(C)**: avg_roe 2.41% < K — 신도리코와 같은 구조

### 인탑스 (00226866)

```json
{
  "verdict": "BUY",
  "prices": { "buy_price": 33076, "fair_price": 25745, "sell_price": 4502, "current_price": 19310 },
  "gap_to_fair": -24.99,
  "inputs": { "avg_roe": 1.08 }
}
```

- **(A) PASS**
- **(C)**: avg_roe 1.08% 극저 → 신도리코·세진티에스 패턴

### 씨유테크 (00575106) — ⚠️ sell 직전

```json
{
  "verdict": "BUY",
  "prices": { "buy_price": 5471, "fair_price": 4793, "sell_price": 2827, "current_price": 2755 },
  "gap_to_buy": -49.64, "gap_to_fair": -42.51, "gap_to_sell": -2.55,
  "inputs": { "avg_roe": 4.60 }
}
```

- **(A) PASS**
- **(B)**: ⚠️ **gap_to_sell -2.55%** — sell (2,827) 직전 (-72원). BUY verdict 유효하나 위험구간 진입 임박
- **(C)**: ROE 4.60% (10건 중 #4 높음)인데 sell 직전 → 시장이 ROE 평가 절하 또는 매도 압력. 7부 A killer 재점검 필요 신호

### LX세미콘 (00525934)

```json
{
  "verdict": "BUY",
  "prices": { "buy_price": 67190, "fair_price": 65832, "sell_price": 61899, "current_price": 63900 },
  "gap_to_buy": -4.9, "gap_to_fair": -2.94, "gap_to_sell": 3.23,
  "inputs": { "avg_roe": 9.43 }
}
```

- **(A) PASS**
- **(B)**: 모든 가격이 좁은 범위 (61,899~67,190) — buy/fair/sell 격차 8.5%. ROE 9.43% (K 근접) → srim 가격 압축
- **(C)**: ROE = K 본문 → fair value 자체가 equity 근접. 본 종목 srim 본 활용 제한적, P/B 또는 DCF 추가 검토 진입

### 아이디피 (01213586) — ⚠️ fair > buy 역전

```json
{
  "verdict": "BUY",
  "prices": { "buy_price": 5886, "fair_price": 6335, "sell_price": 7637, "current_price": 5280 },
  "gap_to_buy": -10.29, "gap_to_fair": -16.66, "gap_to_sell": -30.86,
  "inputs": { "avg_roe": 15.43 }
}
```

- **(A) PASS** — 단 schema 가정 위배
- **(B)**: ⚠️ **fair (6,335) > buy (5,886)** — 정상 srim 본질 (sell > fair > buy 또는 sell > buy > fair) 위배 — *fair > buy* 역전
- **(B-2)**: 본 역전 구조 본 scan_execute embedded 본 동일 노출 영역 — 단 *원인 추적* 본 단독 호출의 `inputs` 본문 (avg_roe 15.43% — 10건 중 #1) 필수
- **(C)**: ROE 15.43% > K 10.54% → fair value가 큰 가치 → buy 진입가가 fair보다 낮아진 *srim 역전 구조*. 본 종목은 *고ROE × srim K 보정* 수동 분석 진입 영역. 7부 E 핵심 영역

### 파트론 (00490151)

```json
{
  "verdict": "BUY",
  "prices": { "buy_price": 9322, "fair_price": 8741, "sell_price": 7057, "current_price": 7330 },
  "gap_to_fair": -16.14,
  "inputs": { "avg_roe": 7.30 }
}
```

- **(A) PASS** — 정상 srim 구조
- **(C)**: ROE 7.30% (적정), 가격 분포 정상 → 본 사이클 *가장 정합한 srim*

### 파이오링크 (00492353)

```json
{
  "verdict": "BUY",
  "prices": { "buy_price": 12645, "fair_price": 12237, "sell_price": 11056, "current_price": 9980 },
  "gap_to_fair": -18.44,
  "inputs": { "avg_roe": 8.79 }
}
```

- **(A) PASS** — 가격 분포 압축 (LX세미콘 유사, ROE = K 근접 9.79%)
- **(C)**: ROE 8.79% < K → fair 본 equity 근접. 단 BUY 영역 안정

### 코텍 (00305297)

```json
{
  "verdict": "BUY",
  "prices": { "buy_price": 19541, "fair_price": 17979, "sell_price": 13454, "current_price": 12350 },
  "gap_to_fair": -31.31,
  "inputs": { "avg_roe": 6.49 }
}
```

- **(A) PASS** — 정상 srim 구조
- **(C)**: ROE 6.49% (적정), gap_to_fair -31% 안전

### T1 종합

- 10/10 BUY ✓ (17 baseline 정합)
- 가격 구조 본 분포:
  - **정상 (sell > fair > buy 패턴)**: 파트론, 파이오링크, LX세미콘, 코텍 (4건)
  - **fair > buy 역전** (고ROE): 아이디피 (1건)
  - **buy > fair > current 큰 할인** (저ROE): 신도리코, 세진티에스, 인탑스, 삼영전자공업, 씨유테크 (5건)
- **(B-2) 주요 발견**: `inputs.avg_roe` + `inputs.required_return_K` + `roe_method` — scan_execute 영역 외. ROE/K 격차 추적이 srim 신뢰도 평가 핵심

---

## T2 sagyeongin_cashflow_check (years: 3)

> 10건 모두 CLEAN 기대 (17 baseline). 본 사이클 정합 확인.

### 결과 — 전 10건 CLEAN

```json
{ "verdict": "CLEAN", "concern_score": 0, "flags": [] }
```

10건 모두 동일 응답:

| corp | verdict | concern_score | flags |
|---|---|---|---|
| 신도리코 / 삼영전자공업 / 세진티에스 / 인탑스 / 씨유테크 / LX세미콘 / 아이디피 / 파트론 / 파이오링크 / 코텍 | CLEAN | 0 | [] |

### T2 평가

- **(A) PASS** ✓ 10/10
- **(B) 가독성**: verdict + concern_score 한눈 파악. 단 응답 본 본 매우 압축 — `yearly_data` 시계열 본문 X (명세 본 정의된 `yearly_data` 본 응답 영역 외)
- **(B-2)**: ⚠️ **명세 vs 실제 어긋남** — 02-decision-flow.md §T2 기대 응답에 `yearly_data: Array<{ year, op_profit, op_cf, ... }>` 명시. 실제 응답은 `verdict + concern_score + flags`만. **`yearly_data` 부재** → scan_execute embedded와 surface 차이 본 추정만큼 크지 X
- **(C) 7부 E 진입**: yearly_data 부재로 *FCF 계산 진입 영역 부재*. 단 verdict CLEAN 단독으로는 7부 B "현금흐름 사실" 진입 근거 약함. **scan-execute output schema 확장 후보** (학습 — T2 단독 호출에 yearly_data 추가 필요)

---

## T3 sagyeongin_capex_signal (lookback_months: 12)

> 신도리코 단독 SIGNAL_DETECTED 기대.

### 신도리코 — SIGNAL_DETECTED ✓

```json
{
  "verdict": "SIGNAL_DETECTED",
  "opportunity_score": 80,
  "signals": [
    {
      "signal": "major_capex_existing_business",
      "description": "20.6% 시설투자 — 토지 및 건물",
      "evidence": {
        "date": "2025년 09월 30일",
        "amount": 220201000000,
        "equity_ratio": 0.2062,
        "category": "토지 및 건물",
        "existing_business_match": true,
        "dart_reference": "20250930000475"
      }
    }
  ]
}
```

- **(A) PASS** ✓
- **(B) 가독성**: signal + description + amount + equity_ratio + category 한눈 파악
- **(B-2) scan_execute 어긋남**:
  - scan_execute: signal + score + top_signals 일부
  - 단독 호출 추가: **`evidence.dart_reference` (20250930000475)** + `evidence.amount` (정확 220,201,000,000원) + `evidence.equity_ratio` (0.2062) + `existing_business_match: true`
  - **`dart_reference` 본 7부 E 진입의 최핵심** — DART 공시 원문 view 경로
- **(C) 7부 E 진입**: `dart_reference: 20250930000475` → `dart.fss.or.kr/dsaf001/main.do?rcpNo=20250930000475` 원문 view 가능. "토지 및 건물 20.6% 시설투자"가 기존 사업 확장인지 신사업 확장인지 *직접 분석* 진입

### 나머지 9건 — NO_SIGNAL

```json
{ "verdict": "NO_SIGNAL", "opportunity_score": 0, "signals": [] }
```

10건 중 9건 (삼영전자공업, 세진티에스, 인탑스, 씨유테크, LX세미콘, 아이디피, 파트론, 파이오링크, 코텍): NO_SIGNAL, score 0.

### T3 종합

- (A) 10/10 PASS
- (B-2) **본 사이클 (B-2) 최대 가치** — 신도리코 `evidence` 4 필드 (dart_reference + amount + equity_ratio + existing_business_match) 단독 호출 전용 노출
- (C) 7부 C 본질 (선행 지표) *완전 추적 가능* — T3 단독 호출이 의사결정 chain 중 가장 큰 가치

---

## T4 sagyeongin_insider_signal (cluster_threshold: 2, reporters_topn: 5)

> 10건 모두 neutral_or_mixed 기대 (17 baseline).

### 입력 어긋남 가드 정합

T4는 다른 4 도구와 다르게 `corp: "회사명"` 입력. 10건 모두 정상 resolve:

| corp | stock_code | resolve |
|---|---|---|
| 신도리코 → 029530 / 삼영전자공업 → 005680 / 세진티에스 → 067770 / 인탑스 → 049070 / 씨유테크 → 376290 / LX세미콘 → 108320 / 아이디피 → 332370 / 파트론 → 091700 / 파이오링크 → 170790 / 코텍 → 052330 | ✓ | 정상 |

### 결과 분류

#### 보고 0건 (5%+ 대량보유 부재) — 3건

| corp | reports_total | signal |
|---|---|---|
| 세진티에스 | 0 | neutral_or_mixed |
| 씨유테크 | 0 | neutral_or_mixed |
| 파트론 | 0 | neutral_or_mixed |

#### 보고 1~3건 (적은 빈도) — 4건

| corp | reports | buy/sell | net_change | quarterly clusters |
|---|---|---|---|---|
| 신도리코 | 3 | 2/1 | +524,302 | 2025Q4 신영자산운용 매도 / 2025Q2·2024Q3 브이아이피자산운용 매수 (2024Q3은 5%+ 신규취득) |
| 삼영전자공업 | 2 | 1/0 | +2,000 | 2024Q3 변동준 (주식 담보) |
| 인탑스 | 2 | 1/1 | 0 | 2025Q1 김근하/김재경 지분 증여 (특수관계 이전, net=0) |
| 파이오링크 | 1 | 1/0 | +9,000 | 2026Q2 이글루 (최대주주 특별관계자) |

#### 보고 8~12건 (높은 빈도) — 2건 ⚠️ 핵심 발견

| corp | reports | buy/sell | net_change | 분석 |
|---|---|---|---|---|
| **아이디피** | **8** | **6/2** | +421,627 | 2024Q4~2026Q2 7 분기 중 6 분기에서 `아이디스홀딩스` 또는 특별관계자 *지속 매수* — cluster_threshold=2 미달 (고유 매수자 1명 — 단 *시간 분산 매수 패턴* 강력 신호) |
| **코텍** | **12** | **8/3** | -804,658 | 2024Q3~2026Q2 본 8 분기 중 6 분기 활동 — `아이디스홀딩스` 매수 vs `대신-뉴젠 신기술투자조합` CB 전환 매도 혼재. 순매도 -804,658주 |

#### LX세미콘 — 기관 양방향

| | |
|---|---|
| reports | 2 |
| 본문 | 2026Q2 삼성자산운용 매수 +823,618 / 국민연금공단 매도 -171,375 (단순추가취득/처분) |

### T4 평가

- **(A) PASS** ✓ 10/10
- **(B) 가독성**: signal + cluster_quarter 한눈 파악 — 단 *cluster_threshold=2 미달 시 quarterly_clusters의 풍부한 본문* 활용 영역 부재
- **(B-2) scan_execute 어긋남**:
  - scan_execute: `insider.signal` + `cluster_quarter` (null)
  - 단독 호출 추가: **`quarterly_clusters[*].reporters[*].name + change + report_resn`** — *시간 분산 매수 패턴* + *공시 사유* 노출 (의사결정 근거 추적 가능)
  - **본 (B-2) 두 번째 큰 가치** — *아이디피 / 코텍* 본 cluster_threshold 본 본 미달 (1명) 단 *시간 분산 누적 매수* 패턴이 단독 호출에서만 보임
- **(C) 7부 C 본질 정합**:
  - "2명 이상 동시 매수" cluster_threshold=2 검사는 *고유 매수자 N명* 기준 — 단 본 사이클이 *시간 분산 단일 매수자* 패턴을 *미신호* 처리하는 본질 발견
  - **threshold 측정 영역**: cluster_threshold가 *동시*와 *시간 분산*을 구분 못 하는 영역 — 학습 영역 (`philosophy 7부 C` *재정정 후보*)

---

## T5 sagyeongin_dividend_check (years: 5)

> 17 baseline: 파트론·파이오링크 A, 코텍 N/A, 나머지 7건 D.

### 결과 — 본 사이클 정합 확인

| corp | grade | avg_payout | avg_yield | payout_stddev | recent_cut | 특이 |
|---|---|---|---|---|---|---|
| 신도리코 | D | 25.5% | 3.89% | 0.0981 | ✓ | 2025 payout 42.6% (전년 17.7%) |
| 삼영전자공업 | D | 54.7% | 2.99% | 0.2870 | ✓ | **2025 payout 110.6%** (적자 분기 영향 추정) |
| 세진티에스 | N/A | 0 | 0 | - | ✗ | 무배당 + 적자 2년 |
| 인탑스 | D | 16.7% | 1.58% | - | ✓ | 2025 payout 38.8% |
| 씨유테크 | D | 30.3% | 14.78%* | 0.0053 | ✓ | **2021 yield 52%** (단일 이상치) |
| LX세미콘 | D | 29.9% | 3.57% | 0.0080 | ✓ | payout 안정 (29~31%), yield 변동 |
| 아이디피 | D | 21.3% | 3.29% | 0.0296 | ✓ | 2024 payout 18.3% (전년 26.2%) |
| **파트론** | **A** | 36.0% | 3.48% | 0.0871 | ✗ | 5년 연속 — 안정 |
| **파이오링크** | **A** | 23.4% | 2.84% | 0.0849 | ✗ | 5년 연속 — 안정 |
| 코텍 | N/A | 18.5% | 3.03% | 0.0994 | ✗ | 적자 1년 (2021), 4년 배당 |

### T5 평가

- **(A) PASS** ✓ 10/10
- **(B) 가독성**: grade 한눈 + metrics 4 필드 (avg_payout/avg_yield/stddev/recent_cut) + 5년 series 풍부
- **(B-2) scan_execute 어긋남** — **본 사이클 (B-2) 최대 가치 (T3와 동급)**:
  - scan_execute: `dividend.grade`만 노출
  - 단독 호출: **`metrics` (4 필드) + `series[*].payout_ratio + dividend_yield + net_income + dividend_total` (5년) + `interpretation_notes`**
  - 17단계 §6 "scan-execute dividend output gap" 정확히 동일 — 후속 사이클 *scan-execute schema 확장* 후보 (학습 28 후보)
- **(C) 7부 E 본질 정합**:
  - 7부 E "배당성향 20~30% 낮으면서 배당률 높으면 지속 가능"
  - **파트론 (A)**: avg_payout 36% (다소 높음) + avg_yield 3.48% — 안정 5년, 7부 E 정합
  - **파이오링크 (A)**: avg_payout 23.4% (E 기준 적정 영역) + avg_yield 2.84% — 안정 5년, 7부 E 정합 ✓ 최적
  - **삼영전자공업 D**: 2025 payout 110.6% — *지속 가능성 의문*. interpretation_notes "최근 연도 배당 삭감" 정확 신호
  - **씨유테크 2021 yield 52%**: 단일 이상치 — *기준 주가 산정 어긋남* 영역 (주식 분할 또는 합병 미반영 추정) → T5 source_notes 확인 후속

---

## 50 cell 종합

### (A) PASS/FAIL — 50/50 PASS ✓

에러 0건. ADR-0018 미발동. T4 입력 어긋남 가드 정상.

### (B-2) surface 차이 — 본 사이클 핵심 발견

| 도구 | 단독 호출 추가 노출 | (B-2) 가치 |
|---|---|---|
| T1 srim | `inputs` (equity_current / avg_roe / K / shares) + `roe_method` + `gap_to_buy/sell` | **중** — ROE/K 추적, 역전 구조 원인 |
| T2 cashflow_check | (없음 — 명세와 어긋남) | **약** — yearly_data 부재, 학습 후보 |
| T3 capex_signal | `evidence.dart_reference + amount + equity_ratio + existing_business_match` | **강** — DART 원문 view 진입 직접 |
| T4 insider_signal | `quarterly_clusters[*].reporters[*].name + change + report_resn` | **강** — 시간 분산 매수 패턴 노출 (cluster_threshold 본질 측정 영역) |
| T5 dividend_check | `metrics` (4 필드) + 5년 `series` + `interpretation_notes` | **강** — 17단계 §6 gap 정확 노출, 본 사이클 최대 가치 (T3 동급) |

### (C) 7부 E 진입 정합 — 8/10

| corp | 7부 E 진입 영역 |
|---|---|
| 파트론 (A) | ✓ 명확 — 배당 + srim 정합 |
| 파이오링크 (A) | ✓ 명확 — 배당 + srim 정합, 본 사이클 최적 |
| LX세미콘 | ✓ ROE = K → P/B 또는 DCF 진입 |
| 아이디피 | ✓ 고ROE — srim K 보정 진입 |
| 신도리코 | ✓ capex SIGNAL — DART 원문 진입 |
| 씨유테크 | ⚠️ sell 직전 — 7부 A killer 재점검 |
| 삼영전자공업 | ⚠️ 배당 110.6% — 지속성 의문, 본문 분석 진입 |
| 인탑스 | ✓ 저ROE — K 보정 또는 srim 신뢰도 의문 |
| 세진티에스 | ✓ 저ROE + 무배당 + 적자 2년 — 7부 B 재검토 |
| 코텍 | ✓ insider 양방향 + 적자 1년 — 수동 분석 진입 |

### 본 사이클 핵심 발견 5건

1. **17단계 §6 dividend gap 정확 확인** — T5 `metrics` + `series` 5년이 scan_execute에서 부재. **scan-execute schema 확장 후보** (학습 28)
2. **아이디피 fair > buy 역전** — 고ROE (15.43%) + K 10.54%. srim 가정 K 보정 필요 (학습 29 후보)
3. **insider cluster_threshold 본질 어긋남** — *시간 분산 단일 매수자* (아이디피 6 분기 / 코텍 매수자 1) 패턴이 *threshold=2 미달*로 미신호 처리. **philosophy 7부 C 재정정 후보** (학습 30)
4. **T3 capex `dart_reference`** — 신도리코 `20250930000475` 직접 노출. 7부 C 선행 지표 원문 추적의 핵심 본문
5. **T2 cashflow `yearly_data` 부재** — 명세 vs 실제 어긋남. T2 단독 호출 schema 확장 후보 (학습 31 후보)

### short-circuit 활용 영역

본 사이클 short-circuit 미적용. 단 본 사이클 분석 후 — 다음 사이클에서 *동일 도구 3건 정착 후 패턴 명확 시* short-circuit 정합 (특히 T2 CLEAN 10/10 같은 *완전 동일 응답* 본 영역).

---

Ref: 02-decision-flow.md 명세 (`db199df`), Stage 18.5 종결 (`bca2af3`), 17 결정 (`2fa52c2`), philosophy 7부 A/B/C/D/E
