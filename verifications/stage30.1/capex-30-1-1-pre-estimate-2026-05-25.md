# Stage 30.1.1 사전 추정 분포 — capex_signal 13건

**사전 추정일**: 2026-05-25
**HEAD commit**: f327c2b (Stage 30.1 매듭 + 단테 정정)
**판단 근거**: ADR-0027 keyword chain → 회수 F 13건 `inh_pp` 텍스트 직접 적용

## 방법론

`judgeExistingBusinessMatch(ast_sen + " " + inh_pp)` 이론치 계산.
- whitelist 매칭 → true → `major_capex_existing_business` (equityRatio ≥ 10%) 또는 `minor_capex` (5-10%)
- blacklist 매칭 → false → `major_capex_unrelated_diversification` (equityRatio ≥ 10%)
- null 패턴 / default → null → **null 흡수** → `major_capex_existing_business` (ADR-0027 §결과)
- equityRatio < 5% → no signal (data availability / 규모 미달)

equity ratio 실측 불가 (field-test 전). `inhdtl_tast_vs` (자산총계 대비) ≥ 10%
수준으로 추정 → equity 기준 비율 더 높을 가능성 높음 (한국 중소형주 레버리지 구조).
**13건 전원 ≥ 5% 임계치 충족 예상** (high confidence). 단 `extractEquityCurrent`
응답 실패 시 NO_SIGNAL 가능 — 로직 오류 아님, data availability 이슈.

## 13건 예측 표

| # | corp_code | corp_name | inh_pp 핵심 | judgeResult | 예측 signalName | tier 주의 |
|---|-----------|-----------|-------------|-------------|-----------------|-----------|
| 1 | 00659976 | 영화테크 | 공장 매입 | true | major_capex_existing_business | — |
| 2 | 01706794 | 아이언디바이스 | 물리적 공간 확보 | null(공간 확보) | major_capex_existing_business | null 흡수 |
| 3 | 01428948 | 오아 | 사옥+업무공간 | null(사옥) | major_capex_existing_business | null 흡수 |
| 4 | 01385005 | 리브스메드 | 양산 거점 | true | major_capex_existing_business | — |
| 5 | 01546101 | 아이엠티 | 제조+연구개발+공장 | true | major_capex_existing_business | — |
| 6 | 00896753 | 에코글로우 | 신사옥 | null(신사옥) | major_capex_existing_business | null 흡수 |
| 7 | 01547933 | 미쥬 | 업무 공간 | null(업무 공간) | major_capex_existing_business | null 흡수 |
| 8 | 00108612 | DS단석 | 사옥 부지 | null(사옥) | major_capex_existing_business | null 흡수 |
| 9 | 00317210 | 성호전자 | 투자수익+임대수익 | false | major_capex_unrelated_diversification | — |
| 10 | 00563545 | 두산테스나 | 수요 증가 대응 | true | major_capex_existing_business | — |
| **11** | **00475976** | **인콘** | **R&D+신사옥** | **null(mixed)** | **major_capex_existing_business** | **KEY CASE** |
| **12** | **01669226** | **한화리츠** | **부동산 임대** | **false(임대)** | **major_capex_unrelated_diversification** | **KEY CASE** |
| 13 | 01307593 | 에이아이코리아 | 업무 공간 | null(업무 공간) | major_capex_existing_business | null 흡수 |

**예측 분포**: existing_business 11건 / unrelated_diversification 2건

## KEY CASE assertions

### 인콘(00475976) — null 흡수 정합 검증

- `inh_pp`: "R&D센터 건립 및 신사옥 확보"
- R&D → whitelist, 신사옥 → null pattern → 동시 매칭 → ADR-0027 §null 3 (mixed) → `null`
- null 흡수 → `major_capex_existing_business`
- **hard assertion**: `evidence.existing_business_match !== false`
- 위반 시: classifySignal null 흡수 if-else (capex-signal.ts:180) regression

### 한화리츠(01669226) — blacklist 임대 정합 검증

- `inh_pp`: "부동산 임대를 통한 수익 창출"
- `임대` keyword → blacklist → `false`
- **hard assertion**: `evidence.existing_business_match === false`
- 위반 시: existing-business-keywords.ts blacklist `임대` 미매칭 → 실제 DART 응답 raw 확인

## Deviation tracking

*(field-test 실행 후 채움)*

| # | corp_name | 예측 | 실측 | 차이 원인 |
|---|-----------|------|------|-----------|
| — | — | — | — | — |

## field-test 실행 명령

```bash
npm run build
node scripts/stage30/field-test-capex-30-1-1.mjs
```

결과 저장: `verifications/stage30.1/field-test-capex-30-1-1-YYYY-MM-DD.json`
