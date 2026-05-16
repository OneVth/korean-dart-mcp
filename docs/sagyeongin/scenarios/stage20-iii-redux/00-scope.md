# Stage 20 (iii)-redux — 검증 명세

학습 28 + 학습 31 user-facing gap 제거 정합 검증.

## 사이클 본질

19단계 schema 확장 (commits `dfbb87f`, `d110410`, `957e5eb`, `0fd10bd`, merge `77c2ac7`, knot `907b8a3`) 본 학습 28 (T5 dividend output gap) + 학습 31 (T2 cashflow output gap) user-facing gap 제거 정착 확인.

- 코드 변경 0 — 시나리오 호출 + 결과 정착 + 사이클 종결 매듭
- baseline main HEAD: `907b8a3`
- MCP 호출 5건 (scan_execute 1 + cashflow_check 2 + dividend_check 2)
- ADR-0019 daily limit pre-check 충분 정합

## 검증 본문 5건

| # | 검증 | MCP 호출 | 본문 |
|---|---|---|---|
| V1 | scan_execute candidate.dividend metrics/series 노출 | scan_execute 1회 | 학습 28 user-facing gap 제거 정합 |
| V2 | scan_execute candidate.cashflow yearly_data 노출 | (V1 동일 호출) | 학습 31 user-facing gap 제거 정합 |
| V3 | cashflow_check 단독 yearly_data 노출 | cashflow_check 2건 | 명세 vs 실제 어긋남 (학습 31 origin) 제거 정합 |
| V4 | dividend_check 단독 metrics/series 노출 | dividend_check 2건 | 학습 28 baseline 정합 (19단계 변화 없음 정합) |
| V5 | 7부 B/E user-facing 의사결정 정합 | (V1~V4 응답 본문 분석) | scan_execute 1회 호출 본 진입/회피 결정 가능성 본문 확인 |

---

## V1 + V2 — scan_execute 1회 호출

### 호출 입력

```json
{
  "tool": "sagyeongin_scan_execute",
  "input": {
    "universe": "watchlist",
    "max_candidates": 3,
    "random_seed": 42
  }
}
```

### 기대 응답 본문

scan_execute 응답 본 `candidates[]` array. 각 candidate 본:

```
candidate.corp_code: string
candidate.corp_name: string
candidate.killer: { passed, reasons, ... }
candidate.cashflow: { passed, yearly_data: [...], ... } | null
candidate.insider: { ... } | null
candidate.srim: { ... } | null
candidate.dividend: { grade, metrics, series, interpretation_notes, ... } | null
```

#### V1 — candidate.dividend 본문 정합

candidate.dividend 본 (null 아닌 케이스):

```
candidate.dividend.grade: "A" | "B" | "C" | "D" | "N/A"
candidate.dividend.metrics: {
  avg_payout_ratio: number,
  avg_dividend_yield: number,
  payout_stddev: number,
  years_of_dividend: number,
  recent_cut: boolean
}
candidate.dividend.series: [
  { year: string, dividend_per_share: number, payout_ratio: number, dividend_yield: number },
  ... (5건 또는 n년)
]
candidate.dividend.interpretation_notes: string[]
```

#### V2 — candidate.cashflow 본문 정합

candidate.cashflow 본 (null 아닌 케이스):

```
candidate.cashflow.passed: boolean
candidate.cashflow.yearly_data: [
  { year: string, op_profit: number | null, op_cf: number | null, inv_cf: number | null, fin_cf: number | null, oi_cf_ratio: number | null },
  ... (5건)
]
```

### PASS 기준

#### V1 PASS

- candidates[] 본 dividend null 아닌 케이스 ≥ 1건
- 본 케이스 본 `metrics` + `series` + `interpretation_notes` 3 필드 모두 존재
- `metrics` 본 5 필드 모두 존재 (avg_payout_ratio, avg_dividend_yield, payout_stddev, years_of_dividend, recent_cut)
- `series` 본 array (빈 array 또는 n년 entries — N/A path 분기 정합)
- `interpretation_notes` 본 string[] (빈 array 또는 다건)

#### V2 PASS

- candidates[] 본 cashflow null 아닌 케이스 ≥ 1건
- 본 케이스 본 `yearly_data` 필드 존재 + array len 5
- 각 entry 본 5 필드 모두 존재 (year, op_profit, op_cf, inv_cf, fin_cf, oi_cf_ratio)
- op_profit null entries 포함 가능 (룰 1 catch / 미트리거 케이스 — 19단계 정착 본문)

### FAIL 기준

