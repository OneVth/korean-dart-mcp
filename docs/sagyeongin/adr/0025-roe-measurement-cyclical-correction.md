# 0025 - srim ROE 측정 정밀화 — 순환주 보정 본질 + 자동 구현 부재

- 상태: Accepted
- 결정일: 2026-05-21
- 결정자: 사용자 + Claude

## 컨텍스트

ADR-0024 cross-reference (line 39/53/62) ROE 측정 정밀화 별 결정 사이클 baseline 명시. Stage 18(iii) e2e 10건 ROE 평균 6.064% vs K 10.54% (K가 평균 ROE 1.74배) 분포 역전 본문 (c) ROE 측정 부적정 분기 결판.

ADR-0023 분기 Y 가드 정착 사후 — 9건 분포 역전 verdict null + reason "srim_inverted_roe_below_K" baseline. ROE 측정 본질 자체 별 baseline 본 ADR 정착.

### Stage 18(iii) 분포 baseline

| 분류 | 건 | 본문 |
|---|---|---|
| ROE > K (정상 분포) | 1 | 아이디피 (15.43% > 10.54%) |
| ROE < K (분포 역전) | 9 | 파트론/파이오링크/LX세미콘/코텍/신도리코/세진티에스/인탑스/삼영전자공업/씨유테크 |

9건 cyclical 산업 다수 (반도체/전자) — 현 시점 trough 단계 가능성 baseline.

## 결정 요인

- **7부 E line 211** — "순환주 ROE — 과거 고점 × 60~70%로 보수적 가정. 과거의 영광 그대로 안 옴." section 명칭 **"E. 정밀 분석 (수동 판단 영역)"**
- **7부 E line 113** — "순환주의 평균 ROE를 어떻게 잡느냐 같은 질문은 대개 '이미 사고 싶은 종목의 합리화 근거 찾기'에서 나온다. 툴이 비싸다고 나와도 과거 고점을 끌어다 정당화하려는 심리다."
- **ADR-0023 baseline** — "정보 노출 + 사용자 판단 양도" 본질 (분기 Y 채택), "정보 차단" 본질 거부 (분기 X 영구 종결)

## 고려한 옵션

### 차원 1 — ROE 측정 본질

- (a) 직전 분기 단독 ROE — `roeSeries[N-1]`
- (b) 4분기 (또는 3년) 가중평균 ROE — `calculateWeightedAvgRoe` 현 baseline
- (c) 순환주 보정 — 과거 고점 × 60~70% (7부 E line 211 baseline) — **순환주 한정**

### 차원 2 — 순환주 자동 식별

- (c-i) KSIC 코드 baseline — DART API 사업 분류 회수
- (c-ii) ROE 시계열 변동계수 (CV) baseline
- (c-iii) 사용자 명시 input — `is_cyclical?: boolean`
- **(c-iv) 자동 식별 부재** — 현 baseline 그대로

### 차원 3 — 자동 보정 본질 (도구 ROE 직접 조정)

- (c-α) 식별 사후 (c) 본문 자동 적용 — `avg_roe = past_peak × 0.6` 도구 직접 산정
- **(c-β) 자동 보정 부재** — 도구 보정 산정 본질 외

## 결정

**차원 1 = (c) 순환주 보정 본질 인정** — 7부 E line 211 직접 baseline.
**차원 2 = (c-iv) 자동 식별 부재** — 현 baseline 그대로 (기존 신호 유지).
**차원 3 = (c-β) 자동 보정 부재** — 7부 E line 113 본질 직접 baseline.

