# 18단계 e2e 분석 매듭

## 분석 시점

- 분석일: YYYY-MM-DD
- baseline: 62a15fc
- 결과 참조: results/01-integrated-flow.md / results/02-decision-flow.md

---

## (ii) 통합 흐름 분석

### (A) PASS/FAIL 종합

| 단계 | 도구 | PASS/FAIL | 비고 |
|---|---|---|---|
| [1] | scan_preview | | |
| [2] | scan_execute | | |
| [3] | update_watchlist list | | |
| [4] | watchlist_check full | | |

### (B) 가독성 종합

- **scan_preview**: preset/universe/daily_limit 한눈 파악
- **scan_execute**: candidates 10건 composite_score DESC 정합
- **update_watchlist list**: corp_name + added_at + tags 한눈 파악
- **watchlist_check full**: summary 한눈 파악 (killer/srim/cashflow/capex/insider)

노트:

### 단계 간 정합

- **[3] ↔ [4] corp_code 완전 일치**:
- **[2] ↔ [3] 교집합** (시간 격증 — 동일 보장 X):
  - 공통:
  - [2]만:
  - [3]만:
- **induty KSIC 26 분포 보존**:

---

## (iii) 사용자 의사결정 분석

### (A) 도구별 PASS/FAIL

(results/02-decision-flow.md 종합 매트릭스 참조)

| 도구 | PASS | FAIL | 호출건 | short-circuit |
|---|---|---|---|---|
| T1 srim | | | | |
| T2 cashflow | | | | |
| T3 capex | | | | |
| T4 insider | | | | |
| T5 dividend | | | | |

### (B) 가독성 종합

- **T1 srim**: verdict/gap_pct 한눈 파악
- **T2 cashflow**: CLEAN 확인 용이성
- **T3 capex**: classification 분류 — 7부 B ("신규 분야 확장 부정") ↔ C ("기존 케파 증설 긍정") 직접 분리
- **T4 insider**: neutral/null 집합 확인
- **T5 dividend**: grade A/D/N/A 한눈 파악 + yield_pct/payout_ratio 의사결정 지원

노트:

### (B-2) scan_execute embedded vs 단독 호출 surface 차이

| 도구 | scan_execute embedded | 단독 추가 노출 | 의사결정 영향 |
|---|---|---|---|
| T1 srim | verdict + prices | `assumptions` + `sensitivity` | |
| T2 cashflow | verdict + concern_score | `yearly_data` 시계열 | |
| T3 capex | signal + score + top_signals 일부 | `rcept_no` + `invest_amount` + `equity_pct` | |
| T4 insider | signal + cluster_quarter | `quarterly_summary[*].reporters` 명단 | |
| T5 dividend | grade만 | `yield_pct` + `payout_ratio` + `yearly_data` | |

실측 확인:

- T1:
- T2:
- T3:
- T4:
- T5:

### (C) 7부 E 진입 정합

- **T1 srim** — `weighted_roe` + `K_used` → 순환주 보정 ("과거 고점 × 60~70%") 수동 분석 진입:
- **T3 capex** — `top_signals[*].rcept_no` → DART 공시 원문 직접 view 진입:
- **T5 dividend** — `yearly_data` → 배당성향 지속성 ("20~30% 낮으면서 배당률 높으면 지속 가능") 판단:

---

## 17단계 baseline 비교

| 지표 | 17단계 baseline | 본 사이클 | 변화 |
|---|---|---|---|
| srim BUY | 10/10 | | |
| cashflow CLEAN | 10/10 | | |
| capex 신도리코 SIGNAL_DETECTED | 1/10 | | |
| insider neutral | 10/10 | | |
| dividend D | 7/10 | | |
| dividend A (파트론·파이오링크) | 2/10 | | |
| dividend N/A (코텍) | 1/10 | | |

**신호 변화 유무** (분기 점검 본질 — 시간 격증 측정):

---

## 7부 영역별 정합 평가

| 영역 | 도구 | 정합 / 어긋남 | 비고 |
|---|---|---|---|
| 7부 A (killer 사전 솎아내기) | watchlist_check killer | | |
| 7부 B (cashflow 점검) | T2 cashflow_check | | |
| 7부 C (capex 선행 지표) | T3 capex_signal | | |
| 7부 C (insider 집중 매수) | T4 insider_signal | | |
| 7부 D (srim 적정가) | T1 srim | | |
| 7부 E (배당 진입 인터페이스) | T5 dividend_check | | |
| 7부 F (scan 스코프 — 10개 내외) | scan_preview/execute | | |

---

## 사이클 종합 판정

- **(A) 도구 동작 검증**: 14개 사경인 도구 × PASS/FAIL
- **(B) 7부 E 진입 인터페이스**: 출력이 수동 분석 진입 결정을 지원하는가
- **분기 점검 신호 변화**: 17단계 대비 유의미한 변화 유무

---

## 학습 정착

### 학습 20번 후보 — 진입 프롬프트 7부 매핑 사전 정착 절차

학습 5 (16(b)) → 학습 17 (17단계) → 본 사이클 3차 관찰 후 결론:
(MCP 세션 결과 수신 후 작성)

### dividend_check 진입 프롬프트 정정

00-scope.md §매듭 6번: entry prompt 영역 X (세션 opener) 정정 본문:
(본 분석 매듭 commit 동시 정착)

---

## 후속 사이클 제언 (Stage 19+)

- **§10.15 KSIC 9차/10차 정책 결정** — KSIC 26 집중 evidence 본격 활용
- **scan-execute output schema 확장** — dividend yield/payout 노출 (17단계 §6 본문 gap 정착)
- **분기 점검 별개 사이클** — 시간 격증 후 (2026-08~) 신호 변화 본격 측정
- **개별 도구 drill-in** — (iii) 특이 발견 시 후속 사이클 진입

---

Ref: 18단계 진입 매듭 db199df, 템플릿 정착 매듭 62a15fc, philosophy 7부 F + E + A + B + C + D