- candidate.dividend / candidate.cashflow 통째 omit (필드 자체 부재) → FAIL
- candidate.dividend null이면서 candidates[] 전체 dividend null → V1 검증 불가 (재호출 또는 universe 조정 필요)
- candidate.cashflow null이면서 candidates[] 전체 cashflow null → V2 검증 불가

---

## V3 — cashflow_check 단독 2건

### 호출 입력

#### V3-1 — 신도리코 (CLEAN baseline)

```json
{
  "tool": "sagyeongin_cashflow_check",
  "input": {
    "corp_code": "00135795",
    "years": 5
  }
}
```

#### V3-2 — LX세미콘 (룰 1 정착 케이스)

```json
{
  "tool": "sagyeongin_cashflow_check",
  "input": {
    "corp_code": "00525934",
    "years": 5
  }
}
```

### 기대 응답 본문

```
response.passed: boolean
response.rules: { rule1, rule2, rule3, rule4, rule5 }
response.yearly_data: [
  { year: string, op_profit: number | null, op_cf: number | null, inv_cf: number | null, fin_cf: number | null, oi_cf_ratio: number | null },
  ... (5건)
]
```

### PASS 기준

#### V3-1 PASS (신도리코 CLEAN)

- `yearly_data` 필드 존재 + array len 5
- 각 entry 본 5 필드 모두 존재
- op_profit + op_cf 본 모두 non-null (CLEAN baseline)
- oi_cf_ratio non-null

#### V3-2 PASS (LX세미콘)

- `yearly_data` 필드 존재 + array len 5
- 각 entry 본 5 필드 모두 존재
- op_profit null entries 허용 (룰 1 미트리거 케이스 — 19단계 정착 본문)
- op_profit null entry 본 oi_cf_ratio도 null (정합)

### V1+V2 ↔ V3 교차 정합

scan_execute candidates[] 본 신도리코 / LX세미콘 corp_code 포함 시:
- candidate.cashflow.yearly_data ↔ V3 응답 yearly_data 동일 값 (year + op_profit + op_cf + inv_cf + fin_cf + oi_cf_ratio 5 필드 모두)
- 미포함 시 본 정합 검증 skip (분리 단독 검증)

---

## V4 — dividend_check 단독 2건

### 호출 입력

#### V4-1 — 파트론 (grade A baseline)

```json
{
  "tool": "sagyeongin_dividend_check",
  "input": {
    "corp_code": "00490151",
    "years": 5
  }
}
```

#### V4-2 — 코텍 (grade N/A)

```json
{
  "tool": "sagyeongin_dividend_check",
  "input": {
    "corp_code": "00305297",
    "years": 5
  }
}
```

### 기대 응답 본문 (Path 분기 명시)

dividend-check.ts 본 N/A 응답 path 2건 존재:

| Path | 조건 | series | metrics | notes |
|---|---|---|---|---|
| Path 1 (L100~115) | `dividend.total.length === 0` early return | `[]` | 0/0/0/0/false | 1건 ("배당 이력 0") |
| Path 2 (L167~177) | `classifyGrade("N/A")` 반환 — n년 데이터 존재, 등급 분류 본질 약함 | n년 array (n<5) | 계산값 (≠0) | 다건 |

코텍 실제 path = V4-2 호출 응답에서 직접 식별.

### PASS 기준

#### V4-1 PASS (파트론 grade A)

- `grade` = "A"
- `metrics` 5 필드 모두 존재 + 모두 ≠ 0 (배당 이력 정상)
- `series` array len 5 (5년 시계열)
- 각 series entry 본 4 필드 모두 존재 (year, dividend_per_share, payout_ratio, dividend_yield)
- `interpretation_notes` 본 string[] (≥ 1건)

#### V4-2 PASS (코텍 grade N/A — Path 양 분기 통합)

- `grade` = "N/A"
- `metrics` 5 필드 모두 존재
- `series` 본 array (빈 array 또는 n년 array — Path 분기 무관)
- `interpretation_notes` 본 string[] (≥ 1건)

**Path 식별 (PASS 후 정착)**:
- Path 1 정합 = `series.length === 0` + `metrics.years_of_dividend === 0` + `notes.length === 1`
- Path 2 정합 = `series.length > 0 && series.length < 5` + `metrics.years_of_dividend > 0` + `notes.length >= 1`

본 식별은 PASS 조건 외 — 학습 28 검증 가치 정착 본문. Path 2 발생 시 series n년 array 노출이 grade "N/A" 단일 라벨 대비 *부분적 배당 이력 visibility* 제공 입증.

### V1 ↔ V4 교차 정합

scan_execute candidates[] 본 파트론 / 코텍 corp_code 포함 시:
- candidate.dividend.metrics ↔ V4 응답 metrics 동일 값 (5 필드 모두)
- candidate.dividend.series ↔ V4 응답 series 동일 값
- candidate.dividend.interpretation_notes ↔ V4 응답 interpretation_notes 동일
- 미포함 시 본 정합 검증 skip

