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
- [x] 5단계: `feat/cashflow-check` — cashflow_check + financial-extractor 확장 (2026-04-30)
- [x] 6단계: `feat/capex-signal` — capex_signal + induty-extractor + DS005 tgastInhDecsn (2026-05-02)
- [x] 7단계: `feat/dividend-check` — dividend_check + financial-extractor 확장 + alotMatter.json (2026-05-02)
- [x] 8단계: `feat/scan-preview` — scan_preview + scan-helpers _lib + corp_code 덤프 단독 활용 (TOOL_REGISTRY 24, 2026-05-02)
- [x] 9단계: `feat/insider-majorstock-signal` — sagyeongin_insider_signal 도구 + majorstock 5%+ stkqy_irds 부호 기반 시그널 (TOOL_REGISTRY 25, 2026-05-03)
- [x] 10단계: `feat/watchlist-check` — sagyeongin_watchlist_check 도구 + 6 사경인 도구 통합 분기 점검 (TOOL_REGISTRY 26, 2026-05-03)
- [x] 11단계: `feat/scan-execute` — sagyeongin_scan_execute (TOOL_REGISTRY 27, 사경인 12, 2026-05-06)
- ~~[ ] 12단계 (백그라운드): insider 14b/c/d — Issue → 원작자 의향 확인 → PR~~ — 폐기 (ADR-0011, β-iii 폐기로 PR 영역 0)

### 현재 작업 단계

11단계 완료 (2026-05-06). TOOL_REGISTRY 27 (사경인 12). `sagyeongin_scan_execute` 추가 — Stage 1~6 통합 시장 스캔 (배치 Phase 2). 8 commit 묶음으로 진행: 묶음 1 (RateLimitedDartClient 7 단테) → 1.5 (HTTP 200 + body status "020" 정정) → 사전 검증 5건 → 2A (scan-checkpoint SQLite 12 단테) → 2B (scan-execute Stage 1~3 + 단순화 1·2·3) → 3A (단순화 1·2·3 정정) → 3B (Stage 4~6 + composite_score + 도구 등록) → 3C (enrichCandidates 21 단테 + buildQuickSummary 8부 본문 정정). 단테 누적 43 (10 dart-rate-limit + 12 scan-checkpoint + 21 scan-enrich). β-i 격리 유지: `src/lib/dart-client.ts` 0 변경.

12단계는 폐기 (ADR-0011). 향후 후속 작업 후보: corp_code 덤프 갱신 (Stage 1 company.json 실패율 65.8% 확인됨), spec §10.8 표현 정정 (spec-pending-edits 누적 영역), 추가 도구.

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

### 매듭/머지 commit push 누락 빈발

발견: 5단계 진행 중 3회 누적 (2026-04-29 ~ 2026-04-30):
- 5단계 직전 fixtures 보완 매듭 `2230393` (4단계 fixture 누락분 추가) — local commit 후 push 누락
- 5단계 묶음 1 머지 commit `78bddde` — local merge 후 push 누락
- 5단계 묶음 2 push — local commit 4개 생성 후 `git push origin feat/cashflow-check` 누락

세 번 모두 Claude 검증 1단계(`git fetch origin` + `git log -1 origin/main` 또는
`git ls-remote origin`)에서 즉시 발견. 사용자 안내 후 push 처리.

원인: 사용자 작업 흐름에서 commit 후 즉시 push가 자동화 안 됨. 특히 매듭 commit /
머지 commit은 작업 단위 종료 직후라 "끝났다" 인식이 강해 push 단계 누락 빈발.

대응:
- 사용자가 commit 또는 merge 후 즉시 `git push origin <branch>` 실행 패턴 정합
- Claude 검증 1단계는 항상 `git fetch origin` + GitHub origin HEAD 직접 확인
  (보고된 commit hash가 origin에 반영됐는지) — push 누락 즉시 발견
- 보고서에 "main HEAD = X" / "feat HEAD = Y" 명시되면 origin과 비교 검증

### 묶음 1 추출 함수 가정 어긋남이 묶음 2 field-test에서 정정되는 패턴

발견: 5단계 묶음 2 (2026-04-30). 묶음 1 `extractCashflowSeries` 가정 3건이 묶음 2
field-test 실행 중 어긋남 발견:
- 엔드포인트 가정: `fnlttSinglAcnt.json` (sj_div="CF" 필터) → 실제: BS+IS만 반환,
  CF는 `fnlttSinglAcntAll.json`에만 존재
- fs_div 분기 가정: items 필터로 CFS/OFS 분기 → 실제: CF 항목은 fs_div 미설정,
  API fs_div 파라미터로 분기 필요
