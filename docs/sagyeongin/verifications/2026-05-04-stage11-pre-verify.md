# 11단계 묶음 2 진입 전 사전 검증

- 일자: 2026-05-04
- baseline: feat/scan-execute HEAD `19d9d16`
- 검증자: Claude Code (Onev 환경)
- 목적: 묶음 2 명세 가정값 vs 실측 어긋남 차단 (9·10단계 정착 패턴)

## 검증 영역

1. OpenDART rate limit 응답 형태 — wrapper 정확성 검증
2. company.json induty_code 부재 corp 표본
3. 6 도구 verdict null/throw 분기 표
4. corp_code 덤프 SQLite 스키마 + KSIC universe 가설
5. capex.opportunity_score + cashflow.concern_score 척도 정합

## 결과 요약

| 영역 | 결론 |
|---|---|
| 1 | OpenDART rate limit → HTTP 200 + body status "020" (HTTP 429 아님) → **wrapper 정정 필요** |
| 2 | 10/10 모두 induty_code FIELD_EXISTS, 부재 없음 |
| 3 | 6 도구 throw 6건(corp 미존재), return null 27건(헬퍼 내부) |
| 4 | induty_code 컬럼 부재(Case B) — 상장사 universe 3,963개 |
| 5 | 척도 정합 — composite 음수 가능(최소 -140), 정렬 정합 |

---

## 영역 1: OpenDART rate limit 응답 형태

### OpenDART 공식 가이드 status code 표

출처: `https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019018`

| status | 의미 |
|---|---|
| 000 | 정상 |
| 010 | 미등록 인증키 |
| 011 | 사용할 수 없는 인증키 |
| 012 | 접근할 수 없는 IP 주소 |
| 013 | 조회된 데이터가 없음 |
| 014 | 파일이 존재하지 않음 |
| **020** | **요청 건수가 일일 한도(20,000건)를 초과** |
| 021 | 기업 조회 건수 초과(최대 100개) |
| 100 | 부적절한 필드값 |
| 101 | 부적절한 접근 |
| 800 | 시스템 점검 중 서비스 중지 |
| 900 | 정의되지 않은 오류 |
| 901 | 사용자 정보 보유기간 만료 |

**HTTP 429 언급 없음** — OpenDART는 오류 코드를 HTTP status code가 아닌 body의 `status` 필드로 표현.

### DartClient 응답 흐름 분석

`src/lib/dart-client.ts:34` — `getJson`:
```typescript
if (!res.ok) {
  throw new Error(`DART ${path} → HTTP ${res.status}`);
}
return (await res.json()) as T;
```

rate limit(status "020") 시 OpenDART는 **HTTP 200 + body `{"status":"020","message":"요청 건수..."}`** 반환.
- `res.ok === true` (HTTP 200) → throw 분기 미진입
- `res.json()` 반환 → 호출자가 `{status:"020",...}` 수신 (에러 아닌 성공으로 처리)

### GitHub 라이브러리 처리 패턴

#### dart-fss (Python)
출처: `https://github.com/josw123/dart-fss`
- `dart_fss.errors.errors` 모듈에 `OverQueryLimit` 클래스 존재
- `dart_fss/api/helper.py` — `check_status(**dataset)` 호출로 body status 검증
- `dart_fss/utils/request.py` — 0.2초 의무 딜레이 (1,000 req/min 초과 시 24h IP 차단 방지)
- **body status "020" → `OverQueryLimit` 예외 발생** 패턴 (HTTP 수준 체크 아님)

#### OpenDartReader (Python)
출처: `https://github.com/FinanceData/OpenDartReader`
- rate limit 처리 코드 직접 확인 불가 (GitHub 인증 필요)
- 공식 status "020" 기반 처리 추정 (OpenDART body 패턴 동일)

### 결론

