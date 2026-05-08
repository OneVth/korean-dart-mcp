# 14단계 (b) 묶음 진입 전 사전 검증

- 일자: 2026-05-08
- baseline: `origin/main` HEAD `2a419e4` (`docs(sagyeongin): spec-pending-edits §10.13 unknown 분류 정밀화 누적`)
- 검증자: Claude Code (Onev 환경 — Korean IP, OpenDART API key 보유)
- 목적: 14단계 (b) `shares_outstanding not found` 정정 + `data_incomplete` 분류 키 추가에서 처리 정책 ①/②/③ 채택에 필요한 데이터 실측

## 14단계 (b) 사전 결정 항목

13단계 묶음 3 field-test (2026-05-07)에서 unknown 8건(모두 `extractSharesOutstanding` throw)이 srim verdict null로 흐름. spec-pending-edits §10.13에서 (b) 통합 처리 추천 — financial-extractor 보완 + skip-reason 분류 키 추가(`data_incomplete`)를 한 묶음에서 처리.

처리 정책 후보 3건 — 사전 검증 결과로 채택.

| 정책 | 내용 | 영향 범위 |
|---|---|---|
| **①** | 현재 throw 동작 유지 (srim verdict null 자연 흡수, ADR-0013 정합) + skip-reason `data_incomplete` 분류 키만 추가 | financial-extractor 변경 0, skip-reason 단독 정정 |
| **②** | `reprt_code` fallback 시도 (사업보고서 11011 → 반기 11012 → 분기 11013/11014) | financial-extractor 변경 + 단테 + DART 호출 1~3회 추가 |
| **③** | srim 별도 verdict 키 (`INSUFFICIENT_DATA`) 신설 | srim-calc + watchlist 변경 + ADR 신설 |

## 검증 영역

1. 환경 baseline (HEAD 일치 + 빌드)
2. unknown 8건 표본 corp_code resolve
3. `stockTotqySttus.json` raw 응답 — 8건 표본 (또는 1~2건 우선)
4. throw 분기 4분류 — 정책 ②/③ 의미 결정 입력
5. `_lib/skip-reason.ts` regex 분기 정밀 표현
6. 묶음 분할 분량 평가 — 정책 채택 후

## 결과 요약 (Onev 실행 후 기록)

| # | 결론 |
|---|---|
| 1 | tsc 0 error / test:unit 159 pass (0 fail) — 9 skip-reason + 22 corp-code-status 포함 확인 |
| 2 | 8건 단독 row (다중 row 없음) — corp_code + stock_code + modify_date 기록 완료 |
| 3 | 전건 status="000" + list 4건 존재 / se 필드값 불일치 → 보통주 행 X (코드 기준) / 핵심 발견: se 값 가정 어긋남 |
| 4 | A=0, B=0, C=8, D=0, E=0 — 전건 분기 C (se 값 불일치) |
| 5 | 4 regex + 3 status 분기 + 6 분류 키 + unknown fallback 정합 확인 / data_incomplete 후보 정합 |
| 6 | 정책 ①-plus 채택 — financial-extractor se 정정 + skip-reason data_incomplete 추가 — 3묶음 분리 |

---

## 영역 1: 환경 baseline

### 명령

```bash
cd /d/_project/korean-dart-mcp
git fetch origin
git log -1 origin/main --format='%h %s'
# 기대값: 2a419e4 docs(sagyeongin): spec-pending-edits §10.13 unknown 분류 정밀화 누적

git checkout -b feat/stage14-pre-verify origin/main
npm install --ignore-scripts
./node_modules/.bin/tsc --noEmit
npm run test:unit
```

### 기록

| 항목 | 결과 |
|---|---|
| origin/main HEAD | `2a419e4 docs(sagyeongin): spec-pending-edits §10.13 unknown 분류 정밀화 누적` ✓ |
| `npm install` 결과 | 성공 (audit 경고만, 빌드 무관) |
| `tsc --noEmit` | 0 error ✓ |
| `npm run test:unit` | **159 pass, 0 fail** — 9 skip-reason + 22 corp-code-status 포함 확인 ✓ |

