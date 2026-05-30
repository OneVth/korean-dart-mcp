# ADR-0029: composite_score 산식 — srim 갭 정렬 주도, capex tie-breaker

## Status: Accepted (부호 정정 fix2 반영)

재스캔(n=16) 결과 산식 방향 확정: 저평가 큰 종목이 composite 상위 정렬(7부 D 주도). gap 전원 음수(min −89, avg −46%), composite 전원 양수. 부호 정정 성공.

**SRIM_GAP_WEIGHT = 1.5 잠정 유지**: 재스캔 표본 capex opportunity_score 전원 0(공시 희소) — 가중치의 capex-vs-gap 균형 기능이 발동하지 않음. 1.5 적정성은 **capex 비-0 표본 확보 시 재판정.** 현 표본으로는 가중치가 정렬에 무영향(모든 종목 동일 배율).

## 결정일: 2026-05-30

## Context

MVP1 export 15후보 전원 composite_score=0 사태 원인 분석:

- **capex 공시 희소**: `tgastInhDecsn` (자기자본 10%+ 시설투자 의무공시) 공시가 lookback 12개월 내
  없는 종목은 signals=[] → opportunity_score=0. 코드 결함 아님 — 데이터 희소성.
- **산식 설계 결함**: `composite = opportunity_score − concern_score` 산식에 7부 D(srim 갭)가
  없다. 대부분 종목이 `0−0=0` → sort에서 0-tie → 입력 순서 보존. export에서 "SRIM 갭 정렬"처럼
  보인 것은 입력이 srim 순이라 0-tie에서 보존된 부수효과(운).

7부 사상 근거:
- **7부 D**: 적정주가 대비 저평가 = "얼마나 싼가" = 매수 근거 본체 → 정렬 주도.
- **7부 C**: 시설투자 기회 시그널 = "추가 성장 모멘텀" = 같은 저평가 폭이면 capex 강한 쪽
  우선 = tie-breaker 보조.
- 7부 C는 가점이지 결격이 아님(성숙기 우량주는 capex 낮아도 정당) → 탈락 필터로 오용 금지.

## Decision

```
composite_score = max(−(srim.gap_to_fair ?? 0), 0) × SRIM_GAP_WEIGHT
                + (capex.opportunity_score ?? 0)
                − (cashflow.concern_score ?? 0)
```

`gap_to_fair` = 괴리율 `(현재가−적정가)/적정가 × 100` (srim-calc.ts:180) — **저평가일수록 음수**.
`max(−gap, 0)` = 저평가 폭: 음수 괴리(저평가)만 양수 가점, 양수 괴리(고평가)는 0 기여.

`SRIM_GAP_WEIGHT = 1.5` — **잠정값**.

### SRIM_GAP_WEIGHT = 1.5 근거

스케일 추정: SIGNAL_SCORES major_existing = +80. "저평가 30% = gap −30 → discount 30 → 30×1.5=45점"
→ major capex 한 방(+80)이 ~17%p 저평가를 역전하지 않도록 균형점 설정.

예: discount 30 (gap −30 기준) → 45점 vs major capex +80 → capex가 약 1.8× 크지만 gap 분포가
capex보다 빈번하고 지속적이라 전체 순위에서 7부 D 주도 달성.

### SRIM_GAP_WEIGHT 조정 기준

field-test 후보군 갭 분포 실측 후 조정:
- 평균 갭이 capex 가점에 **압도**되면 → 상향
- capex가 갭에 **묻히면** → 하향
- **임의 숫자 주입 금지** — min_opportunity_score=50 사고와 동형 함정 차단.
- 조정 시 반드시 이 ADR을 개정하고 근거를 기록.

### null 처리

`gap_to_fair`가 null인 경우 → 갭 기여 0, capex 단독으로 정렬 (안전 폴백).
srim을 통과했으나 갭 계산이 불가한 종목(prices 부재 등)에서 발동.

## 변경 범위

- `scan-execute.ts` `SRIM_GAP_WEIGHT` 상수 + `finalizeCandidates` 산식.
- `capex-signal.ts` SIGNAL_SCORES **무변경** (β-i 가드 — capex 단독 도구 회귀 방지).
- `src/lib/` **무변경** (β-i 격리).

## Consequences

- capex 공시 없는 종목도 gap_to_fair 크기로 정렬 분별 → composite=0 전원 사태 해소.
- unrelated_diversification(−40) 종목은 concern 가산 없이도 composite 하향 — 7부 B 위험 자동 반영.
- `min_opportunity_score` 필터는 capex opportunity_score 기준 유지 (산식 교체와 분리). 필터를
  composite 기준으로 이전하는 것은 후속 검토 사이클 영역.

## Consequences (추가)

- 부호 오류는 field-test 실데이터(n=16, gap 전원 음수 avg −46%)로만 드러남 — srim-calc.ts 계산식 사전 확인 누락 (학습 #61).
- 1.5 가중치 적정성: 재스캔 n=16 실측 — capex opportunity_score 전원 0(공시 희소)이라 capex-vs-gap 균형 기능 미발동. 가중치 정렬 영향 0(모든 종목 동일 배율). **재판정 보류 — capex 비-0 표본 확보 시 재판정.**

## Ref

spec §10.8, §7.1, Stage 30.7, Stage 30.7-fix2 (2026-05-30), Stage 30.7-field-test (2026-05-30), MVP1 export 분석 (2026-05-29), 학습 #59, 학습 #61, 학습 #62
