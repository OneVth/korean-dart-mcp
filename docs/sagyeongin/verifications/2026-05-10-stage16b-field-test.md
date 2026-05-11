# 16단계 (b) field-test — ADR-0015 효과 측정 시도 + 측정 자격 검증

**실행 일자**: 2026-05-10
**script**: `scripts/sagyeongin/field-test-stage16b.mjs` (`feat/stage16b-field-test` 브랜치)
**universe**: included_industries:["26"] + KOSPI+KOSDAQ
**baseline**: main HEAD `b44d3e5` (16(b) 묶음 1 callCount 노출 정합)
**총 elapsed**: 45.0s

---

## 본 검증의 본질 — 측정 자격 검증으로 재정의

사전 검증 명세 (`2026-05-10-stage16b-pre-verify.md`)의 본 본질은 ADR-0015 효과 직접 측정 — B1 shuffle 효과 / C1 wrapper retry 흡수 / candidates ≥ 1 회복 / D1 fail-fast 흐름.

field-test 실행 결과 stage1 도중 DART daily limit (서버 측 status 020) 발동으로 stage2-6 미진입. ADR-0015 효과 본격 측정 영역의 *주요 3건 (B1, C1, candidates) 측정 불가*.

본 사이클 본질을 **측정 자격 검증**으로 재정의 — *측정 가능한 영역이 어디까지인가* 직접 확인. 사전 검증 영역 6 분기별 정정 후보에 *분기 5 (예상 외) 신설*.

---

## 영역 1: 실행 조건

### 명령

```bash
npm run build
node scripts/sagyeongin/field-test-stage16b.mjs
```

### 외부 자원 사전 확인 (실측 직전)

| 항목 | 결과 |
|---|---|
| DART company.json (Samsung 00126380) | HTTP 200, body status `000` ✓ |
| naver finance (005930) | HTTP 200, SIZE 198,423 ✓ |
| KIS rating (statics_spread.do) | HTTP 200, SIZE 77,855 ✓ |

3건 모두 정상 — 사전 검증 명세 영역 1 정합 결과 (회복 검증 13:21 KST 시점).

### 환경

| 항목 | 값 |
|---|---|
| SAGYEONGIN_CONFIG_DIR | tmpdir 임시 격리 |
| included_industries | ["26"] |
| markets | ["KOSPI", "KOSDAQ"] |
| limit | 10 (default) |
| started_at | 2026-05-10T13:22:36.652Z (22:22 KST) |
| finished_at | 2026-05-10T13:23:21.634Z (22:23 KST) |
| elapsed | 45.0s |

---

## 영역 2: pipeline_stats — 13단계 baseline + 15(a) 비교

| 항목 | 13단계 (KSIC 26) | 15(a) (excluded:26) | 16(b) (KSIC 26) | 격차 의미 |
|---|---|---|---|---|
| initial_universe | 3,963 | 3,963 | **3,963** | 동일 모집단 |
| after_static_filter | 294 | 659 | **86** | 13단계 294 대비 *부분 평가만* — 흐름 진단 영역 3 |
| after_killer_check | 79 | 659 | **0** | stage2 미진입 |
| after_srim_filter | 18 | 0 | **0** | stage3 미진입 |
| candidates | 5 | 0 | **0** | 15(a)와 동일 결과 — 원인 완전 다름 |

### `external_call_stats` (16(b) 묶음 1 신설 필드 — 첫 측정값)

| 자원 | callCount |
|---|---|
| dart_call_count | 1,001 |
| naver_call_count | 0 |
| kis_call_count | 0 |

### `next_actions_suggested`

> "daily limit 80% 도달. 24시간 후 `resume_from: \"scan_2026-05-10_m82gga\"`로 재개."

`checkpoint = scan_2026-05-10_m82gga` 발동.

---

## 영역 3: 흐름 정확 진단

### stage1StaticFilter 내부 호출 흐름 (`scan-execute.ts:225-307`)

1. `loadListedCompanies()` — 캐시된 KOSPI+KOSDAQ 전체 3,963 corp 로드 (DART 호출 X)
2. `filterUniverse()` — name pattern 메모리 필터
3. `shuffleWithSeed()` — B1 shuffle 적용 (random_seed 미지정 → Math.random)
4. **for 루프 — 각 corp마다 `extractCompanyMeta` 호출 → DART `company.json` (corp당 1회)**
5. `isMarketMatch` + `isIndustryMatch` 메모리 필터로 KSIC 26 매치 corp만 universe에 push

### 차단 발동 시점

