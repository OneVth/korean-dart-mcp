# 0016 - corp_meta cache (사경인 영역) — induty_code/corp_cls per-corp_code 영구 cache

- 상태: Accepted
- 결정일: 2026-05-11
- 결정자: 사용자 + Claude

## 컨텍스트

13단계 (KSIC 26 universe 추출) 시점부터 `scan_execute`의 stage1 static filter는 corp당 DART `company.json` 호출 1회 (induty_code + corp_cls 추출). KSIC 26 매치 시 universe 86 도출 위해 *전체 3,963 corp 모두 평가* 필요 (스태틱 필터 본질).

16(b) field-test (2026-05-10, baseline `b44d3e5`) 결과 stage1 도중 DART daily limit (서버 status 020) 발동 — `dart_call_count` 1,001 / ~3,963 ≈ 25% 영역만 처리. ADR-0015 본격 효과 측정 (B1 shuffle / C1 wrapper retry / candidates 회복) 영역의 측정 자격 미회복.

16(b) 영역 7 후속 분석 (commit `571822d`) 결과 측정 자격 미회복 본질 원인이 DART daily limit 영역 자체가 아닌 **cache 부재 영역**으로 정정:

| 영역 | 결과 |
|---|---|
| `extractCompanyMeta` (`scan-execute.ts:156-175`) | `ctx.client.getJson("company.json", {corp_code})` 직접 호출 — cache 0 |
| `DartClient.getJson` (`src/lib/dart-client.ts:28-38`) | 매 호출 fetch — cache 0 |
| `CorpRecord` (`src/lib/corp-code.ts:22-28`) | corp_code, corp_name, stock_code, modify_date 4 필드만 — induty_code/corp_cls 부재 |

cache 부재 영역에서 매 측정 사이클마다 동일 ~3,963 corp에 대해 동일 호출 반복 — Onev 환경 키 다른 사용 누적과 결합 시 daily limit (20,000) 빠른 소진.

본 영역 본 본질이 *측정 자격 보장의 사전 영역* — 7부 A "사전 솎아내기"의 사전성 + 5부 "도구 신뢰성"의 반복 호출 결과 동일성 영역 모두에서 cache 본격 정착 영역이 본질적 정합.

또 induty_code 추출 영역이 3 영역 분산:
- `scan-execute.ts:156-175` `extractCompanyMeta` (scan_execute 대량 영역)
- `_lib/induty-extractor.ts` `extractIndutyCode` (capex_signal 단발 영역)
- `corp-code.ts` CorpRecord (induty_code 부재)

본 영역 통합이 cache 모듈 신설 시 본격 정착 영역.

## 고려한 옵션

### (a) `src/lib/corp-code.ts` `CorpRecord` 확장

`src/lib/corp-code.ts`의 `CorpRecord` 인터페이스에 induty_code/corp_cls 필드 추가 + SQLite 스키마 컬럼 신설. corp_code resolver 영역에서 직접 cache 정착.

**문제**: `src/lib/corp-code.ts`는 upstream 모듈 — `_lib/dart-rate-limit.ts:22` 명시 "β-i 격리: src/lib/dart-client.ts 변경 0. composition 패턴." 본 본질 영역 정합으로 *upstream `src/lib/` 0 변경* 본 본격 영역. CorpRecord 확장은 upstream code 변경 → β-i 본질 위반.

ADR-0001 §B2 본문 "원본 수정 면 = 2줄(index.ts). 그 외 사경인 코드는 신규 디렉토리이므로 충돌 발생 0" 본 본질 영역도 위반 — upstream sync 충돌 면 증가.

### (b) 별개 cache 모듈 (사경인 영역) — `_lib/corp-meta-cache.ts`

`src/tools/sagyeongin/_lib/corp-meta-cache.ts` 신설 — 사경인 영역 (β-ii 정합). upstream `src/lib/corp-code.ts` 0 touch.

외부 호출 (DartClient → company.json)은 *외부 영역*에서:
- 단발 영역 (lazy): scan_execute의 `extractCompanyMeta` 또는 capex_signal의 `extractIndutyCode`에서 cache miss 시점만 DartClient 호출 + cache 저장
- 대량 영역 (eager): `sagyeongin_corp_meta_refresh` (가칭) 별개 트리거 도구에서 일괄 fetch (묶음 2 영역)

SQLite store: 사경인 cache dir (`~/.sagyeongin-dart/corp_meta_cache.sqlite` — scan-checkpoint 정합) 별개 파일 (upstream 모듈 store 0 touch).

### (c) 옵션 i 시점 정책 (DART daily limit 자정 직후 + 사전 호출 0)

cache 부재 영역 그대로 + 측정 시점만 자정 직후 + 사전 호출 0 정책.

