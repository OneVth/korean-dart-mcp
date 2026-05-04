# 0014 - scan_execute checkpoint 저장 위치 — settings vs transient state 분리

- 상태: Accepted
- 결정일: 2026-05-04
- 결정자: 사용자 + Claude

## 컨텍스트

11단계 scan_execute 진입 전 checkpoint 저장 위치 결정 필요. 두 본문이 충돌:

- spec §10.8 line 800: "현재 진행 상태를 SQLite에 저장. 이전 dart-agent watchlist/batch.py 패턴 참조" — SQLite 명시
- ADR-0007 line 9 + line 149: "거의 모든 도구가 ~/.sagyeongin-dart/config.json을 읽고 쓴다" + "scan-execute.ts (checkpoint) 후속 사용처 (예정)" — config.json 단일 저장소

ADR-0007은 5단계 진입 전 결정 (2026-04-28). 5단계 시점에는 checkpoint의 성격이 미합의 상태였고 "후속 사용처 (예정)"이라는 본문은 가정에 불과했다. 11단계 본격 진입 시점에 합의가 자연스럽다 — checkpoint는 settings와 성격이 다르다.

## 고려한 옵션

- **옵션 X** (config.json scan_checkpoints 필드 신설): ADR-0007 단일 저장소 정합. atomic write E1 패턴 그대로 흡수. 단 config.json은 사용자 직접 편집 대상 — 큰 checkpoint(수백 corp 부분 결과) 부담 + version migration B1 부담(v0.1 → v0.2 신설).
- **옵션 Y** (별도 SQLite + ADR-0007 분기 갱신): spec §10.8 정합. better-sqlite3 dep 이미 존재 (`scan-helpers.ts:15`). ADR-0007 line 9 + line 149에 "settings에 한정" 분기 본문 추가.

## 결정

**옵션 Y 채택**.

분기:

- **settings** (사용자 선호 + 도구 영구 상태): `~/.sagyeongin-dart/config.json` (ADR-0007 그대로 — watchlist + scan_presets + active_preset + parameters + required_return_cache)
- **transient state** (도구 실행 중간 상태, 사용자 직접 편집 대상 아님): `~/.sagyeongin-dart/scan_checkpoints.sqlite` (신설 — scan_execute 단독 활용)

scan_checkpoints.sqlite:

- 인프라 위치: `src/tools/sagyeongin/_lib/scan-checkpoint.ts` (β-i 격리 — 사경인 디렉토리 단독)
- 스키마: 11단계 묶음 2 위임 명세에서 결정 (대략 scan_id / created_at / processed_corp_codes / pending_corp_codes / partial_candidates / input_args)
- `SAGYEONGIN_CONFIG_DIR` 환경 변수 정합 (ADR-0007과 동일 — 테스트 격리 자연)

ADR-0007 갱신: line 9 + line 149에 "settings에 한정" 분기 본문 추가. Superseded 아님 — 분기 본문 추가만.

## 근거

- **옵션 Y 채택**:
  - settings vs transient state는 본질적으로 다르다 — settings는 사용자 직접 편집 대상, transient state는 도구 실행 시점 상태. 한 저장소에 합치면 사용자가 transient state를 실수로 편집할 수 있고 atomic write E1 부담도 커진다(큰 checkpoint write가 settings write에 영향).
  - 큰 checkpoint를 자연스럽게 흡수 — SQLite는 partial_candidates(수백 corp의 6 도구 stages)를 자연스럽게 처리.
  - better-sqlite3 dep이 이미 존재 — 신규 dep 부담 0.
  - spec §10.8 정합.
  - SAGYEONGIN_CONFIG_DIR 환경 변수 자연 흡수 — 테스트 격리 지속.
- **옵션 X 거부**: 큰 checkpoint + version migration 부담이 크고 사용자 직접 편집 대상이라는 설계 의도와 어긋남.
- **ADR-0007 Superseded 아님**: line 9 + line 149는 settings에는 그대로 정합. transient state만 분기 본문을 추가하므로 작은 갱신.

## 결과

좋은 점:

- settings vs transient state 분기가 명확 — 사용자 직접 편집 대상 보호
- 큰 checkpoint 자연 흡수
- better-sqlite3 dep 추가 부담 0
- ADR-0007 작은 갱신 — Superseded 아님
- spec §10.8 정합

트레이드오프:

- 사경인 도구 안에 두 저장소가 공존(config.json + scan_checkpoints.sqlite) — 단 분기가 자연스러움
- scan-checkpoint.ts 단위 테스트 부담 — better-sqlite3 in-memory 활용(ADR-0003 정합)
- SQLite 부분 손상(ENOENT / 스키마 어긋남) — scan-checkpoint.ts에서 try/catch로 흡수(사용자가 직접 sqlite 파일 삭제로 회복)

미래 변경 시 영향:

- 다른 사경인 도구에 transient state가 새로 생기면 본 ADR이 자연 적용. 단일 scan_checkpoints.sqlite vs 도구별 SQLite 분리는 그때 검토.
- scan_checkpoints.sqlite 스키마 변경 시 마이그레이션 검토(ADR-0007 B1 정합 — 지원 안 되는 version → throw)
- 11단계 묶음 2 위임 명세에서 scan-checkpoint.ts 인터페이스 결정(load / save / list / delete + 분기)

## 참조

- spec §10.8 (scan_execute Input/Output + 체크포인트/리줌)
- ADR-0007 (config-store — settings에 한정으로 분기 갱신)
- ADR-0009 (rate limit + wrapper — checkpoint 시점 결정 정합)
- ADR-0012 (분할 실행 + 사용자 명시 재개 — 본 ADR의 인프라)
- 후속 사용처 (예정): scan-execute.ts (11단계)
