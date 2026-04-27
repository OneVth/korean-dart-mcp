# 0004 - Development Order

- 상태: Accepted
- 결정일: 2026-04-25
- 결정자: 사용자 + Claude

## 컨텍스트

ADR-0001/0002/0003으로 구조/브랜치/테스트가 정해졌다. 다음은 — 11개 도구를 어떤 순서로 만드느냐, 한 단계 안에서 어디까지 해야 다음으로 넘어가느냐, 구현 중 spec 변경이 필요해지면 어떻게 처리하느냐.

세 압력이 상호작용한다.

첫째, **의존성**. spec §10에 따라 srim → required_return, scan_execute → killer/srim/cashflow/... 같은 호출 의존성이 있다. 호출되는 도구가 호출하는 도구보다 먼저 만들어져야 한다.

둘째, **인프라가 코드보다 먼저**. config-store는 거의 모든 도구가 사용. scaffold가 가장 먼저.

셋째, **구현 중 발견될 spec 결함**. 작업 도중 spec의 모호함/오류/누락이 발견될 가능성 큼. 이때마다 spec을 갱신할지, 코드를 우선 진행할지 정책 필요.

## 고려한 옵션

### 개발 순서

이전 세션이 제안한 14단계가 출발점이지만 검증 결과 두 가지 결함:
- `dividend_check`이 naver-price 의존 안 함 (spec §11.3 사실 확인)
- `insider_signal` 수정이 마지막에 위치 — 그러나 watchlist_check/scan_execute가 `chg_rsn_filter: "onmarket_only"`로 호출하므로 두 오케스트레이터 앞에 와야 함 (spec §10.12)

ADR-0002의 의미 묶음 단위와도 정합하도록 11 코드 단계 + 1 커뮤니케이션 단계로 정정.

### 단계별 완료 기준

- ε-ii-A: 코드만 먼저 다 짜고 문서/테스트는 일괄
- ε-ii-B: 한 단계 안에서 코드 + 단위 테스트 + field test + 주석 한 세트
- ε-ii-C: 코드 + 테스트만, 문서는 마일스톤 일괄

### spec 변경 처리

- ε-iii-A: 발견 즉시 모든 spec 변경 수정
- ε-iii-B: 모든 spec 변경 누적 후 마일스톤에 일괄 갱신
- ε-iii-C: 강도별 분기 (의미 변경 즉시, 표현 정정 누적)

## 결정

### 개발 순서 — 11 코드 + 1 커뮤니케이션 단계

| # | 단계 | feat 브랜치 | 비고 |
|---|---|---|---|
| 1 | 포크 + 환경 구성 + sagyeongin 디렉토리 골격 | `feat/scaffold-sagyeongin` | 빈 sagyeongin tools 배열 등록, 빌드 통과 |
| 2 | config-store + update_watchlist + update_scan_preset | `feat/config-store` | 다른 도구 시작 전 의존 |
| 3 | srim-stack: required_return + srim (+ naver-price, srim-calc) | `feat/srim-stack` | 스택 통째 |
| 4 | killer-check (재무 + 공시 통째) | `feat/killer-check` | |
| 5 | cashflow-check | `feat/cashflow-check` | |
| 6 | capex-signal | `feat/capex-signal` | |
| 7 | dividend-check | `feat/dividend-check` | naver-price 의존 안 함 |
| 8 | scan-preview | `feat/scan-preview` | API 거의 0, 단순 |
| 9 | insider-chg-rsn 14a (포크 로컬 + field test) | `feat/insider-chg-rsn` | watchlist/execute 앞에 필수 |
| 10 | watchlist-check | `feat/watchlist-check` | insider 수정 후 |
| 11 | scan-execute (checkpoint/resume 포함) | `feat/scan-execute` | 가장 복잡 |
| (12) | insider-chg-rsn 14b → 14c → 14d | (해당 브랜치 작업 후) | 코드 무관, 백그라운드 |

12단계는 코드와 무관한 커뮤니케이션 단계로, 9단계 머지 후 백그라운드로 진행.

### 1단계 작업 목록 — feat/scaffold-sagyeongin

