# 사경인 도구 작업 가이드

이 파일은 사경인 도구 작업에 진입하는 Claude 세션의 출발점이다. 원본 `CLAUDE.md`는 korean-dart-mcp 전반 가이드이고, 이 파일은 사경인 작업 특화 진입점이다.

## 진입 흐름

새 Claude 세션은 다음 순서로 컨텍스트를 복원한다.

1. **이 파일** — 진입점. 작업 원칙 요약 + 진행 상태
2. **README-SAGYEONGIN.md** (root) — 사용자 관점 개요. 사경인 도구가 무엇이고 왜 만드는지
3. **docs/sagyeongin/sakyeongin_philosophy.md** — 사상 토대. 사경인 철학 7부 + 수렴점
4. **docs/sagyeongin/sagyeongin-dart-agent-spec.md** — 기능 명세. 도구 11개의 input/output/공식/룰
5. **docs/sagyeongin/adr/README.md** — 결정 인덱스. 메타 결정의 단일 출처
6. **작업 관련 ADR 본문** — 인덱스에서 골라 선택적 읽기

위 6단계를 모두 따라가면 컨텍스트가 거의 완전 복원된다. 매 세션 모든 결정을 재논의하지 않는다.

## 작업 원칙 (요약)

상세는 각 ADR 본문 참조. 여기서는 작업 시 즉시 따라야 할 핵심만.

### 격리 원칙 (ADR-0001)

- 사경인 코드는 `src/tools/sagyeongin/` 안에서만 작성
- 공유 로직은 `src/tools/sagyeongin/_lib/` 안에 둠 (`src/lib/`에 두지 않음)
- 원본 도구 수정 금지. 단 `src/tools/index.ts`의 2줄(`import` + `...sagyeonginTools`)과 `src/tools/insider-signal.ts`의 `chg_rsn_filter` 추가는 예외

### 머지 전략 (ADR-0002)

