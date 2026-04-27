# Korean DART MCP — 사경인 도구

[korean-dart-mcp](https://github.com/chrisryugj/korean-dart-mcp) (MIT) fork.
사경인 회계사 투자 철학을 바탕으로 한국 주식 스크리닝/점검 도구 11종을 추가한다.

원본의 도구 15종은 그대로 유지된다 (격리 원칙, [ADR-0001](docs/sagyeongin/adr/0001-fork-isolation-strategy.md)).

## 무엇

원본 korean-dart-mcp는 OpenDART API를 일반 도구로 래핑한 MCP 서버다.
이 fork는 그 위에 **투자 의사결정 단계의 룰과 공식**을 도구화한다 — 무엇을 사지 말지(killer), 얼마면 사도 되는지(S-RIM), 분기마다 무엇을 점검할지(watchlist), 시장 전체를 어떻게 훑을지(scan).

## 왜

사경인 회계사의 투자 원칙은 룰의 모음이다. 사람이 매 분기 손으로 적용하면 실수와 과로가 누적된다. 도구화하면:

- 룰이 일관되게 적용된다 (감정 / 피로 / 편향 제거)
- 시간이 절약된다 (사경인 5부 "시간 들이지 않기")
- 검증 가능하다 (도구 출력이 결정의 흔적으로 남는다)

이 fork의 목표는 **사경인 책/강의에서 명문화된 룰을 도구화**하는 것이다. 새 투자 철학을 만들지 않는다.

## 도구 11종

| # | 도구 | 철학 | 역할 |
|---|---|---|---|
| 1 | `sagyeongin_killer_check` | 7부 A | 재무 + 공시 통합, 상폐 위험 binary 판정 |
| 2 | `sagyeongin_cashflow_check` | 7부 B | 현금흐름 위험 신호 태깅 |
| 3 | `sagyeongin_capex_signal` | 7부 C | 유형자산 양수 결정 + 기존 사업 일치 판정 |
| 4 | `sagyeongin_required_return` | 7부 D-2 | 한국신용평가 BBB- 5년 채권 수익률 조회 (K값) |
| 5 | `sagyeongin_srim` | 7부 D-2 | S-RIM Buy/Fair/Sell 트리플 가격 |
| 6 | `sagyeongin_dividend_check` | 7부 E | 배당성향 추이 + 지속 가능성 평가 |
| 7 | `sagyeongin_scan_preview` | 배치 Phase 1 | 스캔 범위 확정 (API 거의 0) |
| 8 | `sagyeongin_scan_execute` | 배치 Phase 2 | 시장 스캔 실제 실행 |
| 9 | `sagyeongin_watchlist_check` | 배치 | 관심 종목 분기 점검 |
| 10 | `sagyeongin_update_watchlist` | (관리) | 관심 종목 추가/제거/조회 |
| 11 | `sagyeongin_update_scan_preset` | (관리) | 스캔 프리셋 저장/수정 |

각 도구의 input/output/공식/룰 정의는 [spec](docs/sagyeongin/sagyeongin-dart-agent-spec.md) §10 참조.

## 진입 흐름

| 독자 | 시작 |
|---|---|
| 사용자 (인간) | 이 파일 → [철학](docs/sagyeongin/sakyeongin_philosophy.md) → [spec](docs/sagyeongin/sagyeongin-dart-agent-spec.md) |
| 새 Claude 세션 | [docs/sagyeongin/CLAUDE.md](docs/sagyeongin/CLAUDE.md)부터 |
| 결정 근거 | [docs/sagyeongin/adr/README.md](docs/sagyeongin/adr/README.md) |

## 진행 상태

현재 개발 중. 상세 진행과 자주 막히는 곳은 [docs/sagyeongin/CLAUDE.md](docs/sagyeongin/CLAUDE.md)의 "진행 상태" / "자주 막히는 곳" 섹션 참조.

MVP 완성 시점에 `v0.1.0-sagyeongin` 태그가 부여된다 ([ADR-0002](docs/sagyeongin/adr/0002-branch-strategy.md)).

## 라이선스

원본 [korean-dart-mcp](https://github.com/chrisryugj/korean-dart-mcp)와 동일한 MIT 라이선스.