- account_nm 후보 가정: "영업활동현금흐름" / "영업활동으로인한현금흐름" 등 →
  실제: 종목별 변형 다수 ("순현금흐름" / "인한 현금흐름" 등)

위임자가 묶음 2 같은 commit 안에서 코드 정정 + spec-pending-edits 누적 처리
(4단계 묶음 3 audit-extractor 패턴 정합 — DART 응답 형태 가정의 field-test 검증
기존 룰의 자연 적용).

향후 단계에도 적용되는 함정: 추출 함수 작성 묶음(묶음 1)의 응답 형태 가정은
도구 통합 묶음(묶음 2) field-test 전까지 검증 영역 0. 묶음 1 단위 테스트가
합성 입력값 기반이라 실제 응답 형태 강제 검증 영역 아님 (ADR-0003 정신 정합).

대응:
- 추출 함수 위임 명세에 "응답 형태는 가정만, field-test 묶음에서 정정 가능" 명시
  (이미 5단계 묶음 1 명세에 명시됨 — 패턴 유지)
- 도구 통합 묶음 위임 명세에 "묶음 1 가정 어긋남 발견 시 같은 commit 안에서 코드 정정 +
  spec-pending-edits 누적" 패턴 명시 (4단계 묶음 3 + 5단계 묶음 2 패턴 정합)
- 명세 외 함수 정정 commit 위치 룰: 같은 묶음의 통합 commit 안 자연 정합
  (별도 commit 분리는 broken state 위험 ↑)

#### 6단계 누적 (2026-05-02)

6단계 묶음 2 field-test에서 DS005 tgastInhDecsn 응답 필드명 가정 5건 모두 어긋남
발견:
- aqstn_prd_pric_amount → inhdtl_inhprc (양수가액)
- inhrtcap_aqstn_prd_pric_rt → 부재 (extractEquityCurrent 직접 계산 폴백)
- asset_inhtrf_dvsn → ast_sen (자산구분)
- bsns_objt → inh_pp (양수목적)
- rcept_dt → bddd (이사회 결의일)

추가 발견: inhdtl_tast_vs는 자산총계 대비 비율(자기자본 아님 — 사상 임계와 본질 분리).

위임자가 같은 묶음 commit 안에서 코드 정정 + spec-pending-edits §10.3 누적 처리
(4단계 묶음 3 + 5단계 묶음 2 패턴 정합 — 3회 누적 패턴 정착).

3회 누적 패턴이 정착됐으므로 향후 단계 묶음 2 명세 단계는 "응답 형태 가정 어긋남
발견 시 같은 commit 안에서 정정 + spec-pending-edits 누적" 영역을 명세 본문에
필수 포함 영역으로 처리.

### DART 엔드포인트 분기 — fnlttSinglAcnt.json은 BS+IS만, fnlttSinglAcntAll.json은 전체

발견: 5단계 묶음 2 field-test (2026-04-30). 3단계 srim-stack에서 사용한
`fnlttSinglAcnt.json` 엔드포인트는 "주요계정"이라 BS(재무상태표) + IS(손익계산서)만
반환. CF(현금흐름표) 데이터를 얻으려면 `fnlttSinglAcntAll.json` (전체 재무) 사용 필수.

자산총계, 자본총계, 영업이익, 매출 등은 fnlttSinglAcnt.json으로 충분 (3단계·4단계
사용 패턴). 영업/투자/재무 CF는 fnlttSinglAcntAll.json 필수 (5단계 신규 발견).

향후 단계 적용:
- 6단계 capex_signal: 유형자산은 BS 항목 (fnlttSinglAcnt.json 가능)이지만 자산
  매입/매각의 정확한 분류는 CF의 투자활동 세부 항목 필요할 가능성 → fnlttSinglAcntAll.json
  검토 영역
- 7단계 dividend_check: 배당 관련 항목이 어디 분류되는지 확인 영역
  (재무CF 세부 항목? 자본 변동표?)

대응:
- 신규 도구 명세 단계에서 필요 데이터의 엔드포인트 분기 사전 검토
- 묶음 1 추출 함수 가정 단계에서 엔드포인트 명시 (가정), 묶음 2 field-test로 확정

### account_nm 종목별 변형 패턴 — 공백/접속사/접두어 차이 누적

발견: 5단계 묶음 2 field-test (2026-04-30). 영업/투자/재무 CF의 account_nm이
종목별로 미묘한 변형:

| 종목 | 영업CF account_nm |
|---|---|
| 삼성전자, 젬백스 | "영업활동현금흐름" |
| 헬릭스미스 | "영업활동으로 인한 순현금흐름" |
| 현대자동차 | "영업활동으로 인한 현금흐름" |