코드 변경 0. `calculateWeightedAvgRoe` 본 baseline 그대로 유지. phase 1 결정 사이클 단독 (학습 #29 정합).

### 분리 본질 baseline

| 영역 | 본문 |
|---|---|
| 측정 본질 | (c) 순환주 보정 인정 — 사상 정합 |
| 구현 영역 | (c-iv) + (c-β) 자동 부재 — 도구가 보정 도구 본질 거부 |
| 사용자 협업 | 도구 신호 (`avg_roe` + `K` + verdict null reason) + 외부 정보 + 순환주 판단 + (c) 수동 산정 |

## 근거

### 차원 1 (c) 채택 근거

- 7부 E line 211 직접 baseline — 순환주 ROE 측정 본문 명시
- (a) 단일 분기 노이즈 — 7부 D-2 시계열 본질 어긋남
- (b) 4분기 가중평균 — 다운턴 4분기 시 trough 회수 baseline. 순환주 부적정

### 차원 2 (c-iv) 채택 근거

- 7부 E line 211 section 명칭 **"E. 정밀 분석 (수동 판단 영역)"** — 사경인 본문 자체가 수동 판단 명시
- (c-i)/(c-ii) 자동 식별 — 자동 도구 식별 + 사용자 의식 부재. 단 *식별 신호 노출만*은 ADR-0023 정합. 본 사이클 정착 외, 사후 사이클 잔존
- (c-iii) 사용자 명시 — cyclical 표시 rescue 가능성, line 113 위반 영역
- (c-iv) 채택 — 현 baseline 도구 신호 (`avg_roe` + `K` + verdict null + reason "srim_inverted_roe_below_K") 잔존. 분포 역전 신호 ADR-0023 직접 baseline

### 차원 3 (c-β) 채택 근거

- 7부 E line 113 직접 baseline — "툴이 비싸다고 나와도 과거 고점을 끌어다 정당화" 본질이 자동 보정 도구 자체 거부
- ADR-0023 분기 X 영구 종결 동일 분리 본질 — "정보 차단" vs "정보 노출 + 사용자 판단 양도". 자동 보정 = "정보 가공 도구" → 분기 X 본질 정합
- "분기 Y 채택" 본질 적용 — 도구 = 측정 + 신호, 사용자 = 판단 + 보정

## 결과

### 코드 변경 0

- `calculateWeightedAvgRoe` 본 baseline 그대로 유지
- handler 응답 신호 baseline 그대로 유지
- ROE override 부재 (현 baseline 외)

### 도구 영역 현 신호 baseline

- `inputs.avg_roe` (가중평균 결과)
- `inputs.required_return_K`
- verdict null + reason "srim_inverted_roe_below_K" (ADR-0023)
- `calculateWeightedAvgRoe` method (`recent_only` / `weighted`) — handler 노출 부재 (사후 baseline 추가 가능)

### 사용자 협업 본질

- 도구 신호 → 순환주 가능성 판단
- 외부 정보 (DART/네이버) → ROE 시계열 + 사업 회수
- (c) 본문 수동 산정 (과거 고점 × 60~70%)
- 의사결정 직접 판단

### Stage 18(iii) 9건 분포 역전

- ADR-0023 분기 Y 가드 baseline 그대로 잔존 — ADR-0025 직접 정정 본질 외
- 사용자 영역 9건 직접 회수 + 순환주 판단 + 수동 보정

### ADR-0023 cross-reference — 동일 분리 본질 baseline

| ADR | 측정 | 구현 | 거부 | 채택 |
|---|---|---|---|---|
| 0023 | srim prices 산출 (분포 역전 그대로) | verdict 차단 부재 | 분기 X (정보 차단) | 분기 Y (정보 노출 + 사용자 판단 양도) |
| 0025 | (c) 보정 본질 인정 | (c-iv) + (c-β) 자동 부재 | 자동 보정 (line 113 위반) | 신호 노출 + 사용자 수동 보정 |

동일 분리 본질 baseline 누적 2건 — 본 cross-reference 명시 + 학습 정착 보류 (학습 #37 패턴 3 사례 누적 사후 정착 잔존). 사후 baseline 확인 본질 영역 학습 정착 baseline 잔존.

### 사후 사이클 baseline (Stage 28+ 또는 별 ADR)

- KSIC 노출 신설 — DART API 사업 분류 회수 + handler 노출 (자동 식별 신호 영역, ADR-0023 정합)
- ROE CV 노출 — `calculateWeightedAvgRoe` 확장
- `calculateWeightedAvgRoe` method handler 노출
- ROE override 신설 — `override_ROE` input

본 baseline ADR-0023 "분기 Y" 직접 정합 — 자동 식별 신호만, 자동 보정 외.

## 적용 범위

- 코드 변경 0 (phase 1 결정 사이클 단독, 학습 #29 정합)
- ADR-0025 본문 + verifications baseline (`verifications/2026-05-21-adr-0025-roe-measurement.md`) 신설
- adr/README 인덱스 0025 line 1줄 추가 (commit 1 통합)
- β-i 가드 외 (사경인 영역 단독)

Ref: spec §10.4, philosophy 7부 D-2 + 7부 E line 113/211, ADR-0023 (분기 Y baseline) + ADR-0024 cross-reference (line 39/53/62), Stage 18(iii) baseline (`63c1e60`), 학습 #1~#39
