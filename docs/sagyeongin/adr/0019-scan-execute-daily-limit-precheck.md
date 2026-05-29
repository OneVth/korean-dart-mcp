# 0019 - scan_execute 진입 시 daily_limit_usage_pct 사전 가드

- 상태: Accepted
- 결정일: 2026-05-14
- 결정자: 사용자 + Claude

## 컨텍스트

18단계 (ii) 통합 흐름 진입 시 `sagyeongin_scan_preview` 응답에서 **`daily_limit_usage_pct: 163.2`** (32,636 / 20,000) 사전 노출. 단 MCP 세션이 무시 + 명세 사전 가드 부재 → `scan_execute` 진입 → DART 차단 발동 + 56분 hang.

### 본 사례 인과

1. **scan_preview 응답**: `estimated_universe: 3607` × `estimated_api_calls.total: 32636` → daily limit (20,000) 163.2% 초과
2. **MCP 세션 무시**: scan_preview 응답 직접 view 후 limit 초과 자명 — 단 자동 가드 부재 영역
3. **scan_execute 진입** → 1회 완주 불가 확정 (limit 도달 시 status 020 throw 가능 — 단 본 사례는 IP 차단 발동 후 silent 별경로)

### daily limit

OpenDART 공식 — 일 호출 한도 **20,000건**. 초과 시 `status: '020'` 응답. 단 본 사례는 IP 차단 별경로 (ADR-0017 burst 영역) 발동 후 ADR-0018 gap에서 silent.

### ADR-0015/0017/0018과의 본질 차이

| 영역 | ADR-0015 | ADR-0017 | ADR-0018 | 본 ADR-0019 |
|---|---|---|---|---|
| 트리거 | 발동 후 (status 020 등) | 호출 빈도 | HTML 응답 | **명세 추정 + 사전** |
| 대응 | retry + throw | inter-call delay | SyntaxError 변환 | **scan-execute 진입 차단** |
| 시점 | DART 호출 후 | DART 호출 사이 | DART 호출 후 | **DART 호출 전** |

본 ADR-0019는 *사이클 진입 전 차단* — 다른 3 ADR 영역 외 사전 가드.

## 고려한 옵션

### (a) scan_execute 진입 시 scan-helpers 내부 함수 직접 호출 + > 100% 시 throw

scan_preview는 API 호출 0 (scan-helpers.ts pure 함수 단독) — handler 호출 대신 내부 함수 (`filterUniverse` + `estimateApiCalls` + `calculateDailyLimitUsagePct`) 직접 호출.

**장점**:
- 사용자 부담 X (자동 가드)
- silent 진입 차단 → 차단 발동 방지
- scan_preview는 corp_list cache 정착 영역 (cache hit) — 추가 호출 비용 ~0

### (b) input 옵션 추가 — `allow_over_daily_limit: boolean`

사용자가 명시적 override 시에만 limit 초과 진입 허용.

**장점**: 사용자 의사 결정 명시 정합
**문제**: (a) 단독으로는 override 영역 X — included_industries 필터 등으로 universe 축소 후 재진입이 적절. override 옵션은 *후속 정책* 영역.

### (c) 별개 도구 신설 (`sagyeongin_preflight_check`)

사용자 명시 호출 — orchestration 책임 사용자.

**문제**: 명세가 사용자에게 의존 — 본 사례 재발 (MCP 세션이 호출 X). 자동 가드 적절.

### (d) 코드 변경 X, 명세/문서만 정착

scan-execute spec에 *"scan_preview 사전 호출 + 100% 확인 후 진입"* 가드 명시.

**문제**: 본 사례가 명세 가드 부재로 발동 — 명세만으로 부족. 코드 정착 적절.

## 결정

**(a) scan_execute 진입 시 scan-helpers 내부 함수 직접 호출 + 초과 시 throw 채택.**

### 정책

`scan_execute` handler 진입 직후 (fresh 분기 — `args.resume_from` 부재):

