# (ii) scan→watchlist→check 통합 흐름 명세

## 본질

사경인 오케스트레이션 4단계 chain의 end-to-end 본문 정합 측정. 단일 사이클로 candidates 도출 → watchlist 상태 확인 → 분기 점검 본문 흐름.

**측정 본문**:
- (A) 각 단계 PASS/FAIL — error 부재 + 응답 schema 정합
- (B) 단계 간 ID/필드 본문 정합 — corp_code, induty 등이 단계 간 일관 본문

## 17단계 watchlist 보존 영역

`update_watchlist`는 `dry_run` 파라미터 부재 영역. 본 사이클은 **`action: 'list'`** 활용 — watchlist state 변경 X, 현재 정착 본문만 확인.

→ 17단계 결정 본문 (10개 watchlist) 본격 보존.

## 호출 chain

```
[1] scan_preview     ─→ filter_summary, estimated_universe, estimated_api_calls
[2] scan_execute     ─→ candidates 10건 (composite_score DESC) + pipeline_stats
[3] update_watchlist ─→ list action — current watchlist 10건 확인
[4] watchlist_check  ─→ full level — 6 도구 통합 분기 점검 결과
```

---

## [1] scan_preview

### MCP 호출

```json
{
  "tool": "sagyeongin_scan_preview",
  "input": {}
}
```

**입력 본문**: 무인자 — active_preset 자동 fallback (config.active_preset). 17단계 결정 본문이 활용한 preset 영역 자동 정합.

### 기대 응답 schema

```ts
{
  preset_used: string | null,
  filter_summary: {
    markets: string[],
    included_industries: string[] | null,
    excluded_industries_count: number,
    excluded_name_patterns: string[],
  },
  estimated_universe: number,
  estimated_api_calls: {
    stage1_company_resolution: number,
    stage2_killer_check: number,
    ...
  },
  daily_limit_usage_pct: number,
  sample_companies: Array<{ corp_code, corp_name }>,
}
```

### 측정 영역

| 영역 | 기준 |
|---|---|
| (A) PASS | error X + `estimated_universe > 0` + `preset_used` 존재 |
| (B) 가독성 | preset 본문 본격 노출 (markets/industries/excluded 본격 확인 가능) + daily_limit_usage_pct 의사결정 본문 (0~80%면 진행 정합) |

---

## [2] scan_execute

### MCP 호출

```json
{
  "tool": "sagyeongin_scan_execute",
  "input": {
    "limit": 10,
    "random_seed": 42
  }
}
```

**입력 본문**:
- `limit: 10` — 7부 F "10개 내외" 정합
- `random_seed: 42` — 결정론적 shuffle (학습 가드 — undefined 시 재실행 별경로 영역, 본 사이클 본질 X)
- 본 사이클은 *실제 candidates 도출 본문* 측정 — 17단계 결과와 *동일하지 않을 수* 있음 (16(c) 시점 ↔ 본 사이클 시점 시간 격증 가능)

### 기대 응답 schema

```ts
{
  scan_id: string,
  pipeline_stats: {
    initial_universe: number | null,
    after_static_filter: number | null,
    after_killer_check: number,
    after_srim_buy: number,
    ...
  },
  candidates: Array<{
    rank: number,
    corp_code: string,
    corp_name: string,
    corp_cls: "Y" | "K",
    induty_code: string,
    composite_score: number,
    srim: { verdict, prices: {...}, gap_pct, ... },
    cashflow: { verdict, concern_score, signals },
    capex: { signal, opportunity_score, top_signals },
    insider: { signal, cluster_quarter },
    dividend: { grade, ... },
  }>,
  state_notes?: string[],
}
```

### 측정 영역

| 영역 | 기준 |
|---|---|
| (A) PASS | error X + `candidates.length === 10` + 각 candidate 6 도구 필드 본문 존재 |
| (B) 가독성 | composite_score DESC 정착 + srim/cashflow/capex/insider/dividend 5 영역 의사결정 본문 한눈 확인 가능 |
| (C) 17단계 정합 | candidates 10건이 17단계 결과와 *부분 일치* — 시간 격증 정합 (분기 점검 신호 변화는 Stage 19+ 본격) |

**시간 격증 가드**: 본 cycle의 scan_execute 결과는 17단계 watchlist와 *동일 corp_code 집합* 보장 X. KSIC 26 cluster 본문 정착 가정 하 induty distribution 정합 정도가 의사결정 본문 영역.

---

## [3] update_watchlist (list action)

### MCP 호출

