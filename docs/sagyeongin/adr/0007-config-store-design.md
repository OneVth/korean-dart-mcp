# 0007 - config-store Design

- 상태: Accepted
- 결정일: 2026-04-28
- 결정자: 사용자 + Claude

## 컨텍스트

ADR-0001~0006으로 디렉토리/브랜치/테스트/순서/커밋/문서가 정해진 후 첫 코드 작업이 시작됐다. 사경인 도구 11개 중 `update_watchlist`, `update_scan_preset` 외에도 `srim`의 `required_return_cache` 갱신, `watchlist_check` 등 settings 도구가 `~/.sagyeongin-dart/config.json`을 읽고 쓴다. (scan_execute checkpoint는 ADR-0014에 의해 별도 SQLite로 분리 — settings vs transient state는 본질적으로 다름.)

이 영속화 책임을 한 모듈(`_lib/config-store.ts`)에 모은다는 결정은 ADR-0001 (격리 + `_lib` 위치)에서 자연 도출됐으나, 인터페이스 형태와 동작 정책 8개 영역은 spec/ADR 어디에도 명시 없었다. 후속 도구가 모두 이 모듈을 거치므로 결정의 단일 출처가 필요하다.

## 고려한 옵션

8개 결정 영역.

### A — 인터페이스 추상 수준
- A1 필드별 전용 메서드 (`getWatchlist`/`setWatchlist` 등)
- A2 통째 read/write (`loadConfig`/`saveConfig`)
- A3 read + 부분 patch

### B — 마이그레이션 정책 (`version` 필드)
- B1 모르는 version 만나면 throw + 명확한 메시지
- B2 마이그레이션 체인 자동 변환
- B3 version 무시

### C — 부분 손상 처리

JSON 파싱 실패와 부분 결손을 분리 처리할지.

### D — 동시성
- D1 lock 없음
- D2 lockfile
- D3 in-memory 직렬화

### E — write 패턴
- E1 임시 파일 + rename (atomic)
- E2 직접 쓰기

### F — 기본값 머지 (load 시)
- F1 자동 보강 (사용자 파일에 결손 키)
- F2 메모리만 보강
- F3 결손 = 에러

### G — mkdir 자동 처리
- G1 자동 생성
- G2 부재 시 에러

### H — config 파일 자체 부재 (첫 호출)
- H1 디스크에 기본 config 즉시 생성
- H2 메모리에 기본 config만 반환

## 결정

| 영역 | 결정 | 비고 |
|---|---|---|
| A | A2 (`loadConfig`/`saveConfig` 2개만 export) | 영속화 계층만, 도메인 로직 없음 |
| B | B1 (지원 안 되는 version → throw) | YAGNI, 마이그레이션은 v0.2 정의 시점에 작성 |
| C | 분리 (파싱 실패 throw, 부분 결손 보강) | |
| D | D1 (lock 없음) | 1인 사용자 가정 |
| E | E1 (tmp + rename) | atomic write |
| F | F1 + 명시 룰 | 키 부재(`undefined`)만 보강, 빈 값(`{}`, `[]`)은 사용자 의도로 그대로 유지 |
| G | G1 (mkdir 자동) | `saveConfig` 시점에 처리 |
| H | H2 (메모리만, 디스크 안 만듦) | `list` 같은 read-only가 부작용 만들지 않음 |

### 인터페이스 표면

`src/tools/sagyeongin/_lib/config-store.ts`에서 export:

- 타입 5개: `WatchlistEntry`, `ScanPreset`, `SagyeonginParameters`, `RequiredReturnCache`, `SagyeonginConfig`
- 함수 2개: `loadConfig()`, `saveConfig(config)`

비공개: `DEFAULT_CONFIG`, `getConfigDir`, `getConfigPath`, `mergeWithDefaults`.

### 부분 결손 보강 (F1) 깊이

- 깊이 1: 최상위 6개 필드 중 결손 키. `version`은 외부 검증(B1).
- 깊이 2: `parameters` 안 4개 키, `required_return_cache` 안 3개 키.
- 깊이 3 이상 (예: `watchlist` 항목 안 필드): 보강 안 함, 사용자 책임.

### 환경 변수 override

테스트 격리를 위해 `SAGYEONGIN_CONFIG_DIR` 환경 변수가 설정되면 그 경로 사용. 없으면 `~/.sagyeongin-dart/`. 도구 코드는 매 호출 시 lazy 평가하므로 import 순서 무관.

### 호출자 패턴

후속 도구는 모두 다음 패턴:

```typescript
const config = await loadConfig();
// config.X = ...  (도구가 자기 도메인 처리)
await saveConfig(config);
return { /* spec output */ };
```

## 근거

### A2가 채택된 이유

A1 (필드별 메서드)은 config-store가 도구 도메인 지식(어떤 필드를 어떻게 갱신)을 갖게 만든다. 후속 도구마다 새 메서드 추가가 필요해 인터페이스가 발산. A2는 spec §6.2의 6개 필드를 한 객체로 다루는 것과 정합하고 ADR-0001 `_lib` 정신("공유 영속화 책임만, 도구별 로직 없음")과 부합. 도구의 boilerplate는 호출자 패턴(load → mutate → save)으로 흡수.

### B1이 채택된 이유

마이그레이션 체인은 v0.2가 정의될 때 작성하면 충분 (YAGNI). 지금 추측으로 작성하면 v0.2 실제 변경과 어긋날 가능성. 명확한 throw 메시지로 사용자가 수동 대응할 시간을 확보.

### F1 + 명시 룰의 이유

자동 보강은 사용자가 모르는 새 키를 부드럽게 받아들임 (spec 진화 대응). 단 빈 객체/배열을 보강하면 사용자가 의도적으로 비운 상태(예: `scan_presets: {}`로 default를 지운 상황)를 덮음. "키 부재(`undefined`)만 보강, `{}`/`[]` 명시는 유지" 룰로 두 의도 모두 안전하게 지원.

### H2가 채택된 이유

H1은 `list` 같은 read-only 호출이 디스크에 파일을 만들어버려 직관 어긋남. H2는 첫 변경 시점(`add`/`create`/`set_active` 등)에 `saveConfig`가 호출되어야 디스크에 파일 생성. mkdir도 같은 시점(G1).

### atomic write (E1)의 정신

`saveConfig` 도중 SIGINT/크래시 시 부분 쓰기 방지. `fs.writeFile(tmp)` 후 `fs.rename(tmp, target)`. 동일 파일시스템 내 rename은 atomic. tmp 파일명 충돌 가능성은 D1 가정으로 무시.

## 결과

### 좋은 점

- **인터페이스 표면 최소** (2 함수) — 후속 도구가 같은 패턴으로 작성 가능.
- **도메인 로직 없음** — 도구가 자기 책임 영역만 처리, config-store는 비즈니스 무지.
- **환경 변수 override로 테스트 격리** — 사용자 홈 `~/.sagyeongin-dart/` 안전 보장.
- **atomic write로 SIGINT/크래시 시 부분 쓰기 방지**.
- **자동 보강으로 spec 진화에 대응** — 새 키 추가 시 기존 사용자 파일도 호환.

### 트레이드오프

- 호출자가 매번 load → mutate → save 패턴 작성 (boilerplate). 단 이는 도메인 처리가 호출자에 모이는 자연 결과.
- F1 자동 보강은 디스크에 즉시 반영 안 함 (다음 `saveConfig` 시점에). 즉 load 직후 디스크는 결손 상태 유지. 의도적 — load만으로 디스크 부작용 없음.
- 마이그레이션 미지원으로 v0.2 정의 시점에 함수 추가 필요. 그때 ADR 갱신.

### 미래 변경 시 영향

- **v0.2 스키마 정의 시**: 마이그레이션 체인 추가 + 이 ADR 보완 ADR 작성.
- **동시성 요구 발생** (예: 백그라운드 작업 도입): D1 결정 재검토.
- **인터페이스 확장 필요** (예: 부분 patch 메서드): A2 → A3 검토.
- **사용자가 config 직접 편집 빈도 증가 시**: 검증 함수 export 검토 (zod 스키마 외부 노출).

## 참조

- spec §6.1 (파일 위치), §6.2 (스키마), §6.3 (기본값 근거)
- spec §10.10/§10.11 (이 모듈의 첫 호출자)
- ADR-0001 (`_lib` 위치)
- ADR-0003 (테스트 — `_lib` 모듈 위치)
- 구현: `src/tools/sagyeongin/_lib/config-store.ts`
- 후속 사용처 (현재): `update-watchlist.ts`, `update-scan-preset.ts`
- 후속 사용처 (예정): `required-return.ts` (`required_return_cache` 갱신), `srim.ts`, `watchlist-check.ts`
- (scan_execute checkpoint는 ADR-0014 — 별도 SQLite `~/.sagyeongin-dart/scan_checkpoints.sqlite`로 분리)