변형 축: 공백 위치 ("으로인한" vs "으로 인한"), 접속사 유무 ("순"현금흐름 / "인한"
현금흐름), 접두어 (없음 vs 로마자 Ⅰ./Ⅱ./Ⅲ.)

특히 코오롱티슈진 OFS는 로마자 접두어 변형(Ⅰ./Ⅱ./Ⅲ.) 사용 — 현재 후보 리스트
미지원. spec-pending-edits §10.2 §3 항목에 TODO 명시.

향후 단계 적용:
- 후보 리스트 패턴은 모든 신규 추출 함수 공통 — 종목별 변형이 누적될수록 후보
  보강 필요
- 로마자 접두어 변형은 정규식 정규화 영역 (예: `^[ⅠⅡⅢⅣ]\.\s*` strip 후 매칭)
  검토 영역 — 미래 단계 누적 케이스 보고 결정

대응:
- 신규 추출 함수의 account_nm 후보 리스트는 "field-test 확정 영역" 명시
- 발견된 변형은 코드 주석으로 종목 명시 (예: `// 헬릭스미스` — 5단계 묶음 2 패턴 정합)
- 로마자 접두어 정규화는 별도 ADR 또는 spec-pending-edits로 후속 결정

### 사상↔spec 표현 분기 발견 — pending-edits 누적 + 다음 마일스톤 본질 검토 영역

발견: 6단계 묶음 2 field-test (2026-05-02). 사상 본문 7부 C 194줄
"DART 상세검색에서 '신규시설투자'만 필터" vs spec §10.3 데이터 소스
"DS005 tgastInhDecsn (유형자산 양수 결정)" — 실제로는 분리된 영역.

집합 관계 가정: 신규시설투자 공시 ⊂ 유형자산 양수 결정 (모든 신규시설투자는 유형자산
양수지만 역은 아님 — 부동산 매입 등 포함). 그러나 field-test에서 대형 제조업
(삼성전자 등) tgastInhDecsn 공시 영역 0 발견 — 사상 "신규시설투자"는 별도 양식
사용 가능 가설.

향후 단계 적용:
- 사상 본문 표현과 spec 본문 표현이 분기될 때 spec-pending-edits 누적 영역 (의미
  변경 0 단계). 다음 마일스톤(v0.X minor bump 시점)에서 사상 본문 본질 영역 검토 후
  ADR로 격상하거나 spec 본문 표현 정정으로 처리
- MVP 단계는 spec 본문 그대로 유지 (구현 영역 정합 우선) — 사상 본문은 본질 영역
  추적용 보존

대응:
- field-test에서 사상↔spec 분기 발견 시 spec-pending-edits §해당 절 누적
- 매듭 commit 본문에 "사상↔spec 분기 발견 누적 N건" 명시 (마일스톤 시점 일괄 검토 신호)

### DART 응답 비율은 사상 임계와 본질 분리 — 직접 계산 폴백 패턴

발견: 6단계 묶음 2 field-test (2026-05-02). DS005 tgastInhDecsn 응답에
`inhdtl_tast_vs` 필드(자산총계 대비 양수가액 비율, %) 직접 제공. 사상 본문 7부 C
"자기자본 10% 이상 의무공시" 임계는 자기자본 기준이라 본질 분리.

응답 필드 그대로 사용 시 임계 의미 어긋남:
- 자산총계 ≈ 자기자본 + 부채 → 자산총계 대비 비율 < 자기자본 대비 비율
- 자기자본 대비 10%가 의무공시 임계인데 자산총계 대비 10% 사용 시 임계 통과 종목
  과다 발생 (false positive)

대응:
- DART 응답 비율 필드 발견 시 분모 본질 검증 사전 영역 (자산총계? 자기자본? 매출?)
- 사상 본문 임계와 분모 본질 분리 발견 시 직접 계산 폴백 (extractor 함수 활용)
- 6단계 capex-signal: `extractEquityCurrent` 직접 계산 단일 (응답 inhdtl_tast_vs
  사용 영역 0)

향후 단계 적용:
- 7단계 dividend_check: 배당성향 등 응답 비율 발견 시 분모 본질 검증 영역
- 11단계 scan-execute: 종합 평가 시 모든 비율의 분모 본질 일관성 영역

### MVP 한정 보수적 default 패턴 — 7부 C 긍정 발굴 본질에서 의심 시 긍정 분기

발견: 6단계 묶음 2 (2026-05-02). `judgeExistingBusinessMatch` 함수의 default true
결정 본질.