```json
{
  "tool": "sagyeongin_update_watchlist",
  "input": {
    "action": "list"
  }
}
```

**입력 본문**: `action: "list"` — state 변경 X, 현재 watchlist 정착 본문 read-only 영역.

### 기대 응답 schema

```ts
{
  action: "list",
  watchlist: Array<{
    corp_code: string,
    corp_name: string,
    added_at: string,
    tags?: string[],
    notes?: string,
  }>,
  total: number,
}
```

### 측정 영역

| 영역 | 기준 |
|---|---|
| (A) PASS | error X + `total === 10` + 17단계 watchlist 10건 corp_code 본문 일치 |
| (B) 가독성 | corp_name + added_at + tags 본문 확인 가능 (사용자가 watchlist state 한눈 파악) |

**17단계 정합 확인** — 10개 corp_code 본문 정합:
```
00135795, 00127200, 00406727, 00226866, 00575106,
00525934, 01213586, 00490151, 00492353, 00305297
```

---

## [4] watchlist_check (full)

### MCP 호출

```json
{
  "tool": "sagyeongin_watchlist_check",
  "input": {
    "check_level": "full"
  }
}
```

**입력 본문**:
- `check_level: "full"` — 6 도구 통합 분기 점검 (killer + srim + cashflow + capex + insider + dividend)
- `corp_codes` 미지정 → watchlist 전체 (10건)

### 기대 응답 schema

```ts
{
  check_level: "full",
  checked_at: string,
  total: number,
  results: Array<{
    corp_code: string,
    corp_name: string,
    killer: { triggered: string[], passed: boolean },
    srim: { verdict, gap_pct, ... },
    cashflow: { verdict, concern_score, signals },
    capex: { signal, opportunity_score },
    insider: { signal, cluster_quarter },
    dividend: { grade },
    stageNotes?: string[],
  }>,
  summary: {
    killer_triggered: number,
    srim_buy: number,
    cashflow_clean: number,
    capex_signal_detected: number,
    insider_cluster: number,
    ...
  },
}
```

### 측정 영역

| 영역 | 기준 |
|---|---|
| (A) PASS | error X + `total === 10` + 각 corp 6 도구 결과 본문 존재 |
| (B) 가독성 | summary 본문이 watchlist 전체 분기 상태 한눈 파악 가능 (e.g. killer_triggered: 0 → 위험 부재 본격 정합) |
| (C) 17단계 baseline 비교 | 본 결과와 17단계 watchlist add 결정 시 상태 비교 — *시간 격증 신호 변화 없음* 정합 (분기 점검 신호 변화는 2026-08~ 영역) |

---

## 단계 간 본문 정합 검증

### corp_code 일관성

```
[2] scan_execute.candidates[*].corp_code
    ⊂ ∪
[3] update_watchlist.watchlist[*].corp_code
    ===
[4] watchlist_check.results[*].corp_code
```

- [2] ↔ [3]: 부분 교집합 (시간 격증 영역, 동일 보장 X)
- [3] ↔ [4]: 완전 일치 (watchlist_check는 watchlist 본문 직접 조회)

### induty_code 일관성

- [2] candidates의 induty_code 본문
- [4] watchlist_check 각 corp의 induty (KSIC 26 cluster 본문 보존 확인)

---

## 실행 본문 (Onev MCP 등록 세션)

| 단계 | 호출 본문 | 예상 응답 시점 |
|---|---|---|
| [1] scan_preview | 즉시 (API 호출 0) | ~1s |
| [2] scan_execute | DART 호출 chain (cache hit 정합 시 ~2~5분, miss 시 ~10분+) | 시간 영역 본격 |
| [3] update_watchlist list | 즉시 (config 파일 read) | ~1s |
| [4] watchlist_check full | DART 호출 chain (cache hit 본격 정합) | ~2~5분 |

**16(c) 정착 영역 정합**: scan_execute cache 정착 + ADR-0017 inter-call delay + Naver/KIS rate limit 본문 → 측정 진행 영역 안정.

## 결과 정착 영역

→ `results/01-integrated-flow.md`

응답 본문 (전체 JSON 또는 핵심 필드 발췌) + Onev 사용자 본문 노트 (가독성/의사결정 본문 정합/어긋남) 본격 정착.

---

Ref: spec §10.7 (scan_preview/execute), §10.4 (srim), philosophy 7부 F + A + B + C + D, ADR-0010 (배치 분리), ADR-0017 (inter-call delay), 17단계 매듭 `e26dbbf`
