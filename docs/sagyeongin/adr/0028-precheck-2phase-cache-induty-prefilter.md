# 0028 - pre-check 2-phase — corp_meta cache 기반 induty 사전 필터

- 상태: Accepted
- 결정일: 2026-05-29
- 결정자: 사용자 + Claude
- 연동: ADR-0010 개정 (옵션 D over-estimate 분기) + ADR-0019 확장 (사전 가드)

## 컨텍스트

Stage 30.5에서 확정된 발견: `scan_execute` 진입 시 daily limit 사전 가드(ADR-0019)가 induty 취향을 반영하지 못해 잘못 차단한다.

### 인과

1. 사용자가 "반도체 업종만" 같은 induty 필터를 걸어도, pre-check은 name-filter universe(예 3607)로 호출을 추정한다 (`scan-execute.ts` line 729~739 — `filterUniverse(allListed, {excluded_name_patterns})` → `estimateApiCalls(filtered.length)`).
2. 추정이 한도(20,000)를 넘으면 throw → 차단. induty 필터로 universe를 줄여도 pre-check 추정은 변하지 않으므로 안내대로 해도 효과 0.
3. 근본 원인: induty 필터를 적용하려면 종목별 `induty_code`가 필요한데, 이 값은 corp_code 덤프에 부재하고 `company.json`(종목당 1 호출)에서만 온다 (ADR-0010). 즉 induty로 거르려면 먼저 전 종목을 호출해야 하고, 그 호출이 한도를 넘긴다 — 닭-달걀.

### 닭-달걀은 이미 깨져 있다

ADR-0016의 `corp_meta` cache가 종목별 `induty_code` + `corp_cls`를 영구 보유한다 (`corp-meta-cache.ts`, `getCorpMeta(corp_code) → {induty_code, corp_cls, ...} | null`). cache를 채우는 `corp_meta_refresh` 도구도 이미 등록돼 있다 (사경인 15개 중 1, ADR-0016). 즉 cache가 채워진 종목은 `induty_code`를 0 호출로 알 수 있다.

빠진 것은 단 하나 — **pre-check 추정이 cache를 보고 induty 필터를 적용하지 않는다.** pre-check은 `cacheHitCount`만 넘겨 stage1 호출만 차감할 뿐(line 730~732), universe count는 `filtered.length`(name-filter) 그대로라 stage2~6 추정이 induty 무관하게 전체에 걸린다.

## 고려한 옵션

### 옵션 A — override 단독 (`allow_over_daily_limit`)

사용자가 명시 플래그로 가드를 우회. 근본 미해소 — 한도 자체는 그대로라 실행이 중간 차단되거나 다일 분할이 강제된다. 가드를 끄는 도피구일 뿐, 잘못된 차단 자체를 고치지 못함.

### 옵션 B — cache 기반 2-phase pre-check (induty 사전 필터)

pre-check 추정을 2단계로 분리. Phase 1 = name-filter universe. Phase 2 = 그 universe를 corp_meta cache로 분할 — cache-hit 분은 캐시된 `corp_cls`/`induty_code`로 market+induty 필터를 0 호출로 적용해 실 통과분만 추정에 반영, cache-miss 분은 induty 미상이라 보수적으로 전부 통과 가정(over-estimate 유지). cache가 채워진 만큼 추정 universe가 실제로 줄어 잘못된 차단이 사라진다.

### 옵션 C — induty 분포 외삽

cache-miss 분을 cache-hit의 induty 분포로 추정. 정밀하지만 가정 의존이라 한도 가드의 보수성(차단은 넘칠 때만)을 훼손 — 추정이 실제보다 낮게 나와 차단을 통과시킨 뒤 실행 중 한도 도달 위험.

### 옵션 D — corp_code 덤프에 induty_code 컬럼 추가

`src/lib/corp-code.ts` SQLite 스키마 변경. ADR-0001 격리 위반 + ADR-0010 옵션 B(사전 캐시 누적)에서 이미 인프라 부담으로 기각된 경로.

