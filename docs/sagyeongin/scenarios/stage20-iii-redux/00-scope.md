# Stage 20 (iii)-redux — 검증 명세 (정정본, 분기 E)

학습 28 + 학습 31 user-facing gap 제거 정합 검증.

## 정정 사유

직전 명세 `df389df` 본문 V1+V2 호출 입력 가정 (`universe: "watchlist"`, `max_candidates: 3`) 본 실제 scan_execute Input schema 위반. 보류 사이클 매듭 `cf47a64`에서 본질 위반 식별 후 본 정정본으로 재구성.

본 정정본은 분기 E (정적 코드 분석 + test 정합 검증) 정합으로 V1~V5 본문 재정의. MCP 호출 0.

## 사이클 본질

19단계 schema 확장 (commits `dfbb87f`, `d110410`, `957e5eb`, `0fd10bd`, merge `77c2ac7`, knot `907b8a3`)이 학습 28 + 학습 31 user-facing gap 제거를 코드 + test 양쪽에 정착시켰는지 검증.

- 코드 변경 0
- baseline main HEAD: `cf47a64` (보류 종결 매듭)
- MCP 호출 0 (분기 E 본질)
- ADR-0017 / ADR-0019 무관

## 분기 결정 본문

| 분기 | 본질 | 본 사이클 선택 |
|---|---|---|
| A | included_industries 축소 + MCP 호출 | 코드+test 이미 정착 — 잉여 |
| B | checkpoint+resume 분할 | 동일 잉여 |
| C | V1+V2 cover 0 | 본질 위반 |
| D | scan_execute corp_codes 옵션 추가 | 별개 사이클 (코드 변경) |
| **E** | **정적 코드 분석 + test 정합** | **본 사이클 선택 ✓** |

분기 E 근거 본문은 `verifications/2026-05-17-stage20-iii-redux-static.md` 참조.

## 검증 본문 5건 (분기 E 정합 재구성)

| # | 검증 | 수단 | 본문 |
|---|---|---|---|
| V1 | scan_execute candidate.dividend metrics/series/interpretation_notes propagation | 정적 코드 path trace + scan-enrich.test.ts S2/S3 | 학습 28 user-facing gap 제거 정합 |
| V2 | scan_execute candidate.cashflow yearly_data propagation | 정적 코드 path trace + scan-enrich.test.ts S1/S4 | 학습 31 user-facing gap 제거 정합 |
| V3 | cashflow_check 단독 yearly_data 노출 | 직전 사이클 응답 2건 (신도리코 / LX세미콘) 정합 정착 — 재호출 0 | 학습 31 단독 호출 정합 |
| V4 | dividend_check 단독 metrics/series 노출 | 직전 사이클 응답 2건 (파트론 / 코텍) 정합 정착 — 재호출 0 | 학습 28 baseline 정합 |
| V5 | 7부 B/E user-facing 의사결정 정합 | V1~V4 정합 결과 분석 | scan_execute 1회 호출 본 진입/회피 결정 가능성 정착 |

---

## V1 — 학습 28 dividend propagation 정합

### 정적 코드 path trace

`src/tools/sagyeongin/scan-execute.ts`:

| line | 본문 |
|---|---|
| 176-194 | `EnrichedCandidate.dividend` type 정의 — `metrics` (5 필드) + `series` (4 필드 × n entries) + `interpretation_notes` (string[]) |
| 466-500 | `enrichCandidates` dividend stage — `deps.dividend.handler` 응답을 `dividendStage` 객체로 propagation |
| 491-493 | `metrics: r.metrics`, `series: r.series`, `interpretation_notes: r.interpretation_notes` — 19단계 학습 28 정착 위치 |
| 514 | `dividend: dividendStage` — candidate 객체 본 포함 |
| 525-545 | `finalizeCandidates` — `slice(0, limit)` + `rank` 부여만, dividend 필드 mutation 부재 |
| 622 | `buildResponse` — `candidates: args.candidates` 그대로 노출 |

→ handler 응답의 metrics + series + interpretation_notes가 user-facing output까지 mutation 없이 전파.

### scan-enrich.test.ts 정합

| test | line | 본문 |
|---|---|---|
| S2 | 350 | dividend.metrics/series/notes mock response 정합 전파 — `assert.deepEqual(result.enriched[0].dividend?.metrics, mockMetrics)` 등 3 assertion |
| S3 | 381 | cashflow throw → cashflow=null, dividend.metrics 정상 전파 (cross 경로 보존) |

