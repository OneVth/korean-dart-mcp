# 13단계 묶음 3 field-test — corp_code stale 가설 실측

**실행 일자**: 2026-05-07  
**script**: scripts/sagyeongin/field-test-stage13.mjs  
**universe**: KSIC 26 (전자부품) + KOSDAQ+KOSPI 통합  
**총 elapsed**: 471.8s

---

## 본 검증의 본질

11단계 묶음 2B field-test (2026-05-02)에서 Stage 1 company.json 호출 3963회 중 2607회 (65.8%) 실패 발견 — 가설 두 갈래:
- 가설 (α): corp_code 덤프 stale (delisting/management 잔존)
- 가설 (β): DART API 응답 변경 또는 특정 섹터 편중

13단계 묶음 1 (`reason_code` 분류) + 묶음 2 (`sagyeongin_corp_code_status` 도구) + 본 묶음 (field-test 통합) 결합으로 가설 실측.

---

## 영역 1: corp_code_status 도구 결과

### cache_meta

| 필드 | 값 |
|---|---|
| db_path | `C:\Users\user\.korean-dart-mcp\corp_code.sqlite` |
| db_exists | true |
| count | 117,665 |
| updated_at_iso | 2026-05-07T13:11:46.547Z |
| age_hours | ~0.000 (방금 다운로드) |
| fresh_within_ttl | true |

### modify_date 분포

| 영역 | 카운트 | 비율 |
|---|---|---|
| within_30_days | 2,764 | 2.3% |
| within_1_year | 9,299 | 7.9% |
| within_3_years | 19,576 | 16.6% |
| older_than_3_years | 86,026 | **73.1%** |
| null_or_invalid | 0 | 0.0% |
| total_corps | 117,665 | 100% |

### staleness_judgment

| 필드 | 값 |
|---|---|
| verdict | **FRESH** |
| notes[0] | cache age 0.0h < TTL 24h — FRESH |
| notes[1] | modify_date 3년 초과 비율 73.1% (86026/117665) |

**해석**: cache는 FRESH이나 modify_date 3년 초과 비율이 73.1% — 전체 117,665개 corp 중 86,026개가 3년 이상 갱신 없음. 이는 비상장/비활성 기업이 corp_code 덤프에 대거 잔존함을 시사 (delisted corp_code stale 가설의 정황 증거).

---

## 영역 2: scan-execute reason_code 분포

### pipeline 단계별 카운트

| 단계 | 카운트 |
|---|---|
| initial_universe | 3,963 (전체 KOSDAQ+KOSPI) |
| after_static_filter | 294 (KSIC 26 name/induty 매칭 후) |
| after_killer_check | 79 |
| after_srim_filter | 18 |
| returned_candidates | 5 (limit=5) |

### stage 분포

| stage | 카운트 |
|---|---|
| **stage1** | **0** |
| stage2 | 215 |
| stage3 | 61 |
| **합계** | **276** |

### reason_code 분포

| reason_code | 카운트 | 분류 |
|---|---|---|
| status_013 | **0** | 조회 데이터 없음 — corp_code stale 가설 (α) 핵심 지표 |
| __verdict_based__ | 268 | killer EXCLUDE (stage2) + srim verdict (stage3) — 의도적 분리 |
| unknown | 8 | srim 호출 실패: `shares_outstanding not found` (stage3) |

**unknown 8건 상세**: 삼성전기, 케이엠더블유, LX세미콘, 나무가, 제이앤티씨, PS일렉트로닉스, 디케이티, 티에프이 — 모두 `financial-extractor: shares_outstanding not found` 오류. corp_code 자체는 정상, 재무 데이터 불완전.

---

## 영역 3: Cross-check — 가설 실측

### hypothesis: stale + status_013 > 50%

| 항목 | 값 |
|---|---|
| verdict | FRESH |
| status_013 카운트 | 0 |
| stage1_skipped 카운트 | 0 |
| status_013 비율 | 0/0 = 0.0% |
| hypothesis_supported | **false** |

### 분석

**핵심 발견: Stage 1 실패 0건** — KSIC 26 (전자부품) 294개 corp 전원이 company.json 호출 성공.

분기 (iii) — verdict FRESH + status_013 = 0:
- 가설 (α) 해당 없음: KSIC 26 universe에서는 corp_code stale로 인한 Stage 1 실패가 전혀 발생하지 않음.
- 11단계 65.8% 실패율은 **KSIC 26이 아닌 다른 섹터에 편중**된 것으로 해석 가능.

**가능한 설명**:
- KSIC 26 (전자부품) 기업들은 대부분 활성 상장사 — corp_code 유효성 높음
- 65.8% 실패 집중 구간: 다른 산업 코드, 특히 관리종목·거래정지·폐지 기업이 많은 섹터
- modify_date 73.1% (3년 초과) 비율은 전체 117,665개 덤프 기준 — KSIC 26 294개는 상대적으로 활성 기업 집합

**unknown 8건 (shares_outstanding not found)**:
- corp_code stale과 무관 — DART API 호출 성공, 재무 데이터 파싱 단계 실패
- 11단계 SRIM 계산 정확도 개선 후보 (financial-extractor 영역)

---

## 영역 4: 후속 작업 후보

| 후보 | 근거 |
|---|---|
| (a) KSIC 26 외 섹터 field-test | 65.8% 실패율 편중 섹터 특정 — 가설 (α) 정밀 검증 |
| (b) shares_outstanding not found 정정 | `unknown` 8건 재무 데이터 불완전 — financial-extractor 보완 |
| (c) corp_code 갱신 도구 신설 | modify_date 73.1% (3년 초과) 정황 증거 기반 — 전체 덤프 stale 관리 |

결정은 매듭 시점.

---

## 영역 5: 본 묶음 누적 학습

1. **KSIC 26 corp_code 건강성**: 전자부품 294개 corp 전원 Stage 1 통과 — 섹터 선택이 stale 가설 실측의 통제 변수.
2. **modify_date 분포의 의미**: 73.1% 3년 초과는 비상장 법인 잔존 정황이나, 활성 상장사(KSIC 26)는 별개 — 섹터 필터가 stale 효과를 격리.
3. **unknown reason_code 패턴**: `shares_outstanding not found` — srim 계산 전제조건(발행주식수) 부재. DART 재무제표 구조 변경 또는 특정 기업 공시 누락이 원인.
4. **field-test 범위 한계**: limit=5 (candidates 반환), universe=294 (KSIC 26). 65.8% 실패율 재현을 위해서는 limit 해제 + 전체 섹터 테스트 필요.
5. **pipeline_stats 정합성**: 294 → 79 (killer) → 18 (srim) → 5 (limit). 276 skipped (215+61) + 13 (limit 미반환 srim 통과) = 289 = 294-5 ✓ 정합.
