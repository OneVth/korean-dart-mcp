# 0005 - Commit Conventions

- 상태: Accepted
- 결정일: 2026-04-25
- 결정자: 사용자 + Claude

## 컨텍스트

ADR-0002가 rebase then merge --no-ff를 채택했다. 이는 **feat 브랜치의 모든 커밋이 main에 그대로 보존된다**는 뜻이다. 따라서 각 커밋이 의미 있는 단위여야 한다 — squash로 뭉개지지 않으므로.

원작자의 커밋 패턴을 확인한 결과 일관된 컨벤션이 있다 (Conventional Commits + 한국어 본문). 우리도 이 컨벤션을 따라야 미래의 자신과 다른 Claude 세션이 git log를 일관된 멘탈 모델로 읽을 수 있다.

추가로, 사경인 도구는 spec/철학 매핑이 핵심이라 커밋이 어느 spec 섹션 / 어느 철학 부에 근거한 변경인지 추적 가능해야 한다.

## 고려한 옵션

### 메시지 형식

- 원작자 컨벤션 따름 (Conventional Commits + 한국어 + scope)
- 자체 형식 정의

### 언어

- 영어 본문
- 한국어 본문 (원작자 패턴)
- 혼합

### 철학 근거 명시

- 명시 안 함
- 본문에 자연스럽게 녹임
- 별도 trailer 라인 (`Ref:`)

### 커밋 크기

- 원자적 (한 줄 수정마다 한 커밋)
- 의미 단위 (수치 가이드 없이)
- 큰 묶음 (브랜치 전체 한 커밋)

### spec 변경 + 코드 변경 처리

- 한 커밋
- 두 커밋 분리 (spec 먼저, 코드 나중)

## 결정

### 메시지 형식 — Conventional Commits + 한국어, 원작자 패턴

```
<type>(<scope>): <한국어 제목>

<한국어 본문 (선택)>

Ref: <참조>
```

**type**:
- `feat:` 새 기능
- `fix:` 버그 수정
- `refactor:` 동작 동일, 내부 구조 변경
- `docs:` 문서만
- `test:` 테스트만 추가/수정
- `chore:` 빌드/의존성/설정

**scope**: 도구 이름 또는 컴포넌트 (영어, 소문자, kebab-case)
- feat 브랜치 안 커밋: `feat(killer-check):`, `feat(srim):`
- merge commit: `feat(killer-check): 7부 A 통합` 같은 의미 단위
- spec 변경: `docs(spec):`
- ADR 추가: `docs(adr):`
- philosophy 변경: `docs(philosophy):`

### 언어

- **헤더 키워드** (feat/fix/docs/...): 영어 (Conventional Commits 표준)
- **scope**: 영어 소문자
- **제목, 본문**: 한국어 (원작자 패턴)

### 철학 근거 명시 — 본문 마지막 `Ref:` 한 줄

원작자는 명시 안 하지만, 사경인 도구는 spec/철학 매핑이 핵심이라 우리만 추가 가치 있음.

```
feat(killer-check): 재무 기반 룰 4종

- consecutive_operating_loss: 별도재무제표 영업이익 4년 연속 음수
- low_revenue_kosdaq: 코스닥 + 매출 30억 미만
- 다년도 조회 시 fs_div=OFS 명시 (HTS 연결만 보여주는 함정)

Ref: spec §10.1, philosophy 7부 A
```

**Ref 표기 룰**:
- spec 섹션: `§숫자.숫자` (예: `§10.1`)
- 철학: `7부 A` 형태 (philosophy 문서의 부 단위)
- ADR: `ADR-NNNN`
- 외부 참조: URL

### 커밋 크기 — 의미 단위 (수치 가이드 없음)

각 커밋 = "이 부분만 빼서 다른 곳에 적용해도 의미 통하는" 단위.

- WIP/typo 수정 같은 노이즈는 머지 전 rebase로 정리 (`git rebase -i`)
- 도구당 평균 1~3 커밋이 자연스러우나, 도구의 복잡도에 따라 더 많거나 적을 수 있음
- 수치 가이드(예: 브랜치당 N 커밋)는 두지 않음 — 의미 단위 원칙만 따름

**커밋 크기 판단 가이드** (강제 규칙 아님):
- 너무 큼: 본문에 "and"/"또한"이 여러 번 나오면 분할 검토
- 너무 작음: 다음 커밋 없이는 빌드 안 통하면 묶을 검토 (단 spec/코드 분리는 예외)