7부 C "선행 지표 기회 포착"의 본질은 긍정 발굴 — verdict SIGNAL_DETECTED는 "신호
발견 자체"가 의미. 응답 형태 미확정 영역(사업분야 KSIC 직접 부재 등)에서 보수적
분기 결정 시:
- 7부 A·B (부정 발굴 — EXCLUDE / REVIEW_REQUIRED)는 의심 시 부정 분기가 자연
  (false negative 회피 — 회피 대상 누락이 더 위험)
- 7부 C (긍정 발굴 — SIGNAL_DETECTED)는 의심 시 긍정 분기가 자연 (false positive
  허용 — 사용자가 공시 본문 직접 확인하는 후속 영역 자연 정합)

→ 7부 A·B vs 7부 C는 보수적 default 분기 본질 거울 영역.

향후 단계 적용:
- 7단계 dividend_check: 7부 D 본질 (분류 영역 — 안정 vs 성장 vs 회복) — 보수적
  default 분기 본질 영역 검토 (긍정/부정 분류 분기 안 자연일 가능성)
- 8단계+ 도구 영역: 7부 본질 분기에 따라 보수적 default 다름 — 명세 단계 결정 영역

대응:
- 응답 형태 미확정 분기에서 보수적 default 결정 시 7부 본질 영역 검토 우선
- interpretation_notes / investigation_hints에 "사용자 후속 확인 권장" 명시
  (false positive 영역 사용자 영역으로 이전)

### 묶음 1 산출 활용 영역 부재 분기 — 미래 정밀화 영역 산출 보존 패턴

발견: 6단계 묶음 2 (2026-05-02). 묶음 1 `induty-extractor.ts` 산출
(`extractIndutyCode` + `matchInduty`)이 묶음 2 `capex-signal.ts`에서 직접 호출
영역 0 (MVP 한정 보수적 default true 휴리스틱 채택). 묶음 1 산출이 미래 정밀화
영역을 위해 보존.

비슷한 영역 — `parseRatio` 함수도 capex-signal.ts에 보존되지만 호출 영역 0
(응답 `inhrtcap_aqstn_prd_pric_rt` 부재 발견 후 호출 영역 사라짐).

본질: 명세 단계 합리적 가정으로 작성된 산출이 field-test 후 활용 영역 0 발견
시도 broken 영역 0 — 미래 영역 산출의 자연 보존. dead code 영역 아님 (정밀화
시점에 호출 영역 추가 가능).

향후 단계 적용:
- 묶음 1 산출 활용 영역 0 발견 시 commit 메시지 + spec-pending-edits에 "활용
  영역 부재 — 미래 정밀화 영역 산출" 명시
- 매듭 시 자주 막히는 곳 누적 영역 0 (이미 정착 패턴) — 단 영역 부재 자체가
  spec/명세 본질 어긋남 신호일 경우는 별도 ADR 영역 검토

대응:
- 묶음 1 명세 단계에 "묶음 2 활용 영역 미확정 — field-test 응답 형태 확인 후
  결정" 명시 가능
- 묶음 2 명세 단계에 "묶음 1 산출 직접 호출 영역 0 분기 발생 가능 — 미래 정밀화
  영역으로 보존" 명시 (6단계 묶음 2 패턴 정합)

### DART endpoint별 응답 row 필드명 가정 영역 검증 필수

발견: 7단계 묶음 2 (2026-05-02). 묶음 1 `extractDividendSeries`가 alotMatter.json
응답 row 3기간 필드명을 `bfefrmtrm` (전전기) 가정. 실제 응답:
`{"se":"현금배당금총액(백만원)","thstrm":"588,448","frmtrm":"590,777","lwfr":"581,400",...}`

`bfefrmtrm`는 `fnlttSinglAcntAll.json` BS/IS 응답 필드 — endpoint 혼용 오류.
정정 전 증상: years_of_dividend=2 (전전기 데이터 0 → 2년치만 추출).

본질: DART API endpoint별 응답 row 필드명 분기 영역. 5단계 endpoint 분기
(fnlttSinglAcnt vs fnlttSinglAcntAll) 정합 본질 + 7단계는 응답 row 안 필드명
영역으로 본질 분기 한 단계 더 깊어짐.

향후 단계 적용:
- 8단계+ 신규 endpoint 진입 시 응답 row 실측 sample 확인 후 필드명 결정
  (fnlttSinglAcnt 응답 필드명 가정 그대로 끌어오기 영역 0)
- 응답 형태 정정 4회 누적 정착 (4단계 묶음 3 + 5단계 묶음 2 + 6단계 묶음 2 +
  7단계 묶음 2)

대응:
- field-test 단계 raw 응답 sample 1~2 종목 보고 영역 강제 (위임 명세 명시)
- 응답 형태 어긋남 발견 시 같은 묶음 안 정정 + spec-pending-edits 누적 그대로

