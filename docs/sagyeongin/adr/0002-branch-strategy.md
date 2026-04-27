# 0002 - Branch Strategy

- 상태: Accepted
- 결정일: 2026-04-25
- 결정자: 사용자 + Claude

## 컨텍스트

ADR-0001로 디렉토리 격리가 정해졌다. 다음은 작업 흐름 — 어떤 브랜치 구조로 작업하고 어떻게 머지하느냐. 두 압력이 있다.

첫째, **upstream sync 부담**. 원작자가 정기 갱신하는 레포라 우리도 정기 sync 필요. 이때 깨진 머지가 main에 직접 들어가면 위험.

둘째, **1인 개발의 단순함 우선**. 복잡한 git workflow는 5부 "시간 들이지 않기" 원칙 위배.

격리 원칙(ADR-0001)으로 충돌 면이 좁아진 상태이므로 무거운 격리 브랜치 전략은 과잉이다.

## 고려한 옵션

### A1 - main만

모든 작업을 main에 직접 커밋. feat 브랜치 없음.

**문제**: upstream sync 시 깨진 머지가 main에 직접 영향. 자기 작업의 의미 단위 추적도 어려움.

### A2 - main + feat/* + 단발성 sync

기능 작업은 feat 브랜치에서, upstream sync는 필요 시 단발성 `sync-upstream-vX.Y` 브랜치에서. 둘 다 main에 머지.

### A3 - main + 상시 upstream-sync + feat/*

upstream-sync를 상시 브랜치로 두고 일정 주기로 main에 통합.

**문제**: ADR-0001로 충돌 면이 정량적으로 작아져 (2줄 + 2군데), 상시 브랜치의 격리 가치가 비용보다 작다.

## 결정

**A2 채택.** 다음 구조로 운영한다.

### 브랜치 구조