```typescript
// scan-execute.ts handler (fresh 분기)
} else {
  // 신규 scan
  const resolved = await resolveInput(args);

  // ADR-0019: daily limit 사전 가드
  // scan_preview는 API 호출 0 — 내부 helper 직접 호출 정합 (scan-helpers.ts)
  const filterConfig: FilterConfig = {
    excluded_name_patterns: resolved.excluded_name_patterns,
  };
  const allListed = loadListedCompanies();
  const filtered = filterUniverse(allListed, filterConfig);
  const estimate = estimateApiCalls(filtered.length);
  const usagePct = calculateDailyLimitUsagePct(estimate.total);
  if (usagePct > 100) {
    throw new DailyLimitPreCheckError({
      estimated_calls: estimate.total,
      daily_limit: DAILY_LIMIT,
      usage_pct: usagePct,
      universe_count: filtered.length,
    });
  }
  // 기존 stage1~6
}
```

### DailyLimitPreCheckError 신설

```typescript
class DailyLimitPreCheckError extends Error {
  constructor(info: {
    estimated_calls: number;
    daily_limit: number;
    usage_pct: number;
    message: string;
  }) {
    super(info.message);
    Object.assign(this, info);
  }
}
```

scan-execute handler에서 직접 catch — 사용자 응답에 *사전 가드 발동* 명시 정합 (silent 차단

### 적용 범위

`sagyeongin_scan_execute` 단독. `watchlist_check`는 watchlist (10개 내외) 정합 — daily limit 초과 영역 X. `corp_meta_refresh`는 별개 호출 패턴 — 본 ADR 영역 외.

### override 영역

본 ADR 범위 외. 후속 정책 후보:
- input `allow_over_daily_limit: boolean = false` 옵션
- 명시적 override 시 본 가드 우회

### 단테 격리

- 본 가드는 *handler level* — wrapper 영역 X. 단테는 scan-execute handler 정정 (1건 신설 — DailyLimitPreCheckError throw 검증).
- 기존 단테 — mock scan_preview 응답에서 `daily_limit_usage_pct < 100` 적절 (기존 mock universe 대부분 작음 — 영향 X).

## 근거

### (a)를 선택한 이유

- **자동 가드** — 사용자 부담 X, MCP 세션 무시 영역 차단
- **silent 진입 차단** — DART 차단 발동 방지 (본 사례 재발 0)
- **scan_preview 추가 비용 ~0** — corp_list cache 정합
- **명시적 에러 메시지** — 사용자가 included_industries 필터 등 대응 즉시 인지

### (b)/(c)/(d) 거부

- (b): override는 후속 영역 — 본 ADR 영역 외
- (c): 사용자 의존 — 본 사례 재발 위험
- (d): 명세만으로 본 사례 발동 — 부족

## 결과

### 좋은 점

- **18단계 본 사례 직접 차단** — 동일 시나리오 재발 시 즉시 throw + 진입 차단
- **silent 진입 내용 X** — 명시적 에러 메시지로 사용자 직접 인지
- **scan-helpers 직접 호출 비용 ~0** — pure 함수 (SQLite read-only + filter + 산수) 정합

### 트레이드오프

- **scan-execute UX 변경** — 사용자가 included_industries 필터 등으로 universe 축소 후 재진입 1단계 추가
- **scan-helpers 직접 호출** — SQLite read-only (~ms) + pure 함수 정합
- **override 영역 부재** — 본 ADR 범위에서는 100% 초과 강제 차단. 후속 정착 영역

### 미래 변경 시 영향

- **override 옵션 추가** — 별개 ADR 또는 본 ADR 확장
- **threshold 정정** — 100% → 80% 또는 별경로 — 본 ADR default 정합
- **per-tool 사전 가드** — watchlist_check / 별개 도구 내용 확장 시 본 ADR 패턴 정합

## 참조

- ADR-0015 (외부 API burst 차단 통합 정책 — daily limit 발동 후 대응)
- ADR-0017 (DART burst limit — inter-call delay 회피)
- ADR-0018 (HTML 응답 → DartRateLimitError 변환 — 동시 정착, 본 ADR과 상호 보완)
- 18단계 진단 매듭 `fb2a4d7` (`verifications/2026-05-14-stage18-block-diagnosis.md`)
- `src/tools/sagyeongin/scan-execute.ts` (본 ADR 구현 위치)
- `src/tools/sagyeongin/_lib/scan-helpers.ts` (사전 함수 source — filterUniverse + estimateApiCalls + calculateDailyLimitUsagePct)

## 후속 결정 (2026-05-29, override — `allow_over_daily_limit`)

`## override 영역`에서 후속으로 미룬 강제 실행 옵션을 본 section에서 결선한다. ADR-0028(2-phase cache induty pre-filter)로 cache-hit 분의 추정 정밀도가 올라간 뒤에도, cache-miss 비율이 높은 입력은 보수적 pass 가정으로 100%를 넘겨 사전 차단된다. 이때 사용자가 "오늘 안에 못 끝내도 좋다, checkpoint로 이어가겠다"는 의사를 명시할 경로가 필요하다 — 본 결정이 그 경로다.

### 결정

`allow_over_daily_limit: boolean = false` 옵션을 추가한다. true이면 `usage_pct > 100` 사전 차단(DailyLimitPreCheckError throw)을 건너뛰고 스캔에 진입한다.

본 옵션은 **사전 차단만 무력화**한다. 실행 중 daily limit 80%(`CHECKPOINT_THRESHOLD` = 16,000) 도달 시 checkpoint 저장 후 partial 반환하는 ADR-0012 경로는 그대로 작동한다. 즉 "한 번에 못 끝내는 스캔을 시작은 할 수 있게" 하되, 한도 자체를 넘겨 호출하지는 않는다. checkpoint resume(`resume_from`)으로 이튿날 이어가는 흐름이 전제다.

### 입력 양식 — input + preset 둘 다

`resolveInput`이 전 필드를 `args.X ?? preset.Y` 양식으로 처리하므로, 본 옵션만 빼면 비대칭이 된다.

- `InputSchema`에 `allow_over_daily_limit: z.boolean().default(false)` 추가 (직접 지정)
- `ScanPreset` 타입에 `allow_over_daily_limit?: boolean` 추가 (preset 누적 — ADR-0027 config 양식 일치)
- resolve 시 `args.allow_over_daily_limit ?? preset.allow_over_daily_limit ?? false` — 직접 지정이 preset을 override (Stage 30.5 mergeIndustries 양식 일치)
- `ResolvedInput`에 `allow_over_daily_limit: boolean` 추가

pre-check 분기는 `if (usagePct > 100 && !resolved.allow_over_daily_limit)`로 가드 1조건 추가.

### 응답 양식 — additive 필드 + 진술 노트

사전 차단을 건너뛴 사실을 응답에 진술한다 (ADR-0025 사실 진술 baseline). MCP 세션이 필드만으로는 무시 가능(본 ADR 18단계 본 사례 패턴)하므로 사람이 읽을 노트를 병행한다.

- `pipeline_stats`에 `override_applied: boolean` additive 필드
- scan_execute 응답에 `interpretation_notes: string[]` 필드 추가 (현재 부재). scan_preview `buildLimitNotes`(scan-preview.ts) 동형 — `string[]` 조건부 push 패턴 재사용. override 적용 시 "사전 차단 무력화됨, 실행 한도 도달 시 checkpoint 작동(ADR-0012)" 1줄 + cache-miss 비율 높을 시 추정 부정확성 진술 1줄

### warm 권고 노트 — closed

override 적용 시 throw가 일어나지 않으므로 DailyLimitPreCheckError 메시지 안의 warm 권고(corp_meta_refresh 선행) 2줄은 도달하지 않는다. 제거할 노트가 없어 본 분기는 무효. cache-miss 추정 부정확성은 위 interpretation_notes에서 사실 진술로 흡수한다.

### override 후에도 유지되는 안전망

- ADR-0017 inter-call delay (burst 회피) — 실행 중 그대로
- ADR-0012 checkpoint 저장 + resume — 실행 중 한도 80% 도달 시 그대로
- DailyLimitPreCheckError 자체는 존속 — `allow_over_daily_limit=false`(default) 입력은 종전과 동일하게 사전 차단

override는 사전 가드 한 겹만 사용자 명시 의사로 걷어낼 뿐, 실행 경로의 한도 대응은 모두 살아있다.
