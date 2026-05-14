# 18단계 e2e 분석 매듭

## 분석 시점

- 분석일: 2026-05-14
- baseline: 6dd5a1b ((e) Phase 2 결과 정착)
- 결과 참조: results/01-integrated-flow.md (250 line, 4 응답 + 평가)
- 본 사이클 실행 범위: **(ii) 통합 흐름 + (iii) 사용자 의사결정 흐름** — (iii)는 Stage 18.5 (watchlist add 실행) 후 진입

---

## (ii) 통합 흐름 분석

### (A) PASS/FAIL 종합

| 단계 | 도구 | PASS/FAIL | 비고 |
|---|---|---|---|
| [1] | scan_preview | ✓ PASS | daily_limit_usage_pct 163.2% 사전 노출 |
| [2] | scan_execute | ✓ PASS | candidates 10건, 2,732 DART 호출 hang 없이 완주 |
| [3] | update_watchlist list | ✗ FAIL | total 0 (기대 10) — 17단계 결정/실행 분리 |
| [4] | watchlist_check full | ✗ FAIL | total 0 ([3]의 직접 결과) |

### (B) 가독성 종합

- **scan_preview**: preset/universe/daily_limit 한눈 파악 ✓ — `daily_limit_usage_pct: 163.2` 사전 인지 가능
- **scan_execute**: candidates 10건 composite_score DESC 정합 ✓ — pipeline_stats funnel (3964→294→78→19→10) + external_call_stats (DART 2732 / Naver 78) 직관
- **update_watchlist list**: corp_name + added_at + tags 부재 (watchlist 0건)
- **watchlist_check full**: summary schema valid (0건도 명시적), 실측 영역 부재

노트: [1]/[2] 응답이 *7부 F UX 전제* 직관 — 사용자가 universe + filter 효과 + funnel 한눈 파악. [3]/[4] FAIL은 도구 동작 어긋남 X — 환경 config 미반영 (17단계 결정/실행 분리).

### 단계 간 정합

- **[3] ↔ [4] corp_code 완전 일치**: ✓ (양쪽 0건 정합)
- **[2] ↔ [3] 교집합** (시간 격증 — 동일 보장 X):
  - 공통: 0건
  - [2]만: 10건 (scan_execute 결과)
  - [3]만: 0건 (watchlist 미정착)
- **induty KSIC 26 분포 보존**: [2] candidates 10/10 KSIC 26 ✓ — included_industries 필터 정합

---

## (iii) 사용자 의사결정 분석

Stage 18.5 (`bca2af3`) watchlist 정착 후 50 MCP 호출 실행 (10 종목 × 5 도구). 결과 상세는 `results/02-decision-flow.md` 참조.

### 50 cell PASS/FAIL

- (A) 50/50 PASS ✓ — 에러 0건, ADR-0018 미발동, T4 입력 어긋남 가드 정상

### (B) 가독성 종합

- T1 srim: verdict + prices 4개 한눈 파악 ✓
- T2 cashflow: verdict + concern_score 압축 (단 yearly_data 부재)
- T3 capex: signal + evidence 풍부 ✓
- T4 insider: signal + cluster_quarter + quarterly_clusters 풍부
- T5 dividend: grade + metrics + 5년 series 풍부 ✓

### (B-2) scan_execute embedded vs 단독 surface 차이 — 본 사이클 핵심

| 도구 | 단독 호출 추가 노출 | (B-2) 가치 |
|---|---|---|
| T1 srim | `inputs` (equity/ROE/K/shares) + `roe_method` + `gap_to_buy/sell` | 중 |
| T2 cashflow | (없음 — 명세와 어긋남, schema 확장 후보) | 약 |
| T3 capex | `evidence.dart_reference` + `amount` + `equity_ratio` + `existing_business_match` | **강** |
| T4 insider | `quarterly_clusters[*].reporters[*]` (name/change/report_resn) | **강** |
| T5 dividend | `metrics` (4 필드) + 5년 `series` + `interpretation_notes` | **강** |

### (C) 7부 E 진입 정합 — 8/10 명확

- 파트론·파이오링크 (A 등급): 배당 + srim 정합, 진입 최적
- 신도리코: capex SIGNAL + DART 원문 진입 경로
- 아이디피: 고ROE → srim K 보정 진입
- 씨유테크: sell 직전 → 7부 A killer 재점검 진입
- LX세미콘: ROE = K → P/B 또는 DCF 진입
- 삼영전자공업: 배당 110.6% → 지속성 분석 진입
- 인탑스·세진티에스: 저ROE → srim 신뢰도 의문

