# verifications: ADR-0025 ROE 측정 정밀화 결판 baseline

- 결판일: 2026-05-21
- 사이클: Stage 27 — ADR-0025 신설
- 결정자: 사용자 + Claude
- 학습 #9 정합 — 결정 baseline 영구 보존

## 본문 baseline

ADR-0024 cross-reference (line 39/53/62) 영역 ROE 측정 정밀화 별 ADR 본문 baseline. Stage 18(iii) e2e 10건 ROE 평균 6.064% vs K 10.54% 분포 역전 baseline 사후 — ROE 측정 본질 자체 ADR-0025 결판.

## 사상 baseline — 7부 E 직접 인용

### line 113 (확증편향 경계 section)

> "순환주의 평균 ROE를 어떻게 잡느냐 같은 질문은 대개 '이미 사고 싶은 종목의 합리화 근거 찾기'에서 나온다. 툴이 비싸다고 나와도 과거 고점을 끌어다 정당화하려는 심리다. 매수 전에는 양쪽 정보를 균형 있게 습득하고, 매수 후에도 자기 선택을 계속 검증해야 한다."

### line 211 (E. 정밀 분석 — 수동 판단 영역 section)

> "**순환주 ROE** — 과거 고점 × 60~70%로 보수적 가정. 과거의 영광 그대로 안 옴."

section 명칭 자체가 **"E. 정밀 분석 (수동 판단 영역)"** — 사경인 본문 영역 순환주 ROE 보정 본 *수동 판단 영역* 직접 baseline.

## ADR-0024 cross-reference baseline

`docs/sagyeongin/adr/0024-srim-K-essence-baseline.md` 영역 line:

- line 39: "ROE 측정 정밀화 영역 (분기 (c)) → **ADR-0025 후보** cross-reference. 별 결정 사이클 영역."
- line 53: "(ii) ROE/K 양쪽 → ROE 측정 정밀화 영역 분리 (ADR-0025 후보)"
- line 62: "(c) ROE 측정 부적정: 7부 E '순환주 ROE 과거 고점 × 60~70%' 보정 본문 직접 근거 → ADR-0025 후보"

Stage 25 (ADR-0024) 사이클 영역 본 cross-reference 사전 명시 → Stage 27 (ADR-0025) 정착 직접 baseline.

## 결정 baseline — 3 차원 분리 본질

### 차원 1 (ROE 측정 본질) — (c) 순환주 보정 인정

- 7부 E line 211 직접 baseline
- (a) 단일 분기 노이즈 — 7부 D-2 시계열 본질 어긋남 (거부)
- (b) 4분기 가중평균 — 다운턴 trough 회수 (순환주 영역 부적정)
- (c) 순환주 한정 — 사상 정합 (채택)

### 차원 2 (자동 식별) — (c-iv) 부재 채택

- (c-i) KSIC 자동 식별 — 사후 baseline 잔존 (자동 식별 *신호 노출만* ADR-0023 정합)
- (c-ii) ROE CV 자동 식별 — 사후 baseline 잔존
- (c-iii) 사용자 명시 input — rescue 가능성, line 113 위반 영역
- (c-iv) 자동 식별 부재 — 채택. 현 baseline 도구 신호 (`avg_roe` + `K` + verdict null reason) 잔존

### 차원 3 (자동 보정) — (c-β) 부재 채택

- (c-α) 자동 보정 — line 113 본질 직접 위반 (거부)
- (c-β) 자동 보정 부재 — 채택. 사용자 수동 보정 양도

## ADR-0023 cross-reference — 동일 분리 본질 baseline 누적 2건

| ADR | 측정 영역 | 구현 영역 | 거부 본질 | 채택 본질 |
|---|---|---|---|---|
| 0023 | srim prices 산출 (분포 역전 그대로) | verdict 차단 부재 | 분기 X (정보 차단, 7부 D-2 어긋남) | 분기 Y (정보 노출 + 사용자 판단 양도) |
| 0025 | (c) 순환주 보정 인정 | (c-iv) + (c-β) 자동 부재 | 자동 보정 (line 113 위반) | 신호 노출 + 사용자 수동 보정 |

본질 정확 일치 baseline — "도구가 측정 도구일 뿐, 가공/보정/차단 도구 본질 거부, 정보 노출 + 사용자 판단 양도가 사상 정합".

학습 #42 후보 baseline = 본 분리 본질. 학습 #37 패턴 (3 사례 누적 사후 정착) 영역 외 baseline 본질 — 학습 정착 보류, 사후 사이클 baseline 영역 잔존. 본 사이클 영역 ADR 본문 cross-reference 명시만.

## Stage 18(iii) 9건 분포 역전 잔존

| 본문 | 처리 |
|---|---|
| 9건 verdict null + reason "srim_inverted_roe_below_K" | ADR-0023 분기 Y 가드 그대로 잔존 |
| 9건 cyclical 산업 다수 (반도체/전자) trough 가능성 | 사용자 영역 직접 회수 + 순환주 판단 + 수동 보정 |
| ADR-0025 직접 정정 본질 | 외 (본 사이클 영역 결판 부재) |

## 코드 변경 0

- `src/tools/sagyeongin/_lib/srim-calc.ts` — `calculateWeightedAvgRoe` 본 baseline 그대로 유지
- `src/tools/sagyeongin/srim.ts` — handler 신호 baseline 그대로 유지
- phase 1 결정 사이클 단독 (학습 #29 정합)

## 사후 사이클 baseline (Stage 28+ 또는 별 ADR)

ADR-0023 "분기 Y" 직접 정합 본질 영역 자동 식별 *신호만* 본문 baseline:

- KSIC 노출 신설 — DART API 사업 분류 회수 + handler 노출
- ROE CV 노출 — `calculateWeightedAvgRoe` 확장
- `calculateWeightedAvgRoe` method handler 노출 (`recent_only` / `weighted`)
- ROE override 신설 — `override_ROE` input

자동 *보정* 영역 (`avg_roe` 직접 산정 도구 영역) — 본 baseline 영역 영구 외 (line 113 본질 baseline).

## 사이클 메타

- 사이클: Stage 27 ADR-0025 신설
- 산출 commit: 3건 (commit 1 = ADR + adr/README / commit 2 = 본 verifications / commit 3 = CLAUDE.md 매듭)
- 코드 변경: 0
- β-i 가드: 무관 (사경인 영역 단독)
- 단테: 변화 0 (241 유지)
- TOOL_REGISTRY: 29 (사경인 14)

Ref: ADR-0025, ADR-0024 (cross-reference baseline), ADR-0023 (cause + 동일 분리 본질), philosophy 7부 D-2 + 7부 E line 113/211, spec §10.4, Stage 18(iii) baseline (`63c1e60`)
