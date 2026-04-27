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
- [ ] 1단계: `feat/scaffold-sagyeongin` — 디렉토리 골격 + index.ts 등록
- [ ] 2단계: `feat/config-store` — config-store + update_watchlist + update_scan_preset
- [ ] 3단계: `feat/srim-stack` — required_return + srim + naver-price + srim-calc
- [ ] 4단계: `feat/killer-check`
- [ ] 5단계: `feat/cashflow-check`
- [ ] 6단계: `feat/capex-signal`
- [ ] 7단계: `feat/dividend-check`
- [ ] 8단계: `feat/scan-preview`
- [ ] 9단계: `feat/insider-chg-rsn` (14a — 포크 로컬 + field test)
- [ ] 10단계: `feat/watchlist-check`
- [ ] 11단계: `feat/scan-execute`
- [ ] 12단계 (백그라운드): insider 14b/c/d — Issue → 원작자 의향 확인 → PR

### 현재 작업 단계

마일스톤 합의 완료. 다음 작업은 1단계 `feat/scaffold-sagyeongin`.

ADR-0004의 1단계 작업 목록 12 항목 참조.

## 자주 막히는 곳

이 섹션은 구현 진행하며 누적된다. 새 세션이 같은 막힘을 반복하지 않도록 Claude가 발견한 함정을 기록.

(아직 구현 시작 전. 채워질 예정.)

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