### 5등급 verdict의 fixture 등급 가정 어긋남 빈발 영역

발견: 7단계 묶음 2 (2026-05-02). 명세 단계 5등급 fixture 가정 5개 중 3개 어긋남:
- KT&G A 가정 → C 실측 (성향 57.7%) → KB금융 신규 A 추가
- POSCO홀딩스 C 가정 → D 실측 (recent_cut=true 트리거)
- 카카오 N/A 가정 → N/A 실측 (정합)

본질: binary verdict (4·5·6단계)는 가정 정확도 비교적 높음 (룰 트리거 사전 발견 가능).
5등급 verdict (연속 스펙트럼)는 실측값 기준 등급 분기라 명세 단계 가정 정확도 낮음 —
field-test 단계까지 등급 가정 보류 영역 자연.

향후 단계 적용:
- 8단계+ 도구가 binary verdict 분기일 시 가정 정확도 회복 가능
- 5등급 + 다단계 verdict 분기 시 명세 단계 가정은 발견 시도용만, 실측값 정정 영역 자연

대응:
- 5등급 + 다단계 verdict fixture 가정은 "발견 시도" 명시 (확정 가정 영역 아님)
- field-test 결과 정정 시 fixture 주석에 "초기 가정 → 실측 정정" 명시
  (6단계 패턴 정합)

### series sparse limitation — 시계열 dense 가정 영역 분기

발견: 7단계 묶음 2 (2026-05-02). `dividend_yield: dividend.yield_market[i] ?? 0`
영역 — yield_market 배열은 데이터 있는 연도만 dense 누적, dividend.total 시계열과
1:1 정합 영역 0 가능.

본질: extractDividendSeries 안 total은 sparse (무배당 연도 0), yield_market은 dense
(데이터 있는 연도만) — 두 분기 혼재. 도구 안 series 구성 시 길이 + 연도 정합 영역 0 가능.

향후 단계 적용:
- 8단계+ 시계열 추출 함수 doc comment에 "sparse / dense" 분기 명시 영역 검토
- 다음 마일스톤 시점 yield_market sparse 변환(연도 매칭) 정밀화 검토

대응:
- MVP 한계 영역 코드 코멘트 명시 (dividend-check.ts `series.dividend_yield` 정합)
- spec-pending-edits §10.6 누적 영역 0 (micro 영역, 8·9·10단계 정밀화 영역 후보 보존)

### 위임 분기 명명 보고 텍스트 vs commit 본문 정합 영역

발견: 7단계 묶음 2 (2026-05-02). 위임 명세 응답 형태 정정 commit 위치 분기 3개 (A/B/C)
명명. 보고 chat 텍스트 "분기 A" 명시 vs 실제 commit 본문 정합은 분기 B (별도 정정
commit, history 보존). chat 보고 텍스트만 오류 — commit 본문이 진실.

본질: 위임 보고 텍스트는 약식 가능, commit 본문이 진실. 보고 검증 시 commit
본문 직 확인 영역 자연.

대응:
- 위임 명세 "분기 보고" 영역에 "commit 본문에 채택 분기 명시 강제"
- 검증 시 `git show <hash> --format=%B` 직접 확인 (chat 보고 텍스트만 의존 0)

### 명세 단계 가정값 vs 사용자 환경 실측값 어긋남 패턴

발견: 8단계 단일 묶음 (2026-05-02). 위임 명세 단계 가정값 3개 모두 사용자
환경 실측에서 어긋남:
- universe 가정 1,500~2,200 (default preset) → 실측 3,607
- daily_limit_usage_pct 가정 60~80% → 실측 163.2%
- tech_focus 프리셋 가정 존재 → 실측 부재 (default config-store에는 `default`만)

본질: 4·5·6·7단계는 "묶음 1 추출 함수 가정"이 묶음 2 field-test에서 정정 패턴
(line 220-246). 8단계는 단일 묶음 영역이라 패턴 본질 다름 — "위임 명세 자체의
가정값"이 사용자 환경 실측에서 정정. spec 본문 예시(workflow §10.7 "1,500 →
~1,200 passed") + Claude 명세 가정값 모두 fork 실 환경 영역 검증 영역 0이
자연 — 명세 단계는 추정 영역, field-test가 진실 영역.

향후 단계 적용:
- 위임 명세에 "명세 가정값은 추정 — field-test 실측이 진실, 정정 commit 본문에 명시" 영역 일반 룰 명시 (4·5·6·7·8단계 5회 누적 정착)
- spec workflow 예시 영역도 사용자 환경 실측 영역 정합 영역 검증 본질 (다음 마일스톤 영역 본질 검토)

