# ADR-0026 — KSIC 정책 baseline (X1 채택 + 자릿수 혼재 + 대칭 매칭 이미 정착)

- 상태: Accepted (Stage 29.5 정정 baseline)
- 일자: 2026-05-22 (Stage 29.5 정정: 2026-05-22)
- Stage: 29 → 29.5 정정
- 관련: ADR-0016 (corp_meta cache), spec §10.3 (capex_signal), §10.7 (scan_preview), §10.14 (신설), spec-pending-edits §10.15 (X1/X2/X3 후보)

## Context

`capex_signal` (7부 C 영역) 본문 `judgeExistingBusinessMatch` (capex-signal.ts line 121~133) 영역 MVP 한정 default true 휴리스틱 baseline — `extractIndutyCode` + `matchInduty` 정착 완료 baseline (induty-extractor.ts) 영역 호출 0건 baseline. 본 함수 활용 baseline 진입 전 KSIC 차수 정책 baseline 결정 필요.

spec-pending-edits §10.15 후보 3건 baseline 누적:
- X1: startsWith 현행 유지 — 코드 변경 0
- X2: 9차/10차 매핑 테이블 신설 — 외부 source 필요
- X3: `sagyeongin_industry_distribution_status` 도구 신설 — 분포 노출 baseline

본 사이클 영역 회수 E (DART corp_meta cache 실측 분포 회수, 2026-05-12 baseline, 3,964건) 결과 baseline 영역 직접 정책 결정.

## Decision

**X1 채택 + matchInduty 대칭 매칭 이미 정착 (현행 본문 `slice === slice` 양쪽 추출) + 2자리 record 미매칭 허용 baseline**.

### 1. 차수 정책 — 단일 차수 고정 부재 baseline

DART API 영역 `induty_code` 차수 메타 미제공 baseline 직접 확인. corp_meta cache 영역 induty_code = 회사 등록 당시 코드 그대로 baseline = KSIC 9차/10차 혼재 baseline.

→ **차수 식별 baseline 자체 부재** baseline = X2 (매핑 테이블) baseline 자체 적용 불가 baseline → 기각 baseline.

### 2. 자릿수 정책 — 혼재 허용 + prefix 3자리 매칭 baseline

회수 E 실측 baseline (3,964건):

| 자릿수 | 건수 | 비율 |
|---|---|---|
| 5 (세세분류) | 2,050 | 51.7% |
| 3 (소분류) | 1,389 | 35.1% |
| 4 (세분류) | 481 | 12.1% |
| 2 (중분류) | 44 | 1.1% |

prefix 3자리 unique = 176개 (소분류 다양성 충분 baseline).

→ `matchInduty(prefixLen=3)` default baseline 채택 — 7부 C 본질 ("케파 증설 vs 신규 분야 확장") 경계 정합.

### 3. 매칭 알고리즘 — 대칭 prefix 매칭 (현행 본문 이미 정착)

자릿수 혼재 baseline 영역 비대칭 매칭 위험 가능성 baseline (개념 baseline):

| record A | record B | startsWith(A, B) | startsWith(B, A) |
|---|---|---|---|
| "21210" | "212" | false | **true** |
| "212" | "21210" | true | false |

**현행 본문 (induty-extractor.ts lines 56-66) 영역 양쪽 prefixLen 추출 후 정확 일치 baseline (대칭 정합)**:

```typescript
if (normA.length < prefixLen || normB.length < prefixLen) return false;
return normA.slice(0, prefixLen) === normB.slice(0, prefixLen);
```

| A | B | 본문 결과 | 본질 |
|---|---|---|---|
| "21210" | "212" | slice(0,3) "212" === "212" → **true** | 대칭 정합 |
| "212" | "21210" | "212" === "212" → **true** | 대칭 정합 |
| "212" | "21" | length 2 < 3 → **false** | 2자리 미매칭 (§4 baseline 정합) |

→ 현행 본문 = 대칭 baseline 이미 정착. Stage 29 phase 1 사전 가정 ("현행 startsWith 단방향, phase 2 정밀화 필요") **어긋남 식별 (Stage 29.5 정정)** — 실제 본문은 이미 대칭 + 2자리 미매칭 §4 정합. **phase 2 코드 변경 부재**.

### 4. 2자리 record corner case — 미매칭 허용 baseline

44건 (1.1%) baseline 영역 prefix 3자리 매칭 시 불완전 baseline. MVP 영역 별도 처리 overhead 회피 → **미매칭 baseline 허용** (false negative 1.1% baseline 흡수).

### 5. X3 (분포 도구 신설) baseline — 보류 baseline