---

## 영역 2: unknown 8건 표본 corp_code resolve

### 8건 표본 list (13단계 field-test 결과)

| # | corp_name |
|---|---|
| 1 | 삼성전기 |
| 2 | 케이엠더블유 |
| 3 | LX세미콘 |
| 4 | 나무가 |
| 5 | 제이앤티씨 |
| 6 | PS일렉트로닉스 |
| 7 | 디케이티 |
| 8 | 티에프이 |

### resolve 방법

기존 `resolve-corp-code` 도구 또는 `_lib/scan-helpers.ts` 사용. corp_code SQLite 직접 조회도 가능.

```bash
# 표본 1: 삼성전기 → corp_code resolve
node --input-type=module -e "
import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { join } from 'node:path';
const db = new Database(join(homedir(), '.korean-dart-mcp', 'corp_code.sqlite'), { readonly: true });
const rows = db.prepare(\"SELECT corp_code, corp_name, stock_code, modify_date FROM corps WHERE corp_name LIKE '%삼성전기%' AND stock_code != ''\").all();
console.log(JSON.stringify(rows, null, 2));
db.close();
"
```

8건 모두 동일 패턴 — corp_name 일치 + stock_code 부재 행 제외 (상장사 한정).

### 기록

| # | corp_name | corp_code | stock_code | modify_date |
|---|---|---|---|---|
| 1 | 삼성전기 | 00126371 | 009150 | 20230102 |
| 2 | 케이엠더블유 | 00226352 | 032500 | 20260311 |
| 3 | LX세미콘 | 00525934 | 108320 | 20240322 |
| 4 | 나무가 | 00819374 | 190510 | 20240723 |
| 5 | 제이앤티씨 | 00447575 | 204270 | 20250401 |
| 6 | PS일렉트로닉스 | 01015160 | 332570 | 20250507 |
| 7 | 디케이티 | 01137903 | 290550 | 20230403 |
| 8 | 티에프이 | 01035368 | 425420 | 20221117 |

corp_name 부분일치 다중 row 시 stock_code 일치하는 단독 row 선택 (상장사). modify_date도 함께 기록 — corp_code stale 가설 부보강.

---

## 영역 3: `stockTotqySttus.json` raw 응답

### endpoint

`extractSharesOutstanding` 호출 (`src/tools/sagyeongin/_lib/financial-extractor.ts:221-236`):

```ts
const year = new Date().getFullYear() - 1;  // 2025
const raw = await ctx.client.getJson<StockResp>("stockTotqySttus.json", {
  corp_code,
  bsns_year: String(year),
  reprt_code: "11011",  // 사업보고서
});
```

### 호출 (Onev 환경)

8건 모두 동일 호출. 표본 1 (삼성전기) 우선 호출 → 분기 분류 → 잔여 7건 일괄 호출.

```bash
# 표본 1: 삼성전기 (corp_code 영역 2의 결과 사용)
CORP_CODE="<영역 2의 삼성전기 corp_code>"
API_KEY="$DART_API_KEY"  # ~/.korean-dart-mcp/.env 또는 셸 환경
curl -s "https://opendart.fss.or.kr/api/stockTotqySttus.json?crtfc_key=${API_KEY}&corp_code=${CORP_CODE}&bsns_year=2025&reprt_code=11011" | jq .
```

### 기록 — 8건 표본 (영역 4 입력)

| # | corp_name | status | list 존재 | 보통주 행 | istc_totqy | 분기 (영역 4) |
|---|---|---|---|---|---|---|
| 1 | 삼성전기 | 000 | O (4건) | X (se 불일치) | - | C |
| 2 | 케이엠더블유 | 000 | O (4건) | X (se 불일치) | - | C |
| 3 | LX세미콘 | 000 | O (4건) | X (se 불일치) | - | C |
| 4 | 나무가 | 000 | O (4건) | X (se 불일치) | - | C |
| 5 | 제이앤티씨 | 000 | O (4건) | X (se 불일치) | - | C |
| 6 | PS일렉트로닉스 | 000 | O (4건) | X (se 불일치) | - | C |
| 7 | 디케이티 | 000 | O (4건) | X (se 불일치) | - | C |
| 8 | 티에프이 | 000 | O (4건) | X (se 불일치) | - | C |

