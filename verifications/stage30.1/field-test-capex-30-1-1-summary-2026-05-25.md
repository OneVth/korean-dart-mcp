# Stage 30.1.1 field-test-capex — 실측 summary

**실행일**: 2026-05-25  
**스크립트**: `scripts/stage30/field-test-capex-30-1-1.mjs`  
**raw JSON**: `verifications/stage30.1/field-test-capex-30-1-1-2026-05-25.json`  
**run-log**: `verifications/stage30.1-field-test/run-log-2026-05-25.txt`

## 결과 요약

| 항목 | 값 |
|---|---|
| 전체 | 13건 |
| PASS | 13 |
| FAIL | 0 |
| NO_SIGNAL | 0 |
| KEY CASE | 2건 전체 PASS |

## signalName 분포

| signalName | signal 수 | 회사 수 |
|---|---|---|
| `major_capex_existing_business` | 12 | 11 (두산테스나 2건 포함) |
| `major_capex_unrelated_diversification` | 2 | 2 (성호전자 + 한화리츠) |

**사전 추정 (existing 11 / unrelated 2) 정합 ✓**

## existing_business_match 분포

| 값 | 건수 | 흡수 결과 |
|---|---|---|
| `true` | 5 | `major_capex_existing_business` |
| `null` | 7 | `major_capex_existing_business` (null 흡수 ADR-0027) |
| `false` | 2 | `major_capex_unrelated_diversification` (blacklist) |

## KEY CASE 검증

### 인콘 (00475976, induty=468)

- `existing_business_match` = `null` (mixed purpose 흡수)
- verdict = `SIGNAL_DETECTED`, score = 80
- signal = `major_capex_existing_business`
- assert `not_false` → **PASS ✓** (ADR-0027 null 흡수 정책 정합)

### 한화리츠 (01669226, induty=68112)

- `existing_business_match` = `false` (blacklist: 임대)
- verdict = `SIGNAL_DETECTED`, score = -40
- signal = `major_capex_unrelated_diversification`
- assert `false` → **PASS ✓** (ADR-0027 blacklist 임대 정합)

## ADR-0015 burst 회피

- 250ms delay 정합 작동
- fetch-failed / burst 미발생

## 정합 판정

| 기준 | 결과 |
|---|---|
| 13건 전수 호출 완료 | ✓ |
| KEY CASE 2건 PASS | ✓ |
| signalName 사전 추정 정합 | ✓ |
| β-i 가드 (src/ 무변경) | ✓ |

→ **Stage 30.1.1 field-test 완료. 사전 추정 정합.**

## 관련 문서

- ADR-0027: `docs/sagyeongin/adr/0027-judge-existing-business-match-policy.md`
- ADR-0015: `docs/sagyeongin/adr/0015-external-api-burst-policy.md`
- 사전 추정: `verifications/stage30.1/capex-30-1-1-pre-estimate-2026-05-25.md`
