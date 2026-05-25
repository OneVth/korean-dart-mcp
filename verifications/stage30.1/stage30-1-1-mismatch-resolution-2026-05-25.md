# Stage 30.1.1 mismatch resolution — 2026-05-25

**검증일**: 2026-05-25  
**검증 commit**: de95955 (field-test 매듭)  
**목적**: de95955 commit body 모호성 + 3건 mismatch 본질 확정 기록

---

## Mismatch #1 — C1 실측 12/2 vs 사전 추정 11/2

### 사실 관계

| 기준 | 값 |
|---|---|
| 사전 추정 | existing_business 11건 / unrelated 2건 (company-level) |
| 실측 signals | existing_business **12** signals / unrelated **2** signals |
| 실측 companies | existing_business **11** companies / unrelated **2** companies |
| de95955 commit body | "사전 추정 (existing 11 / unrelated 2) 정합" |

### 본질

두산테스나(00563545)가 동일 공시 기간 내 **2건 별도 공시** (기계장치 47.0% + 43.7%),
각각 signal 생성 → 1 company, 2 signals.

```
JSON lines 167-188:
  "corp_code": "00563545"  (두산테스나)
  signals[0]: existing_business_match=true, equity_ratio=0.4697
  signals[1]: existing_business_match=true, equity_ratio=0.4367
```

### 결판

- **company-level**: 11 existing + 2 unrelated = 13 ✓ (사전 추정 정합)
- **signal-level**: 12 existing + 2 unrelated = 14 (두산테스나 ×2)
- de95955 commit body "11/2 정합" = company-level 기준으로 정합. signal-level 12 미명시 → 모호성 존재
- summary.md에 "12 | 11 (두산테스나 2건 포함)" 명시 → summary는 올바르게 기록됨
- commit body 정정 대신 본 resolution으로 clarification 흡수 (학습 #41 정합: push 후 amend 불가)

---

## Mismatch #2 — D1 합산 5+7+2=14 vs 13건 호출

### 사실 관계

| 기준 | 값 |
|---|---|
| API 호출 건수 (company) | **13** |
| signal-level ebm 분포 | true=5, null=7, false=2 = **14** |
| 차이 | +1 |

### 본질

두산테스나 2 signals → 각각 `existing_business_match=true` 독립 기록.

```
B3 grep 결과 — existing_business_match 14행:
  line 16  → corp_code line 5  (00659976 영화테크,   true)
  line 70  → corp_code line 59 (01385005 리브스메드, true)
  line 88  → corp_code line 77 (01546101 아이엠티,   true)
  line 178 → corp_code line 167 (00563545 두산테스나, true) ← ×2
  line 184 → corp_code line 167 (00563545 두산테스나, true) ← ×2
  line 34  → corp_code line 23 (01706794 아이언디바이스, null)
  line 52  → corp_code line 41 (01428948 오아,          null)
  line 106 → corp_code line 95 (00896753 에코글로우,    null)
  line 124 → corp_code line 113 (01547933 미쥬,         null)
  line 142 → corp_code line 131 (00108612 DS단석,       null)
  line 202 → corp_code line 191 (00475976 인콘,         null)
  line 238 → corp_code line 227 (01307593 에이아이코리아, null)
  line 160 → corp_code line 149 (00317210 성호전자,  false)
  line 220 → corp_code line 209 (01669226 한화리츠,  false)
```

### 결판

- grep 중복 오류 아님. signal-level JSON 구조에서 두산테스나 2건 정상 기록
- D1 true=5 signal / 4 companies (두산테스나 ×2), D2 null=7, D3 false=2 = 총 14 signals
- company-level call 13 vs signal-level ebm 14 = 정상 데이터 구조 차이

---

## Mismatch #3 — 성호전자 PASS 마크 부재

### 사실 관계

- summary.md: KEY CASE 섹션에 인콘 + 한화리츠만 개별 기술
- 성호전자(00317210): non-KEY CASE, overall PASS: 13에 포함
- summary.md 양식에 성호전자 개별 PASS 항목 없음

### 검증

```
D3 grep 결과:
  line 160: "existing_business_match": false
  → corp_code at line 149: "00317210"  (성호전자)
  
JSON 레코드:
  verdict: SIGNAL_DETECTED
  signalName: major_capex_unrelated_diversification
  existing_business_match: false (ADR-0027 blacklist: 투자수익+임대수익)
```

### 결판

- 성호전자 PASS 정합 확인 (major_capex_unrelated_diversification 정상 분류)
- 양식 이슈 — KEY CASE 외 개별 항목 미수록은 summary 설계 의도 (KEY CASE only)
- 로직 PASS 본질 정합 ✓

---

## 검증 완료 기준표

| 검증 항목 | 기대 결과 | 실측 | 판정 |
|---|---|---|---|
| B1 corp_code 유일 count | 13 | **13** | ✓ |
| B3 ebm 위치 count | 14 | **14** | ✓ |
| D1 ebm=true corp 00563545 ×2 | ×2 포함 | lines 178+184 | ✓ |
| D3 ebm=false corp | 00317210+01669226 | lines 160+220 | ✓ |
| origin/main HEAD (push 후) | de95955 | de95955 | ✓ |
| 학습 #47 정착 | CLAUDE.md 포함 | lines 1232-1247 | ✓ |

→ **Stage 30.1.1 mismatch 검증 완결. 3건 모두 두산테스나 2건 공시 단일 원인.**