- **rate limit 도달 시 응답 형태: (b) HTTP 200 + body status "020"**
- 근거: OpenDART 공식 가이드 status code 표 (status "020" 명시), dart-fss `OverQueryLimit` 패턴 (HTTP 수준이 아닌 body status 검증)
- **wrapper 정정 필요**:
  - 현재 `isRateLimitError(err)` → `err.message.includes("HTTP 429")` — 절대 발동 안 함
  - DartClient.getJson은 HTTP 200 + status "020" 응답을 에러 없이 반환
  - 정정 방향: `RateLimitedDartClient.getJson`에서 반환값 body의 `status === "020"` 검사 추가, 또는 DartClient.getJson에 body status 검증 추가(β-i 격리 위반 — 불가)
  - **β-i 격리 원칙상 DartClient 변경 0 → wrapper 내부에서 반환값 체크 필요**

---

## 영역 2: company.json induty_code 부재 corp 표본

### 호출 표본 (10회)

| corp_code | corp_name | corp_cls | status | induty_code | induty_code 필드 | 비고 |
|---|---|---|---|---|---|---|
| 00126380 | 삼성전자(주) | Y | 000 | 264 | FIELD_EXISTS | KOSPI |
| 00164779 | 에스케이하이닉스(주) | Y | 000 | 2612 | FIELD_EXISTS | KOSPI |
| 00266961 | 네이버(주) | Y | 000 | 63120 | FIELD_EXISTS | KOSPI |
| 00258801 | (주)카카오 | **Y** | 000 | 63120 | FIELD_EXISTS | 예상 K → 실측 Y (KOSPI 이전) |
| 01160363 | (주)에코프로비엠 | K | 000 | 28202 | FIELD_EXISTS | KOSDAQ |
| 00554024 | (주)셀트리온헬스케어 | **E** | 000 | 467 | FIELD_EXISTS | 예상 K → 실측 E (합병 후 기타법인) |
| 00434003 | (주)다코 | E | 000 | 25931 | FIELD_EXISTS | 비상장(기타법인) |
| 00430964 | 굿앤엘에스주식회사 | E | 000 | 64999 | FIELD_EXISTS | 비상장(기타법인) |
| 00388953 | 크레디피아제이십오차유동화전문회사 | E | 000 | 64999 | FIELD_EXISTS | 비상장(기타법인) |
| 00179984 | (주)연방건설산업 | E | 000 | 42 | FIELD_EXISTS | 비상장(기타법인) |

호출 횟수: **정확 10회** (daily limit 영향 0.05%)

### 부수 발견

- corp_cls="N" (외부감사대상 비상장) 표본 없음 — SQLite stock_code NULL 표본 4개가 모두 corp_cls="E" 반환
- 비상장 corp_cls 분포: "E" (기타법인) 가 stock_code NULL 영역 주류
- induty_code 값 형태: 2~5자리 숫자 문자열 (KSIC 코드 앞 자리 → 2자리: 대분류)

### 결론

- **induty_code 부재 분기 발생: 없음** (10/10 FIELD_EXISTS, 값 비어있음 없음)
- 부재 시 응답 형태: 표본 내 미관측 — 추가 표본 필요 시 묶음 2 진입 후 진행
- Stage 1 정적 필터 처리 권장: 표본 기준 induty_code는 항상 존재 — skip 처리 안전, 단 FIELD_ABSENT 방어 코드 최소 보존 권장

---

## 영역 3: 6 도구 verdict null/throw 분기 표

grep 명령: `grep -nE "throw new|^\s+throw |return null" src/tools/sagyeongin/$f.ts`

### killer-check.ts

| 라인 | 분기 종류 | 조건 | scan_execute 처리 |
|---|---|---|---|
| 70 | return null | series.length !== 4 | 헬퍼 함수 내부 |
| 71 | return null | !series.every(v < 0) | 헬퍼 함수 내부 |
| 83 | return null | (내부 조건) | 헬퍼 함수 내부 |
| 98 | return null | (내부 조건) | 헬퍼 함수 내부 |
| 100 | return null | corp_cls !== "K" | handler 정상 종료 — 비코스닥 자동 PASS |
| 107 | return null | (내부 조건) | 헬퍼 함수 내부 |
| 109 | return null | revenue >= 3,000,000,000 | handler 정상 종료 — 매출 3B↑ PASS |
| 212 | return null | count < threshold | handler 정상 종료 — 4-3 미충족 PASS |
| 234 | throw | corp_code not found | try/catch 자동 탈락 |