본 사이클 회수 E baseline 영역 X3 사전 baseline 직접 정합 — 본 ADR 결정 baseline 직접 X3 정책 결정 baseline 우회 가능. X3 도구 신설 baseline 영역 Stage 30 이후 후속 baseline (capex_signal 활용 baseline 영역 분포 도구 필요성 식별 baseline 후 baseline).

## Consequences

### 긍정

- **차수 식별 부재 baseline 직접 정합** — 외부 매핑 테이블 baseline 부재 baseline 영역 적정 baseline
- **prefix 3자리 default baseline 회수 E 직접 정합** — 176 unique 소분류 baseline = capex_signal 구분 가능 baseline
- **MVP 영역 overhead 최소화** — 2자리 corner case 별 처리 baseline 회피 baseline
- **phase 2 (Stage 30) 코드 변경 spec baseline 명시 baseline** ~~matchInduty 대칭 매칭 정밀화 baseline~~ — Stage 29.5 정정 baseline 영역 본 본문 **삭제** (현행 본문 이미 정착, phase 2 코드 변경 부재)

### 부정

- **9차/10차 혼재 baseline 허용** — KSIC 차수 변경 시 prefix 일치 baseline 영역 의미 불일치 가능성 (false positive 위험 baseline). MVP 영역 흡수 baseline
- **2자리 record (44건, 1.1%) 미매칭 baseline** — 7부 C false negative 1.1% baseline 흡수
- **Stage 29 phase 1 사전 가정 어긋남 (Stage 29.5 정정 baseline)** — "현 `matchInduty` 본문 대칭 매칭 부재" 가정 영역 raw 본문 사전 view 부재 산물 (학습 #44 직접 근거). 실제 본문 (induty-extractor.ts lines 56-66) = `slice === slice` 양쪽 추출 = 이미 대칭 정합

### 후속 영향

- ~~Stage 30 phase 2 baseline = `matchInduty` 대칭 매칭 정밀화 + `judgeExistingBusinessMatch` 본문 정착 (`extractIndutyCode` + `matchInduty` 활용)~~ **Stage 29.5 정정 baseline 영역 본 본문 본질 재정의**:
  - `matchInduty` 대칭 매칭 = 이미 정착 baseline (코드 변경 부재)
  - `judgeExistingBusinessMatch` signature = `(assetCategory: string, bsnsObjt: string, companyInduty: string) → boolean` 직접 확인 (capex-signal.ts lines 121-131) — DART `ast_sen` (자산 종류) + `inh_pp` (취득 목적) 텍스트 + 회사 KSIC 코드 baseline. **induty vs induty 비교 본질 부재** — `matchInduty` 직접 활용 baseline 적용 불가 (induty 코드 양쪽 부재)
  - 본 함수 정밀화 본질 = 자본거래 공시 텍스트 (ast_sen + inh_pp) 영역 회사 KSIC 본 사업 정합 판정 baseline — Stage 30 재정의 baseline (γ 텍스트 매칭 키워드 누적 사이클 — DART tgastInhDecsn 응답 분포 field-test 의존)
- spec-pending-edits §10.3 건 1 (자릿수) baseline = §10.14 흡수 baseline → 정착 baseline
- spec-pending-edits §10.15 baseline = X1 정착 + X2 기각 + X3 보류 (Stage 30+ 후속 baseline)
- §10.3 (capex_signal) + §10.7 (scan_preview) cross-reference baseline = §10.14 참조 baseline

## Verification

- 회수 E raw 결과: `verifications/stage29/induty-distribution-2026-05-12.md`
- DART corp_meta cache: `.cache/corp_meta.db` 영역 SQLite schema (corp_code PRIMARY KEY + induty_code TEXT NOT NULL + corp_cls TEXT NOT NULL + modify_date TEXT NOT NULL + fetched_at TEXT NOT NULL)
- 실측 baseline 일자: 2026-05-12

### Stage 29.5 정정 baseline (2026-05-22)

- `matchInduty` raw 본문 (induty-extractor.ts lines 56-66) 직접 view 회수 → §3 + §부정 + §후속 영향 본문 정정
- `judgeExistingBusinessMatch` signature raw (capex-signal.ts lines 121-131) 직접 view 회수 → §후속 영향 본질 재정의 (텍스트 vs KSIC 매칭 baseline)
- 학습 #44 신설 직접 근거 (ADR/spec 결정 사이클 영역 raw 본문 사전 view 가드, paired #38/#42)

---

Ref: spec §10.14 (신설 + Stage 29.5 정정), §10.3 (capex_signal), §10.7 (scan_preview), spec-pending-edits §10.3 건 1 + §10.15, ADR-0016 (corp_meta cache), 회수 E (3,964건), 사이클 baseline `5f9c5e7` (Stage 28 매듭) + `7e23ce4` (Stage 29 phase 1 매듭, Stage 29.5 정정 baseline)