- 1,001번째 corp 처리 중 DART 서버 측 **status 020 응답** (daily limit 도달)
- `extractCompanyMeta` 내부에서 `DartRateLimitError` throw (line 264)
- catch 분기 → `limitReached: true` 반환 (line 264-272)
- outer 흐름 (line 670-686) — `stage1.limitReached` 분기 → `saveCheckpoint` + `buildResponse` with `hasCheckpoint: true`

### 모든 수치 정합

| 수치 | 의미 |
|---|---|
| dart_call_count = 1,001 | extractCompanyMeta 누적 (corp당 1회) — 1,001 corp 평가 |
| after_static_filter = 86 | 1,001 평가 중 KSIC 26 매치 + market 매치 = 86 |
| skipped_corps = 0 | DART 정상 응답 + 미매치 corp은 `continue` (skip 영역 X) |
| after_killer_check = 0 | stage2 미진입 cumulative |
| naver/kis = 0 | stage3 이하 미진입 |
| checkpoint = scan_id | line 670 분기 발동 |

**1,001 / 3,963 ≈ 25% partial 평가** — 86 매치 → 전체 평가 시 ~340 매치 추정 (13단계 baseline 294 정합).

---

## 영역 4: ADR-0015 효과 측정 영역 재해석

| 측정 영역 | 본 사이클 결과 | 사유 |
|---|---|---|
| **A2 fetch failed retry** | 측정 X | network 차단 X (DART 정상 응답 후 status 020) — A2 분기 미발동 |
| **B1 shuffle 효과** | 부분 측정만 | 1,001 corp 영역에서 partial — 결정론 vs 확률론 corp 분포 비교는 *동일 universe에서 2회 이상 측정* 필요. 본 사이클 1회만 |
| **C1 wrapper retry 흡수** | **측정 불가** | naver/kis stage 미진입 (callCount = 0). retry 자체 발동 X |
| **candidates ≥ 1 회복** | **측정 불가** | stage2-6 미진입 |
| **D1 fail-fast 흐름** | **정합 동작 검증 ✓** | DartRateLimitError 발생 즉시 line 264 catch → limitReached: true → saveCheckpoint + buildResponse. 추가 호출 X. fail-fast 본질 정합 |

15(a) candidates = 0과 *동일 결과지만 원인 완전 다름*:
- 15(a): 외부 자원 차단 (stage3 naver/KIS IP block) — 659 fetch failed
- 16(b): DART daily limit (stage1 status 020) — stage2 자체 미진입

---

## 영역 5: 사전 검증 영역 4 baseline 가정 어긋남

사전 검증 명세 영역 4: "after_static_filter = 294 (13단계 측정값)" — *완전 universe 평가 가정* baseline.

16(b) 측정: after_static_filter = 86 — *partial universe 평가 (25%)*.

baseline 가정 정정 — *13단계 baseline 294는 DART daily limit 여유분이 충분한 시점의 측정 결과*. Onev 환경 API 키의 daily limit 잔여량에 따라 *완전 평가 자격 자체가 측정 시점에 의존*.

후속 사이클의 사전 검증 명세 작성 시 추가 영역 — *DART daily limit 잔여량 사전 확인* (status 020 또는 잔여량 측정 가능 endpoint 영역 점검).

---

## 영역 6: 영역 6 분기 5 (예상 외) 신설

사전 검증 명세 영역 6의 분기 4건 외 *DART daily limit 영역에서 stage1 자체 차단으로 측정 자격 미회복* — 분기 5로 추가.

### 분기 5 — DART daily limit 영역 측정 자격 미회복

**측정 영역**: stage1 도중 DartRateLimitError → limitReached: true → stage2 미진입. dart_call_count < 전체 universe 평가 필요량.

**정정 후보**:
- API 키 daily limit 영역 측정 시점 정책 — *자정 KST 직후 + 사전 측정 외 호출 0건 시점* 정책 추가
- universe 사전 cache 영역 — *KSIC 코드 사전 캐시*로 DART 호출 자체 회피 (코드 변경 영역 — 후속 ADR 후보)
- 측정 universe 축소 영역 — *단일 corp_cls* 또는 *small subset corp_code 직접 지정*으로 DART 호출 ↓

**측정 indicator**:
- dart_call_count vs initial_universe 비율 (1,001 / 3,963 ≈ 25%)
- after_static_filter vs 전체 평가 추정 매치 수 (86 vs ~340)

**후속 ADR 후보**: ADR-0016 후보 — *측정 자격 보장을 위한 universe 사전 cache 영역* (KSIC 코드 사전 캐시 또는 corp_cls 분리 영역).

---

## 영역 7: 측정 자격 미회복 본질 정정 — cache 부재 발견 (2026-05-10 후속 분석)