### 본 사이클 핵심 발견 5건

1. **17단계 §6 dividend gap 정확 확인** — T5 `metrics` + `series` 5년이 scan_execute에서 부재 (`grade`만). **scan-execute schema 확장 후보** → 학습 28
2. **아이디피 fair > buy 역전** — 고ROE (15.43%) + K 10.54%. srim K 보정 필요 → 학습 29 후보
3. **insider cluster_threshold 본질 어긋남** — *시간 분산 단일 매수자* (아이디피 6분기 / 코텍 매수자 1) 패턴이 *threshold=2 미달*로 미신호 처리. **philosophy 7부 C 재정정 후보** → 학습 30
4. **T3 capex `dart_reference`** — 신도리코 `20250930000475` 노출. 7부 C 선행 지표 원문 추적의 핵심 본문 (B-2 최대 가치)
5. **T2 cashflow `yearly_data` 부재** — 명세 vs 실제 어긋남. T2 단독 호출 schema 확장 후보 → 학습 31

---

## 17단계 baseline 비교

| 지표 | 17단계 baseline | 본 사이클 [2] candidates | 변화 |
|---|---|---|---|
| candidates 총 | 10 | 10 | 동일 |
| srim BUY | 10/10 | 10/10 | 동일 |
| cashflow CLEAN | 10/10 | 미노출 (scan_execute 직접 verdict 미노출) | 측정 영역 외 |
| capex SIGNAL_DETECTED | 1/10 (신도리코) | 1/10 (신도리코) | **동일** |
| insider neutral | 10/10 | 10/10 (모두 `neutral_or_mixed`) | 동일 |
| dividend D | 7/10 | 4/10 (신도리코·삼영전자공업·인탑스·파트론?) | **drop** |
| dividend A | 2/10 (파트론·파이오링크) | 1/10 (파트론) — 파이오링크 drop | **drop** |
| dividend N/A | 1/10 (코텍) | 4/10 (엠투엔·인터엠·코텍·기산텔레콤) | **증가** |

**candidates 본 사이클 vs 17 baseline**:
- 재출현 5건: 신도리코, 삼영전자공업, 인탑스, 파트론, 코텍
- 본 사이클 신규 5건: 에이텍모빌리티, 토비스, 엠투엔, 인터엠, 기산텔레콤
- 17만 (drop) 5건: 세진티에스, 씨유테크, LX세미콘, 아이디피, 파이오링크

**신호 변화 유무** (분기 점검 본질):
- capex 신도리코 SIGNAL_DETECTED 유지 — 7부 C 보존 ✓
- srim BUY 영역 — 본 사이클 candidates 10건 모두 BUY (17 동일)
- **본 비교는 *시간 격증 신호 변화* X — universe drift** (3607 → 3964, +357) — random_seed=42 동일 단 universe 변화 시 결정론 영역 어긋남. ADR-0015 B1 영역 외 — 별경로 학습.

---

## 7부 영역별 정합 평가

| 영역 | 도구 | 정합 / 어긋남 | 비고 |
|---|---|---|---|
| 7부 A (killer 사전 솎아내기) | scan_execute internal killer | ✓ 정합 | 78건 pass (294 → 78) |
| 7부 B (cashflow 점검) | cashflow_check 단독 호출 | ✓ 측정 — 10/10 CLEAN (concern_score 0) | yearly_data 부재 (명세 어긋남) — 학습 31 후보 |
| 7부 C (capex 선행 지표) | scan_execute internal capex | ✓ 정합 | 신도리코 SIGNAL_DETECTED (composite_score 80) |
| 7부 C (insider 집중 매수) | scan_execute internal insider | ✓ 정합 | 10/10 neutral_or_mixed |
| 7부 D (srim 적정가) | scan_execute internal srim | ✓ 정합 | 294 → 19 (BUY filter) → 10 |
| 7부 E (배당 진입 인터페이스) | dividend_check 단독 호출 | ✓ 명확 측정 — `metrics` + 5년 `series` 풍부 | 17단계 §6 gap 정확 확인 (scan_execute는 grade만) |
| 7부 F (scan 스코프 — 10개 내외) | scan_preview/execute | ✓ 정합 | candidates 10건 + included_industries 필터 |

---

## 사이클 종합 판정

### (A) 도구 동작 검증