대응:
- 정정 영역 commit 본문에 "명세 가정 = X / 실측 = Y / 정정 = Z" 영역 명시 강제 (분기 A 채택 시 — 8단계 정착)
- spec-pending-edits 누적 영역에 "실측 영역 + 본질 분기" 명시 (8단계 §10.7 4건 정합)

### spec workflow 예시 vs 실제 default config 정합 검증 영역

발견: 8단계 단일 묶음 (2026-05-02). spec §10.7 workflow 예시 "tech_focus 프리셋
적용 시 universe 약 200~400" 언급 — 실제 `config-store.ts` default
scan_presets에는 `default` 프리셋만 존재, `tech_focus` 부재.

본질: spec 예시 영역이 미래 인프라 가정 영역 본질 (사용자가 직접 update_scan_preset
도구로 추가하는 영역 자연). 단 신규 단계 위임 명세 작성 시 spec 예시 직접 참조
영역에서 실제 config 영역 사전 검증 영역 자연 — 가정 영역 어긋남 사전 회피.

향후 단계 적용:
- 위임 명세에 spec 예시 영역 직접 참조 시 "실제 config 영역 사전 검증 영역" 명시 본질
- 9·10·11단계도 spec 예시 영역 활용 시 동일 영역 검증 영역 자연

대응:
- spec-pending-edits §10.7 누적 (8단계 정합 — line 441 영역)
- 다음 마일스톤 시점 spec workflow 예시 영역 정정 영역 검토 (사용자 환경 영역 정합 본질)

### 8단계 over-estimate 본질 정합 vs buggy 분기 본질 — 11단계 분할 실행 ADR 영역 분리

발견: 8단계 field-test (2026-05-02). universe 3,607 + daily_limit 163.2%는
"daily limit 초과" 영역 = 표면 영역 buggy 본질 보임 — 단 ADR-0010 옵션 D
정합 영역 본질 정합 (over-estimate 본질 = 8단계 자체 정합 영역).

본질 분기:
- 8단계 (scan_preview) over-estimate = corp_cls + induty_code 분기 미적용 영역 (옵션 D 정합) → 사용자 의사결정 정보 제공 본질 정합 (5부 "사람 결정 영역 사전 분리" 정합)
- 11단계 (scan_execute) 분할 실행 영역 = daily limit 초과 영역 처리 본질 → 별도 ADR 영역 (ADR-0011 가칭, 11단계 진입 전 결정 영역)

본질 정합 본질: "표면 영역 buggy로 보이는 영역이 사실 본질 정합 + 다음 단계
ADR 영역 분리 본질" — 사상 5부 정합 영역 (사람 결정 영역 사전 분리). 8단계
도구 verdict 영역 0 본질 정합 (사용자가 직접 결정 — 도구가 결정 0).

향후 단계 적용:
- 11단계 진입 전 ADR 영역 (분할 실행 전략 — 우선순위 분기? 사용자 confirm 분기? checkpoint/resume 분기?) ADR-0009 (외부 스크래핑) 영역과 함께 결정 영역 자연
- spec-pending-edits §10.7 line 436-439 영역 누적 정합 — 11단계 진입 전 본질 검토 영역 자연

대응:
- 11단계 진입 전 ADR 영역 추가 (가칭 ADR-0011 — scan_execute 분할 실행 전략)
- 8단계 사용자 발견 영역 본질 평가 영역 정착 — "buggy 보이는 영역이 본질 정합 분기 + 다음 단계 ADR 영역 분리 본질" 영역 일반 룰 정착

### 9단계 사전 검증 — spec + ADR 동시 기각 첫 케이스

발견: 9단계 진입 전 사전 검증 (2026-05-03). spec §10.12 + ADR-0001 β-iii 본문 가정 ("DART elestock.json raw response에 chg_rsn 필드 존재")이 두 endpoint (elestock 2,615건 + majorstock 40건) 실측에서 모두 기각. spec + ADR 동시 기각 첫 케이스.

본질 분기:
- 8단계까지 학습은 "묶음 1 추출 함수 가정 vs 묶음 2 실측 어긋남" (4·5·6·7단계 5회 누적) + "위임 명세 가정값 vs 사용자 환경 실측값 어긋남" (8단계 1회 추가, 6회 누적) 패턴이었음
- 9단계는 신규 패턴 — "spec 본문 + ADR 본문 두 영역 동시 가정"이 raw response 영역 미검증으로 기각. ADR-0001 line 113 "원본 코드 211~228줄 검증" 본문이 코드 영역만 검증, raw response 영역 미검증이 본질 hole

