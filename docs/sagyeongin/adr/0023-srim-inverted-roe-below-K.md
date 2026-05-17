# 0023 - srim 분포 역전 (ROE < K) verdict invariant 가드

- 상태: Accepted
- 결정일: 2026-05-17
- 결정자: 사용자 + Claude

## 컨텍스트

Stage 18(iii) e2e 측정 (`63c1e60`) §T1 sagyeongin_srim 10건 baseline에서 핵심 발견 — 가격 분포가 ROE/K 대소관계에 의존하는 srim 공식 본질이 results 본문 분류 + handler 응답 양쪽에서 정합 처리되지 않음.

### srim 공식 분포 본질

`src/tools/sagyeongin/_lib/srim-calc.ts` line 119-132 본문:

```
excessIncome = equity × (avgRoe − K)

W08 = equity + (excess × 0.8) / (1 + K − 0.8)  → buy  = W08 / shares
W09 = equity + (excess × 0.9) / (1 + K − 0.9)  → fair = W09 / shares
W10 = equity + (excess × 1.0) / (1 + K − 1.0)  → sell = W10 / shares
```

분모 W=1.0이 가장 작음 → 분수 가장 큼. excess 부호에 따라 분포 결정:

| 케이스 | excess | 분포 | 본질 |
|---|---|---|---|
| ROE > K | 양수 | sell > fair > buy | 안전마진 정합 (정상) |
| ROE = K | 0 | buy = fair = sell | 가격 압축 |
| ROE < K | 음수 | buy > fair > sell | **분포 역전** |

### 18(iii) baseline 10건 실측

- ROE > K (정상 분포 sell > fair > buy): 아이디피 1건 (ROE 15.43% > K 10.54%)
- ROE < K (분포 역전 buy > fair > sell): 9건 (파트론/파이오링크/LX세미콘/코텍/신도리코/세진티에스/인탑스/삼영전자공업/씨유테크)

### results 본문 모순 식별

`docs/sagyeongin/scenarios/stage18-e2e/results/02-decision-flow.md`:

- line 174 "정상 (sell > fair > buy 패턴)" — 파트론/파이오링크/LX세미콘/코텍 4건. 실제 분포 buy > fair > sell (ROE < K). 본문 분류 본질 거꾸로.
- line 175 "fair > buy 역전 (고ROE)" — 아이디피 1건. 실제 분포 sell > fair > buy 정상. "역전" 표기 부정확.
- line 124 "정상 srim 본질 (sell > fair > buy 또는 sell > buy > fair) 위배 — fair > buy 역전" — 아이디피 본문 자체 모순 (sell > fair > buy 정상 분포에 "역전" 표기).

### handler 응답 본질 부정확

`src/tools/sagyeongin/srim.ts` + `_lib/srim-calc.ts` 본문:

- `calculateSrim` 진입에 `avgRoe < K` 가드 없음 → ROE < K 종목도 srim prices 산출 (분포 역전).
- `judgeSrimVerdict` (line 153-171) basis="fair" first-match 본문:
  - `currentPrice ≤ prices.buy → BUY`
  - 분포 역전 시 prices.buy가 가장 큼 → current가 buy 이하면 무조건 BUY.
- 신도리코 검증: current 47,350 ≤ buy 88,224 → BUY 산출. 그러나 ROE 4.16% << K 10.54%로 사경인 7부 D-2 본질 ("초과이익 양수 종목 발견") 위반.

→ ROE < K 종목이 항상 BUY 분류 — 사용자 의사결정 본질 부정확.

## 고려한 옵션

- **분기 X** (`calculateSrim` 진입 가드): `avgRoe < K` 감지 시 null + reason. srim 적용 자체 보류.
- **분기 Y** (`judgeSrimVerdict` invariant 가드): srim prices 산출 정상, verdict 산출 시 `prices.buy > prices.sell` 감지 시 null + reason.
- **분기 Z** (results 본문 정정): 18(iii) results §T1 line 124 + 170-178 본문 정정. 학습 29 origin 재정의.

## 결정

**분기 Y + 분기 Z 결합 채택. 분기 X 보류 (후속 사이클 영역).**

### 분기 Y (구현 영역, phase 2 별 사이클)

- `judgeSrimVerdict` 본문 진입에 invariant 가드 추가 — `prices.buy > prices.sell` 감지 시 null 반환 (ADR-0013 null 가드 본문 연장).
- handler note 본문에 `srim_status=verdict_null (srim_inverted_roe_below_K, ADR-0023)` 추가.
- 테스트 신설 — ROE < K 분포 역전 케이스 + invariant 가드 (학습 #24 정합).

### 분기 Z (정정 영역, 본 ADR 동반)

- `docs/sagyeongin/scenarios/stage18-e2e/results/02-decision-flow.md` line 124 + 170-178 본문 정정.
- 학습 29 origin 재정의 — "고ROE × srim K 보정" 영역 아닌 "ROE < K 케이스 srim 적용 본질 의문" 영역.

## 근거

### 분기 Y 채택 근거

- **사용자 응답 보존** (학습 #25 정합) — 18(iii) baseline 9건 prices 본문 그대로 노출. handler deterministic 본질 정합.
- **사경인 7부 D-2 본질 정합** — verdict 보류 + reason "srim_inverted_roe_below_K" 본문으로 사용자 의사결정 본질 정합. RIM은 "초과이익 양수 종목 발견" 본문이 본질.
- **inputs 본문 노출 정합** — handler 응답 `inputs.avg_roe` + `inputs.required_return_K` 본문이 사용자가 ROE vs K 직접 식별 가능 영역.
- **type 시스템 정합** (학습 #26) — verdict null 반환은 기존 SrimVerdict | null 본문 정합. INVERTED enum 신설은 type 본질 변화.

### 분기 X 보류 근거

- 사용자 측 본질 큰 변화 — 18(iii) baseline 9건 prices null 전환.
- 분기 Y 정착 후 사용자 측 피드백 받아 결정 정합.
- 후속 사이클 영역 (Stage 22+ 후보).

### 분기 Z 채택 근거

- 학습 29 origin 본문 자체 모순 — 정정 정합.
- 코드 변경 0 (results md 파일만 정정).
- 사이클 본질 재정의 정착 본문.

## 적용 범위

- `src/tools/sagyeongin/_lib/srim-calc.ts` — `judgeSrimVerdict` invariant 가드 (phase 2)
- `src/tools/sagyeongin/_lib/srim-calc.test.ts` — invariant 가드 + ROE < K 테스트 신설 (phase 2)
- `src/tools/sagyeongin/srim.ts` — note 본문 reason 추가 (phase 2)
- `docs/sagyeongin/scenarios/stage18-e2e/results/02-decision-flow.md` — line 124 + 170-178 본문 정정 (phase 1 / commit 2)
- β-i 가드 영역 외 (`src/tools/sagyeongin/_lib/srim-calc.ts`는 fork 신설 파일 `2e19965` 14단계 묶음 3)

Ref: spec §10.4, philosophy 7부 D-2 (RIM 초과이익 양수 종목 발견), 18(iii) results §T1 (`63c1e60`), 학습 #24/#25/#26/#27, ADR-0013 null 가드 본문 연장