본 영역 *후속 발견 영역* — 16(b) 매듭 (`a5c507a`) 정착 후 추가 fork view에서 도출된 본질 정정. 영역 4/5/6의 진단 *부분 정정*.

### 발견 — DART 호출 영역 cache 0 본격 확인

직접 view 결과 3 영역 모두 cache 부재:

| 영역 | 결과 |
|---|---|
| `extractCompanyMeta` (`scan-execute.ts:156-175`) | `ctx.client.getJson("company.json", {corp_code})` 직접 호출 — cache 0 |
| `DartClient.getJson` (`src/lib/dart-client.ts:28-38`) | 매 호출마다 fetch — cache 0 |
| `RateLimitedDartClient` wrapper | callCount 추적만 — cache 0 |
| `CorpRecord` (`src/lib/corp-code.ts:22-28`) | corp_code, corp_name, stock_code, modify_date 4 필드만 — **induty_code / corp_cls 필드 X** |

DART의 `corpCode.xml` dump에는 induty_code 영역이 *원래 X*. KSIC 26 매치 위해 corp당 company.json 호출 *불가피*. 그런데 cache 0이라 매 측정 사이클마다 동일 corp에 대해 동일 호출 반복.

### 측정 자격 미회복 본질 정정

| 종전 진단 (영역 5/6) | 정정 진단 (영역 7) |
|---|---|
| DART daily limit 영역 자체가 측정 한계 | **cache 부재로 인한 호출 폭증 + Onev 환경 키 다른 사용 누적**이 daily limit 빠른 소진 직접 원인 |
| 분기 5 = "DART daily limit 영역 측정 자격 미회복" | 분기 5 본질 정정 = "**cache 부재 영역에서의 측정 자격 미회복**" |
| 옵션 i (시점 정책)으로 회복 가능 | 옵션 i는 *임시 회복* — cache 부재 본질 영역 영구 |
| 옵션 ii는 universe 사전 cache (대규모 신설) | **옵션 ii 본질 재정의 — induty_code/corp_cls per-corp_code cache (CorpRecord 확장 + lazy/eager 정책)** |

### Onev 환경 키 다른 사용 누적 영역 정황

DART API 키는 Onev 환경 *단일* — Claude Code 일반 사용 + 다른 측정 스크립트 + 16(b) 측정 모두 누적. 16(b) 측정 시점 1,001 호출에서 status 020 → 그날 이미 ~14,999 호출이 누적되어 있던 영역 (`DAILY_LIMIT = 20,000`의 ~75% 영역).

본 정황으로 측정 자격 미회복의 직접 원인:
- (cache 부재로 인한 호출 폭증, 측정 사이클당 ~3,963 호출)
- + (Onev 환경 키 다른 사용 누적)

### 옵션 ii 본질 재정의 — `CorpRecord` 확장

```typescript
// 정정된 옵션 ii (ADR-0016 후보)
interface CorpRecord {
  corp_code: string;
  corp_name: string;
  corp_eng_name?: string;
  stock_code?: string;
  modify_date?: string;
  induty_code?: string;       // 신설 — company.json 첫 호출 결과 cache
  corp_cls?: string;          // 신설 — Y/K/N/E
  meta_fetched_at?: string;   // cache 시점 (invalidate 영역)
}
```

영역 영역 정책:
- **lazy 영역**: 처음 만나는 corp_code에 대해서만 company.json 호출 + 결과 저장 (디스크 cache)
- **eager 영역**: corp_code dump 갱신 시점에 induty_code/corp_cls 일괄 fetch (대규모 호출 1회 → 이후 측정 사이클 호출 0)
- **invalidate**: induty_code 영역 거의 변하지 않음 — long TTL (1주~1개월) 또는 영구 cache (modify_date 변경 시 invalidate)

### 16(c) 정책 우선순위 정정 권고

종전 추천 (영역 8 후속 결정): 하이브리드 (i → ii) — 옵션 i 1차 시도, X 시 옵션 ii.

**정정 추천**: **ii 우선** (또는 *ii 우선 + i 병행 보조*).

근거:
- 옵션 i는 daily limit 회복에만 의존 — *cache 부재 영구 영역*에서 매 측정 사이클마다 동일 위험 재발
- 옵션 ii는 *측정 호출 자체* 90%+ 감소 (3,963 → 신규 corp만 호출, 후속 사이클은 거의 0)
- *cache 부재가 본질적 한계*라는 통찰이 옵션 ii 우선 진입 결정 트리거

### β-i 격리 정합성 검토

옵션 ii는 `src/lib/corp-code.ts` 변경 영역 — 본 모듈은 *외부 자원 모듈*이 아니라 *corp_code resolver* 영역. β-i 격리 (외부 자원 + wrapper 변경 0) 본질 정합. 16(c) 사이클 진입 시 본격 검토 영역.

