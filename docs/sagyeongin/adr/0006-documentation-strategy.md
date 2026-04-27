# 0006 - Documentation Strategy

- 상태: Accepted
- 결정일: 2026-04-25
- 결정자: 사용자 + Claude

## 컨텍스트

이 레포는 1인 사용자 + 다수 Claude 세션이 공동 작업한다. 세션 간 컨텍스트 이전 비용이 실재한다 — 매 세션 같은 결정을 재논의하면 5부 "시간 들이지 않기" 원칙 위배.

문서가 풀어야 할 문제:

- 새 Claude 세션이 빠르게 진입할 수 있어야 함
- 큰 의사결정의 단일 출처
- 사경인 도구의 사용자 가이드 (지금은 자기 자신, 나중엔 가능)
- 변경 이력 추적
- spec 갱신 추적

ADR-0001의 격리 원칙과도 정합해야 — 우리 문서가 원본을 침범하면 격리 깨짐.

## 고려한 옵션

### 사경인 문서 디렉토리

- `docs/sagyeongin/` (서브 디렉토리)
- `docs/` 직접 (서브 없음, 평면)
- `sagyeongin/` (root에 별도, 강한 분리감)
- root에 별도 README들만, 다른 문서는 흩어짐

### CHANGELOG

- CL-A: 원본 `CHANGELOG.md`에 사경인 섹션 추가
- CL-B: `CHANGELOG-SAGYEONGIN.md` 별도 파일
- CL-C: `docs/sagyeongin/CHANGELOG.md` (디렉토리 안)
- CL-D: 안 만듦

### ADR

- AD-A: 정식 ADR (`docs/sagyeongin/adr/NNNN-title.md`)
- AD-B: 단일 합의 문서에 모든 결정 누적
- AD-C: 안 만듦
- AD-D: hybrid

### spec 버전 관리

- VS-A: 현재 방식 유지 (헤더 버전 + 수정 이력)
- VS-B: 매 버전마다 별도 파일
- VS-C: 별도 changelog 파일
- VS-D: 현재 방식 + 큰 변경은 ADR로 표현

### Claude 세션 진입 가이드

- 원본 `CLAUDE.md`에 사경인 섹션 추가
- `docs/sagyeongin/CLAUDE.md` 별도

### philosophy 문서 위치

- 레포에 copy
- 레포 외부 (Claude 프로젝트의 첨부 문서로만)

## 결정

### 사경인 문서 디렉토리 — `docs/sagyeongin/`

원본 레포에는 `docs/` 디렉토리 자체가 없다. 우리가 `docs/`를 새로 만들면 그 안에 뭐가 들어가도 원본과 절대 충돌 없다.

```
docs/sagyeongin/
├── CLAUDE.md                        # 사경인 작업 진입 가이드
├── sakyeongin_philosophy.md         # 사상 토대 (Claude 프로젝트에서 copy)
├── sagyeongin-dart-agent-spec.md    # 기능 명세
├── spec-pending-edits.md            # 표현 정정 누적 (ADR-0004)
└── adr/
    ├── README.md                    # ADR 인덱스
    └── NNNN-title.md                # 결정별
```

### CHANGELOG — CL-B (`CHANGELOG-SAGYEONGIN.md` root에)

근거:
- 원본 `CHANGELOG.md`는 매 릴리즈 갱신되는 파일 → CL-A는 충돌 빈도 1위
- root 가시성 (`README-SAGYEONGIN.md`와 한 묶음으로)
- 자주 보는 파일이라 root가 자연스러움

**갱신 시점**: ADR-0002의 태그 시점(`v0.1.0-sagyeongin`)에. 그 사이 갱신 안 함 — 매 머지마다 갱신은 마찰.

**형식**: 원작자 패턴 그대로 채용. Keep a Changelog + 영어 섹션 헤더 + 한국어 본문.

추가 섹션:
- `### Added` — 새 도구
- `### Changed` — 기존 도구 동작 변경
- `### Internal` — _lib 변경, 리팩토링
- `### Philosophy` — 철학 매핑 변경 (spec §10.X 갱신 등)
- `### Verified` — field test 결과

### ADR — AD-A (정식 ADR 도입)

근거: 1인 사용자 + 다수 Claude 세션 = 사실상 팀 작업. ADR이 정확히 세션 간 컨텍스트 이전 비용을 줄이는 도구.

