# 18단계 e2e 테스트 사이클 — 본질 + 스코프 + 측정 본문

## 사이클 시점

- 진입일: 2026-05-14
- baseline: main HEAD `e26dbbf` (17단계 §6 정정 매듭)
- TOOL_REGISTRY: 29 (사경인 14)
- 단테 누적: 219
- 본 사이클 본질: *Real use case e2e 측정 사이클* (코드 변경 X 가능, 측정 X 정합)

## 본 사이클 본질

사경인 14개 도구 + 6개 오케스트레이션 영역의 **실제 사용 흐름** 본격 측정. 시간 격증 없는 영역 (분기 점검 신호 변화는 Stage 19+, 2026-08~ 사이클) — 본 사이클은 **도구 자체 흐름** + **사용자 의사결정 본문** 측정.

## 측정 본문 영역 (양쪽)

| 영역 | 본문 | 측정 기준 |
|---|---|---|
| **(A) PASS/FAIL** | 도구 호출이 spec 정합 응답 본문을 반환하는가 | error 부재 + schema 정합 + 핵심 필드 본문 존재 |
| **(B) 출력 가독성/의사결정** | 사용자가 출력을 읽고 *7부 E 진입 결정*을 내릴 수 있는가 | 핵심 verdict 명확성 + 근거 추적 가능성 + 의사결정 본문 정합 |

→ (A)는 도구 동작 영역, (B)는 7부 E 진입 인터페이스 영역.

## 시나리오 본문 영역 — (ii) + (iii)

### (ii) scan→watchlist→check 통합 흐름 (`01-integrated-flow.md`)

**본질**: end-to-end 오케스트레이션 검증. 단일 사이클로 candidates 도출 → watchlist 정착 → 분기 점검까지 본문 정합 확인.

**호출 chain**:
```
scan_preview → scan_execute → update_watchlist → watchlist_check
```

**측정 본문**: (A) 각 단계 응답 본문 + (B) 단계 간 ID/필드 본문 정합 (corp_code, induty 등).

**주의**: 본 사이클은 *17단계 watchlist 영역 보존* — `update_watchlist`는 기존 watchlist 변경 X 영역으로 호출 (e.g. dry_run 또는 별개 list 본문). 결정은 17단계에서 종결.

### (iii) 사용자 의사결정 흐름 (`02-decision-flow.md`)

**본질**: 17단계 watchlist 10개 종목 × 사경인 본격 도구 (srim/cashflow_check/capex_signal/insider_signal/dividend_check) **단독 MCP 호출** → 출력 본문 사용자 가독성 + 의사결정 정합 본격 측정.

**측정 본문**:
- (A) 각 단독 호출 PASS/FAIL
- (B) **scan_execute batch 출력 vs 단독 MCP 호출 출력의 본문 차이** — 단독 호출은 별개 사용자 surface (코드/구조 미세 정합 영역). scan_execute 내부 function call ≠ MCP 외부 호출.

**드릴 영역**:
- srim: prices.{current_price, fair_value_per_share, valuation_gap_pct} + verdict + assumptions
- cashflow_check: concern_score + signals 본문
- capex_signal: opportunity_score + top_signals 본문
- insider_signal: signal + cluster_quarter 본문
- dividend_check: grade + payout 본문 + (16(c) scan-execute schema 미노출 영역의 단독 호출 정합 확인)

### (i) 개별 도구 단독 흐름 — 본 사이클 영역 X

(i) per-tool 단독 호출은 (iii)의 부분 본문으로 자연 포함 (5개 본격 도구). 별개 영역 정착 X — 후속 사이클 drill-in 영역 (해당 시).

## 측정 대상 종목

**17단계 watchlist 10개** (KSIC 26 cluster, 16(c) scan-execute 도출):