### srim.ts

| 라인 | 분기 종류 | 조건 | scan_execute 처리 |
|---|---|---|---|
| 76 | throw | corp_code not found | try/catch 자동 탈락 |

※ srim handler verdict null: ADR-0013 후속 — srim-calc.ts 위임. verdict null 시 scan_execute 자동 탈락 정합.

### cashflow-check.ts

| 라인 | 분기 종류 | 조건 | scan_execute 처리 |
|---|---|---|---|
| 75 | return null | oi/cf 데이터 없음 | 헬퍼 내부 |
| 88 | return null | divergenceCount < 2 | 헬퍼 내부 |
| 108 | return null | cf.operating.length < years | 헬퍼 내부 |
| 111 | return null | !tail.every(v < 0) | 헬퍼 내부 |
| 131 | return null | cf/investing 없음 | 헬퍼 내부 |
| 137 | return null | totalAssets <= 0 | 헬퍼 내부 |
| 142 | return null | recentOcf >= 0 | 헬퍼 내부 |
| 144 | return null | icfRatio < 0.1 | 헬퍼 내부 |
| 165 | return null | n === 0 | 헬퍼 내부 |
| 188 | return null | (fallthrough) | 헬퍼 내부 |
| 202 | throw | corp_code not found | try/catch 자동 탈락 |

### capex-signal.ts

| 라인 | 분기 종류 | 조건 | scan_execute 처리 |
|---|---|---|---|
| 97 | return null | !v | 헬퍼 내부 (parseAmount) |
| 99 | return null | !cleaned or "-" | 헬퍼 내부 |
| 107 | return null | !v | 헬퍼 내부 (parseRatio) |
| 109 | return null | !cleaned or "-" | 헬퍼 내부 |
| 111 | return null | !Number.isFinite | 헬퍼 내부 |
| 140 | return null | amount <= 0 | 헬퍼 내부 |
| 148 | return null | equityRatio === null | 헬퍼 내부 (시그널 0) |
| 162 | return null | capex/equity < 5% | 헬퍼 내부 (시그널 영역 외) |
| 201 | throw | corp_code not found | try/catch 자동 탈락 |

### insider-signal.ts

| 라인 | 분기 종류 | 조건 | scan_execute 처리 |
|---|---|---|---|
| 81 | return null | !s | 헬퍼 내부 (parseRatio) |
| 152 | throw | DART majorstock 오류 [status] | try/catch 자동 탈락 |

※ insider-signal의 throw는 corp 미존재가 아닌 DART API 에러 응답 — raw.status 포함 (`${raw.status}: ${raw.message}`)

### dividend-check.ts

| 라인 | 분기 종류 | 조건 | scan_execute 처리 |
|---|---|---|---|
| 89 | throw | corp_code not found | try/catch 자동 탈락 |

### 결론

- **handler throw 분기 합계: 6건** (도구당 1건, corp 미존재 또는 DART API 오류) → scan_execute try/catch로 자동 탈락
- **return null 분기 합계: 27건** (대부분 헬퍼 함수 내부 — handler 수준 return null은 killer-check 3건만 확인)
- 묶음 2 명세 반영: handler 수준 return null(killer-check 100, 109, 212) → verdict가 null인 경우 scan_execute는 Stage 별 분기 처리(Stage 2는 자동 탈락, Stage 4~6은 태그 보존)

---

## 영역 4: corp_code 덤프 SQLite 스키마 + KSIC universe 가설

### corps 테이블 스키마

```sql
CREATE TABLE corps (
      corp_code TEXT PRIMARY KEY,
      corp_name TEXT NOT NULL,
      corp_eng_name TEXT,
      stock_code TEXT,
      modify_date TEXT
    )
```

