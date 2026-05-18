# 위임 명세 작성 체크리스트

위임 명세 작성 시 단계별 사전 검증 본문 영역. 학습 누적 #1/#3/#16/#20/#23/#27/#28/#29/#30/#32/#33/#34/#35/#36 정합.

## 0단계 — 환경 영역 사전 grep (학습 #32 정합)

- [ ] fork clone 위치 확인 (`/home/claude/fork` 또는 동일 영역)
- [ ] `git fetch origin` 진입
- [ ] `git log -1 --format='%H %s' origin/main` — baseline HEAD 확인
- [ ] `git status --short` — working tree clean 확인 (학습 #28 정합)
- [ ] 사이클 본질 정합 영역 (clone/web/bash/view) 영역 직접 회수 가능 영역 식별

## 1단계 — baseline line count 사전 검증 (학습 #36 베이스라인 가드)

- [ ] 변경 대상 파일 영역 `wc -l <파일>` 직접 회수
- [ ] **view tool "[N lines total]" 표시 영역 직접 가정 어긋남** — `wc -l` 결과만 신뢰
- [ ] baseline line count 명세 본문 영역 직접 인용 (view tool 표시 영역 외)

근거: Stage 23 어긋남 2건 — ADR-0023 view "[112 lines total]" / wc -l 111, CLAUDE.md view "[957 lines total]" / wc -l 956. view tool 표시 = 본문 line 수 (마지막 newline 미포함), `wc -l` = newline character 본문 → 1 line 어긋남 누적.

## 2단계 — 변경 산식 사전 계산 (학습 #3 + #33 정합)

- [ ] markdown section 신설 시 산식: `header (1) + 빈줄 (1) + bullet × N + 사후 빈줄 (1) = N+3 line`
- [ ] heredoc 본문 영역 `wc -l` 사전 검증 — 실측 line count 명세 본문 영역 명시
- [ ] str_replace edit 본문 영역 +/- 직접 계산
- [ ] 종합 `git diff --numstat` 예상 본문 영역 명시 (file 단위 +N/-N)

## 3단계 — cleanup 허용 범위 (학습 #36 cleanup 동반 가드)

- [ ] 명세 영역에서 diff 산식 본문 영역에 **cleanup 허용 범위 ±2 line** 명시
- [ ] Onev 실행 영역 명세 영역 외 cleanup (오타 정정, 한자 본문 정정, 사후 빈줄 정정 등) 동반 가능성 명시
- [ ] 보고 본문 영역에서 cleanup 본문 영역 명시 가드 (실제 diff와 명세 영역 어긋남 식별 영역)

근거: Stage 23 어긋남 — 명세 +31/-1 / 실측 +32/-2. 어긋남 본질 = Stage 22 매듭 line "분析" → "分析" 한자 정정 cleanup (+1/-1).

## 4단계 — RW_MODE 본문 영역 명시 (학습 #20 정합)

위임 명세 첫 줄 RW_MODE 명시 필수:

| 모드 | 허용 |
|---|---|
| READ_ONLY | git read 명령 / 파일 read만 |
| PUSH_ONLY | git push + git fetch + git read |
| MCP_ONLY | 지정 MCP 호출만 — git/파일 변경 일체 금지 |
| WRITE | 파일 edit + git commit + git push + git read |

## 5단계 — 보고 양식 (학습 #33 정합)

- [ ] 단일 파일 line count (`wc -l`) + git diff stat (`git diff --stat`) 분리 표기
- [ ] markdown section 신설 시 사전 산식 vs 실측 어긋남 본문 사후 검증
- [ ] cleanup 본문 영역 별 보고 (학습 #36 cleanup 동반 가드)
- [ ] "변경 발생 N confirm" 강제 본문 영역

## 6단계 — push 검증 (학습 #1 정합)

- [ ] `git fetch origin` 진입
- [ ] `git log -1 --format='%H' origin/main` vs `git log -1 --format='%H' HEAD` 일치 확인
- [ ] 불일치 시 즉시 push 재진입 또는 보고

## 사이클 본질 정합 (학습 #23/#27/#29 정합)

- [ ] 사이클 본질 가정 위반 시 보류 결정 (학습 #23)
- [ ] 결정 사이클 ↔ 실행 사이클 분리 (학습 #27) — 결정 사이클은 코드 변경 0 정합
- [ ] phase 1 결정 main 직접 + phase 2 실행 feat branch 분리 (학습 #29)

## ADR cross-reference

- 학습 #1 — push 검증
- 학습 #3 — line count 산수 사전 검증
- 학습 #16 — ADR 효과 범위 명확화
- 학습 #20 — RW_MODE 명시 가드
- 학습 #23 — 사이클 본질 가정 위반 시 보류 결정
- 학습 #27 — 결정 ↔ 실행 분리
- 학습 #28 — stale working tree 가드
- 학습 #29 — phase 1 결정 main 직접 + phase 2 실행 feat branch 분리
- 학습 #30 — 사전 산수 검증 → 위임 명세 → Claude Code 재검증 3중 가드
- 학습 #32 — 환경 영역 사전 grep
- 학습 #33 — 보고 양식 명세 정밀화
- 학습 #34 — Q&A 답변 본질 평가 영역
- 학습 #35 — Q&A entry prompt 영역 한 답변 사전 식별 가드 정밀화
- 학습 #36 — 위임 명세 baseline 산식 사전 검증 + 실행 영역 cleanup 동반 가능성 가드

---

Ref: 학습 36 정착 사이클 baseline, philosophy 7부 D-2 (사경인 영역 직접 관계 0, 프로세스 학습 트랙), 학습 누적 #1~#36
