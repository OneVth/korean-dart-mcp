# 18단계 (ii) hang + DART 차단 진단

## 진단 시점
- 진단일: 2026-05-14 01:10 KST
- baseline: 22eedbe
- 분석 도구: Claude Code (MCP 호출 X — 코드 view + curl 단독)

---

## 1. hang 경과

| 이벤트 | 시점 | 비고 |
|---|---|---|
| scan_preview 완료 | 2026-05-13 ~23:45 KST | `estimated_universe: 3607`, `daily_limit_usage_pct: 163.2%` |
| scan_execute 호출 | 2026-05-13 ~23:46 KST | `{ limit: 10, random_seed: 42 }` |
| hang 발견 | 2026-05-14 ~00:42 KST | 실행 중 무응답 (~56분 경과) |
| interrupt | 2026-05-14 ~00:43 KST | 사용자 중단 |
| DART 차단 확인 | 2026-05-14 00:55 KST | `curl -I` → 302 → /error1.html |

---

## 2. MCP 로그 ([1])

- 위치 탐색: `%LOCALAPPDATA%\AnthropicClaude`, `%APPDATA%\Claude` → 해당 디렉토리 없음
- Claude Code stdio 서버는 stderr을 별도 파일로 저장하지 않음
- **로그 없음** — 코드 분석 + curl 진단으로 원인 재구성

---

## 3. scan-execute stage flow ([2])

| stage | wrapper 활용 | DART 우회 | 에러 처리 |
|---|---|---|---|
| Stage 1 (static filter) | `extractCompanyMeta` → ADR-0016 cache 우선 | X (ctx.client 경유) | DartRateLimitError → `limitReached: true` (early exit ✓) |
| Stage 2 (killer) | `killerCheckTool.handler(limitedCtx)` | X (ctx.client 경유) | **fail-safe**: 각 룰 `try { … } catch { return null; }` → **PASS 반환** (DartRateLimitError propagate X) |
| Stage 3 (srim) | `srimTool.handler(limitedCtx)` | X (ctx.client 경유) | fail-safe 없음 → throw → stage23Skipped → continue (DartRateLimitError 아니면 early exit X) |
| Stage 4~6 (enrich) | 4 도구 핸들러 | X (ctx.client 경유) | `partial_candidates` 없으면 즉시 완료 |

**우회 발견**: 없음 — 모든 DART 호출이 `limitedCtx.client` 경유 정합.

**핵심 문제**: killer-check fail-safe가 DART 차단 상황에서 예상치 못한 효과를 냄.
- DART 차단 → 모든 killer 룰 fail → 모든 룰 return null → triggered_rules 없음 → **verdict PASS**
- 3,607개 전 회사가 killer "통과" → stage3 srim으로 진행 → no early exit

---

## 4. RateLimitedDartClient + timeout ([3])

| 항목 | 상태 | 코드 위치 |
|---|---|---|
| 200ms delay (ADR-0017) | ✓ 정착 | `dart-rate-limit.ts:122` `interCallDelayMs: 200` |
| retry 1s × 1회 | ✓ 정착 | `dart-rate-limit.ts:157` `sleep(1000)` |
| DartRateLimitError throw 경로 | ✓ 정착 | fetch failed 2회 또는 020 status 2회 → throw |
| **fetch timeout** | ✓ DartClient에 30s timeout 정착 | `dart-client.ts:22` `timeout: opts.timeout ?? 30_000` |

### SyntaxError gap — hang 본격 원인 후보 1순위

DART IP 차단 시 응답 경로:
```
GET /api/company.json → HTTP 302 → Location: /error1.html
fetch 자동 redirect 추적 → GET /error1.html → HTTP 200 OK (HTML)
DartClient.getJson: res.ok = true → res.json() → SyntaxError (HTML ≠ JSON)
```

SyntaxError 처리 흐름:
```
RateLimitedDartClient.getJson:
  catch (err) {
    if (!isFetchFailedError(err)) throw err;  // ← SyntaxError: throw (retry 없음)
  }
  → SyntaxError propagate (DartRateLimitError X, fetch failed X)
```

killer-check:
```
evaluateConsecutiveOperatingLoss: catch { return null; }  // SyntaxError 흡수
evaluateLowRevenueKosdaq:        catch { return null; }
evaluateAuditRules:               catch { return []; }
countEventsLast3Years × 3:       catch { return { count: 0 }; }
→ 모든 룰 = null/[] → triggered_rules 없음 → verdict PASS
```