### 누적 학습 8번 후보

**측정 자격 본질 진단 시 cache 영역 사전 view 누락 가드** — 16(b) 매듭 시점 진단이 *DART daily limit 영역*에 본격 집중되었으나 *cache 부재 영역* 사전 view 누락. 향후 측정 자격 본질 진단 시 호출 흐름 + cache 영역 + 외부 환경 사용 누적 영역 *3 영역 모두 직접 view* 필수.

---

## 영역 8: 후속 결정 — 본 사이클 종결

본 사이클 본 본 본질을 *측정 자격 검증*으로 재정의 — ADR-0015 본격 효과 측정은 *별개 사이클 (16(c) 또는 후속)*로 분리.

### 본 사이클 매듭 영역

1. CLAUDE.md 갱신 — 16(b) 종결 + 누적 학습 (16단계 매듭의 5번 누적 학습 + 16(b) 신규 학습)
2. 영역 6 분기 5 신설 — 사전 검증 명세 영역 6에 추가 (또는 본 결과 분석 md만)

### 16(c) 또는 후속 사이클 영역

ADR-0015 본격 효과 측정 — 측정 자격 보장 정책 결정 후 진입:
- ~~(옵션 i) DART daily limit 자정 직후 + 사전 호출 0 정책~~ → **임시 회복 영역, 본격 정착 X (영역 7 정정)**
- **(옵션 ii) ADR-0016 신설 — induty_code/corp_cls per-corp_code cache (`CorpRecord` 확장) → 코드 변경 + 재측정** (정정 추천 — 영역 7 본격 정착)
- (옵션 iii) 측정 universe 축소 — 단일 corp_cls 등 → 측정 영역 본질 변경 (후순위)

후속 사이클 진입 시점에 결정 — 영역 7 정정 추천 정합 시 **옵션 ii 우선** + 옵션 i 병행 보조 (옵션 ii 구현 전까지 임시 측정 회복 영역).

---

## 영역 9: 16(b) 누적 학습 후보

본 사이클에서 도출된 누적 학습 후보 (16단계 종결 매듭의 4건 외 추가):

### 누적 학습 5 — 진입 프롬프트 작성 시 ADR/spec 직접 grep 누락 가드

(본 세션 calibration에서 발동 — 16(b) 진입 프롬프트의 7부 D-2 라벨링 어긋남 사례. ADR-0015 line 162 직접 grep 누락이 원인)

### 누적 학습 6 — 위임 명세 line 번호 정확성 가드

(묶음 1 진행 중 발동 — 명세 line 655 vs 실제 line 673 어긋남 사례. grep 결과 line 번호 vs 호출 영역 시작 line 차이가 원인. 위임 명세 작성 시 *grep 매치 line 그대로 인용 + sed 검증 영역 명시* 정합)

### 누적 학습 7 — 사전 검증 baseline 가정의 측정 자격 의존성

(본 사이클에서 발동 — 사전 검증 영역 4의 "after_static_filter = 294" baseline 가정이 *DART daily limit 여유분 충분 시점* 가정. 후속 사이클 사전 검증 명세 작성 시 *측정 자격 자체 사전 확인* 영역 추가)

### 누적 학습 8 — 측정 자격 본질 진단 시 cache 영역 사전 view 누락 가드

(본 사이클 매듭 후속 분석에서 발동 — 영역 7. 측정 자격 미회복 진단을 *DART daily limit 영역*에 본격 집중하였으나 *cache 부재 영역* 사전 view 누락. 향후 측정 자격 본질 진단 시 호출 흐름 + cache 영역 + 외부 환경 사용 누적 영역 *3 영역 모두 직접 view* 필수)

본 4건 (5/6/7번은 16(b) 매듭 `a5c507a`에 정착, 8번은 본 영역 7 추가 commit 또는 후속 16(c) 매듭 시점 정착).

---

## 참조

- ADR-0015 외부 API burst 차단 통합 정책
- `verifications/2026-05-10-stage16b-pre-verify.md` — 사전 검증 명세 (영역 4 baseline 가정 정정 영역)
- `verifications/2026-05-09-stage16-pre-verify.md` — 16단계 사전 검증
- `verifications/2026-05-07-stage13-field-test.md` — 13단계 KSIC 26 baseline (294)
- `feat/stage16b-field-test` 브랜치 — script + 결과 JSON 보존 (main 머지 X — 15(a) 정합)
- philosophy 7부 A (사전 솎아내기 측정 자격) + 5부 (도구 신뢰성)