## 결정

**옵션 B 채택.** override(옵션 A)는 본 ADR에서 제외 — ADR-0019 후속 정책으로 분리. 본 ADR의 결정은 "induty 필터가 한도를 실제로 줄이게 한다" 한 가지로 한정한다. override("한도를 무시한다")는 정반대 성격이라 한 결정에 섞으면 초점·검수가 엉킴. cache cold + 다일 분할 수용 시나리오는 자동 축소 구현 후 실데이터로 별도 결정.

### B1. pre-check 2-phase 추정

`scan_execute` 사전 가드(ADR-0019) + `scan_preview` 추정 양쪽에서 universe를 2단계로 산출한다.

- Phase 1 — name-filter: `filterUniverse(allListed, {excluded_name_patterns})` → U (현행).
- Phase 2 — cache 기반 induty 분할: U의 각 종목에 `getCorpMeta`.
  - cache-hit ∧ `isMarketMatch` ∧ `isIndustryMatch` 통과 → 측정 universe 포함 (H', stage1 호출 0 — 이미 캐시됨).
  - cache-hit ∧ 필터 탈락 → 제외 (전 stage 기여 0).
  - cache-miss → 측정 universe 포함 (M, induty 미상 — 보수적 통과 가정). stage1 호출 1 (resolve 필요).
- 추정 호출: `estimateApiCalls(universeCount = H' + M, { cacheHitCount = H' })`. 이 시그니처는 현행 그대로 — stage1 = (H'+M) − H' = M, stage2~6 = H'+M. (현행은 universeCount = U, 본 결정은 H'+M.)

응답 필드는 의미를 뭉개지 않고 additive 분리한다 (cache 상태에 따라 같은 입력이 다른 수치를 낼 때의 혼란 방지):

- `estimated_universe` — 의미 불변 = name-filter 후 U (안정값, backward-safe).
- `estimated_universe_after_cache_filter` — cache-hit induty 적용 후 H'+M (추정·차단의 실 기준). 신 필드, additive.
- `cache_coverage` — H/U 비율 (이 추정을 얼마나 믿을지 사용자가 판단하는 투명성 수치). 신 필드, additive.

한도 차단(`> 100`)과 `daily_limit_usage_pct`의 기준은 `estimated_universe_after_cache_filter`. 기존 `estimated_universe`는 의미·타입 불변이라 기존 소비자(funnel 대화 흐름) 무파손. 신 필드 패턴은 Stage 30.4.1 `interpretation_notes`와 동일 (additive optional).

### B2. cache-miss 보수 처리 + warm 안내

cache-miss(M)는 전부 통과 가정으로 over-estimate 유지 — 차단의 보수성 보존. 단 M이 클수록(cache cold) 추정 감소가 작아 lever가 무력하므로, M/U 비율이 높으면 응답에 `corp_meta_refresh` 선행 권고를 노출한다 (`scan_preview` interpretation_notes / pre-check 에러 메시지 — Stage 30.4.1 패턴 follow). warm은 1회 ~3,963 호출(한도 내)로 완료되고, 이후 induty 필터가 0 호출.

### B3. ADR-0010 옵션 D 개정

ADR-0010이 정한 "`estimated_universe` = induty 미적용 over-estimate"는 cache 도입 전 전제. 본 ADR로 개정 — cache-hit 분은 induty 적용, cache-miss 분만 over-estimate. `estimated_universe`/`daily_limit_usage_pct` 의미가 "name-filter 후"에서 "name-filter + cache-hit induty 적용 후"로 바뀐다. (ADR-0010 본문에 개정 section 추가.)

## 근거

- 닭-달걀의 두 전제(induty cache + warm 도구)가 이미 존재하므로, 근본 해소에 필요한 신 인프라가 0이다. 결선만 잇는다.
- cache-miss over-estimate 유지는 ADR-0019의 "차단은 넘칠 때만" 보수성을 깨지 않는다 — cache가 비면 현행과 동일하게 보수적, 채워질수록 정밀.
- override를 본 ADR에서 분리한 이유: 가드를 끄면 잘못된 차단도 옳은 차단도 함께 꺼져 ADR-0019 본 사례(56분 hang)가 재발할 수 있다. 자동 축소가 근본 해소이고, override는 그것이 닿지 못하는 잔여(cache cold + 사용자 수용) 영역이라 성격·시점이 달라 ADR-0019 후속으로 둔다.
- 옵션 C 거부: 한도 가드는 안전 쪽으로 틀려야 한다 (차단 누락 < 과차단). 외삽은 과소추정 위험.
- 옵션 D 거부: ADR-0001 격리 + ADR-0010 옵션 B 기각 근거 유지.

## 결과

### 좋은 점

- induty 필터가 실제로 한도를 줄이는 lever가 됨 — Stage 30.5 잘못된 차단 직접 해소.
- 신 인프라 0 (cache + warm 도구 기존). 구현은 추정 경로 결선 + 필터 함수 재사용.
- `scan_preview`/`scan_execute` 추정 의미 일치 (양쪽 2-phase) — preview가 보여준 수치가 execute 차단과 어긋나지 않음.

### 트레이드오프

- cache cold 시 lever 무력 — warm 선행 의존. warm 안내(B2)로 완화하나 사용자 1단계 추가.
- cache 상태에 따라 같은 입력의 차단 기준값이 달라짐 (warm 진행 중) — 단 `estimated_universe`(안정값) / `estimated_universe_after_cache_filter`(실 기준) / `cache_coverage`(신뢰도) 분리 노출(B1)로 혼란 해소. 의미 모호성이 트레이드오프가 아니라 투명성으로 전환됨.

### 구현 stage 인계 (본 ADR는 결정 단독, code 0)

- `isMarketMatch`/`isIndustryMatch` (현재 `scan-execute.ts` line 213~234, 모듈 사적) → `_lib/scan-helpers.ts` 추출 (pre-check/preview/execute 3곳 공유). β-i 정합 (`src/tools/sagyeongin/_lib/`).
- Phase 2 분할 helper 신설 (`_lib` — `getCorpMeta` 기반 pure 함수, universe + market/induty 입력 → {H', M} 산출). 단위 테스트 대상.
- pre-check 블록(`scan-execute.ts` 729~739) + `scan-preview` 추정부 양쪽 결선 교체.
- 응답에 `estimated_universe_after_cache_filter` + `cache_coverage` additive 필드 추가 (`estimated_universe` 불변). cache-miss 비율 높을 시 warm 권고 note (Stage 30.4.1 interpretation_notes 패턴).
- spec §10.7/§10.8 추정 의미 개정 + ADR-0010 개정 section.
- 단위/통합 테스트 — cache warm/cold/부분 시나리오.

## 참조

- ADR-0010 (scan_preview static filter 비용 — 옵션 D over-estimate, 본 ADR로 개정)
- ADR-0016 (corp_meta cache — induty_code + corp_cls 영구 보유, 본 ADR 전제)
- ADR-0019 (daily limit 사전 가드 — 본 ADR가 2-phase로 확장. override는 ADR-0019 후속으로 분리)
- ADR-0001 §B2 (격리 — `_lib` 추출 정합)
- Stage 30.5 발견 (`verifications/2026-05-28-stage30.5-precheck-block.md`)
- `scan-execute.ts` line 213~234 (필터 함수), 729~739 (pre-check), 263~340 (stage1 cache-first 흐름)
- `_lib/scan-helpers.ts` (`estimateApiCalls` cacheHitCount 시그니처), `_lib/corp-meta-cache.ts` (`getCorpMeta`)
- philosophy 7부 A (즉시 솎아내기 — induty 필터 사전화), 5부 (시간 안 들임 — 한도 회피)