**문제**: 임시 회복 영역. cache 부재 본 본질 영구 영역에서 매 측정 사이클마다 동일 위험 재발. *측정 자격 영구 정착 X*.

### (d) universe 축소

단일 corp_cls 영역 (KOSPI 또는 KOSDAQ만) 또는 단일 industry prefix 영역으로 universe 축소 → 호출 영역 격감.

**문제**: 측정 본질 영역 변경 — 사경인 본 본질 영역 (전체 상장사 대상 사전 솎아내기)에서 *부분 영역 만* 본격 정착. 7부 A 본질 변경.

## 결정

**(b) 별개 cache 모듈 (사경인 영역) 채택.** `src/tools/sagyeongin/_lib/corp-meta-cache.ts` 신설 + lazy + eager 병행 (eager 우선) + modify_date invalidate.

### 영역 정책

**모듈 위치**: `src/tools/sagyeongin/_lib/corp-meta-cache.ts` (β-ii 정합 — ADR-0001 §B2 "사경인 코드 100%가 단일 디렉토리").

**SQLite store**: 사경인 cache dir (`~/.sagyeongin-dart/corp_meta_cache.sqlite` — `SAGYEONGIN_CONFIG_DIR` 환경 변수 오버라이드 영역) 별개 파일. upstream `~/.korean-dart-mcp/corp_code.sqlite` 0 touch.

스키마:

```sql
CREATE TABLE IF NOT EXISTS corp_meta (
  corp_code   TEXT PRIMARY KEY,
  induty_code TEXT NOT NULL,
  corp_cls    TEXT NOT NULL,
  modify_date TEXT NOT NULL,
  fetched_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_modify_date ON corp_meta(modify_date);
```

**lazy 영역**: scan_execute의 `extractCompanyMeta` + capex_signal의 induty 추출 영역에서 cache miss 시점만 DartClient 호출 + cache 저장. 외부 호출 영역은 사경인 영역 (scan-execute.ts / induty-extractor.ts)에서만 — corp-meta-cache.ts는 cache store 영역만 (외부 호출 0).

**eager 영역** (묶음 2): `sagyeongin_corp_meta_refresh` (가칭) 별개 트리거 도구 신설 → 3,963 corp 일괄 fetch. `RateLimitedDartClient` 사용 → ADR-0015 wrapper 효과 본격 측정 자격 (D1 fail-fast + B1 shuffle).

**eager 우선**: 16(c) 진입 시 eager 트리거 1회 실행 → cache 정착 → 후속 측정 사이클 호출 ~0. modify_date 갱신 corp만 lazy 영역에서 갱신.

**invalidate**: corp_code dump 갱신 시점 (CorpRecord의 24h TTL)에 corp_meta_cache의 modify_date와 CorpRecord.modify_date 비교 → 갱신된 corp만 invalidate. corp_meta_cache TTL 자체 없음 (영구 cache + modify_date 트리거).

**induty 추출 영역 통합** (묶음 1B 영역):
- `_lib/induty-extractor.ts` `extractIndutyCode`: cache 우선 영역으로 정정. cache hit → cache 결과 반환 / miss → DartClient 호출 + cache 저장
- `scan-execute.ts:156-175` `extractCompanyMeta`: cache 우선 영역으로 정정. 동일 패턴 (induty_code + corp_cls 동시 추출)
- 본 두 함수 통합 가능 영역 검토 — 묶음 1B 영역 본격 검토

### 묶음 분리 (정착 경로)

- **묶음 1A** (본 ADR + cache 모듈): ADR-0016 신설 + `_lib/corp-meta-cache.ts` 신설 + 단테 — code-only, 외부 호출 0
- **묶음 1B** (cache 통합): `extractCompanyMeta` + `extractIndutyCode` cache 우선 영역 정합 + stage1 처리 corp_code external_call_stats 노출 영역 — code-only, 외부 호출 0
- **묶음 2** (eager fetch + ADR-0015 측정): `sagyeongin_corp_meta_refresh` 도구 신설 + field-test = D1 + B1 측정
- **묶음 3** (cache hit 재측정): scan_execute 재측정 = C1 wrapper retry + candidates ≥ 1 회복 측정

## 근거

### (a)가 거부된 이유

upstream `src/lib/corp-code.ts` 변경 → β-i 본질 (src/lib 0 변경 + composition wrapper, `_lib/dart-rate-limit.ts:22` 직접 인용) 위반 + ADR-0001 §B2 본 본질 (원본 수정 면 2줄) 위반 + upstream sync 충돌 면 증가.

### (b)를 선택한 이유

**β-i 본격 정합** — upstream 0 touch + 사경인 영역에서 본 cache 영역 본격 정착. ADR-0001 §B2 "사경인 코드 100%가 단일 디렉토리" 본격 정합. upstream sync 비용 0.