| rank | corp_code | corp_name | corp_cls | induty | composite | srim gap | capex |
|---|---|---|---|---|---|---|---|
| 1 | 00135795 | 신도리코 | Y | 263 | 80 | -38.77 | SIGNAL_DETECTED |
| 2 | 00127200 | 삼영전자공업 | Y | 26291 | 0 | -10.69 | NO_SIGNAL |
| 3 | 00406727 | 세진티에스 | K | 26211 | 0 | -40.71 | NO_SIGNAL |
| 4 | 00226866 | 인탑스 | K | 2642 | 0 | -17.23 | NO_SIGNAL |
| 5 | 00575106 | 씨유테크 | K | 26224 | 0 | -42.49 | NO_SIGNAL |
| 6 | 00525934 | LX세미콘 | Y | 2612 | 0 | -9.58 | NO_SIGNAL |
| 7 | 01213586 | 아이디피 | K | 26329 | 0 | -18.51 | NO_SIGNAL |
| 8 | 00490151 | 파트론 | K | 2629 | 0 | -17.37 | NO_SIGNAL |
| 9 | 00492353 | 파이오링크 | K | 26410 | 0 | -10.07 | NO_SIGNAL |
| 10 | 00305297 | 코텍 | K | 26519 | 0 | -31.17 | NO_SIGNAL |

**근거**:
- 연속성 — 17단계 결정 영역 본격 정합
- 자격 동등 — 7부 F "10개 내외" + D 2단계 srim BUY + A killer PASS + B cashflow CLEAN
- KSIC 26 100% 집중 — induty cluster 본문 정합 (Stage 19+ §10.15 정책 결정 후속)

## 철학 영역 정합

| 영역 | 본문 |
|---|---|
| **7부 F (스코프)** | 본 사이클의 *UX 전제* 영역 — 10개 × 분기/반기 점검 패턴이 측정 스코프 본문 ("매주/매월 분석" 영역 X). 본 사이클은 7부 F 본질 X — 7부 F가 검증 대상 영역 (도구가 F UX 전제를 지원하는가) |
| **7부 E (정밀 분석)** | 본 사이클은 *7부 E 진입 인터페이스* 영역 — 도구 깔때기 통과 후 사용자가 E 영역 수동 분석 진입 가능성 본격 측정. E 자체 영역 X (E는 candidate 통과 후 별개 수동 영역) |
| **7부 A/B/C/D** | 본 사이클 도구 호출의 본질 영역 — killer/cashflow/capex/insider/srim 각각 A/B/C/D 영역 본격 정합 |

## 실행 영역 — 혼합 본문

| 영역 | 주체 | 산출 |
|---|---|---|
| 시나리오 명세 작성 | Claude (본 web/mobile chat 세션) | `01-*.md`, `02-*.md` |
| MCP 도구 호출 실행 | Onev (MCP 등록 Claude 세션 — Claude desktop 등) | 도구 응답 본문 (JSON/text) |
| 결과 record 정착 | Onev (실행) → Claude (정리/포맷) | `results/0N-*.md` |
| 분석 매듭 | Claude (본 세션) | `analysis.md` |

학습 #18 정합 — MCP 도구 호출은 MCP 등록 Claude 세션 영역, 본 web/mobile chat 세션 + Claude Code 세션 X.

## 본 사이클 범위 외 (Stage 19+ 후속)

- **분기 점검 신호 변화 측정** — 시간 격증 후 (2026-08~) 본격 사이클
- **§10.15 KSIC 9차/10차 정책 결정** — KSIC 26 집중 evidence 본격 활용
- **scan-execute output schema 확장** — dividend yield/payout 노출 영역
- **D 3단계 컨센서스 도구 영역** — MVP 외 / 영구 보류 / 별개 ADR+spec 신설 영역
- **개별 도구 (i) drill-in 사이클** — 본 사이클 (iii) 측정 결과 본문 특이 발견 시

## 매듭 산출 (사이클 종결 시)

1. `README.md` + `00-scope.md` + `01-integrated-flow.md` + `02-decision-flow.md` (Claude 명세)
2. `results/01-*.md`, `results/02-*.md` (Onev 실행 결과)
3. `analysis.md` (Claude 분석 매듭)
4. CLAUDE.md `## 진행 영역` 갱신 + 18단계 cross-ref
5. 학습 정착 — 후보:
   - 학습 20번: 진입 프롬프트 작성 시 본 도구 14건 × 7부 매핑 *사전 정착 절차* (학습 5 → 17 → 본 영역 3차 재발 가드 강화)
6. 진입 프롬프트 dividend_check 정정 — entry prompt 영역 X (세션 opener) → 본 매듭 commit 동시 정착

---

Ref: ADR-0001 (β-i 격리), philosophy 7부 F + E + A + B + C + D, 17단계 매듭 `e26dbbf`