**위치**: `docs/sagyeongin/adr/`
**형식**: 라이트 MADR 5섹션 (컨텍스트 / 고려한 옵션 / 결정 / 근거 / 결과). 상세는 `docs/sagyeongin/adr/README.md` 참조.
**작성 기준**: README 인덱스의 "ADR 작성 기준" 섹션 참조.

### spec 버전 관리 — VS-D (현재 방식 + ADR 활용)

**spec 파일 안**:
- 헤더 `**버전**: v0.X (한 줄 요약)` 유지
- 수정 이력 섹션 유지 (한 줄씩 누적)
- 한 줄 요약은 `(ADR-NNNN 반영)` 형태로 ADR 참조 가능

**ADR과의 역할 분담**:
- ADR — `decisional` 변경 (왜 이렇게 됐는지). 도구 추가/삭제, 공식 변경, 룰 변경.
- spec — 현재 상태 reference (지금 어떻게 되어있는지).
- spec-pending-edits.md — 표현 정정 누적.

**버전 번호 정책**:
- patch (v0.2 → v0.2.1): 표현 정정만 (ADR 없음)
- minor (v0.2 → v0.3): 의미 변경 1개 이상 (ADR 1개 이상 동반)
- major (v0.X → v1.0): MVP 완성 시점

**ADR 도입 자체가 첫 minor bump 트리거** — 이번 세션 끝에 spec v0.3 갱신.

### Claude 세션 진입 가이드

**두 위치 사용**:

1. **원본 `CLAUDE.md` 한 줄 안내 추가**:
   ```markdown
   > 📌 사경인 도구 작업 시: docs/sagyeongin/CLAUDE.md 부터 읽을 것.
   ```
   원본 손대지만 한 줄이라 충돌 비용 무시 가능. 자동 진입을 위해 필요 (새 세션이 원본 CLAUDE.md를 자동 읽으므로).

2. **`docs/sagyeongin/CLAUDE.md` 별도 작성**:
   사경인 작업 진입 가이드. 살아있는 문서. 진행 상태와 자주 막히는 곳을 누적.

### philosophy 문서 — 레포에 copy

`docs/sagyeongin/sakyeongin_philosophy.md`로 copy. 커밋 대상.

근거:
- **자기 완결성**. 5부 "시간 들이지 않기"의 정신은 미래의 자신이 git log + 레포만 보고 컨텍스트 복원 가능해야 한다는 뜻으로 확장. `Ref: philosophy 7부 A`가 외부 의존이면 Claude 프로젝트가 변형될 때 참조 불능.
- **동기화 부담 작음**. philosophy는 안정 문서 — 영상 정리 끝났고 큰 변경 거의 없음.

### README

- **원본 `README.md`**: 거의 그대로 유지. 한 줄 fork 안내만 추가:
  ```markdown
  > 📌 이 레포는 사경인 도구 11종이 추가된 fork입니다. 
  > [README-SAGYEONGIN.md](./README-SAGYEONGIN.md) 참조.
  ```
- **`README-SAGYEONGIN.md`** (root): 신설. 사경인 도구 사용자 가이드. GitHub 레포 첫 화면에서 가시 (root 파일 리스트).

### 최종 디렉토리 트리

```
korean-dart-mcp/                                (fork)
├── README.md                                   ← 원본 + 한 줄 fork 안내
├── README-SAGYEONGIN.md                        ← 신설
├── README-EN.md                                ← 원본 그대로
├── CHANGELOG.md                                ← 원본 (touch 안함)
├── CHANGELOG-SAGYEONGIN.md                     ← 신설
├── CLAUDE.md                                   ← 원본 + 한 줄 안내
├── LICENSE, package.json, tsconfig.json, ...   ← 원본
├── docs/                                       ← 신설
│   └── sagyeongin/
│       ├── CLAUDE.md
│       ├── sakyeongin_philosophy.md
│       ├── sagyeongin-dart-agent-spec.md
│       ├── spec-pending-edits.md
│       └── adr/
│           ├── README.md
│           └── 0001 ~ 0006.md
├── src/
│   └── tools/                                  (ADR-0001 참조)
└── scripts/
    └── sagyeongin/                             (ADR-0003 참조)
```

## 근거

### `docs/sagyeongin/` 선택 이유