향후 단계 적용:
- 단계 진입 전 사전 검증 영역 자체가 8단계 학습 정착의 자연 적용. 9단계는 그 정착이 1차/2차 두 endpoint 검증으로 확장 — 7회 누적 정착
- ADR 결정 본문이 "원본 코드 검증" 같은 영역 본문 시 "코드 영역" vs "raw response 영역" 분기 명시 강제. 가정 영역이 raw 데이터 영역에 의존 분기 시 사전 호출 검증 영역 강제 룰 정착
- 신규 디렉토리 `docs/sagyeongin/verifications/` 신설 — 사전 검증 결과 영구 보존 패턴. 미래 단계 사전 검증 시 동일 디렉토리 영역 자연

대응:
- ADR-0011 채택 — 9단계 본질 재정의 (chg_rsn_filter 폐기 → majorstock stkqy_irds 부호)
- ADR-0001 β-iii Superseded by 0011
- 12단계 (백그라운드 — Issue/PR) 폐기 — upstream insider-signal.ts 직접 수정 0
- spec §10.12 전면 재작성 + §5.1 도구 9→10 + §5.3 insider 정정 + §4 line 109 정정 + v0.6
- 검증 보고 영구 보존 — `docs/sagyeongin/verifications/2026-05-03-stage9-pre-verify.md`

ADR-0011 정합: 사전 검증의 비용 작음 본질 (호출 1회 + 보고 단일 양식, 코드 변경 0, 매듭 0) vs 명세 폐기 부담 영역 비대칭 — 향후 단계 모두 동일 패턴 적용 자연.

### 10단계 srim 음수 prices 발견 — 11단계 진입 전 ADR 검토 후보

발견: 10단계 field-test (2026-05-03). 카카오 + LG화학 srim 호출 시 `prices must be positive` throw 발생. 원인 추정: 평균 ROE 음수 또는 자기자본 음수로 srim 공식 (E × (1+(ROE−K))^t / K) 결과가 음수 → throw.

watchlist_check 동작은 정상:
- try/catch가 srim throw를 잡고 notes에 기록
- 해당 corp의 srim stage만 skip, 다른 stages는 정상 산출
- 전체 점검은 안 멈춤 (5부 사람 결정 영역 사전 분리 정합)

정리 — watchlist_check 자체에는 문제 없음. srim 도구가 음수 케이스를 처리하는 방식이 검토 대상.

선택지:
- 옵션 A (현재): throw — 호출자가 try/catch로 처리
- 옵션 B: verdict null + prices null + 음수 사유 note — 정상 응답으로 노출
- 옵션 C: verdict "INVALID" 같은 별도 enum 추가 — 사용자에게 명시적 신호

옵션 B/C는 srim Output 스키마 변경이라 ADR 사항. 11단계 진입 전 ADR-0009 + ADR-0012 결정 시 함께 검토.

향후 단계 적용:
- 사경인 도구가 다른 사경인 도구를 호출하는 패턴 (10단계 watchlist_check)에서 호출되는 도구의 throw 케이스를 try/catch로 감싸는 패턴이 정착
- 도구 간 호출 시 throw vs null+note 정책은 도구별로 갈라질 수 있음 — 일관 정책은 ADR로 결정

대응:
- 11단계 진입 전 ADR 결정 시 srim 음수 처리 함께 검토
- 다른 사경인 도구도 음수/0/null 입력 케이스에서 throw vs null+note 처리 방식 검토 필요

후속 처리 완료 (2026-05-04, ADR-0013 채택 + feat/srim-null-on-invalid 머지):

- ADR-0013 옵션 B 채택 — verdict null + prices null + note (srim Output 스키마 nullable 확장)
- srim-calc.ts throw 4건 → null 반환 (line 74·109·115·148)
- srim.ts handler 3 분기 null 처리 + note에 ADR-0013 trailer 명시 (srim_status=null / verdict_null)
- watchlist-check.ts srim 호출 위치에서 verdict null 감지 시 stageNotes 노출 (외부 K 실패용 try/catch는 유지)
- 외부 K 실패 (resolveK 내부) + corp_code 미존재 (srim.ts:76)는 throw 유지 (ADR-0013 적용 범위 밖)

**명세 가정 vs 실측 어긋남 (8회 누적, 본 단계가 8회차)**:

