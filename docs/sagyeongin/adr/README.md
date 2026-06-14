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
| [0007](./0007-config-store-design.md) | config-store Design | Accepted (settings에 한정 — transient state는 0014로 분리) | 2026-04-28 | loadConfig/saveConfig 2개, atomic write, 기본값 머지, H2 read-only 부작용 없음 |
| [0008](./0008-html-parser-cheerio.md) | HTML Parser (cheerio) | Accepted | 2026-04-28 | cheerio ^1.0.0, dependencies, kis-rating-scraper + naver-price 사용 |
| [0009](./0009-opendart-rate-limit-policy.md) | OpenDART Rate Limit + Backoff 정책 | Accepted | 2026-05-03 | 옵션 B + wrapper (ii) — 단순 retry 1회 + DartRateLimitError throw, 사경인 디렉토리 wrapper 신설 |
| [0010](./0010-scan-preview-static-filter-cost.md) | scan_preview Static Filter 비용 노출 전략 | Accepted | 2026-05-02 | 옵션 D — 8단계 0 호출 + estimated_api_calls.stage1_company_resolution 비용 노출 |
| [0011](./0011-stage9-insider-signal-redefinition.md) | 9단계 insider 시그널 본질 재정의 | Accepted | 2026-05-03 | majorstock stkqy_irds 부호, β-iii 폐기 |
| [0012](./0012-scan-execute-split-and-resume.md) | scan_execute 분할 실행 + 사용자 명시 재개 | Accepted | 2026-05-03 | 옵션 A — corp 단위 + daily limit 80% checkpoint + 사용자 명시 resume_from |
| [0013](./0013-srim-null-on-invalid.md) | srim 비정상 입력/계산 케이스 처리 | Accepted | 2026-05-03 | 옵션 B — verdict null + prices null + note (srim-calc.ts 4건). 외부 K 실패는 throw 유지 |
| [0014](./0014-scan-execute-checkpoint-storage.md) | scan_execute checkpoint 저장 위치 — settings vs transient state 분리 | Accepted | 2026-05-04 | 옵션 Y — scan_checkpoints.sqlite 별도 신설. ADR-0007은 settings에 한정으로 분기 갱신 |
| [0015](./0015-external-api-burst-policy.md) | 외부 API burst 차단 통합 정책 (DART + naver/KIS rating) | Accepted | 2026-05-09 | A2 fetch failed retry + B1 corp_code shuffle + C1 naver/KIS wrapper + D1 즉시 종결 (코드 변경 0) 통합 |
| [0016](./0016-corp-meta-cache.md) | corp_meta cache — induty_code/corp_cls per-corp_code 영구 cache | Accepted | 2026-05-11 | 사경인 영역 corp-meta-cache.ts 신설 + lazy + eager 병행 + modify_date invalidate |
| [0017](./0017-dart-burst-rate-limit.md) | DART burst limit 정책 — inter-call delay 정착 | Accepted | 2026-05-12 | RateLimitedDartClient inter-call delay 200ms 정착 (성공 호출 후) |
| [0018](./0018-dart-html-response-block.md) | DART HTML 응답 (302 redirect) → DartRateLimitError 변환 정책 | Accepted | 2026-05-14 | wrapper getJson SyntaxError catch → DartRateLimitError(status=html_response_block) throw |
| [0019](./0019-scan-execute-daily-limit-precheck.md) | scan_execute 진입 시 daily_limit_usage_pct 사전 가드 | Accepted (ADR-0030 부분 개정) | 2026-05-14 | scan_execute fresh 분기 진입 직후 daily_limit_usage_pct > 100 → DailyLimitPreCheckError throw / ADR-0030이 throw를 신호 분기로 확장 |
| [0023](./0023-srim-inverted-roe-below-K.md) | srim 분포 역전 (ROE < K) verdict invariant 가드 | Accepted | 2026-05-17 | 분기 Y judgeSrimVerdict buy>sell invariant 가드 null + 분기 Z 학습 #29 origin 재정의, 분기 X 폐기 |
| [0024](./0024-srim-K-essence-baseline.md) | srim K 본질 baseline (자본비용 + BBB- 5Y proxy) | Accepted | 2026-05-19 | K 본질 = 주주의 요구수익률 / 구현 proxy = BBB- 5Y / 보정 0 / ADR-0025 후보 cross-reference |
| [0025](./0025-roe-measurement-cyclical-correction.md) | ROE 측정 정밀화 — 순환주 보정 본질 + 자동 구현 부재 | Accepted | 2026-05-21 | 차원 1 (c) 순환주 보정 인정 / 차원 2 (c-iv) 자동 식별 부재 / 차원 3 (c-β) 자동 보정 부재 / ADR-0023 cross-reference 동일 분리 본질 |
| [0026](./0026-ksic-policy-baseline.md) | KSIC 정책 baseline (X1 채택 + 자릿수 혼재 + 대칭 매칭) | Accepted | 2026-05-22 | 차수 식별 부재 → X2 기각 / prefix 3자리 default (176 unique 소분류) / matchInduty 대칭 매칭 phase 2 / 2자리 record (44건, 1.1%) 미매칭 허용 / X3 보류 |
| [0027](./0027-judge-existing-business-match-policy.md) | judgeExistingBusinessMatch 텍스트 매칭 정책 baseline | Accepted | 2026-05-22 | signature boolean → boolean \| null / whitelist (공장/R&D/양산/수요대응) + blacklist (임대수익/투자수익/사업다각화) + null (사옥/업무공간 모호) / induty cross-reference 보조 / ast_sen 단조 92.3% baseline → assetCategory keyword matching 부재 / 회수 F 13건 직접 근거 |
| [0028](./0028-precheck-2phase-cache-induty-prefilter.md) | pre-check 2-phase — corp_meta cache 기반 induty 사전 필터 | Accepted | 2026-05-29 | 옵션 B (cache-hit induty 0 호출 적용 + cache-miss over-estimate) / estimated_universe additive 분리 + cache_coverage / ADR-0010 옵션 D 개정 / ADR-0019 확장 / override 후속 분리 / 신 인프라 0 |
| [0029](./0029-composite-score-srim-gap-primary.md) | composite_score 산식 — srim 갭 정렬 주도, capex tie-breaker | Accepted | 2026-05-30 | `composite = gap × 1.5 + opportunity − concern`. 7부 D 정렬 주도 / 7부 C tie-breaker / `SRIM_GAP_WEIGHT=1.5` 잠정 / capex 희소 0-tie 사태 해소 |
| [0030](./0030-scan-two-mode-conversational-gate.md) | scan 2-모드 게이트 — 자동 완주 / 단계별 대화 | Accepted | 2026-05-31 | 강제 = 제어 흐름(신호 부재 → throw 대신 견적 반환), required 무력 / (가) 한 도구 — 강제력 동률, 근거는 기존 인프라 재사용 / `scope_confirmed` 신설(상위) ≠ `allow_over_daily_limit`(하위) / 재실행 fresh / ADR-0019 부분 개정 |
| [0031](./0031-opensource-separation-direction.md) | 오픈소스 공개 시 분리 구조 방향 | Proposed | 2026-06-02 | 원본 의존성 + 사경인 확장 별도 패키지. 실행은 MVP 검증 후 |

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
