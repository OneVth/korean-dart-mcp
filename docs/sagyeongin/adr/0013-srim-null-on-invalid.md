# 0013 - srim 비정상 입력/계산 케이스 옵션 B (verdict null + note)

- 상태: Accepted
- 결정일: 2026-05-03
- 결정자: 사용자 + Claude

## 컨텍스트

10단계 watchlist_check field-test에서 카카오 + LG화학 srim 호출 시 `judgeSrimVerdict: prices must be positive` throw 발생 (`src/tools/sagyeongin/_lib/srim-calc.ts:148`). 원인 추정: 평균 ROE 음수 또는 자기자본 음수로 srim 공식 결과가 음수.

watchlist_check는 try/catch로 흡수했지만 srim 자체의 비정상 케이스 처리 정책이 검토 대상. srim-calc.ts에 유사 throw 4건:

- line 74: `roeSeries cannot be empty` — ROE 시계열 부재
- line 109: `shares must be positive` — 발행 주식수 부재 또는 음수
- line 115: `denominator (1+K-W) too small` — 계산 denominator 0에 가까움
- line 148: `prices must be positive` — 음수 prices 결과

외부 K값 조회 실패 throw (`srim.ts:90`)는 별도 — 외부 의존이라 본 ADR 적용 범위 밖.

## 고려한 옵션

- **옵션 A** (현재 throw 유지): 호출자가 try/catch로 처리. watchlist_check가 이미 사용 중.
- **옵션 B** (verdict null + prices null + note): srim이 비정상 케이스를 정상 응답으로 노출, note에 사유 명시.
- **옵션 C** (verdict "INVALID" enum 추가): 기존 verdict enum (BUY/BUY_FAIR/FAIR/SELL_FAIR/SELL)에 "INVALID" 추가.

## 결정

**옵션 B**:

- 적용 범위: srim-calc.ts 4건 (line 74·109·115·148) → throw 대신 null 반환
- srim.ts handler: srim-calc.ts 결과가 null이면 verdict null + prices null + note 추가 + 정상 응답
- 외부 K 조회 실패 (srim.ts:90)는 throw 유지 — 외부 의존, 호출자가 명시적으로 처리

## 근거

- **옵션 B 채택**:
  - 5부 "사람 결정 영역 사전 분리" — 도구가 throw로 결정 강제 X. 사용자가 결과 보고 판단
  - 호출자 부담 감소 — try/catch 매번 강제 X
  - verdict enum 인플레이션 회피 — 기존 사용처 (watchlist_check stages.srim) 호환 유지
  - 다른 사경인 도구도 비정상 케이스 발생 시 동일 패턴 점진 확장 가능
- **옵션 A 거부**: 호출자 매번 try/catch 부담. watchlist_check는 흡수했지만 다른 호출자도 반복.
- **옵션 C 거부**: verdict enum 인플레이션. 사용처 (watchlist_check + scan_execute) 모두 enum 분기 추가.

## 결과

좋은 점:
- srim 호출자 부담 감소
- verdict enum 그대로 — 기존 사용처 호환
- watchlist_check 동작 단순화 — try/catch는 외부 K 실패만 잡음
- 5부 정합

트레이드오프:
- srim Output 스키마 명시적 확장 — verdict가 string | null
- 본 ADR 적용 시 srim 코드 + watchlist_check 코드 동반 변경 (별도 단발 브랜치 — 11단계 진입 전 처리)
- 다른 사경인 도구 (cashflow/capex/dividend)도 비정상 케이스 패턴 검토 — 본 ADR이 기준점

미래 변경 시 영향:
- 새 사경인 도구 작성 시 비정상 케이스 처리는 ADR-0013 정합 (verdict null + note 패턴)
- srim 비정상 케이스 sample 발견 시 fixtures 누적 검토
