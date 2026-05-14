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