기록 항목:
- `status`: 응답 body의 status 코드 (예: "000", "013", "020")
- `list 존재`: O / X (status="000"인데 list 부재 가능)
- `보통주 행`: O / X (`se="보통주"` 행 존재 여부)
- `istc_totqy`: 보통주 행의 istc_totqy 값 (없으면 -, 0이면 0)

표본 1~2건 우선 호출 후 분기 패턴 식별되면 잔여 일괄. daily limit (20,000건) 영향 0 — 8회 호출.

### 핵심 발견: se 필드값 가정 어긋남

코드 가정 `se === "보통주"` 가 실제 DART 응답과 불일치 — 보통주 해당 행의 실제 se 값:

| # | corp_name | 실제 se 값 (보통주 해당 행) | includes("보통주") | istc_totqy (실제값) |
|---|---|---|---|---|
| 1 | 삼성전기 | `"의결권이 있는주식(보통주)"` | ✓ | 74,693,696 |
| 2 | 케이엠더블유 | `"의결권 있는 주식"` | ✗ (보통주 키워드 없음) | — |
| 3 | LX세미콘 | `"보통주식"` | ✓ | 16,264,300 |
| 4 | 나무가 | `"보통주식"` | ✓ | 14,045,317 |
| 5 | 제이앤티씨 | `"보통주식"` | ✓ | 57,848,466 |
| 6 | PS일렉트로닉스 | `"보통주식"` | ✓ | 43,789,726 |
| 7 | 디케이티 | `"보통주식"` | ✓ | 20,001,230 |
| 8 | 티에프이 | `"보통주식"` | ✓ | 11,960,710 |

- 7/8: `r.se.includes("보통주")`로 데이터 복구 가능
- 케이엠더블유 1/8: `"의결권 있는 주식"` — includes("보통주") 불일치, 별도 패턴 필요 (`includes("의결권 있는")` 등)
- reprt_code fallback 불필요 — 데이터 자체는 11011 사업보고서에 존재함

---

## 영역 4: throw 분기 4분류

### 분기 매트릭스

`extractSharesOutstanding` throw 분기 (코드 line 228-235):

```ts
const rows = raw.status === "000" ? (raw.list ?? []) : [];
const common = rows.find((r) => r.se === "보통주");
if (!common?.istc_totqy) {
  throw new Error(...);  // 분기 A/B/C/D
}
const shares = parseAccountAmount(common.istc_totqy);
if (shares !== null && shares > 0) return shares;
throw new Error(...);  // 분기 E
```

| 분기 | 조건 | 정책 ② 의미 | 정책 ③ 의미 |
|---|---|---|---|
| **A** | status≠"000" → rows=[] | reprt_code fallback **유의미** (사업보고서 미공시 → 반기 시도 의미) | data_incomplete 신호 |
| **B** | status="000", list 부재/[] | fallback 무의미 (응답 자체 빈) | data_incomplete 신호 |
| **C** | status="000", list 존재 but 보통주 행 부재 | fallback 무의미 (구조 다름) | data_incomplete 신호 |
| **D** | 보통주 행 존재 but istc_totqy 부재/0 | fallback 무의미 (필드 부재) | data_incomplete 신호 |
| **E** | istc_totqy 존재 but parseAccountAmount null/≤0 | fallback 무의미 (parse 실패) | data_incomplete 신호 |

### 기록 — 분기 카운트

| 분기 | 카운트 (8건 중) | 비율 |
|---|---|---|
| A (status≠"000") | 0 | 0% |
| B (status="000", list 부재) | 0 | 0% |
| C (보통주 행 부재) | **8** | **100%** |
| D (istc_totqy 부재/0) | 0 | 0% |
| E (parse 실패) | 0 | 0% |