```
1. 포크 (GitHub UI에서)
2. 로컬 clone, upstream remote 추가
   git clone <fork-url>
   cd korean-dart-mcp
   git remote add upstream https://github.com/chrisryugj/korean-dart-mcp.git
   git remote -v   # 확인

3. 첫 빌드/필드테스트 통과 확인 (업스트림 그대로)
   npm install
   npm run build
   .env 파일 생성 (DART API 키)
   node scripts/field-test-v0_9.mjs   # 통과 확인

4. main에서 feat/scaffold-sagyeongin 분기

5. 디렉토리 골격 생성:
   src/tools/sagyeongin/index.ts        # export const sagyeonginTools: ToolDef[] = [];
   src/tools/sagyeongin/_lib/.gitkeep   # 빈 디렉토리 표시

6. src/tools/index.ts 수정:
   import { sagyeonginTools } from "./sagyeongin/index.js";
   ...
   export const TOOL_REGISTRY: ToolDef[] = [
     ... (기존 15개)
     ...sagyeonginTools,
   ];

7. 빌드 통과 확인 (npm run build)

8. 기존 field-test 재실행 — 회귀 0 확인

9. 로컬 운영 디렉토리 준비 (~/.sagyeongin-dart/ — config.json은 안 만듦, 추후 config-store가 처리)

10. README의 사경인 섹션 placeholder 추가 — README-SAGYEONGIN.md 신설
    원본 README.md에 한 줄 fork 안내 추가
    원본 CLAUDE.md에 한 줄 사경인 작업 안내 추가
    docs/sagyeongin/ 디렉토리 생성, 합의된 문서 6종 + ADR 6개 + 인덱스 + CLAUDE.md 배치

11. 커밋 (ADR-0005 형식)
12. main에 rebase then merge --no-ff
```

**1단계 완료 기준**:
- 빌드 통과
- 기존 field-test 통과
- `sagyeonginTools` 빈 배열 등록 상태에서 MCP 서버 기동 확인
- upstream remote 정상 설정 확인

### 단계별 완료 기준 — 한 세트

ε-ii-B 채택. 한 feat 브랜치(= 한 단계) 안에서 다음 항목이 모두 갖춰져야 main에 머지 가능.

| 항목 | 포함 조건 | 비고 |
|---|---|---|
| 도구 코드 (`*.ts`) | 항상 | |
| 순수 계산 단위 테스트 (`*.test.ts`) | 순수 계산 로직 있으면 | srim-calc, KSIC 매칭 등 |
| field test (`scripts/sagyeongin/field-test-*.mjs`) | 항상 | 도구당 1개 이상 |
| fixtures.mjs 갱신 | 새 종목 추가 시 | EXCLUDE 케이스 발견 시 |
| 도구 코드 주석 (철학 근거) | 항상 | ADR-0005의 Ref와 정합 |
| README 갱신 | 큰 항목 추가 시 | 도구별 작은 항목은 마일스톤 일괄 |
| spec 변경 | 의미 변경 발생 시 | 별도 커밋 (ADR-0005) |

**예외**: 1단계 `feat/scaffold-sagyeongin`은 도구 자체가 없으므로 field test 불필요. 빌드/등록 검증만.

### spec 변경 처리 — 강도별 분기

ε-iii-C 채택.

| 변경 유형 | 처리 |
|---|---|
| 새 도구 추가 / 도구 삭제 | 즉시 spec 수정 + ADR 작성 |
| 도구 input/output 스키마 변경 | 즉시 |
| 공식 / 임계값 / 룰 정의 변경 | 즉시 |
| 표현 정정 / 오타 / 예시 갱신 | 일괄 (마일스톤 시 일괄 반영) |
| 명시적 비목표(§11) 추가 | 즉시 (스코프 폭발 방어 핵심) |
| 의존성 표(§11.3) 추가 | 즉시 |
| 매핑 표(§4) 표현 정정 | 일괄 |

**누적 위치**: 일괄 처리 항목은 별도 파일 `docs/sagyeongin/spec-pending-edits.md`에 한 줄씩 추가. spec 본문에 누적 메모 섞이지 않도록.

**즉시 처리 시 절차**:
1. spec 갱신 (의미 변경)
2. ADR 작성 (필요 시)
3. spec 헤더의 수정 이력에 `(ADR-NNNN 반영)` 추가
4. spec 커밋 → 코드 커밋 (ADR-0005의 분리 원칙)

