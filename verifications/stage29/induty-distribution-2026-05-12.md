# 회수 E — induty_code 분포 실측 (2026-05-12, 3,964건)

**목적**: ADR-0026 (KSIC 정책 baseline) 의사결정 근거 데이터 영구 보존.  
**일자**: 2026-05-12  
**데이터 소스**: `.cache/corp_meta.db` (corp_meta cache, ADR-0016)  
**총 건수**: 3,964건

---

## corp_meta.db SQLite schema

```sql
CREATE TABLE corp_meta (
  corp_code   TEXT NOT NULL PRIMARY KEY,
  induty_code TEXT NOT NULL,
  corp_cls    TEXT NOT NULL,
  modify_date TEXT NOT NULL,
  fetched_at  TEXT NOT NULL
);
```

---

## 샘플 5건

```json
[
  { "corp_code": "00126380", "induty_code": "26221", "corp_cls": "Y", "modify_date": "20231215" },
  { "corp_code": "00104377", "induty_code": "212",   "corp_cls": "Y", "modify_date": "20220830" },
  { "corp_code": "00164779", "induty_code": "4641",  "corp_cls": "K", "modify_date": "20240101" },
  { "corp_code": "00293886", "induty_code": "70111", "corp_cls": "Y", "modify_date": "20210503" },
  { "corp_code": "00401136", "induty_code": "461",   "corp_cls": "K", "modify_date": "20230618" }
]
```

---

## 자릿수 분포

```sql
SELECT length(induty_code) AS digits, count(*) AS cnt
FROM corp_meta
GROUP BY digits
ORDER BY cnt DESC;
```

| 자릿수 | 항목 | 건수 | 비율 |
|---|---|---|---|
| 5 | 세세분류 | 2,050 | 51.7% |
| 3 | 소분류 | 1,389 | 35.1% |
| 4 | 세분류 | 481 | 12.1% |
| 2 | 중분류 | 44 | 1.1% |
| **합계** | | **3,964** | **100%** |

---

## prefix 3자리 unique 분포 (상위 30개)

```sql
SELECT substr(induty_code, 1, 3) AS prefix3, count(*) AS cnt
FROM corp_meta
GROUP BY prefix3
ORDER BY cnt DESC
LIMIT 30;
```

| prefix3 | 건수 | 추정 항목 |
|---|---|---|
| 262 | 187 | 전자부품·반도체 |
| 266 | 163 | 의료·측정기기 |
| 264 | 145 | 통신장비 |
| 201 | 112 | 의약품 |
| 281 | 108 | 전기장비 |
| 291 | 97 | 일반기계 |
| 101 | 84 | 식료품 |
| 710 | 78 | 전문·과학·기술 (KSIC 9차 계열) |
| 463 | 72 | 기계·장비 도매 |
| 241 | 68 | 기초금속 |
| 301 | 61 | 자동차·부품 |
| 311 | 57 | 선박·보트 |
| 321 | 54 | 의료·정밀기기 |
| 620 | 51 | SW 개발 |
| 265 | 49 | 가전·AV 기기 |
| 461 | 46 | 농·축·수산물 도매 |
| 251 | 44 | 금속 가공 |
| 452 | 41 | 자동차 판매 |
| 211 | 39 | 펄프·종이 |
| 411 | 37 | 건설 |
| 631 | 35 | 데이터·서버 |
| 551 | 33 | 숙박 |
| 561 | 31 | 음식점 |
| 351 | 29 | 전력 생산 |
| 531 | 27 | 소매 (전문) |
| 642 | 25 | 금융 |
| 661 | 23 | 보험 |
| 701 | 21 | 부동산 |
| 802 | 19 | 교육 |
| 911 | 16 | 예술·스포츠 |

**prefix 3자리 unique 총계**: **176개**

---

## 2자리 record 목록 (44건 corner case)

```sql
SELECT induty_code, count(*) AS cnt
FROM corp_meta
WHERE length(induty_code) = 2
GROUP BY induty_code
ORDER BY cnt DESC;
```

| induty_code | 항목 | 건수 |
|---|---|---|
| 26 | 전자부품 (중분류) | 12 |
| 20 | 화학물질 (중분류) | 9 |
| 28 | 전기장비 (중분류) | 7 |
| 29 | 기계 (중분류) | 6 |
| 62 | SW (중분류) | 4 |
| 기타 | — | 6 |
| **합계** | | **44** |

---

## 핵심 발견

1. **KSIC 9차/10차 혼재 확인**: `induty_code = "70xxx"` (KSIC 9차 전문과학기술) + `induty_code = "71xxx"` (KSIC 10차 전문과학기술) 동시 존재 — 차수 식별 메타 DART API 미제공으로 자동 구분 불가. → ADR-0026 X2 기각 근거.

2. **3자리 > 5자리 분포**: 51.7% (5자리) + 35.1% (3자리) = 86.8% 주력 — prefix 3자리 default가 전체 커버리지 정합.

3. **prefix 3자리 176 unique**: `capex_signal` 7부 C "케파 증설 vs 신규 분야 확장" 경계 구분 충분 — ADR-0026 X1 채택 근거.

4. **2자리 record 1.1%**: MVP false negative 흡수 허용 — ADR-0026 corner case 결정 근거.

---

Ref: ADR-0026, spec §10.14, corp-meta-cache.ts (ADR-0016)  
Baseline: `5f9c5e7` (Stage 28 매듭), 회수 E 일자: 2026-05-12
