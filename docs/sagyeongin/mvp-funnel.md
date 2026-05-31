# MVP funnel — 사용자 설계 의도

## 배경

본 fork (`OneVth/korean-dart-mcp`) = 사경인 7부 투자 철학 기반 한국 주식 screening MCP server. 사용자 설계 의도 = **한 번에 한 종목씩 작업 외** — batch screening → watchlist 좁히기 → 단일 종목 분석 4단계 funnel.

## 4단계 funnel

| # | 단계 | 내용 | 도구 매핑 |
|---|---|---|---|
| 1 | **취향 설정** | 사용자 선호 / 비선호 induty (KSIC) 등록 — whitelist + blacklist | `sagyeongin_user_preference` **(Stage 30.2 정착 — 2026-05-26)** |
| 2 | **섹션 전수조사** | induty whitelist 매칭 corp 전수 → screening (killer/cashflow/capex/insider/srim/dividend 단계별 매칭) | `sagyeongin_scan_execute` (induty 필터 추가 인계) |
| 3 | **대화 funnel** | Claude 영역 단계별 대화 + 사경인 도구 호출 + 관심 종목 선별 | MCP client (Claude Desktop 등) 책임. 단, 한도 초과 시 도구가 `mode:"preview"` 구조화 견적 반환 — client가 options를 사용자에게 펼쳐 선택받아 재호출 (ADR-0030) |
| 4 | **단일 종목 분석** | 관심 종목 정밀 분석 — watchlist_check + 사경인 도구 통합 호출 | `sagyeongin_watchlist_check` + 기존 도구 sequential |

## 단계별 책임 분리

| 단계 | MCP 도구 책임 | Claude (LLM) 책임 |
|---|---|---|
| 1 | preference 저장 + 회수 | 사용자 입력 induty 정합 검증 |
| 2 | screening 산출 (corp 분포 + 도구 결과) | 산출 해석 + 단계별 매칭 |
| 3 | 단계별 도구 호출 (single corp). 한도 초과 시 scan_execute `mode:"preview"` 응답 → options 제시 → 사용자 선택 → 재호출 | 대화 진행 + 사용자 의도 회수 + 선별 |
| 4 | watchlist_check + 사경인 도구 호출 | 통합 해석 + 투자 판단 보조 |

## 7부 정합

| 단계 | 7부 정합 |
|---|---|
| 1 | **7부 A (사전 솎아내기)** — induty 영역 제외 / 선호 본질 |
| 2 | **7부 A + B + C** — killer (A) + cashflow (B) + capex (C) 영역 전수 매칭 |
| 3 | **7부 C + D + E** — capex (C) + srim (D) + dividend (E) 영역 단계별 대화 |
| 4 | **7부 전체** — watchlist_check 통합 + 단일 corp 정밀 |

## MVP 단계 분리

| MVP | 본질 |
|---|---|
| **M1** | 1단계 정착 — `sagyeongin_user_preference` 도구 신설 + persistence: `~/.sagyeongin-dart/user-preference.json` (정착 2026-05-26) |
| M2 | 1+2단계 — M1 + scan_execute induty 필터 추가 |
| M3 | 1+2+3단계 — M2 + 대화 funnel 사용 패턴 정착 (Claude client 영역) |
| M4 | 전체 — M3 + 단일 종목 분석 정밀화 |

## 사이클 인계

| Stage | MVP 단계 | 본질 |
|---|---|---|
| Stage 30.2 (ε) | **M1** | `sagyeongin_user_preference` 도구 정착 — 완료 (2026-05-26). M2 결판 baseline: M1 실측 사용 사후 사용자 결판 |
| Stage 30.3+ | M2~M4 | M1 실측 사용 사후 결판 (학습 #8 정합 — 사전 추정 외 실측 baseline) |

## ADR-0030 대화 루트 (Stage 32 정착)

`sagyeongin_scan_execute`가 한도 초과(`usage_pct > 100`)를 감지하고 사용자 신호(`scope_confirmed` 또는 `allow_over_daily_limit`)가 없으면, throw 대신 `mode:"preview"` 구조화 견적을 반환한다(**대화 루트**). 응답에는 lever 3개(`options`: narrow_scope / accept_limit / warm_cache)가 구조화 객체로 포함되며, 각 lever에 재호출 인자(`recall_args_hint`)가 함께 제공된다.

이로써 도구가 대화 매듭을 **강제**한다 — 도구 책임 = "신호 없으면 못 멈추고 못 간다(제어 흐름)". MCP client 책임 = options를 사용자에게 펼쳐 선택을 받아 재호출. `scope_confirmed=true`는 사용자가 명시적으로 완주를 선택한 경우에만 주입(client 임의 주입 시 7부 책임 client).

## 학습 정합

- **학습 #8**: 명세 가정 vs 실측 어긋남. M1 단독 정착 + 실사용 → M2 결판 본질 = 사전 추정 외 실측 우선 정합.
- **학습 #3**: calibration 철학 + 코드 균형. 각 사이클 entry prompt 영역 MVP 본질 + 도구 본질 양쪽 검증.

---

Ref: 사용자 설계 의도 (Stage 30.2 entry 진입 사전 식별), spec § 사용자 선호 (신설 인계), 7부 A/B/C/D/E, 학습 #3 + #8, ADR-0030 (Stage 32).