- **main** — 항상 빌드/테스트 통과 상태 유지. 모든 기능이 머지되는 단일 안정 브랜치.
- **feat/*** — 의미 묶음 단위로 분기. 머지 후 삭제.
- **sync-upstream-vX.Y** — upstream 업데이트 머지 시 단발성 생성. 머지 후 삭제.

### feat 브랜치 단위 — 의미 묶음

도구당 1 브랜치는 도구 의존성을 무시한다. 의미 묶음 단위로 11개 브랜치를 운영한다.

| # | 브랜치 | 내용 |
|---|---|---|
| 1 | `feat/scaffold-sagyeongin` | 디렉토리 골격 + index.ts 등록 |
| 2 | `feat/config-store` | config-store + update_watchlist + update_scan_preset |
| 3 | `feat/srim-stack` | required_return + srim + naver-price + srim-calc |
| 4 | `feat/killer-check` | 재무 + 공시 통째 |
| 5 | `feat/cashflow-check` | |
| 6 | `feat/capex-signal` | |
| 7 | `feat/dividend-check` | |
| 8 | `feat/scan-preview` | |
| 9 | `feat/insider-chg-rsn` | insider_signal 직접 수정 (β-iii 14a) |
| 10 | `feat/watchlist-check` | |
| 11 | `feat/scan-execute` | checkpoint/resume 포함 |

순서는 ADR-0004 (개발 순서) 참조.

### 머지 방식 — rebase then merge --no-ff

feat 브랜치를 main에 통합하는 절차:

```bash
# feat 브랜치에서
git rebase main                    # main 최신 위로 다시 쌓음 (linear)
git checkout main
git merge --no-ff feat/xyz         # merge commit 생성, fast-forward 안 함
git branch -d feat/xyz             # feat 브랜치 삭제
```

**효과**:
- 커밋 보존 (squash로 뭉개지 않음)
- rebase로 머지 시점 충돌 최소화
- `--no-ff`로 생긴 merge commit이 "이 커밋 묶음이 한 feature였다"는 그룹핑 정보를 남김
- `git log --first-parent main`로 feature 단위 히스토리 추출 가능

### upstream sync 절차

```bash
git fetch upstream
git checkout -b sync-upstream-v0.9.3   # main 기반
git merge upstream/main                # merge commit 사용 (rebase 아님)
# 충돌 해결 (예상 지점: tools/index.ts, insider-signal.ts)
npm run build                          # 빌드 통과 확인
node scripts/field-test-v0_9.mjs       # 회귀 0 확인
git checkout main
git merge --ff-only sync-upstream-v0.9.3
git branch -d sync-upstream-v0.9.3
```

### 태그 정책

MVP 완성 시점에 한 번 — `v0.1.0-sagyeongin`. 원작자 버전(`v0.9.X`)과 충돌하지 않도록 `-sagyeongin` suffix.

포스트-MVP 태그는 그때 결정.

### upstream remote 설정

```bash
git remote add upstream https://github.com/chrisryugj/korean-dart-mcp.git
git remote -v   # origin = 우리 fork, upstream = 원본
```

## 근거

### A1이 거부된 이유

깨진 머지가 main을 감염시킬 수 있고, 자기 작업의 의미 단위가 git log에서 사라진다.

### A3이 거부된 이유

ADR-0001로 충돌 면이 매우 좁아졌다. 상시 격리 브랜치의 가치가 부담을 정당화하지 못함.

### A2를 선택한 이유

**격리와 단순함의 균형**. feat 브랜치로 작업의 의미 단위 보존, 단발성 sync로 깨진 머지 격리, 그러나 상시 브랜치 부담 없음.

### rebase then merge --no-ff를 선택한 이유 (squash 대신)

squash 머지는 커밋을 뭉개므로 feat 브랜치 안의 의미 단위 정보가 사라진다. rebase then merge --no-ff는 커밋을 보존하면서 merge commit으로 그룹 표시를 함께 남긴다. ADR-0005 (커밋 전략)의 "의미 단위 커밋"과 정합 — 각 커밋이 main에 그대로 남으므로 커밋 단위가 의미를 가져야 한다.

upstream sync에 merge commit (rebase 아님)을 쓰는 이유: rebase는 우리 main 커밋의 SHA를 변경한다. 이미 push된 main이라면 force-push 필요 — 위험. merge commit은 SHA 보존.

### 의미 묶음 단위 (도구당 1 브랜치 대신)

도구당 1 브랜치는 11개 → spec §10에서 srim → required_return → naver-price 같은 의존성을 인위적으로 쪼갠다. srim_stack을 한 브랜치로 묶으면 자연스럽다. 단순 도구는 1 도구 = 1 브랜치, 의존 묶음은 함께 한 브랜치 = 11 브랜치.

## 결과

### 좋은 점

- **upstream sync가 main에 영향 주지 않고 격리 가능** (단발성 sync 브랜치).
- **feature 단위 추적** (`git log --first-parent`).
- **각 커밋의 의미 보존** (rebase + merge --no-ff).
- **상시 격리 브랜치 부담 없음** — 1인 개발에 적합.

### 트레이드오프

- **rebase 후 force-push가 필요한 경우 발생 가능**. feat 브랜치를 push한 후 rebase하면 force-push 필요. 1인 개발이라 영향 없지만, 만약 협업 발생 시 주의.
- **sync-upstream 브랜치를 매번 만들고 지우는 마찰**. 단발성이라 부담 작지만 0은 아님.
- **MVP 전 태그 없음** — 중간 마일스톤 추적은 git log에 의존.

### 미래 변경 시 영향

- **MVP 완성 후 태그 정책 재검토**: 포스트-MVP에서 정기 릴리즈 태그를 채택할지 결정.
- **협업자 합류 시 force-push 정책 재검토**: 현재는 1인이라 자유로움.
- **원작자가 main 브랜치명을 변경하면** (`master` → `main` 같은 큰 변경) sync 절차의 브랜치명 갱신 필요.

## 참조

- ADR-0001 (격리 원칙으로 인한 충돌 면 축소)
- ADR-0004 (개발 순서 — feat 브랜치 순서 결정)
- ADR-0005 (커밋 전략 — rebase + merge --no-ff와 정합)