원인: 분기 C의 "보통주 행 부재"는 실제 데이터 부재가 아니라 **se 필드값 가정 어긋남**. 데이터는 11011 사업보고서에 존재.

### 정책 결정 입력

| 분기 분포 | 추천 정책 |
|---|---|
| A 비율 ≥ 50% | 정책 ② 검토 — fallback으로 회복 가능 |
| A 비율 < 50% (B/C/D 다수) | 정책 ① 채택 자연 — fallback 무의미, ADR-0013 정합 (srim verdict null 흡수) |
| 분기 분산 (A/B/C/D 혼재) | 정책 ① 우선 + 정책 ② 별도 단계 후보 |

정책 ③ (별도 verdict 키 신설)은 ADR 신설 비용 크고 ADR-0013 정합 부정 — 분기 분포 무관 우선순위 낮음.

**실측 기반 정책 채택**: A 비율 0% → **정책 ① 자연** + 추가 발견 반영:

- reprt_code fallback (정책 ②)은 불필요 — 데이터는 11011에 존재, 코드 se 매치 로직이 문제
- 정책 ①-plus 채택: **financial-extractor se 정정** + **skip-reason data_incomplete 추가**
  - se 정정: `r.se === "보통주"` → `r.se.includes("보통주") || r.se.includes("의결권 있는")`
  - 이 정정으로 8/8 모두 데이터 복구 가능 (케이엠더블유 포함)
  - data_incomplete는 정정 후에도 남는 패일세이프 분류 키

---

## 영역 5: `_lib/skip-reason.ts` regex 분기 정밀 표현

### 현재 분류 코드 (line 21-45)

```ts
const m = msg.match(/\[(\d{3})\]/);  // status regex 1건
if (m) {
  if (code === "013") return "status_013";
  if (code === "014") return "status_014";
  return "status_other";
}
if (/회사를 찾을 수 없습니다/.test(msg)) return "corp_not_found";  // regex 2
if (/timeout|...|network/i.test(msg)) return "network_error";  // regex 3
if (/JSON|...|parse/i.test(msg)) return "parse_error";  // regex 4
return "unknown";
```

### 정밀 표현

- **regex 4건** (status `/\[(\d{3})\]/` + corp_not_found + network_error + parse_error)
- **status regex 매치 후 3분기** (013 / 014 / other)
- **합 6 분류 키** + `unknown` fallback

실측 확인 (2026-05-08): skip-reason.ts 46줄 직접 읽기로 구조 정합 확인 ✓

regex 상세 (실제 코드):
- regex 1: `/\[(\d{3})\]/` → 013/014/other
- regex 2: `/회사를 찾을 수 없습니다/` → corp_not_found
- regex 3: `/timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED|fetch failed|network/i` → network_error
- regex 4: `/JSON|Unexpected token|parse/i` → parse_error

→ spec §10.13 정정 시 본 정밀 표현 사용. 묶음 2에서 `data_incomplete` regex 추가 후:
- regex 5건 + status 3분기 + 7 분류 키 + `unknown` fallback

### `data_incomplete` 분류 후보

```ts
if (/shares_outstanding not found|financial-extractor:|series sparse/i.test(msg)) {
  return "data_incomplete";
}
```

throw 메시지: `"financial-extractor: shares_outstanding not found for <corp_code>"`

regex 정합 확인:
- `/shares_outstanding not found/i` → ✓ 매칭
- `/financial-extractor:/i` → ✓ 매칭 (양쪽 모두 커버)
- 기존 6 분류 키 영향: 0 (status 코드/resolveCorp/네트워크/파싱과 겹침 0)

se 정정 후에도 케이엠더블유 등 장기적 실패 케이스에서 data_incomplete 분류 정합 유지.

---

## 영역 6: 묶음 분할 분량 평가

### 실측 결과 기반 채택 정책: ①-plus (영역 4 결과 분기 A=0%, C=100%, se 가정 어긋남 발견)