### induty_code 컬럼 분기

- **결과: Case B — induty_code 컬럼 부재**
- PRAGMA table_info(corps) 컬럼 목록: corp_code, corp_name, corp_eng_name, stock_code, modify_date (5개)

### Case B 결과 (induty_code 부재)

induty_code 컬럼 부재. KSIC universe 카운트는 묶음 2 본격 작업 시점 company.json 호출로 산출 필요.

Stage 1 정적 필터에서 KSIC prefix 기반 필터링은 SQLite 단독으로 불가 → company.json 호출 비용 발생.
영역 2 실측에서 모든 corp가 induty_code 포함 확인 → 호출당 1회로 KSIC 확보 가능.

### 상장사 전체 universe 카운트

```sql
SELECT COUNT(*) FROM corps WHERE stock_code IS NOT NULL AND stock_code != '';
```

- **카운트: 3,963개**
- 8단계 default preset universe (3,607)와 비교: **어긋남 +356개**
  - 원인 추정: corp_code 덤프 갱신 시점 차이 (8단계 이후 상장 추가분)
  - 묶음 2 명세 기준값: 3,963개 (현 덤프 기준)

### 결론

- induty_code 컬럼: **부재 (Case B)**
- 상장사 전체 universe: **3,963개** (현 덤프 기준)
- Stage 1 KSIC 필터 비용: SQLite 단독 불가 → company.json 호출 필요 (영역 2 실측에서 induty_code 항상 존재 확인 → 호출당 확보 가능)

---

## 영역 5: capex.opportunity_score + cashflow.concern_score 척도 정합

### capex SIGNAL_SCORES 표

출처: `src/tools/sagyeongin/capex-signal.ts:51-55`

| signal | score |
|---|---|
| major_capex_existing_business | 80 |
| major_capex_unrelated_diversification | **-40** |
| minor_capex | 30 |

### opportunity_score 산출

출처: `src/tools/sagyeongin/capex-signal.ts:234-237`

```typescript
const opportunity_score = signals.reduce(
  (sum, s) => sum + (SIGNAL_SCORES[s.signal] ?? 0),
  0,
);
```

- 산출 공식: signals.reduce 합산
- 범위: **clamp 없음 (jsdoc line 25: "0~100 clamp 안 함 — 음수 가능")**
- **음수 가능 여부: 예** — `major_capex_unrelated_diversification` (-40)
- 가능 최대값: 80 + 30 = 110 (기존 사업 대형 + 소형 동시)
- 가능 최소값: -40 (비관련 다각화만)

### cashflow RULE_SCORES 표

출처: `src/tools/sagyeongin/cashflow-check.ts:34-39`

| flag | score |
|---|---|
| oi_cf_divergence | 40 |
| negative_ocf_persistent | 30 |
| negative_ocf_with_active_icf | 20 |
| cf_pattern_risky | 15 |

### concern_score 산출

출처: `src/tools/sagyeongin/cashflow-check.ts:236-239`

```typescript
const concern_score = Math.min(
  flags.reduce((sum, f) => sum + (RULE_SCORES[f.flag] ?? 0), 0),
  100,
);
```

- 산출 공식: flags.reduce 합 → Math.min(..., 100)
- 범위: **0 ~ 100 (cap 100)**
- 가능 최대값: min(40+30+20+15, 100) = 100

### composite_score 정합 검증

- 공식: `capex.opportunity_score - cashflow.concern_score`
- 가능 최대값: 110 - 0 = **+110**
- 가능 최소값: -40 - 100 = **-140**
- 정렬 시 영향: composite 음수 corp가 candidates 후미 — 사경인 "비싼 회사(비관련 다각화 + 현금흐름 불량)" 자동 후미 정합

### 결론

- **척도 정합: 정합**
- 묶음 2 반영 사항: MVP 단순 공식(`opportunity_score - concern_score`) 그대로 채택
- 음수 composite 처리: 정렬 후미 처리 자연 — 별도 clamp 불필요
