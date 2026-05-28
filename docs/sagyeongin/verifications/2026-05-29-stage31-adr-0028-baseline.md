# Stage 31 — ADR-0028 결정 baseline 검증 (pre-check 2-phase)

baseline: origin/main `2e77123` (Stage 30.4.1 매듭). fresh clone 직접 회수.

## 발견 — 근본 lever의 전제가 이미 존재

ADR-0028 옵션 B의 실현 근거. 신 인프라 0.

| 사실 | 회수 위치 | 결판 |
|---|---|---|
| corp_meta cache가 induty_code + corp_cls 영구 보유 | `_lib/corp-meta-cache.ts` `CorpMetaCacheRecord` (induty_code, corp_cls, modify_date, fetched_at) + `getCorpMeta(corp_code) → record \| null` | cache-hit 분 induty 0 호출 획득 가능 ✓ |
| cache warm 도구 존재 | `index.ts` `corpMetaRefreshTool` 등록 (ADR-0016, 사경인 15 중 1) | warm flow 기존 ✓ |
| pre-check이 induty 미적용 | `scan-execute.ts` 729~739 — `filterUniverse(allListed, {excluded_name_patterns})` → `estimateApiCalls(filtered.length, {cacheHitCount})`. universe = name-filter U, induty 무관 | 잘못된 차단 근본 (Stage 30.5) ✓ |
| estimate 시그니처가 2-phase 수용 | `_lib/scan-helpers.ts` `estimateApiCalls(universeCount, {cacheHitCount})` — stage1 = (universe − cacheHits), stage2~6 = universe | universeCount=H'+M, cacheHitCount=H' 결선 가능 (시그니처 불변) ✓ |
| 필터 함수 모듈 사적 | `scan-execute.ts` 213~234 `isMarketMatch`/`isIndustryMatch` (export 안 됨) | 구현 stage서 `_lib` 추출 필요 |
| stage1 cache-first → induty 필터는 호출 뒤 | `scan-execute.ts` 263~340 — `extractCompanyMeta`(cache-first) → `isIndustryMatch`. cache-hit = 0 호출 | induty 필터는 stage1 비용 후, 단 cache-hit는 호출 0 ✓ |

## 닭-달걀

induty_code는 corp_code 덤프 부재 → company.json(종목당 1 호출, ADR-0010). induty로 거르려면 전 종목 호출 필요 = 한도 초과. 단 corp_meta cache가 이를 영구 보관하므로, cache 채워진 분은 0 호출. 빠진 것은 pre-check 추정이 cache를 안 보던 결선 하나.