- 명세 가정: "음수 ROE corp → calculateSrim null → prices 모두 null"
- 실측: ROE는 양수 (K보다 낮을 뿐) → calculateSrim 정상 산출 → sell price 음수 (-132322 / -2864) → judgeSrimVerdict가 prices.sell ≤ 0 감지 → null 반환 → verdict null + note `srim_status=verdict_null (ADR-0013)`
- ADR-0013 옵션 B는 두 분기 (calculateSrim null vs judgeSrimVerdict null) 모두 흡수하는 설계라 결과적으로 정상 동작. 위임자가 실측 후 field-test 케이스 이름을 "음수 ROE 케이스"에서 "이상 계산 케이스"로 자체 정정 (commit 3eb3534).

**학습 — 사전 검증 차단 패턴의 hole**:

- 9단계 verifications/ 패턴은 **raw API 응답** 가정 어긋남에는 통하지만 **수학 공식 분기**에는 안 통함 (본 단계 발견)
- 명세 작성 시 raw 응답 사전 검증 + 공식 분기 자체를 fork 코드 직접 추적 둘 다 필요
- 본 단계의 경우: srim-calc.ts의 `calculateSrim` (S-RIM 공식) → `judgeSrimVerdict` (가격 비교) 두 단계가 각각 null 분기를 가짐. 명세 단계에서 두 분기 모두 추적했어야 함
- 미래 명세 작성 시: 도구가 여러 함수를 거치는 파이프라인일 때 각 함수의 null/throw 분기를 모두 사전 검증 단계에 포함

**결과적 정상 동작**: ADR-0013 옵션 B의 설계 자체가 두 분기 모두 흡수하니 코드는 정확히 동작. 학습은 명세 작성 측의 사전 검증 hole — 미래 단계에서 같은 hole 회피.

### 11단계 scan-execute 누적 학습 — 6건

11단계는 8 commit 묶음으로 진행돼 단계 내 학습 누적이 깊다. 본 영역은 후속 단계 명세 작성 시 참조.

**1) 인프라 wrapper 묶음은 사전 검증을 첫 commit 전에 (1단계 → 1.5 정정)**: 묶음 1에서 RateLimitedDartClient를 HTTP 429 감지로 작성 → 실측은 HTTP 200 + body `{"status":"020",...}`. 1.5단계로 정정 commit 별도 추가. 학습: 인프라 wrapper는 verifications/ 사전 검증을 첫 commit 전에 끼워 넣음.

**2) 인터페이스 절약 단순화 → 후속 묶음 정정 패턴 (2B → 3A)**: 묶음 2B에서 universe_meta 미보존, killer_passed_cumulative 미사용, partial_candidates underscore-prefix 키로 단순화 1·2·3 도입 → resume 흐름에서 모두 어긋남 → 묶음 3A에서 정정 (4개 optional 필드 추가, backward-compat 유지). 학습: 인터페이스 절약 단순화는 resume 흐름까지 추적 후 결정. backward-compat optional 필드 패턴으로 정정 가능.

**3) 단테 빈 구멍 사후 보강 패턴 — DI 패턴 처음부터 (3B → 3C 정정)**: 묶음 3B field-test가 KSIC "26" KOSDAQ universe 14개 + srim 통과 0건이라 enrichCandidates 런타임 검증 0건. 묶음 3C로 mock 기반 단테 추가 → buildQuickSummary 8부 본문 어긋남 발견 (NORMAL/N/A 노이즈 항상 표시 + gap_to_fair 미포함) → 본문 정정. 학습: field-test 분포 의존(srim 통과 corp 분포)으로 런타임 미검증된 함수는 mock 기반 단테로 사후 보강. 처음부터 DI 패턴 (EnrichDeps export + deps 인자) 설계가 mock 가능성 좌우.

**4) Stage 1 company.json 65.8% 실패율 — corp_code 덤프 갱신 후보**: 묶음 2B field-test에서 company.json 호출 3963회 중 2607회 실패 (skipped stage1, 65.8%). 가능 원인은 corp_code 덤프 stale (delisting/management 사례 잔존) 또는 DART API 응답 변경. 후속 단계 후보: corp_code 덤프 갱신 도구.

**5) wc -l 보고 줄 수 어긋남 4 cumulative → 3B/3C에서 0**: 묶음 1, 2A, 2B, 3A에서 보고 분량 vs 실제 분량 어긋남 누적. 묶음 3B/3C에서 명세에 "wc -l 출력 한 줄씩 그대로" 명시 → 어긋남 0. 학습: 줄 수는 직접 명령 출력 첨부 본질이 효과적 (Onev 환경 상황별 변동 가능).

**6) β-i 격리 본질 유지 — composition wrapper + DI 패턴**: 11단계 전 묶음에서 `src/lib/dart-client.ts` 92줄 0 변경. RateLimitedDartClient (composition wrapper) + EnrichDeps (DI 패턴) 두 패턴이 격리 본질 보존. 학습: 후속 단계에서도 같은 패턴 유지.

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