S2 + S3 정합 본 V1 검증 본질을 deterministic하게 cover.

### V1 PASS 조건

코드 path 정합 + S2/S3 test 정합 모두 충족. **V1 PASS ✓**.

---

## V2 — 학습 31 cashflow propagation 정합

### 정적 코드 path trace

`src/tools/sagyeongin/scan-execute.ts`:

| line | 본문 |
|---|---|
| 153-166 | `EnrichedCandidate.cashflow` type 정의 — `yearly_data` (6 필드 × n entries) 포함 |
| 393-422 | `enrichCandidates` cashflow stage — `deps.cashflow.handler` 응답을 `cashflowStage` 객체로 propagation |
| 415 | `yearly_data: r.yearly_data` — 19단계 학습 31 정착 위치 |
| 511 | `cashflow: cashflowStage` — candidate 객체 본 포함 |
| 525-545, 622 | finalize + response 흐름 V1 동일 (mutation 부재) |

### scan-enrich.test.ts 정합

| test | line | 본문 |
|---|---|---|
| S1 | 329 | cashflow.yearly_data mock response 정합 전파 — `assert.deepEqual(result.enriched[0].cashflow?.yearly_data, mockYd)` |
| S4 | 408 | dividend throw → dividend=null, cashflow.yearly_data 정상 전파 (cross 경로 보존) |

### V2 PASS 조건

코드 path 정합 + S1/S4 test 정합 모두 충족. **V2 PASS ✓**.

---

## V3 — cashflow_check 단독 정합 (직전 사이클 응답 정착)

직전 보류 사이클 MCP 호출 응답 2건:

| Call | corp_code | corp_name | 응답 |
|---|---|---|---|
| V3-1 | 00135795 | 신도리코 | CLEAN, yearly_data 5건 정합 — op_profit/op_cf/inv_cf/fin_cf/oi_cf_ratio 5 필드 모두 non-null |
| V3-2 | 00525934 | LX세미콘 | CLEAN, yearly_data 5건 정합 — 룰 1 미트리거 (null path 미cover) |

본 사이클 V3 재호출 0 (handler deterministic). **V3 PASS ✓**.

### V3 미cover 본문

- 룰 1 트리거 케이스 (op_profit null entry) 미cover — 후속 사이클 또는 18(iii) 재실행 시 보강 가능

---

## V4 — dividend_check 단독 정합 (직전 사이클 응답 정착)

직전 보류 사이클 MCP 호출 응답 2건:

| Call | corp_code | corp_name | 응답 |
|---|---|---|---|
| V4-1 | 00490151 | 파트론 | grade A, 5년 series 정합, metrics 5 필드 모두 ≠ 0, interpretation_notes ≥ 1건 |
| V4-2 | 00305297 | 코텍 | grade N/A Path 2 확정 — series 4년 + metrics 계산값 + notes 2건 |

본 사이클 V4 재호출 0. **V4 PASS ✓**.

### V4 Path 식별 정착 (학습 28 가치 본문)

- Path 1 (`series.length === 0` + `years_of_dividend === 0` + `notes.length === 1`) — 본 사이클 미cover (배당 이력 0 케이스 부재)
- **Path 2** (`series.length > 0 && < 5` + `years_of_dividend > 0` + `notes.length >= 1`) — 코텍으로 cover ✓ → 부분적 배당 이력 visibility 정합

---

## V5 — 7부 B/E user-facing 의사결정 정합

V1~V4 응답 본문 분석. 별도 호출 없음.

### V5-A (7부 B — 학습 31)

V1 + V2 정합으로 scan_execute candidates[] 본 cashflow.yearly_data 5년 본문 노출 정합:
- op_profit ↔ op_cf gap 식별 가능
- inv_cf (capex) 자본 지출 패턴 식별 가능
- fin_cf (배당/차입) financing 패턴 식별 가능
- oi_cf_ratio 5년 추이 "수치 vs 사실" 정합 검증 가능

→ scan_execute 1회 호출 본 cashflow_check 단독 재호출 강제 없음 정착.

### V5-B (7부 E — 학습 28)

V1 + V4 정합으로 scan_execute candidates[] 본 dividend.metrics + series + interpretation_notes 본문 노출 정합:
- avg_dividend_yield 진입 가격대 1차 판단
- recent_cut grade override red flag 식별
- series yield 추세 저점/고점 정합 식별
- interpretation_notes multi-signal 조합 회수