**invalidate 본격 정착** — cache 모듈에서 modify_date 트리거 본격 정착. CorpRecord (upstream)의 modify_date 영역과 동기 영역에서 별개 store 분리 영역이 본격 영역 — 단일 invalidate 트리거 (modify_date 갱신) 본 본질 정합.

**induty 추출 영역 단일 source 정착** — 3 영역 분산이 cache 모듈 영역에서 본격 통합 본격 정착. lazy 영역 단일 진입 경로 (cache hit 우선) 본 본질 정합.

**ADR-0015 효과 본격 측정 자격 동시 정착** — eager fetch (묶음 2)에서 3,963 corp 일괄 호출 영역이 `RateLimitedDartClient` wrapper 본격 발동 → D1 + B1 본격 측정 자격. cache hit 후 scan_execute 재측정 (묶음 3)이 stage1 호출 0 영역에서 stage2-6 본격 진입 → C1 + candidates 본격 측정 자격.

### (c)가 거부된 이유

임시 회복 영역 — cache 부재 본 본질 영구 영역 미회복. 옵션 i 본격 정합 X — 단 옵션 ii 본격 정착 *전*까지 임시 측정 회복 영역 (자정 KST 직후 + 사전 호출 0) 영역으로 본격 영역 X (16(c) 묶음 2 직전 시점에 *별개 영역* 진입 사전 검증 정책으로 정착 — ADR 영역 X).

### (d)가 거부된 이유

7부 A 본 본질 영역 변경 — 사경인 본 본질 (전체 상장사 사전 솎아내기) 영역 부분 영역 만 본격 정착. 본 본질 영역 변경 영역에서 *후순위* 영역.

## 결과

### 좋은 점

- **β-i 본격 정합** — upstream `src/lib/` 0 변경 정합. upstream sync 비용 0
- **측정 자격 영구 정착** — cache 부재 본 본질 영구 영역 해소. 후속 측정 사이클 호출 ~0 영역
- **ADR-0015 효과 본격 측정 자격 동시 정착** — eager fetch + cache hit 재측정 영역에서 D1 + B1 + C1 + candidates 4 indicator 모두 측정 자격 정착
- **induty 추출 영역 단일 source 정착** — 3 영역 분산 영역 통합. cache 영역 본격 진입 경로 (cache hit 우선)
- **invalidate 본격 정착** — corp_code dump 갱신 영역 (CorpRecord.modify_date)과 동기. 별개 store 분리 영역이 별개 invalidate 트리거 부담 X — modify_date 단일 트리거

### 트레이드오프

- **별개 SQLite store 영역** — `corp_meta_cache.sqlite` 별개 파일 영역 정착. 단 cache invalidate 트리거가 modify_date 단일 영역이라 일관성 부담 X
- **eager fetch 1회 시점 영역** — 16(c) 진입 시 3,963 corp 일괄 호출 영역 *대규모 호출 1회 발생*. 본 영역 ADR-0015 wrapper 본격 영역 발동 영역 — 본 영역에서 D1 + B1 효과 본격 측정 영역
- **modify_date 미갱신 시 cache 영구** — corp 정보 (induty_code 등) 영구 변경 없음 가정. 단 본 가정 X 시점에서 cache 부정합 영역 — modify_date 영역 본격 갱신 가정 본격 정합

### 미래 변경 시 영향

- **cache 모듈 영역 본 본질 변경 X** — corp_meta는 corp 메타 영역만 (induty_code + corp_cls). 다른 메타 영역 (예: 결산월, 외감인) 영역 본격 추가 영역에서 본 모듈 영역 확장 영역
- **induty-extractor.ts + extractCompanyMeta 통합 영역** — 본 ADR 영역 X. 묶음 1B 영역 본격 검토 (cache 우선 영역 진입 시점에 본 두 함수 영역 통합 본 본질 정합 여부 본격 검토)

## 참조

- ADR-0001 (격리 전략 §B2 — 사경인 코드 100%가 단일 디렉토리)
- ADR-0015 (외부 API burst 차단 통합 정책 — D1 + B1 + C1 본 본질 영역)
- spec §10.3 (capex_signal — induty 추출 영역 본격 정착)
- spec §10.8 (scan_execute — stage1 static filter 영역)
- spec-pending-edits.md §10.15 (KSIC 9차/10차 induty_code 혼재 영역 — 본 ADR 영역 정착 후 본격 진입 영역)
- `verifications/2026-05-10-stage16b-field-test.md` 영역 7 (cache 부재 발견)
- `_lib/dart-rate-limit.ts:22` (β-i 본격 라벨링 영역 인용 — src/lib 0 변경 + composition 패턴)