| 영역 | 결과 |
|---|---|
| ADR-0017 inter-call delay | ✓ 검증 — 2,732 호출 hang 없이 완주 |
| ADR-0018 html_response_block | DART 정상 — throw 발동 X (정상 path 정합) |
| ADR-0019 pre-check | ✓ 검증 — included_industries 적용 시 통과, 부재 시 throw 예고 (실측 별경로) |
| scan_execute pipeline | ✓ 정합 — funnel 4 단계 정상 |
| update_watchlist list | ✓ 동작 정상 (단 watchlist 0건 — 환경 영역) |
| watchlist_check full | ✓ 동작 정상 (단 results 0건 — [3] 직접 결과) |

→ **도구 동작 영역 14/14 정상**. FAIL [3]/[4]는 도구 어긋남 X — 환경 config 미반영.

### (B) 7부 E 진입 인터페이스

본 사이클 측정 완료. 50 호출 결과 — (B-2) 단독 호출 surface 차이 명확:
- T3 capex `dart_reference` (원문 view) + T5 dividend `series` 5년 — 본 사이클 최대 가치
- 7부 E 진입 8/10 종목 명확 (파트론·파이오링크 최적, 아이디피·신도리코·씨유테크 분석 진입)
- 17단계 §6 dividend gap 정확 확인 — scan-execute schema 확장 후보

### 분기 점검 신호 변화

본 사이클 *측정 불가* — 17단계 baseline이 환경에 미정착, 비교 baseline 부재. 단 [2] candidates의 17 baseline 부분 일치 (5/10)는 *universe drift*이며 분기 점검 신호 변화 영역 아님.

### 핵심 발견 — 17단계 결정/실행 분리

본 사이클 발견:

1. **17단계 결정 매듭 (`2fa52c2`)은 결정 commit 단독** — `update_watchlist(add)` MCP 호출은 별경로 실행 예정이었으나 *미실행 또는 분리 세션*
2. **18-e2e 명세 (`01-integrated-flow.md`, `02-decision-flow.md`)는 "17단계 watchlist 전제"로 작성** — 전제 부정
3. **학습 #21 (Phase 분리) 본질 동일** — 명세/결정 ↔ 실행 호출 분리

→ 17단계 add 실행은 별개 후속 사이클 (Stage 18.5).

---

## 학습 정착