---

## V5 — 7부 B/E user-facing 의사결정 정합

V1~V4 응답 본문 분석. 별도 MCP 호출 없음.

### 기대 본문

#### V5-A (7부 B — 학습 31)

scan_execute 1회 응답 본 candidate.cashflow.yearly_data 5년 본문만으로:
- op_profit ↔ op_cf gap 추이 식별 가능
- inv_cf (capex) 본 자본 지출 패턴 식별 가능
- fin_cf (배당/차입) 본 financing 패턴 식별 가능
- oi_cf_ratio 5년 추이 본 "수치 vs 사실" 정합 검증 가능

→ 단독 cashflow_check 재호출 강제 없음 입증.

#### V5-B (7부 E — 학습 28)

scan_execute 1회 응답 본 candidate.dividend.metrics + series + interpretation_notes 본문만으로:
- avg_dividend_yield 본 진입 가격대 1차 판단 가능
- recent_cut 본 grade override red flag 식별 가능
- series yield 추세 본 저점/고점 정합 식별 가능
- interpretation_notes 본 multi-signal 조합 회수 가능

→ 단독 dividend_check 재호출 강제 없음 입증.

### V5 PASS 기준

- V1 PASS + V2 PASS + V3 PASS + V4 PASS 통과 시 V5 자동 PASS 후보
- V5-A: candidate.cashflow.yearly_data 5년 본문 본 7부 B 4 본문 (op_profit/op_cf gap + inv_cf + fin_cf + oi_cf_ratio) 모두 식별 가능 확인
- V5-B: candidate.dividend 본 metrics 5 필드 + series + notes 본 7부 E 3 본문 (yield + recent_cut + series 추세) 모두 식별 가능 확인

---

## 사이클 단계

| # | 단계 | 산출 | commit |
|---|---|---|---|
| 1 | **시나리오 명세** (본 단계) | `docs/sagyeongin/scenarios/stage20-iii-redux/00-scope.md` | main 직접 commit (knot 패턴) |
| 2 | MCP 호출 + 결과 정착 | `docs/sagyeongin/scenarios/stage20-iii-redux/results/01-verification.md` | main 직접 commit |
| 3 | 사이클 종결 매듭 | `docs/sagyeongin/CLAUDE.md` 갱신 + 단테 누적 | main 직접 commit (knot) |

본 사이클 코드 변경 0 — feature branch 불필요.

## 학습 가드 (사이클 진행 중 적용)

| 학습 | 가드 |
|---|---|
| #1 | push 검증 — `git fetch origin` + commit hash 직접 확인 |
| #3 | line count 산수 사전 검증 |
| #18 | MCP 호출은 `sagyeongin-mcp` 등록 Claude Code 세션. file/git은 별경로 |
| #21 | Phase 분리 — 단일 위임에 MCP 호출 + commit 합치면 클라이언트 자체 판단 발생 |
| #27 | 결정 ↔ 실행 분리 — 본 명세 (결정) + V1~V5 실행 commit 분리 |
| #28 | stale working tree 가드 — `git status -b` 확인 + `git reset --hard origin/main` 동기화 후 진행 |
| ADR-0003 | mock 단테 없음 — 본 사이클 실 MCP 호출 영역 |
| ADR-0019 | daily limit pre-check — 5 호출 본 충분 정합 |

## noise 통제

19단계 entry prompt 가드 유지:
- "본격" 강조 부사 금지
- "본문" — 의미 있을 때만
- "영역" — 의미 있을 때만
- "정합" — 일치/맞춤 의미만
- "본 X 본 Y" 연속 패턴 금지

## 참조

- 18 (iii) 50 호출 시나리오: `docs/sagyeongin/scenarios/stage18-e2e/02-decision-flow.md`
- 18 (iii) 50 호출 결과: `docs/sagyeongin/scenarios/stage18-e2e/results/02-decision-flow.md`
- 18 (iii) analysis: `docs/sagyeongin/scenarios/stage18-e2e/analysis.md` (학습 28/31 origin)
- 19단계 1단계 사전 검증: `docs/sagyeongin/verifications/2026-05-15-stage19-schema-gap.md`
- 19단계 commits: `dfbb87f`, `d110410`, `957e5eb`, `0fd10bd`, merge `77c2ac7`, knot `907b8a3`

---

Ref: spec §V1~V5, philosophy 7부 B (수익은 수치, 현금흐름은 사실) + 7부 E (배당주 진입 인터페이스), 학습 28/31 (18 (iii) analysis), 19단계 knot `907b8a3`