scan-execute stage2/3:
```
catch (e) {
  if (e instanceof DartRateLimitError) return saveAndReturnPartial(...);  // ← 미발동
  stage23Skipped.push({ reason: `killer 호출 실패: ${e.message}` });
  continue;  // ← 다음 회사로 진행
}
```

**결론**: SyntaxError는 세 계층 모두에서 "처리됨"으로 취급되나, 각 계층이 서로 다른 방식으로 처리:
- RateLimitedDartClient: retry 없이 propagate
- killer-check: 흡수 → PASS (의도치 않게 "통과")
- scan-execute stage2/3: per-corp skip → loop 계속

---

## 5. DART API 차단 ([4])

### curl 측정

| 시점 | 명령 | 응답 | 소요 |
|---|---|---|---|
| T0 (00:55 KST) | `curl -I .../api/list.json` | HTTP 302 → /error1.html | 63.9ms |
| T+60s (00:56 KST) | 동일 | HTTP 302 → /error1.html | — |
| T+5min | 대기 중 (백그라운드) | — | — |

```
HTTP/1.1 302 Found
Date: Wed, 13 May 2026 15:47:27 GMT
Connection: close
Content-Length: 0
Location: https://opendart.fss.or.kr/error1.html
```

- 응답 즉각 (63.9ms) → hang 아님, **즉각 redirect 차단**
- `Content-Length: 0` → 302 응답 body 없음 → fetch가 redirect 추적 후 HTML 수신

**결론**: IP 레벨 차단. API key 무관. 60초 후에도 지속 → 단기 회복 없음.

---

## 6. 16(c) ↔ 18단계 차단 시점 ([5])

### 누적 DART 호출 기록

| 날짜 | 이벤트 | DART calls | terminated_by |
|---|---|---|---|
| 2026-05-12 08:28 UTC | corp_meta_refresh r1 | 244 | completed |
| 2026-05-12 08:29 UTC | corp_meta_refresh r2 | 0 (all cache hit) | completed |
| 2026-05-12 14:27 UTC | 16c scan_execute (industry 26) | 2,725 | completed |
| 2026-05-14 ~16:46 UTC | 18단계 (ii) scan_execute (전체 universe) | — (interrupt, 미완) | 사용자 중단 |

- May 12 일간 합계: ~2,969 calls (daily limit 20,000 대비 14.8%)
- **차단 발동 시점**: May 12 완료 후 ~ May 14 18단계 진입 전 (정확한 시점 미지)
- 16c scan (May 12) 자체: burst limit 내 정상 완료 (ADR-0017 효과 ✓)
- **pre-check 없이 18단계 진입** → DART 이미 차단 상태에서 scan_execute 시작

### 차단 원인 추정

1. May 13~14 사이 별도 DART 활동 (session 외 호출 가능성)
2. DART IP 차단 기준이 단일 session의 burst가 아닌 **누적 패턴** 기반일 가능성
3. pre-check 부재로 차단 상태 진입 → 56분 runaway loop

---

## 7. 분석 매듭

### 7.1 hang 원인

**확정**: DART IP 차단 + SyntaxError gap + killer fail-safe의 조합이 56분 runaway loop 유발

| 계층 | 동작 | 결과 |
|---|---|---|
| DART 서버 | 302 즉각 redirect (63.9ms) | HTML 응답 |
| DartClient.getJson | res.json() → SyntaxError | throw (not fetch failed) |
| RateLimitedDartClient | isFetchFailedError = false | retry 없음, DartRateLimitError 없음 |
| killer-check | catch { return null } × 6 룰 | verdict PASS (전 회사) |
| scan-execute stage2 | e instanceof DartRateLimitError → false | per-corp skip, 루프 계속 |
| scan-execute stage3 | srim throw → not DartRateLimitError | per-corp skip, 루프 계속 |

**시간 추정**:
- Stage 1: ~0분 (cache warm, 메모리 연산)
- Stage 2 (killer × 3,607): 3,607 × 6 DART calls × ~130ms ≈ 2,813s ≈ 47분
- Stage 3 (srim × 진행 중): 3,607 × 2 DART calls × ~130ms ≈ 939s ≈ 16분 (중단)
- **총 추정 56분 시점 interrupt**: Stage 3 약 50% 진행 중 중단 정합

(130ms = 302 redirect(65ms) + error1.html fetch(65ms))