분리감을 만드는 더 좋은 방법은 root README 가시성. `README-SAGYEONGIN.md`가 root에 있으면 GitHub 레포 첫 화면에서 즉각 가시. 디렉토리를 root에 띄우는 것보다 효과적이고 일반 컨벤션과 정합.

이 레포는 fork이지 별개 프로젝트가 아니다. 사경인 도구는 korean-dart-mcp의 도구 11개로 등록된다. 디렉토리 구조가 "별개 프로젝트"처럼 보이면 오히려 부정확.

### CL-B 선택 이유

CL-A는 충돌 면 1위. CL-D는 사용자(우리 자신) 관점 손해 — git log는 원자 단위, CHANGELOG는 릴리즈 단위. CL-B는 root 가시성 + README와 정합.

### AD-A 선택 이유

다수 Claude 세션 환경에서 ADR의 컨텍스트 이전 비용 절감 효과가 가장 큼. AD-B (단일 합의 문서)는 결정이 늘어날수록 한 파일이 비대해져 가독성 저하. AD-A는 결정 1개 = 1파일이라 검색/추적 명확.

### VS-D 선택 이유

ADR이 이미 `decisional` 변경 흡수. spec은 "현재 상태 reference", ADR이 "왜 이렇게 됐는지" 기록 — 역할 분담 명확. VS-B (버전별 파일)는 1인 + 다 Claude 세션 환경에 과함. VS-C (별도 changelog)는 ADR과 중복.

### philosophy 레포 copy 이유

자기 완결성과 미래의 Claude 세션 진입 흐름. 외부 의존을 가능한 한 줄여 git log + 레포로 컨텍스트 복원 가능하게 함.

### docs/sagyeongin/CLAUDE.md 신설 이유

원본 CLAUDE.md는 사경인과 무관한 MCP 서버 일반 가이드. 사경인 작업용 가이드를 한 줄 끼워넣는 것보다 별도 파일이 정보 위계상 정확하다.
- 원본 = "이 레포 전반"
- 신설 = "사경인 작업 진입점"

격리 원칙(ADR-0001) 정합 — 신설 파일은 별도, 원본은 최소 수정.

## 결과

### 좋은 점

- **새 Claude 세션이 ADR 인덱스로 빠르게 진입** — 매 세션 결정 재논의 0.
- **결정 단일 출처** — ADR 1개 = 결정 1개.
- **격리 원칙 일관** — 신설 문서가 원본을 거의 침범 안 함.
- **자기 완결성** — philosophy/spec/ADR 모두 레포 안.
- **변경 이력 두 층위** — git log (커밋 단위) + CHANGELOG (릴리즈 단위) + ADR (결정 단위).

### 트레이드오프

- **ADR 작성 부담** — 큰 결정마다 5섹션 작성. 단 다수 세션 환경의 컨텍스트 이전 비용보다는 작음.
- **CHANGELOG 갱신 부담** — 마일스톤 시 한 번이라 자주는 아니지만 0은 아님.
- **원본 README/CLAUDE.md 한 줄 수정의 충돌 가능성** — 한 줄이라 비용 무시 가능.
- **다수 문서로 분산** — 정보가 어디 있는지 알기 위한 학습 곡선. CLAUDE.md의 진입 흐름이 이 비용을 줄임.

### 미래 변경 시 영향

- **ADR이 늘어나면 인덱스 가독성 유지** 위해 카테고리 분류 도입 가능 (예: 메타 결정 / 도구 결정).
- **spec major bump (v1.0)** 시 CHANGELOG 새 섹션, 큰 ADR 작성 가능성.
- **사용자 늘면** README-SAGYEONGIN.md 확장. 현재는 자기 자신용 → 미래엔 외부 사용자용 전환 가능.
- **원본 README/CLAUDE.md 한 줄 수정 충돌** 발생 시 수동 머지로 처리. 1년에 1~2번 가능.

## 참조

- ADR-0001 (격리 원칙 — 신설 디렉토리/파일)
- ADR-0002 (브랜치 전략 — 태그 시점에 CHANGELOG 갱신)
- ADR-0003 (테스트 — `scripts/sagyeongin/` 위치 결정과 정합)
- ADR-0004 (spec 변경 처리 — pending-edits 위치)
- ADR-0005 (커밋 — `docs(adr):`, `docs(spec):` scope 정합)
- 원본 `CLAUDE.md`, `CHANGELOG.md`, `README.md`
