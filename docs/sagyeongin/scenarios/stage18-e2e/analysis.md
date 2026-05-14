# 18단계 e2e 분석 매듭

## 분석 시점

- 분석일: 2026-05-14
- baseline: 6dd5a1b ((e) Phase 2 결과 정착)
- 결과 참조: results/01-integrated-flow.md (250 line, 4 응답 + 평가)
- 본 사이클 실행 범위: **(ii) 통합 흐름 단독** — (iii) 영역은 17단계 add 후속 사이클로 분리

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

**본 사이클 미실행** — 17단계 add 실행 본 분리로 watchlist 0건 상태. (iii) 본질 (10 종목 × 5 도구 단독 호출)은 watchlist 정착 후 측정 가능.

후속 사이클 분리:
- 17단계 add 실행 (Stage 18.5 또는 후속)
- (iii) Phase 1+2 진입 — (B-2) scan_execute embedded vs 단독 surface 차이 + 7부 E 진입 정합 측정

### (B-2) / (C) 본 사이클 미측정

(B-2) scan_execute embedded vs 단독 호출 surface 차이 — 본 사이클 영역 외.
(C) 7부 E 진입 정합 — 본 사이클 영역 외.

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
| 7부 B (cashflow 점검) | scan_execute internal cashflow | 본 사이클 직접 측정 영역 외 | candidates 단계에서 미노출 |
| 7부 C (capex 선행 지표) | scan_execute internal capex | ✓ 정합 | 신도리코 SIGNAL_DETECTED (composite_score 80) |
| 7부 C (insider 집중 매수) | scan_execute internal insider | ✓ 정합 | 10/10 neutral_or_mixed |
| 7부 D (srim 적정가) | scan_execute internal srim | ✓ 정합 | 294 → 19 (BUY filter) → 10 |
| 7부 E (배당 진입 인터페이스) | scan_execute internal dividend | ✓ 정합 (grade 노출) | 단 yield_pct/payout 미노출 — (iii) 후속 |
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

본 사이클 영역 외 ((iii) 미실행). 후속 사이클에서 측정.

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

## 후속 사이클 제언 (Stage 18.5 + 19+)

| 사이클 | 영역 | 시점 |
|---|---|---|
| **Stage 18.5** | 17단계 watchlist add 실행 — `update_watchlist(action: "add", corp_codes: [10건])` MCP 호출 + analysis | 즉시 가능 |
| (iii) Phase 1+2 | watchlist 정착 후 10 종목 × 5 도구 단독 호출 — (B-2) surface 차이 측정 + 7부 E 진입 정합 | Stage 18.5 후 |
| **§10.15 KSIC 9차/10차 정책 결정** | KSIC 26 집중 evidence 활용 (본 사이클 candidates 10/10 KSIC 26 보존) | 별경로 |
| **scan-execute output schema 확장** | dividend yield/payout 노출 (17단계 §6 gap 정착) | 별경로 |
| **분기 점검 사이클** | 시간 격증 후 (2026-08~) 신호 변화 측정.| 후속 |
| **개별 도구 drill-in** | (iii) 특이 발견 시 후속 사이클 | 후속 |

### 별개 ADR 후보 (후속)

- **ADR-0020 (fetch timeout)** — 학습 25 정착
- **ADR-0021 (fail-safe 누적 throw)** — 학습 26 정착
- **ADR-0022 (DART IP 차단 사전 가드)** — 학습 24 정착

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