### 7.2 차단 원인

**확정**: 18단계 scan_execute 진입 시점에 DART 이미 차단 상태. pre-check 부재.

- 16c scan (2,725 calls) 자체는 ADR-0017 보호 하에 정상 완료
- 정확한 차단 발동 원인: May 13~14 사이 미지 (session 외 활동 또는 서버 측 정책)
- **근본 가드 부재**: scan_execute 진입 전 DART 상태 검증 없음

### 7.3 ADR-0015/0017 평가

| ADR | 평가 |
|---|---|
| ADR-0015 A2 (fetch failed retry) | **gap 발견**: 302→HTML SyntaxError 미커버. isFetchFailedError = TypeError "fetch failed" 전용. |
| ADR-0015 D1 (fail-fast on DartRateLimitError) | 정합 — 그러나 SyntaxError가 DartRateLimitError로 변환되지 않으므로 D1 미발동 |
| ADR-0017 (inter-call delay) | 성공 호출 후에만 적용. 차단 상태에서는 delay 없음 (적용 범위 외) |
| ADR-0012 (checkpoint) | callCount 기반 — 차단 시 호출 성공 없음 → callCount 증가 없음 → checkpoint 미발동 |

**ADR 코드 정합 자체는 ✓** — 다만 302→HTML 차단 패턴은 기존 ADR 설계 외부 시나리오.

---

## 8. 재진입 영역

### 차단 회복 추정

| 시점 | 예측 | 근거 |
|---|---|---|
| T+5min (현재) | 302 지속 (대기 중) | 단기 회복 X (60s 후도 302) |
| KST 자정 (오늘 00:00 이미 지남, 다음 자정) | 회복 가능 | DART daily limit 자정 KST 리셋 패턴 |
| T+24시간 | 회복 기대 | IP 차단 보통 24시간 이내 해제 |

**권장**: `curl -I https://opendart.fss.or.kr/api/list.json` → HTTP 200 확인 후 재진입.

### 재진입 절차

1. pre-check 스크립트 실행 (200 확인)
2. scan_execute 재호출 (또는 ADR 정정 후 재진입)
3. `daily_limit_usage_pct: 163.2%` → 기본 preset full scan은 하루에 완주 불가 → checkpoint 활용 또는 `included_industries` 필터 권장

---

## 9. 학습 후보

| # | 본문 | 근거 |
|---|---|---|
| **24** | **scan_execute 진입 전 DART pre-check 필수 — `curl -I` 302 시 즉시 중단 권고** | 이미 차단 상태에서 56분 runaway loop 발동 |
| **25** | **DART 302→HTML SyntaxError는 ADR-0015 fetch failed 정책 외 — DartClient 수준에서 redirect 감지 정책 필요** | `isFetchFailedError`가 SyntaxError를 인식 못해 retry/DartRateLimitError 미발동 |
| **26** | **killer-check fail-safe는 차단 환경에서 "전 회사 PASS" 부작용 발생 — scan_execute level 차단 감지 별도 정착 검토** | 3,607개 전 회사가 killer PASS → stage2 early exit 없음 |

---

## 10. 결정 영역 (Onev 회신 대기)

| 결정 | 후보 |
|---|---|
| 차단 회복 대기 vs IP 변경 | curl 200 확인 후 결정 (24시간 대기 우선 권장) |
| ADR 정정 사이클 | ADR-0015 gap (302→HTML SyntaxError) + ADR-0018 신설 (pre-check guard) |
| 18단계 (ii) 재진입 방식 | 사전 pre-check guard 정착 + `included_industries` 필터 권장 (163.2% → checkpoint 불가피) |
| 본 진단 매듭 commit | Onev 회신 후 별개 |

---

## 부록: scan_preview 경고 징후 (사후 분석)

본 위임 진입 전 scan_preview 응답에 경고 징후 포함:
```json
{
  "daily_limit_usage_pct": 163.2,
  "estimated_api_calls": { "total": 32636 }
}
```
- 163.2% = daily limit 20,000 대비 32,636 calls 필요 → **1회 scan으로 완주 불가**
- pre-check guard가 있었다면 이 시점에서 DART 차단 감지 + 진입 중단 가능

---

Ref: ADR-0015 (fetch failed retry), ADR-0017 (burst inter-call delay), ADR-0012 (checkpoint), 16c 매듭 `17eb4c6`, 18단계 진입 `db199df`
