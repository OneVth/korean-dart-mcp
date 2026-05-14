# (ii) 통합 흐름 실행 결과

## 실행 시점

- 실행일: 2026-05-14 18:05~18:07 (KST)
- baseline: d587f55 (18-e2e (ii) 명세 정정 매듭)
- MCP 세션: Claude Code (`sagyeongin-mcp` 등록, 29 tools)

---

## [1] sagyeongin_scan_preview

**호출 입력**: `input: {}`  (active_preset fallback)

### 응답

```json
{
  "preset_used": "default",
  "filter_summary": {
    "markets": ["KOSPI", "KOSDAQ"],
    "included_industries": null,
    "excluded_industries_count": 27,
    "excluded_name_patterns": ["투자회사", "투자조합", "기업인수목적", "스팩", "리츠", "REIT"]
  },
  "estimated_universe": 3607,
  "estimated_api_calls": {
    "stage1_company_resolution": 3607,
    "stage2_killer": 10821,
    "stage3_srim": 11542,
    "stage4_5_6_tags": 6666,
    "total": 32636
  },
  "daily_limit_usage_pct": 163.2,
  "sample_companies": [{ "corp_code": "00149293", "corp_name": "신한은행" }, "..."]
}
```

소요: ~1s

### 평가

- **(A)** PASS
- **(B) 가독성**:
  - `preset_used`: "default"
  - `estimated_universe`: 3,607
  - `daily_limit_usage_pct`: **163.2%** — ADR-0019 pre-check 발동 예고 직접 노출
  - 노트: included_industries 적용 전 universe 본문. 본 응답이 사용자에게 "필터 필수" 직관 인지 정합

---

## [2] sagyeongin_scan_execute

**호출 입력**: `input: { "limit": 10, "random_seed": 42, "included_industries": ["26"] }`

### 응답

```json
{
  "scan_id": "scan_2026-05-14_fkxaio",
  "pipeline_stats": {
    "initial_universe": 3964,
    "after_static_filter": 294,
    "after_killer_check": 78,
    "after_srim_filter": 19,
    "returned_candidates": 10
  },
  "external_call_stats": {
    "dart_call_count": 2732,
    "naver_call_count": 78,
    "kis_call_count": 0
  },
  "candidates": [
    { "rank": 1, "corp_code": "00135795", "corp_name": "신도리코", "corp_cls": "Y", "induty_code": "263", "composite_score": 80, "killer": {"verdict": "PASS"}, "srim": {"verdict": "BUY", "prices": {"buy_price": 88224, "fair_price": 76308, "sell_price": 41779, "current_price": 47350}, "gap_to_fair": -37.95}, "cashflow": {"verdict": "CLEAN", "concern_score": 0}, "capex": {"verdict": "SIGNAL_DETECTED", "opportunity_score": 80, "top_signals": ["major_capex_existing_business"]}, "insider": {"signal": "neutral_or_mixed"}, "dividend": {"grade": "D"} },
    { "rank": 2, "corp_name": "에이텍모빌리티", "composite_score": 0, "srim": {"verdict": "BUY", "gap_to_fair": -30.48}, "dividend": {"grade": "C"} },
    { "rank": 3, "corp_name": "토비스", "composite_score": 0, "srim": {"verdict": "BUY", "gap_to_fair": -22.64}, "dividend": {"grade": "B"} },
    { "rank": 4, "corp_name": "삼영전자공업", "composite_score": 0, "srim": {"verdict": "BUY", "gap_to_fair": -9.96}, "dividend": {"grade": "D"} },
    { "rank": 5, "corp_name": "인탑스", "composite_score": 0, "srim": {"verdict": "BUY", "gap_to_fair": -24.99}, "dividend": {"grade": "D"} },
    { "rank": 6, "corp_name": "엠투엔", "composite_score": 0, "srim": {"verdict": "BUY", "gap_to_fair": -19.33}, "dividend": {"grade": "N/A"} },
    { "rank": 7, "corp_name": "파트론", "composite_score": 0, "srim": {"verdict": "BUY", "gap_to_fair": -16.14}, "dividend": {"grade": "A"} },
    { "rank": 8, "corp_name": "인터엠", "composite_score": 0, "srim": {"verdict": "BUY", "gap_to_fair": -29.16}, "dividend": {"grade": "N/A"} },
    { "rank": 9, "corp_name": "코텍", "composite_score": 0, "srim": {"verdict": "BUY", "gap_to_fair": -31.31}, "dividend": {"grade": "N/A"} },
    { "rank": 10, "corp_name": "기산텔레콤", "composite_score": 0, "srim": {"verdict": "BUY", "gap_to_fair": -19.67}, "dividend": {"grade": "N/A"} }
  ],
  "checkpoint": null
}
```

