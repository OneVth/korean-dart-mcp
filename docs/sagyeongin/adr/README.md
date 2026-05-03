# 사경인 도구 ADR (Architecture Decision Records)

이 디렉토리는 사경인 도구 개발의 큰 의사결정을 기록한다. 새 Claude 세션은 이 인덱스를 먼저 보고, 작업 관련 ADR 본문만 선택적으로 읽는다.

## 목적

이 레포는 1인 사용자 + 다수 Claude 세션이 공동 작업한다. 세션 간 컨텍스트 이전 비용을 줄이기 위해 큰 결정은 ADR 1개로 분리 기록한다. ADR이 없으면 매 세션이 같은 결정을 재논의한다.

## ADR 작성 기준

다음 변경은 ADR 작성 대상이다.

- 도구 추가/삭제, 공식 변경, 룰 정의 변경 (spec의 의미 변경)
- 디렉토리 구조, 브랜치 전략, 테스트 방법 같은 메타 결정
- 외부 의존 추가 (spec §11.3 갱신 동반)

다음 변경은 ADR 작성 대상이 아니다.

- 표현 정정, 오타, 예시 갱신 → `spec-pending-edits.md` 누적
- 일상 구현 (특정 도구의 내부 로직 작성) → 커밋 메시지로 충분
- 버그 수정 → CHANGELOG 갱신만

## ADR 형식

라이트 MADR (Markdown ADR) 5섹션. 본문은 한국어, 헤더와 상태는 영어 키워드.

```
# NNNN - 결정 제목

- 상태: Accepted (또는 Superseded by NNNN / Deprecated)
- 결정일: YYYY-MM-DD
- 결정자: 사용자 + Claude

## 컨텍스트
이 결정이 왜 필요했는가.

## 고려한 옵션
- 옵션 1
- 옵션 2

## 결정
어느 옵션을 선택했는가. 핵심 한 줄 + 구체.

## 근거
왜 이 옵션을 선택했는가. 거부된 옵션이 왜 거부됐는가.

## 결과
- 좋은 점
- 트레이드오프
- 미래 변경 시 영향
```

## 인덱스

| ID | 제목 | 상태 | 결정일 | 핵심 |
|---|---|---|---|---|
| [0001](./0001-fork-isolation-strategy.md) | Fork Isolation Strategy | Accepted (β-iii Superseded by 0011) | 2026-04-25 | `src/tools/sagyeongin/` 격리, B2 패턴 |
| [0002](./0002-branch-strategy.md) | Branch Strategy | Accepted | 2026-04-25 | main + feat/* + sync 단발성, rebase then merge --no-ff |
| [0003](./0003-test-strategy.md) | Test Strategy | Accepted | 2026-04-25 | 샘플 기반 검증, Node built-in test runner |
| [0004](./0004-development-order.md) | Development Order | Accepted | 2026-04-25 | 11 코드 단계 + 1 커뮤니케이션 |
| [0005](./0005-commit-conventions.md) | Commit Conventions | Accepted | 2026-04-25 | Conventional Commits + 한국어 + Ref |
| [0006](./0006-documentation-strategy.md) | Documentation Strategy | Accepted | 2026-04-25 | `docs/sagyeongin/` + ADR + 별도 README/CHANGELOG |
| [0007](./0007-config-store-design.md) | config-store Design | Accepted | 2026-04-28 | loadConfig/saveConfig 2개, atomic write, 기본값 머지, H2 read-only 부작용 없음 |
| [0008](./0008-html-parser-cheerio.md) | HTML Parser (cheerio) | Accepted | 2026-04-28 | cheerio ^1.0.0, dependencies, kis-rating-scraper + naver-price 사용 |
| [0009](./0009-opendart-rate-limit-policy.md) | OpenDART Rate Limit + Backoff 정책 | Accepted | 2026-05-03 | 옵션 B + wrapper (ii) — 단순 retry 1회 + DartRateLimitError throw, 사경인 디렉토리 wrapper 신설 |
| [0010](./0010-scan-preview-static-filter-cost.md) | scan_preview Static Filter 비용 노출 전략 | Accepted | 2026-05-02 | 옵션 D — 8단계 0 호출 + estimated_api_calls.stage1_company_resolution 비용 노출 |
| [0011](./0011-stage9-insider-signal-redefinition.md) | 9단계 insider 시그널 본질 재정의 | Accepted | 2026-05-03 | majorstock stkqy_irds 부호, β-iii 폐기 |
| [0012](./0012-scan-execute-split-and-resume.md) | scan_execute 분할 실행 + 사용자 명시 재개 | Accepted | 2026-05-03 | 옵션 A — corp 단위 + daily limit 80% checkpoint + 사용자 명시 resume_from |
| [0013](./0013-srim-null-on-invalid.md) | srim 비정상 입력/계산 케이스 처리 | Accepted | 2026-05-03 | 옵션 B — verdict null + prices null + note (srim-calc.ts 4건). 외부 K 실패는 throw 유지 |

## 상태 정의

- **Accepted** — 현재 유효한 결정. 따라야 함.
- **Superseded by NNNN** — 더 이상 유효하지 않음. 후속 ADR이 대체.
- **Deprecated** — 폐기. 대체 결정 없이 더 이상 따르지 않음.
- **Proposed** — 제안 단계. 아직 합의 안 됨.

## 새 ADR 작성 절차

1. 다음 번호의 파일 생성 (`docs/sagyeongin/adr/NNNN-kebab-case-title.md`)
2. 위 5섹션 형식 따름
3. 이 README 인덱스 표에 한 줄 추가
4. 관련 spec 갱신 (의미 변경의 경우)
5. spec 헤더의 수정 이력에 `(ADR-NNNN 반영)` 추가
6. 관련 ADR이 대체되면 그 ADR의 상태를 `Superseded by NNNN`으로 변경
7. 커밋: `docs(adr): NNNN - 결정 제목`
