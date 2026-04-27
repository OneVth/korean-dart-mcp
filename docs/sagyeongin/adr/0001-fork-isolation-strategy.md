# 0001 - Fork Isolation Strategy

- 상태: Accepted
- 결정일: 2026-04-25
- 결정자: 사용자 + Claude

## 컨텍스트

이 레포는 [korean-dart-mcp](https://github.com/chrisryugj/korean-dart-mcp) (MIT, v0.9.2)의 fork이다. 원본은 OpenDART API를 MCP 도구 15개로 래핑한 일반 도구이고, 우리는 그 위에 사경인 회계사 투자 철학 기반의 도구 11개를 추가한다.

원작자는 활발히 개발 중이다 (최근 30 커밋 모두 의미 있는 기능 추가). 우리는 정기적으로 upstream을 sync해야 하므로, 사경인 코드와 원본 코드의 충돌 면을 최소화할 디렉토리 구조 결정이 필요하다.

이 결정은 다른 모든 결정의 전제다. 디렉토리가 정해져야 브랜치 전략(ADR-0002), 테스트 위치(ADR-0003), 개발 순서(ADR-0004)가 결정 가능하다.

## 고려한 옵션

### B1 - 완전 격리

`src/tools/sagyeongin/` 안에 모든 사경인 코드, 원본 코드 0 touch.

**문제**: 도구를 MCP 서버에 등록하려면 `src/tools/index.ts`의 `TOOL_REGISTRY` 배열에 추가해야 한다. 이 파일을 건드리지 않으면 도구가 작동하지 않는다. 구조적으로 불가능.

### B2 - 최소 수정 격리

공용 등록 파일은 최소 패턴으로 수정하고, 나머지 사경인 코드는 완전 격리.

```ts
// src/tools/index.ts
import { sagyeonginTools } from "./sagyeongin/index.js";  // 신규 1줄
export const TOOL_REGISTRY: ToolDef[] = [
  resolveCorpCodeTool,
  // ... 기존 15개 (touch 안함)
  ...sagyeonginTools,  // 신규 1줄
];
```

원본 수정 면 = 2줄. 그 외 모든 사경인 코드는 `src/tools/sagyeongin/` 안에만.

### B3 - 자유 수정

원본 도구의 동작도 필요하면 자유롭게 수정.

**문제**: upstream sync 시 충돌이 잦아진다. 원작자가 같은 파일을 갱신할 때마다 수동 머지 필요. 1인 개발 + 5부 "시간 들이지 않기" 원칙 위배.

## 결정

**B2 채택.** 사경인 코드는 `src/tools/sagyeongin/` 디렉토리에 격리한다. 원본 코드 수정은 다음 두 곳으로 한정한다.

### 디렉토리 구조

```
src/tools/
├── index.ts                       # import 1줄 + ...sagyeonginTools 1줄 추가
├── insider-signal.ts              # chg_rsn_filter 추가 수정
├── sagyeongin/                    # 신설 디렉토리
│   ├── index.ts                   # sagyeonginTools 배열 export
│   ├── _lib/                      # 사경인 공유 로직
│   │   ├── srim-calc.ts
│   │   ├── kis-rating-scraper.ts
│   │   ├── naver-price.ts
│   │   ├── config-store.ts
│   │   └── pipeline.ts
│   ├── killer-check.ts
│   ├── cashflow-check.ts
│   ├── capex-signal.ts
│   ├── required-return.ts
│   ├── srim.ts
│   ├── dividend-check.ts
│   ├── scan-preview.ts
│   ├── scan-execute.ts
│   ├── watchlist-check.ts
│   ├── update-watchlist.ts
│   └── update-scan-preset.ts
└── ... (원본 도구 14개, touch 안함)
```

### 도구당 1파일 평면 (β-i)

`src/tools/sagyeongin/` 내부는 도구당 1파일 평면 구조. 7부 매핑별 서브디렉토리는 만들지 않는다. 11개 도구는 평면이 부담 없다.

### 공유 로직 위치 (β-ii)

공유 로직은 `src/tools/sagyeongin/_lib/` 하위에 둔다. `src/lib/sagyeongin/`에 두지 않는다. 사경인 코드 100%가 한 디렉토리(`src/tools/sagyeongin/`)에 모이도록 한다.

### insider_signal 수정 (β-iii)

원본 `src/tools/insider-signal.ts`에 `chg_rsn_filter?: "onmarket_only" | "all"` 파라미터를 추가한다. 기본값 `"all"` (원본 동작 유지). 두 군데 수정 — Input zod 스키마, filter 로직.

수정 후 절차:
- **14a**: 포크 로컬에서 구현 + field test
- **14b**: GitHub Issue 생성 (필수). 원작자에게 이 로직을 업스트림에 추가할 의향이 있는지 문의. 레퍼런스 PR 형태로 구현 첨부
- **14c**: 원작자 긍정 응답 후에만 PR 제출
- **14d**: 거부되거나 응답 없으면 포크에만 유지

## 근거

### B1이 거부된 이유

도구 등록이 구조적으로 불가능. 원본의 `TOOL_REGISTRY` 배열이 단일 등록 메커니즘이라 우회 불가.

### B3이 거부된 이유

머지 충돌 면이 자유 수정에 비례한다. 1인 개발에서 매 sync마다 수동 머지는 5부 "시간 들이지 않기" 원칙 위배.

### B2를 선택한 이유

**머지 충돌 면을 정량적으로 최소화한다.** 원본 수정 = 2줄(index.ts) + 2군데(insider-signal.ts). 그 외 사경인 코드는 신규 디렉토리이므로 충돌 발생 0. index.ts는 우리 수정이 항상 배열 끝부분이라 git auto-merge가 보통 처리한다.

**`_lib/` 위치 (옵션 Y)를 선택한 이유**: spec §3.1 "사경인 도구는 `tools/sagyeongin/` 하위에 격리" 원칙과 가장 잘 맞는다. `src/lib/sagyeongin/`로 분리하면 사경인 코드가 두 디렉토리(`src/tools/sagyeongin/` + `src/lib/sagyeongin/`)에 흩어진다. `_lib/`로 안에 두면 사경인 코드 통째로 보기/옮기기/격리가 명확하다. 원본 `src/tools/_helpers.ts`도 underscore prefix로 헬퍼를 도구 디렉토리 안에 두는 선례가 있다.

**도구당 1파일 평면**: 원본 컨벤션 일치 (15개 도구 모두 `src/tools/*.ts` 평면). 미래의 자신과 다른 Claude 세션이 같은 멘탈 모델로 읽는다. 11개는 서브디렉토리 분할이 과한 구조화.

**β-iii가 β1(직접 수정)이고 β2(wrapper)가 아닌 이유**: 원본 handler가 거래 항목의 `chg_rsn` 필드를 결과에 보존하지 않는다 (원본 코드 211~228줄 검증). 따라서 wrapper로 호출 후 사후 필터링이 구조적으로 불가능. 별도 구현(β2-broad)은 ~200줄 코드 중복 + 업스트림 개선 추적 불가로 부담이 크다. 직접 수정 + Issue-first PR이 spec §10.12 결정과도 정합.

## 결과

### 좋은 점

- **머지 충돌 면 정량적으로 최소** (2줄 + 2군데). upstream sync 비용 거의 0.
- **사경인 코드 100%가 단일 디렉토리** (`src/tools/sagyeongin/`). 통째로 보기/이동/제거 가능.
- **원본 컨벤션과 정합** (도구당 1파일, underscore prefix 헬퍼). 멘탈 모델 일관.
- **β-iii 직접 수정으로 코드 중복 0**, 업스트림 개선 자동 추적 가능 (PR 머지 시).

### 트레이드오프

- **`src/lib/` 일반 컨벤션과 미세하게 어긋남**. 원본은 `src/lib/`에 공용 라이브러리를 두지만 우리는 `src/tools/sagyeongin/_lib/`. 격리 우선 결정이라 정당화됨.
- **`src/tools/index.ts`와 `insider-signal.ts`는 충돌 가능 영역**. 원작자가 이 두 파일을 크게 리팩토링하면 (예: `TOOL_REGISTRY`를 다른 자료구조로 변경) 머지 시점에 수동 처리 필요. 현재 컨벤션으로는 그런 리팩토링 가능성 낮음.

### 미래 변경 시 영향

- **이 결정 변경은 거의 모든 작업 영향**. 디렉토리를 옮기면 import 경로, 빌드 설정, ADR-0003 (테스트 위치), ADR-0004 (개발 순서)가 영향받는다.
- **β-iii 14c (PR 머지) 시점**: insider-signal.ts의 우리 수정이 업스트림에 흡수되어 우리 fork에서 해당 수정 제거 가능. 단 사경인 도구가 `chg_rsn_filter: "onmarket_only"`로 호출하는 패턴은 그대로 유지.
- **새 도구 추가 시**: `src/tools/sagyeongin/` 안에 파일 추가 + `src/tools/sagyeongin/index.ts`의 `sagyeonginTools` 배열에 추가. 원본 파일 추가 수정 없음.

## 참조

- spec §3.1 (도구 격리 원칙)
- spec §10.12 (insider_signal chg_rsn_filter 결정)
- spec §11.3 (외부 의존 표)
- 원본 컨벤션 검증: `src/tools/index.ts`, `src/tools/_helpers.ts`, `src/tools/insider-signal.ts`