소요: ~2분 (DART 2,732 호출 + 200ms inter-call delay)

### 평가

- **(A) PASS**
  - `candidates.length`: 10 ✓
  - 각 candidate 6 도구 필드 존재: ✓ (killer/srim/cashflow/capex/insider/dividend)
- **(B) 가독성**:
  - composite_score DESC 정합: ✓ (#1=80, #2~#10=0 — 신도리코만 capex confluence)
  - 노트: pipeline_stats 4 단계 funnel 직관 본문 (3964 → 294 → 78 → 19 → 10). `external_call_stats` 추가 노출 — ADR-0017 inter-call delay 효과 측정 가능
- **(C) 17단계 baseline 비교**:
  - corp_code 교집합: **5/10** — 신도리코, 삼영전자공업, 인탑스, 파트론, 코텍
  - 17단계만: 세진티에스, 씨유테크, LX세미콘, 아이디피, 파이오링크 (5건 drop)
  - 본 사이클 신규: 에이텍모빌리티, 토비스, 엠투엔, 인터엠, 기산텔레콤 (5건 진입)
  - induty KSIC 26 분포: ✓ 10/10 (cluster 보존)
- **(D) ADR-0019 pre-check 정합**: ✓ — included_industries: ["26"] 적용으로 after_static_filter 294 → daily_limit_usage_pct 사전 통과
- **ADR 정상 동작 정합**:
  - ADR-0017 inter-call delay: 2,732 호출 hang 없이 완주 ✓
  - ADR-0018 html_response_block: DART 정상 응답 — throw 발동 X ✓
  - ADR-0019 pre-check: filter 적용으로 통과 ✓

---

## [3] sagyeongin_update_watchlist (action: "list")

**호출 입력**: `input: { "action": "list" }`

### 응답

```json
{
  "watchlist": [],
  "total": 0
}
```

소요: ~1s

### 평가

- **(A) FAIL** ⚠️
  - `total`: **0** (기대: 10)
  - 17단계 10 corp_code 일치 여부:
    - `00135795` (신도리코): ✗
    - `00127200` (삼영전자공업): ✗
    - `00406727` (세진티에스): ✗
    - `00226866` (인탑스): ✗
    - `00575106` (씨유테크): ✗
    - `00525934` (LX세미콘): ✗
    - `01213586` (아이디피): ✗
    - `00490151` (파트론): ✗
    - `00492353` (파이오링크): ✗
    - `00305297` (코텍): ✗
- **(B) 가독성**: watchlist 비어있음 — corp_name + added_at + tags 본문 부재

---

## [4] sagyeongin_watchlist_check (check_level: "full")

**호출 입력**: `input: { "check_level": "full" }`

### 응답

```json
{
  "check_level": "full",
  "checked_at": "2026-05-14T09:07:38.343Z",
  "total": 0,
  "results": [],
  "summary": {
    "total": 0,
    "A_excluded": 0,
    "srim_buy_zone": 0,
    "B_review_required": 0,
    "C_signal_detected": 0
  }
}
```

소요: ~1s (watchlist 비어있음 — DART chain 0건)

### 평가

- **(A) FAIL** ⚠️ — [3]의 직접 결과
  - `total`: 0
  - 각 corp 6 도구 필드 존재: N/A (results 빈 배열)
- **(B) 가독성**:
  - summary 한눈 파악:
    - `killer_triggered`: N/A
    - `srim_buy`: N/A
    - `cashflow_clean`: N/A
    - `capex_signal_detected`: N/A
    - `insider_cluster`: N/A
  - 노트: watchlist 미정착 → check 영역 부재. summary schema 자체는 정합 (0건도 명시적)
- **(C) 17단계 baseline 비교**: N/A (baseline 자체가 환경에 미반영)

---

## 단계 간 정합

### corp_code 일관성

- **[3] watchlist ↔ [4] watchlist_check**: ✓ 완전 일치 (양쪽 모두 0건 — 정합)
- **[2] candidates ↔ [3] watchlist**: 교집합 0건
  - 공통 corp_code: 0
  - [2]만: 10건 (scan_execute 결과)
  - [3]만: 0건 (watchlist 비어있음)

### induty_code 일관성

- **[2] candidates** induty 분포: KSIC 26 cluster 10/10 (26-263, 26-2612, 26-2621, 26-2622, 26-2629, 26-2641, 26-2651 분포)
- **[4] watchlist_check** induty: N/A (results 빈 배열)

---

## 종합

### (A) 4단계 PASS/FAIL

| 단계 | 결과 |
|---|---|
| [1] scan_preview | ✓ PASS |
| [2] scan_execute | ✓ PASS |
| [3] update_watchlist list | ✗ FAIL (watchlist 비어있음) |
| [4] watchlist_check full | ✗ FAIL ([3]의 직접 결과) |

### (B) 가독성 종합

- [1]/[2]: 응답 schema 직관 — pipeline_stats funnel + external_call_stats + candidates 측정 가능
- [3]/[4]: 비어있음 응답 schema는 valid — 단 측정 영역 부재

### 17단계 baseline 비교 — 핵심 발견

**17단계 *결정* ↔ *실행* 분리 식별**:

17단계 결정 매듭 (`2fa52c2`, `verifications/2026-05-14-stage17-watchlist-add.md`)은 *결정 본문 단독 commit* — 코드 변경 0, 측정 X. `update_watchlist({ action: "add", ... })` MCP 호출은 *별경로* (분리된 세션 또는 미실행).

본 사이클 환경 (`sagyeongin-mcp` 등록 Claude Code) — 17단계 add 실행 본 분리 영역 부재. config 본 빈 상태.

**시사점**:
1. 18-e2e 명세 본문이 "17단계 watchlist 전제"로 작성 — 전제 부정 직접
2. 학습 #21 (Phase 분리) 본질 동일 — *결정/명세 본문 ↔ 실행 호출 분리*
3. 17단계 add는 *별개 후속 사이클* — 본 사이클 매듭 후 진입

### 시간 격증 본문 — candidates 5/10 어긋남

본 사이클 candidates vs 17단계 baseline 50% 일치 + 50% 신규. 가능 원인:
- 16(c) `corp_meta_refresh` 시점 ↔ 본 사이클 시점 universe drift (3,607 → 3,964, +357)
- `random_seed: 42` 동일 단 universe 변화 시 결정론 본문 적용 영역 어긋남
- srim 가격/공정가치 본문 시점별 변동 — BUY 영역 진입/이탈 직접

→ 본 어긋남은 ADR-0015 B1 (shuffleWithSeed) 정책 영역 외 — universe 자체 변화. 별경로 학습 영역.

### 핵심 정합

- ADR-0017/0018/0019 본 사이클 검증 완료 (정상 동작)
- scan_execute 2,732 DART 호출 hang 없이 완주 — 본 사이클 진입 안전 확인
- 발견: 17단계 결정/실행 분리 — 학습 정착 영역 발견

---

Ref: 18-e2e (ii) 명세 매듭 `d587f55`, ADR-0017/0018/0019, 17단계 결정 매듭 `2fa52c2`