본 사이클 학습 7건 (#21 4차 재발 포함):

### 학습 21번 — Phase 분리 가드 (4차 재발 본 사이클 정착)

학습 #18 (16(c)) → 학습 21 (본 사이클 (b) 단계) → 본 사이클 4차 재발:

- Phase 1 (MCP 호출 / 분석) ↔ Phase 2 (file 채움 + git) 분리 본질
- 단일 위임에 MCP 호출 + commit 합치면 클라이언트 자체 판단 영역 발생
- 본 사이클 (e) Phase 1 실행 중 Claude Code가 `results/01` 편집 진입 — 위임 외 작업 발생

**가드**: 위임 명세에 `git X / 파일 X / commit X / push X / 별경로 사전 정착 X` 표 명시 + Phase 분리 본질 명시.

### 학습 22번 — 위임 클라이언트 명시 가드

본 사이클 (e) Phase 1 위임 클라이언트 명시 (`korean-dart-mcp` 등록 본 필수 + Plan mode 비활성)로 정상 동작. 위임 헤더에 클라이언트 명시 가드 정합.

### 학습 23번 — 회신 해석 가드

직전 사용자 회신을 *향후 의도* vs *현재 셋업 완료*로 분리 해석. Onev "mcp는 claude code에서 실행시킬거야" → 향후 의도 (등록 미완) — 본 사이클 1차 관찰 후 정착.

### 학습 24번 — DART 차단 pre-check 가드

ADR-0017 회피 정책은 *신규 호출* 본 — *이미 차단된 IP* 별개. 사이클 진입 사전 `curl -I` 가드 정착. ADR-0019 (daily_limit_usage_pct pre-check) + 별경로 IP 차단 pre-check 본 분리 영역.

### 학습 25번 — fetch timeout 정착 가드

ADR-0017/0018에 정착 안 됨 — 본 사이클 hang 56분은 timeout 부재 영향. Node fetch timeout N초 정착은 별개 ADR 후보 (별경로).

### 학습 26번 — killer-check fail-safe 차단 환경 부작용

차단 환경에서 silent SyntaxError → fail-safe → 전 corp PASS → runaway loop. ADR-0018 (wrapper SyntaxError 변환)으로 silent 영역 차단. fail-safe 본 정책은 ADR-0018 후 effective. 단 fail-safe 누적 throw 정책은 별개 ADR 후보.

### 학습 27번 — 결정/실행 분리 가드 (본 사이클 핵심 발견)

본 사이클 발견 정착:

- 17단계 결정 매듭 (`2fa52c2`)은 *결정 단독 commit* — MCP 호출 본 분리
- 18-e2e 명세가 "17단계 watchlist 전제"로 작성됐으나 실행 본 미정착
- 결정 commit은 코드 변경 0 / 측정 X — 단 *실행 호출* 본 별개 단계

**가드**:
1. 결정 매듭 commit에 *실행 호출 분리* 명시 (사용자 액션 필수)
2. 후속 사이클 진입 시 *전제 환경 본 검증* (e.g. `update_watchlist list`로 사전 확인)
3. Stage X 결정 + Stage X.5 실행 본 분리 패턴 정착

학습 #21 (Phase 분리) 본질 동일 — 단 *commit 영역*까지 확장.

### dividend_check 진입 프롬프트 정정

18단계 진입 프롬프트의 사경인 도구 14건 표에서 `dividend_check`가 E 행에서 누락. 정정 영역:

```
| E (정밀 분석) | dividend_check + 수동 영역 | ✓ (배당 sub-area) + — |
```

본 entry prompt은 *세션 opener* — fork artifact 외. 단 본 분석 매듭에 정정 기록 정착.

---

## 후속 사이클 제언 (19+)

본 사이클 ((ii) + Stage 18.5 + (iii)) 종결 후 후속 후보:

| 사이클 | 영역 | 시점 |
|---|---|---|
| **scan-execute output schema 확장** | T5 dividend (`metrics` + `series`) + T2 cashflow (`yearly_data`) 추가 노출 — 학습 28/31 정착 | 1순위 |
| **ADR-0023 srim K 보정** | 고ROE 종목 (아이디피) fair > buy 역전 정책 — 학습 29 후보 | 2순위 |
| **philosophy 7부 C 재정정** | insider cluster_threshold *동시* vs *시간 분산* 분리 — 학습 30 후보 | 2순위 |
| **ADR-0020 (fetch timeout)** | 학습 25 정착 | 별경로 |
| **ADR-0021 (fail-safe 누적 throw)** | 학습 26 정착 | 별경로 |
| **ADR-0022 (DART IP 차단 사전 가드)** | 학습 24 정착 | 별경로 |
| **§10.15 KSIC 9차/10차 정책 결정** | KSIC 26 집중 evidence 활용 | 별경로 |
| **분기 점검 사이클** | 시간 격증 후 (2026-08~) 신호 변화 측정 | 후속 |
| **개별 도구 drill-in** | (iii) 특이 발견 (씨유테크 sell 직전, 삼영전자공업 110.6% 등) | 후속 |

### 사이클 핵심 종결

| 차원 | 결과 |
|---|---|
| commit chain | 18단계 8건 + Stage 18.5 1건 + (iii) Phase 2 1건 = 10건 |
| 단테 누적 | 226 (+7) |
| MCP 호출 | (ii) scan_execute 1 + Stage 18.5 add 1 + (iii) 50 = 52건 |
| β-i 정합 | ✓ `src/lib/` 0 변경 |
| 검증 ADR | ADR-0017/0018/0019 정상 동작 |
| 핵심 발견 | 학습 27 (결정/실행 분리) + 학습 28~31 후보 ((iii) (B-2) 어긋남) |

---

## 본 사이클 최종 정착

| 영역 | 결과 |
|---|---|
| (ii) 통합 흐름 PASS/FAIL | [1]/[2] PASS + [3]/[4] FAIL (환경 영역) |
| ADR 검증 | ADR-0017/0018/0019 정상 동작 ✓ |
| 단테 누적 | 226 (+7 본 사이클) |
| β-i 정합 | ✓ `src/lib/` 0 변경 |
| 핵심 발견 | 17단계 결정/실행 분리 — 학습 27번 |
| 사이클 종결 | analysis.md 매듭 후 매듭 commit 정착 |

---

Ref: 18단계 진입 매듭 db199df, 템플릿 정착 매듭 62a15fc, (e) 결과 정착 6dd5a1b, 17단계 결정 매듭 2fa52c2, ADR-0017/0018/0019, philosophy 7부 F + E + A + B + C + D