- main + feat/* + 단발성 sync 브랜치
- feat 브랜치 → main 머지: rebase then merge --no-ff (커밋 보존 + merge commit으로 그룹 표시)
- upstream sync는 `sync-upstream-vX.Y` 단발성 브랜치 → main에 merge commit으로 통합
- MVP 완성 시점에 `v0.1.0-sagyeongin` 태그 한 번

### 테스트 전략 (ADR-0003)

- TDD 비채택. 샘플 기반 검증 주도
- 순수 계산: Node built-in `node --test`, `*.test.ts` 동일 디렉토리, 빌드 후 실행
- 도구 통합: `scripts/sagyeongin/field-test-*.mjs`, 실제 DART API 호출
- 외부 스크래핑: `scripts/sagyeongin/smoke-scrapers.mjs`로 페이지 구조 살아있는지 확인
- CI 미도입. 로컬 명시 실행만

### 개발 순서 (ADR-0004)

11 코드 단계 + 1 커뮤니케이션 단계. 단계별 한 세트 완료 (코드 + 단위 테스트 + field test + 주석)가 머지 기준.

### 커밋 (ADR-0005)

- 형식: `feat(scope): 한국어 제목`
- 본문 한국어, 마지막 줄에 `Ref: spec §X.Y, philosophy 7부 A`
- spec 변경 + 코드 변경은 분리 커밋 (spec 먼저, 코드 나중)
- 의미 단위 (원자적이지도 너무 큰 묶음도 아님)

### spec 변경 처리 (ADR-0006)

- 의미 변경 (도구 추가/삭제, 공식 변경, 룰 변경): 즉시 spec 수정 + ADR 작성
- 표현 정정 (오타, 예시 갱신): `docs/sagyeongin/spec-pending-edits.md` 누적, 마일스톤 시 일괄 반영
- spec 버전: ADR 동반 변경 시 minor bump (v0.X → v0.X+1), MVP 완성 시 v1.0

## 진행 상태

### 마일스톤

- [x] 기능 명세 v0.2 확정 (2026-04-24)
- [x] 구현 전략 합의 (이 ADR들, 2026-04-25)
- [x] 1단계: `feat/scaffold-sagyeongin` — 디렉토리 골격 + index.ts 등록 (2026-04-27)
- [x] 2단계: `feat/config-store` — config-store + update_watchlist + update_scan_preset (2026-04-28)
- [x] 3단계: `feat/srim-stack` — required_return + srim + naver-price + srim-calc (2026-04-28)
- [x] 4단계: `feat/killer-check` — killer_check + financial-extractor 확장 + audit-extractor (2026-04-29)
- [ ] 5단계: `feat/cashflow-check`
- [ ] 6단계: `feat/capex-signal`
- [ ] 7단계: `feat/dividend-check`
- [ ] 8단계: `feat/scan-preview`
- [ ] 9단계: `feat/insider-chg-rsn` (14a — 포크 로컬 + field test)
- [ ] 10단계: `feat/watchlist-check`
- [ ] 11단계: `feat/scan-execute`
- [ ] 12단계 (백그라운드): insider 14b/c/d — Issue → 원작자 의향 확인 → PR

### 현재 작업 단계

4단계 완료 (2026-04-29). 다음 작업은 5단계 `feat/cashflow-check`.

## 자주 막히는 곳

이 섹션은 구현 진행하며 누적된다. 새 세션이 같은 막힘을 반복하지 않도록 Claude가 발견한 함정을 기록.

### 한 feat 브랜치에서 도구 N개 만들 때 등록 커밋이 broken state로 묶이는 경향

발견: 2단계 묶음 2 (2026-04-28). 위임 명세에서 "각 커밋이 자체 완결, 중간 head 빌드 통과"
명시했으나 Claude Code가 두 도구를 한 커밋에 등록(`index.ts` import 라인 두 줄 동시 추가)하여
첫 커밋 시점에 두 번째 도구 파일 부재로 빌드 실패. 최종 HEAD는 통과하지만 ADR-0005 105~108줄
"다음 커밋 없이는 빌드 안 통하면 묶을 검토" 위반. bisect 정확도 흠집 + 미래 컨텍스트 복원
시 중간 커밋 checkout 깨짐.

대응:
- 위임 프롬프트에 "각 커밋 시점에서 `npm run build` 실행 결과를 보고에 포함" 명시
- 위임 보고 검증 시 fork pull 후 각 중간 커밋 checkout + 빌드 시도로 우회 검증
- 발견 시 즉시 rebase로 split (예: 묶음 2 사후 정리 위임 패턴)

ADR 측 메모: ADR-0005 105~108줄 "다음 커밋 없이는 빌드 안 통하면 묶을 검토"는 위임 시
명시적 검증 단계 없이는 무시되기 쉬움. 향후 위임에서 다중 도구 등록은 등록 커밋을 마지막에
별도로 두는 패턴도 고려할 가치.

### 위임 보고의 분량 수치는 wc -l과 다른 경우가 많음

발견: 2단계 묶음 1 (147+120 vs 실제 188+153), 묶음 2 (89+116 vs 실제 114+131). 일관되게
실제보다 적게 보고됨. 코드 품질 무관하지만 큰 차이는 결함 신호로 오인 가능. 향후 위임에
"보고 분량은 `wc -l` 결과 그대로" 명시.

### 11단계 scan-execute 시작 전 외부 스크래핑 rate limit/캐시 ADR 결정 필요

발견: 3단계 묶음 2 (2026-04-28). 1인 분기 점검 + 단일 srim 호출 영역에서는 위험 0
이지만, scan-execute가 srim 통과 종목 N개에 대해 naver 현재가를 연속 호출 시 IP
차단 가능성 있음 (Node 기본 UA 차단 사례 다수, 봇 식별).

묶음 2에서는 즉시 처리 영역만 적용:
- Chrome 데스크톱 UA + Accept-Language ko-KR (봇 차단 회피)
- 5초 timeout (AbortController)

호출 빈도 정책 (캐시, delay, 백오프)은 11단계 시작 전 ADR-0009로 결정.
- naver: 한 scan 안 동일 종목 중복 호출 방지 in-memory 캐시 / 호출 간 delay
- kisrating: spec §10.5 628~632줄 24시간 캐시 (required-return.ts가 관리, 묶음 3)

### 매듭 커밋의 위치 룰 (활성 feat vs main 직커밋)

발견: 3단계 종료 매듭 `8fed9c7`이 마일스톤 체크박스만 갱신하고 "현재 작업 단계" 섹션 미갱신 → 자체 모순 (2026-04-28). 매듭 위치 룰 명시 누락이 원인.

**판별 테스트**: 그 매듭을 빼고도 활성 feat 브랜치가 의미 단위로 완결되는가?

- 빠지면 깨짐 → **활성 feat 안**
- 빠져도 무방 → **main 직커밋**

**활성 feat에 들어가도 무방 (또는 자연)** — 작업 묶음의 사양/결정/발견:
- spec 의미 변경 (도구/스키마/공식/룰)
- 단계 *도중* 합의된 작업 결정 ADR (예: ADR-0008 cheerio — 묶음 1 위임 중 채택)
- spec-pending-edits 누적 (작업 중 발견)
- chore deps (코드와 함께 머지돼야 빌드 통과)
- ADR install 결과 메모 (deps 추가 후속)
- "자주 막히는 곳" 누적 (작업 중 발견 후속 메모)

**main 직커밋이어야** — 작업 묶음 외 회고/메타:
- **CLAUDE.md "현재 작업 단계" + 마일스톤 체크박스 갱신** — 단계 완료는 머지가 만듦. 머지 전 feat 안 갱신은 의미 정합 깨짐
- 단계 *진입 전* 인프라 결정 ADR (예: ADR-0007 config-store — 2단계 진입 시 설계 합의 후 코드)
- 다음 단계 사전 ADR (예: ADR-0009 rate limit — 11단계 시작 전)
- CHANGELOG, README 큰 항목 (ADR-0006 마일스톤 시점만)
- upstream sync 후 정합 갱신

**작업 결정 ADR의 분기 (사용자 실제 패턴)**: 단계 *진입 전* 결정 → main / 단계 *도중* 합의 → feat 안. ADR-0007이 main, ADR-0008이 feat에 들어간 분기는 이 룰 정합.

### 명세 단계의 DART 응답 형태 가정은 field-test에서 확정

발견: 4단계 묶음 3 (2026-04-29). audit-extractor 명세 작성 시 DART
`accnutAdtorNmNdAdtOpinion` 응답의 정확한 필드 형태를 모름 (`bsns_year` 마커 vs 연도 숫자,
`adt_opinion` 정확 값). 명세 단계에 합리적 가정만 적고 "field-test에서 검증" 명시했음.
묶음 3 field-test 실행 결과:

- `adt_opinion` 실제 값이 `"적정의견"` (suffix 포함) — `=== "적정"` 정확 매치는 false positive
- 다수 종목이 연결/별도 2 row 반환, 별도 row가 `"-"` 플레이스홀더 가능 (OFS 미제출)

→ killer-check.ts 즉시 정정 (`startsWith("적정")` 패턴 + `"-"` 필터) + spec-pending-edits §10.1 누적.

향후 단계에도 적용되는 함정: **DART 응답 필드의 정확한 값/형태는 명세에서 가정만 가능,
field-test가 유일한 검증 영역**. 5단계 cashflow_check 영업CF, 6단계 capex_signal 자산
매입 등 후속 단계도 같은 패턴 — `"-"` 플레이스홀더 또는 suffix 포함 텍스트 가능성 있음.

대응:
- 명세 단계에서 응답 정확 형태 모르는 영역은 가정을 적되 "field-test에서 정정 가능" 명시
- field-test 위임 명세에 "실제 응답 ≠ 명세 가정 시 즉시 코드 정정 + spec-pending-edits 누적"
  패턴 명시
- 위임자가 같은 묶음 안에서 코드 정정 + 사양 영역 분리 누적 (4단계 묶음 3 패턴 정합)

ADR-0003 정합: 단위 테스트가 합성 입력값 기반이라 실제 응답 형태 강제 검증 영역 아님 —
field-test가 응답 검증 유일 영역이라는 ADR-0003 정신 그대로.

### 위임 보고 검증 시 stale local main으로 잘못 판정하는 헛다리

발견: 4단계 묶음 1 검증 (2026-04-29). Claude 환경 fork local `main`이 사용자 직커밋
정정 매듭(`eefd708`) 반영 전(`ad2a77a`)에 머물러 있는 상태에서 `git diff main..feat/...` 실행 →
이전 main 직커밋의 변경(CLAUDE.md 정정)이 위임자 추가 영역으로 잘못 보임 → 헛다리 보고 작성.

대응:
- fork 검증 시 항상 `git fetch origin` 후 `origin/main..feat/...` 기준 diff (local main은 stale 가능)
- `git log -1 origin/main`으로 HEAD 일치 확인 후 비교
- 사용자 명시 "현재 main HEAD = X" vs `origin/main` 실측 불일치 시 즉시 fetch/pull로 정합

세션 메모리에도 동일 영역 박아둠 (반복 회피).

### Claude 검증 환경 npm install이 caret 범위 무시 (메이저 상위 설치)

발견: 4단계 묶음 1 검증 (2026-04-29). package.json `"typescript": "^5.9.3"`인데 Claude
환경 `npm install`이 TypeScript 6.0.3 설치 → 새 메이저의 deprecated 경고가 fatal 처리돼
빌드 실패로 보임. 사용자 환경에서는 정상 통과.

대응:
- 검증 시 빌드 실패 = 위임자 보고 거짓 의미 0. 검증 핵심은 코드 본문 vs 명세 정합성
- 빌드/테스트 통과 영역은 사용자 환경 보고 신뢰 (위임 명세에 빌드/테스트 결과 보고 강제 패턴 정합)
- Claude 환경에서 직접 빌드 시도 시 `npm install typescript@5.9.3 --silent`로 핀하면 통과

세션 메모리에도 동일 영역 박아둠.

## 의사결정 시 주의

새 결정이 필요한 상황을 마주하면 다음을 따른다.

1. **기존 ADR로 답이 나오는가?** — 해당 ADR의 결정에 따름. 임의 변경 금지.
2. **기존 ADR과 충돌하는 새 결정이 필요한가?** — 새 ADR 작성. 기존 ADR을 `Superseded by NNNN`으로 표시.
3. **ADR이 다루지 않는 새 영역인가?** — 새 ADR 작성.
4. **표현 정정 / 사소한 정정인가?** — `spec-pending-edits.md`에 누적.

새 결정은 사용자 합의 후에만 ADR로 산출. Claude 단독 결정 금지.

## 참조

- 원본 가이드: [CLAUDE.md](../../CLAUDE.md) (root, korean-dart-mcp 전반)
- 사용자 가이드: [README-SAGYEONGIN.md](../../README-SAGYEONGIN.md) (root)
- 변경 이력: [CHANGELOG-SAGYEONGIN.md](../../CHANGELOG-SAGYEONGIN.md) (root)