**신규 발견**: 분기 C의 원인이 데이터 부재가 아닌 **se 필드값 가정 어긋남**으로 확인.
reprt_code fallback (정책 ②) 불필요 — 데이터는 11011에 존재, se 매치 로직이 문제.

| 묶음 | 내용 | 변경 파일 | 단테 |
|---|---|---|---|
| **1** | `_lib/financial-extractor.ts` `extractSharesOutstanding` se 매치 정정 (`=== "보통주"` → `includes("보통주") \|\| includes("의결권 있는")`) + spec §10.13·se발견 누적 | financial-extractor.ts + financial-extractor.test.ts | 신규 3~4건 (se 변형 2종 + 매치 성공 + 케이엠더블유 패턴) |
| **2** | `_lib/skip-reason.ts` `data_incomplete` 분류 키 추가 (패일세이프 — se 정정 후에도 남는 미분류 케이스용) | skip-reason.ts + skip-reason.test.ts | 신규 1~2건 (shares_outstanding not found 메시지 분류) |
| **3** | watchlist 통합 검증 (se 정정 후 unknown → 복구 또는 data_incomplete 분포 실측) + 매듭 | verifications/ + spec/ADR 누적 | 0 (field-test) |

→ **묶음 3건 분리 자연**. financial-extractor 변경 분량 + 단테 분량으로 묶음 1 단독.

### 정책 ① 원안 (미채택, 참고)

| 묶음 | 내용 | 비고 |
|---|---|---|
| **1** | skip-reason.ts data_incomplete만 | se 가정 어긋남 방치 — 데이터 복구 0 |
| **2** | 매듭 | |

→ se 가정 어긋남 발견으로 원안 ① 부적합 판단. ①-plus 채택.

### 정책 ② (미채택, 참고)

reprt_code fallback — 데이터가 11011에 이미 존재하므로 불필요. DART 추가 호출 비용만 발생.

### 정책 ③ (미채택)

별도 verdict 키 신설 — ADR 신설 비용 + srim-calc + watchlist 변경. 분기 분포 무관 우선순위 낮음 (ADR-0013 정합 부정).

---

## ADR 결정

| 정책 | ADR 처리 |
|---|---|
| **①** | ADR-0013 누적 §추가 자연 — null 흡수에 새 사례 (`extractSharesOutstanding` throw → srim verdict null) 명시 |
| **②** | 신규 ADR 후보 — `reprt_code` fallback 정책 (DART 호출 카운트 + daily limit 영향 + 사업보고서 미공시 분기) |
| **③** | 신규 ADR 필수 — srim verdict 키 확장 (ADR-0013 정합 부정) |

영역 4 결과 + 정책 채택 후 ADR 결정.

---

## 다음 단계

영역 1~6 결과 보고 → 정책 ①/②/③ 채택 + 묶음 분할 결정 → 14단계 (b) 묶음 1 위임 명세 진입.

위임 보고 시 첨부 항목:
- 영역 1 빌드 출력 (`tsc --noEmit` + `npm run test:unit`)
- 영역 2 corp_code resolve 결과 표 (8건)
- 영역 3 raw 응답 8건 (또는 분기 패턴 명확 시 1~2건 우선 + 잔여 일괄)
- 영역 4 분기 분류 카운트
- 영역 5 정밀 표현 정합 확인
- 영역 6 묶음 분할 결정

---

## 참고

- 13단계 verifications: `2026-05-07-stage13-field-test.md`
- spec §10.13: `docs/sagyeongin/sagyeongin-dart-agent-spec.md` (예정 정정 위치)
- spec-pending-edits §10.13: `docs/sagyeongin/spec-pending-edits.md:449-467`
- ADR-0013 (srim-null-on-invalid): `docs/sagyeongin/adr/0013-srim-null-on-invalid.md`
- ADR-0001 (β-i 격리): `src/lib/` 변경 0 유지 — 본 단계 financial-extractor 변경은 `_lib/` 위치 (β-i 정합)