### spec 변경 + 코드 변경 — 분리 커밋

같은 브랜치 안에서 spec 변경과 코드 변경이 함께 발생하면 두 커밋으로 분리. spec 먼저, 코드 나중.

**예시 흐름**:
```
1. docs(spec): §10.1 killer_check에 frequent_rights_offering 룰 추가
2. feat(killer-check): 재무 룰 4종 + frequent_rights_offering
3. test(killer-check): field-test-killer.mjs — 삼성전자 PASS, [상폐종목] EXCLUDE
```

**예외**: 표현 정정/오타 같은 일괄 처리 항목은 `spec-pending-edits.md`에만 기록 (커밋 안 만듦), 마일스톤 시 일괄 spec 갱신을 한 `docs(spec):` 커밋으로.

## 근거

### 원작자 컨벤션을 따르는 이유

원작자 30 커밋 모두 일관된 패턴 (`feat(v0.9.2):`, `fix(v0.7.1):`, `docs:` 등). ADR-0003의 "원작자 컨벤션 일치" 정신과 정합. 미래의 Claude 세션이 같은 멘탈 모델로 git log를 읽음.

### 한국어 본문

원작자 본문이 한국어. 우리 사용자(1인)도 한국어 사용자. 영어로 쓸 이유 없음.

### Ref 추가 (원작자에 없는 추가)

원작자의 도구는 일반 OpenDART 래퍼라 spec/철학 매핑 필요 없음. 우리는 사경인 철학 매핑이 핵심 가치라 추가 정보가 가치를 정당화.

`Ref:` trailer 형식은 git의 표준 trailer 패턴 (Signed-off-by와 같은 위치). 자연스럽게 녹음.

### 의미 단위 (수치 가이드 없는 이유)

수치 가이드(예: "브랜치당 1~5 커밋")는 강제로 읽혀 의미 단위 원칙을 왜곡할 수 있다. 의미 단위만 원칙으로 두고 결과 수치는 자연 발생.

### spec/코드 분리 커밋

세 가지 이유:

1. **spec 변경 자체가 의사결정 기록**. 분리하면 `git log spec/sagyeongin-dart-agent-spec.md`로 의사결정 history 자연 추출.
2. **bisect 정확도**. spec 변경이 동작 변경의 근원이면, 분리 커밋이 bisect 결과 정확.
3. **rebase 정리 자유도**. 같은 브랜치 안에서 spec 커밋을 앞으로, 코드 커밋을 뒤로 정렬하면 git log가 자연스럽게 "결정 → 구현" 순서.

## 결과

### 좋은 점

- **원작자 컨벤션 일치** — git log 읽기 쉬움.
- **철학 근거 추적 가능** — `git log --grep="philosophy 7부"` 같은 검색 가능.
- **의사결정 history 추출 가능** — spec 변경 커밋만 따로 볼 수 있음.
- **머지 커밋 그룹핑 + 의미 단위 보존** — ADR-0002의 rebase then merge --no-ff와 정합.

### 트레이드오프

- **Ref 작성 부담** — 매 커밋마다 spec/philosophy 위치 확인. 단 도구 만들 때 항상 spec을 보고 있으므로 추가 비용 작음.
- **분리 커밋 부담** — spec과 코드를 한 작업 흐름에서 만들었어도 두 커밋. 단 rebase로 정리 가능.
- **rebase -i 작업 필요성** — WIP 커밋 정리. 1인 개발이라 익숙해지면 마찰 작음.

### 미래 변경 시 영향

- **새 type 추가 가능** — `style:`, `perf:` 등 Conventional Commits 표준에 있는 type. 필요 시 추가.
- **scope 명명 컨벤션** — 도구 추가 시 자연스럽게 따름. 큰 영역(예: orchestrators) 추가 시 새 scope 합의 필요 가능.
- **Ref 형식 확장 가능** — 새 참조 대상(예: 외부 논문, 책 페이지) 추가 가능.

## 참조

- ADR-0002 (rebase then merge --no-ff — 커밋 보존)
- ADR-0003 (한 세트 완료 기준 — test/docs 커밋 트리거)
- ADR-0004 (spec 변경 즉시 처리 — 분리 커밋 트리거)
- spec 전체 (Ref 대상)
- philosophy 전체 (Ref 대상)
- 원본 컨벤션: `git log --pretty=format:"%h %s" -30`