## 근거

### 14단계 결함 두 가지 정정

**dividend_check은 naver-price 의존 안 함**: spec §11.3 표(909줄)에 네이버 금융은 "`sagyeongin_srim` 내부 (current_price 조회)"로만 명시. §10.6의 dividend_yield는 시계열 과거 데이터지 실시간 현재가 아님. DART 사업보고서에서 추출 가능.

**insider 수정의 위치**: spec §10.12 마지막 줄에 "`sagyeongin_scan_execute`와 `sagyeongin_watchlist_check`는 내부에서 `chg_rsn_filter: "onmarket_only"`로 호출"이라 명시. 두 오케스트레이터 앞에 insider 수정이 와야 한다.

### orchestrators 1 → 3 분리

`feat/orchestrators` 한 브랜치로 묶으면:
- 너무 큰 PR (3개 도구 + checkpoint/resume)
- 중간 head 빌드 통과 어려움
- scan_execute의 복잡도 때문에 머지 시점 지연

3개로 쪼개면 의미 단위가 명확하고 단계별 완료 기준 적용 쉬움.

### 한 세트 완료 기준

- ADR-0002의 rebase then merge --no-ff와 정합. main에 들어가는 머지 커밋이 "이 feature의 완성 단위"를 표시하는데, 코드만 들어가고 테스트/문서가 나중에 따로 들어가면 머지 커밋 의미가 흐려짐.
- 컨텍스트 비용 — 코드 다 짠 후 한참 뒤에 테스트를 쓰면 "이 함수가 왜 이렇게 됐더라" 다시 복원해야 함.
- ADR-0003 "샘플 기반 검증"과 정합 — 검증이 구현 직후 일어나야 디버깅 비용 작음.

### 강도별 분기

큰 의미 변경(새 도구, 공식 변경)을 메모로 누적하면 다음 결정이 어긋난 spec 위에서 이뤄질 위험. 즉시 수정해야 후속 결정이 정합.

표현 정정/오타는 코드 흐름 끊을 가치 없음. 일괄이 효율적.

별도 파일(`spec-pending-edits.md`) 분리: spec 본문에 누적 메모 섞이면 본문 가독성 저하.

## 결과

### 좋은 점

- **의존성 충돌 없음** — 호출되는 도구가 호출하는 도구보다 먼저 만들어짐.
- **단계별 완료 기준이 명확** — 한 세트 갖추면 머지, 아니면 머지 안 함.
- **spec 변경이 코드 변경과 분리되어 추적 가능** — git log 분리 + ADR 작성.
- **누적 메모와 본문 분리** — spec 본문 깨끗.

### 트레이드오프

- **한 세트 기준이 작업을 늦출 수 있음**. 코드만 빨리 짜고 싶을 때 테스트/문서 부담. 단 5부 "시간 들이지 않기" 원칙 — 나중에 돌아와서 컨텍스트 복원하는 비용이 더 큼.
- **즉시 처리 spec 변경이 흐름을 끊음**. 단 큰 변경은 흐름이 끊겨야 옳음 — 어긋난 spec 위에서 다음 결정 막아야 함.
- **spec-pending-edits.md 누적분이 잊혀질 위험**. 마일스톤 시점에 의식적으로 점검 필요.

### 미래 변경 시 영향

- **단계 순서 변경 시 의존성 재검증 필수**. 예를 들어 `feat/dividend-check`을 `feat/srim-stack` 앞으로 옮기려면 dividend가 정말 srim에 의존 안 하는지 재확인.
- **새 도구 추가 시** 의존성 그래프 재계산 후 적절한 위치에 삽입.
- **마일스톤 시점에 `spec-pending-edits.md` 일괄 처리** — 그때 spec 버전 minor bump.

## 참조

- spec §10 (도구별 명세)
- spec §10.12 (insider chg_rsn_filter)
- spec §11.3 (외부 의존)
- ADR-0001 (격리 원칙 — 사경인 디렉토리 구조)
- ADR-0002 (브랜치 전략 — feat 브랜치 단위)
- ADR-0003 (테스트 전략 — 검증 영역 분리)
- ADR-0005 (커밋 전략 — spec/코드 분리 커밋)
- ADR-0006 (문서화 — spec-pending-edits.md 위치)