→ scan_execute 1회 호출 본 dividend_check 단독 재호출 강제 없음 정착.

### V5 PASS

V1+V2+V3+V4 모두 PASS → **V5 자동 PASS ✓**.

---

## 검증 결과 종합

| V | PASS/FAIL | 수단 |
|---|---|---|
| V1 | PASS ✓ | 정적 코드 path (scan-execute.ts:176-194, 466-500, 491-493, 514, 525-545, 622) + scan-enrich.test.ts S2/S3 |
| V2 | PASS ✓ | 정적 코드 path (scan-execute.ts:153-166, 393-422, 415, 511) + scan-enrich.test.ts S1/S4 |
| V3 | PASS ✓ | 직전 사이클 응답 2건 (신도리코 / LX세미콘) 정합 정착, 재호출 0 |
| V4 | PASS ✓ | 직전 사이클 응답 2건 (파트론 / 코텍) 정합 정착, 재호출 0 |
| V5 | PASS ✓ | V1~V4 정합 결과 분석 정합 |

**5/5 PASS. 학습 28 + 학습 31 user-facing gap 제거 정착 ✓**.

상세 evidence: `docs/sagyeongin/verifications/2026-05-17-stage20-iii-redux-static.md`.

---

## 사이클 단계

| # | 단계 | 산출 | commit |
|---|---|---|---|
| 1 (보류) | 1단계 명세 신설 (가정 위반) | `00-scope.md` (df389df, 324 line) | df389df |
| 1 (정정) | **명세 정정 + verifications 신설** (본 단계) | 본 `00-scope.md` (정정본) + `verifications/2026-05-17-stage20-iii-redux-static.md` | main 직접 commit (Phase A) |
| 2 | 사이클 종결 매듭 | `docs/sagyeongin/CLAUDE.md` 갱신 + 단테 누적 + 학습 #24~26 정착 | main 직접 commit (Phase B knot) |

본 사이클 코드 변경 0 — feature branch 불필요.

## 학습 가드 (사이클 진행 중 적용)

| 학습 | 가드 |
|---|---|
| #1 | push 검증 — `git fetch origin` + commit hash 직접 확인 |
| #3 | line count 산수 사전 검증 |
| #18 | MCP 호출은 `sagyeongin-mcp` 등록 Claude Code 세션 — 본 사이클 MCP 호출 0 |
| #20 (Stage 20) | RW_MODE 명시 가드 |
| #21 (Stage 20) | 호출 입력 schema 직접 회수 가드 (보류 사이클 발견 본문 정착) |
| #22 (Stage 20) | ADR-0019 estimate cache hit 미반영 — 본 사이클 무관 (MCP 호출 0) |
| #23 (Stage 20) | 사이클 본질 가정 위반 시 보류 결정 — 본 사이클 정정 정합 (수단 전환만, 본질 충족) |
| #27 | 결정 ↔ 실행 분리 — Phase A (정정 명세 + verifications) ↔ Phase B (매듭) |
| #28 | stale working tree 가드 — `git status -b` 확인 + `git reset --hard origin/main` 동기화 후 진행 |

## noise 통제

19단계 entry prompt 가드 유지:
- "본격" 강조 부사 금지
- "본문" — 의미 있을 때만
- "영역" — 의미 있을 때만
- "정합" — 일치/맞춤 의미만
- "본 X 본 Y" 연속 패턴 금지

## 참조

- 보류 사이클 매듭: `cf47a64`
- 1단계 명세 (가정 위반): `df389df`
- 학습 28/31 origin: `docs/sagyeongin/scenarios/stage18-e2e/results/02-decision-flow.md` line 385-389
- 18 (iii) decision-flow: `docs/sagyeongin/scenarios/stage18-e2e/02-decision-flow.md`
- 19단계 commits: `dfbb87f`, `d110410`, `957e5eb`, `0fd10bd`, merge `77c2ac7`, knot `907b8a3`
- 본 사이클 evidence: `docs/sagyeongin/verifications/2026-05-17-stage20-iii-redux-static.md`

---

Ref: spec §V1~V5 (분기 E 정정본), philosophy 7부 B (수익은 수치, 현금흐름은 사실) + 7부 E (배당주 진입 인터페이스), 학습 28/31 (18 (iii) results §본 사이클 핵심 발견 5건 #1·#5), 19단계 knot `907b8a3`, 보류 사이클 매듭 `cf47a64`
