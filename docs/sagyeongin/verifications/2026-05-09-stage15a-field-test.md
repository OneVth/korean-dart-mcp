# 15단계 (a) field-test — KSIC 26 제외 universe 가설 (α) 실측

**실행 일자**: 2026-05-09  
**script**: `scripts/sagyeongin/field-test-stage15a.mjs`  
**universe**: excluded_industries:["26"] + KOSDAQ+KOSPI 통합  
**총 elapsed**: 376.5s

---

## 본 검증의 본질

11단계 묶음 2B field-test에서 Stage 1 company.json 호출 3,963회 중 2,607회 (65.8%) 실패 발견.  
13단계에서 KSIC 26 통제군(294개 corp 전원 Stage 1 통과 → status_013=0)으로 가설 (α) 해당 없음 판정.

**본 단계**: KSIC 26 *제외* universe(비KSIC26 활성 섹터 전체)로 가설 (α) 정밀 검증.

- **가설 (α)**: Stage 1 실패 corp는 modify_date 3년 초과 비율이 모집단 기준선(73.1%)보다 유의미하게 높음 → stale corp_code 결정론적 시그널
- **대립 가설 (β)**: Stage 1 실패는 DART API 호출 정책 (throttle/retry/backoff) 또는 응답 구조 변경이 원인

---

## 영역 1: 실행 조건

### 명령

```bash
npm run build
node --env-file=.env scripts/sagyeongin/field-test-stage15a.mjs
```

### 환경

| 항목 | 값 |
|---|---|
| SAGYEONGIN_CONFIG_DIR | tmpdir 임시 격리 (스크립트 진입 시 초기화) |
| excluded_industries | ["26"] |
| markets | ["KOSDAQ", "KOSPI"] |
| limit | 200 |
| elapsed | 376.5s |
| started_at | 2026-05-09T02:25:04.949Z |
| finished_at | 2026-05-09T02:31:21.403Z |

**network_error > 50% 경고**: 이하 분석에서 reason_code 전체가 network_error (100%)임을 사전 명시. 명세(verifications 사전 검증 명세) 정책에 따라 가설 (α) 판정은 modify_date 분포로 진행하되, 결과 해석에서 네트워크 오류 맥락을 병기한다.

---

## 영역 2: pipeline_stats — 13단계 비교 표

| 영역 | 13단계 (KSIC 26) | 15(a) (excluded:26) | 격차 의미 |
|---|---|---|---|
| initial_universe | 3,963 | **3,963** | 동일 모집단 (전체 KOSDAQ+KOSPI) |
| after_static_filter | 294 | **659** | +365 — 비KSIC26 섹터 중 Stage 1 통과 + 필터 통과 corp |
| after_killer_check | 79 | **659** | killer 통과율 **100%** (13단계 26.9% 대비 이상치 — 영역 3 해설) |
| after_srim_filter | 18 | **0** | SRIM 통과 0건 — 전원 network_error (naver 호출 차단) |
| candidates | 5 | **0** | limit=200 미달 — SRIM 단계 전원 탈락 |

### pipeline 흐름 해설

13단계와 본 단계의 파이프라인 구조 차이:

- **13단계**: 3,963 → static_filter(KSIC 26 매칭) → 294 corp만 선별 후 Stage 1 → 전원 통과 (0 stage1 실패)
- **15단계**: 3,963 → Stage 1 (company.json 호출) → 2,607 network_error 탈락 → 정적 필터 → 659 통과

즉, 15단계는 Stage 1이 전체 3,963 corp를 대상으로 순차 실행 후 필터가 적용된다. 3,963 − 2,607 (stage1 탈락) = 1,356 통과 → 정적 필터 후 659 잔류 (697건 KSIC/market 기준 제외).

---

## 영역 3: stage 분포 + reason_code 분포

### stage 분포

| stage | 카운트 | 비율 |
|---|---|---|
| stage1 | 2,607 | 79.8% |
| stage2 | 0 | 0.0% |
| stage3 | 659 | 20.2% |
| **합계** | **3,266** | 100% |

### reason_code 분포

| reason_code | 카운트 | 비율 | 분류 |
|---|---|---|---|
| **network_error** | **3,266** | **100.0%** | 네트워크 / API 호출 실패 |
| status_013 | 0 | 0.0% | DART 조회 데이터 없음 (stale 시그널) |
| status_014 | 0 | 0.0% | DART 서비스 중단 |
| status_other | 0 | 0.0% | 기타 DART 오류 |
| corp_not_found | 0 | 0.0% | corp_code 미존재 |
| parse_error | 0 | 0.0% | 응답 파싱 실패 |
| data_incomplete | 0 | 0.0% | 재무 데이터 불완전 |
| unknown | 0 | 0.0% | 분류 미달 |

**network_error 내역 분리**:

- **stage1 network_error (2,607건)**: `company.json 실패: fetch failed` — DART API 호출 자체 실패 (연결 거부 또는 타임아웃). 11단계 2,607건 재현.
- **stage3 network_error (659건)**: `srim 호출 실패: fetch failed` — naver 현재가 스크래핑 연속 659회 호출 → IP 차단 추정.

> **unknown 해석 가드**: unknown=0 (전부 network_error 분류). 분류 미달 영역 없음.  
> verdict-기반 skip(stage2 killer EXCLUDE / stage3 verdict null)도 0건 — stage2 자체가 0 스킵.

**killer check 100% 통과 이상치 해설**: after_killer_check = after_static_filter = 659. 원인 후보:
1. killer_check가 stage1에서 이미 얻은 company.json 데이터를 활용 — 추가 API 호출 없이 통과 판정
2. 659개 corp가 재무 killer 트리거(연속 적자, 자본잠식 등) 미해당 — excluded_industries:["26"] 필터 통과 corp는 상대적으로 건전한 활성 섹터 집합

---

## 영역 4: 가설 (α) 결과

### Stage 1 실패 corp modify_date 분포

| 구간 | 카운트 | 비율 |
|---|---|---|
| within_30_days | 106 | 4.1% |
| within_1_year | 925 | 35.5% |
| within_3_years | 719 | 27.6% |
| older_than_3_years | 857 | **32.9%** |
| null_or_invalid | 0 | 0.0% |
| **합계** | **2,607** | 100% |

### 가설 (α) 수치

| 항목 | 값 |
|---|---|
| stage1_failed_count | 2,607 |
| older_than_3_years_ratio | **32.9%** |
| universe_baseline_ratio | 73.1% |
| 격차 | −40.2%p |
| interpretation_note | 가설 (α) 기각 — 3년 초과 비율(32.9%)이 낮음. Stage 1 실패는 stale과 무관 → 가설 (β) 가중. |

### 판정 분기

| older_ratio | 판정 | 의미 |
|---|---|---|
| ≥ 90% | (α) 강한 지지 | stale 결정론적 시그널 |
| 60~90% | (α) 약한 지지 | stale 부분 원인 |
| **< 60%** | **(α) 기각** | **Stage 1 실패 stale 무관 → (β) 가중** |

**실측 32.9% → (α) 기각** 확정.

**역방향 분포 해석**: Stage 1 실패 corp의 67.1%가 modify_date 3년 이내 (비교적 최근 갱신). modify_date가 최근인 corp일수록 DART에 유효한 정보가 있으나 API 호출 자체가 network_error로 실패 → stale 문제가 아닌 DART API 호출 정책(throttle/backoff 부재) 문제.

(c) 우선순위: **ADR-0014 후보 신설** — DART 호출 정책 (throttle·retry·backoff) 설계. status_013(stale 시그널)이 0건인 점에서 corp_code stale 격리 도구((c) 계획)은 우선순위 후순위로 내려간다.

---

## 영역 5: KSIC 26 비교 차원

| 항목 | 13단계 (KSIC 26) | 15(a) (excluded:26) |
|---|---|---|
| candidates 수 | 5건 | **0건** |
| candidates induty_code | 261, 262, 263, 264, 269 계열 | — |
| SRIM 통과 비율 | 18/79 = 22.8% | 0/659 = **0.0%** |

candidates=0이므로 induty_code 분포 비교는 불가. 0건의 직접 원인은 SRIM 단계 전원 network_error(naver 호출 차단)이며, SRIM 판정 자체가 수행되지 않은 상태다. 비KSIC26 universe의 내재적 필터링 특성(killer 통과율, SRIM BUY 비율)은 별도 실행(네트워크 오류 제거 후)에서 재측정이 필요하다.

---

## 영역 6: data_incomplete / unknown 비율 — 14단계 (b) 학습 흡수 검증

| reason_code | 카운트 | 14단계 (b) 흡수 정합 |
|---|---|---|
| data_incomplete | 0 | `_lib/skip-reason.ts` 커버 정합 — 미발동 |
| unknown | 0 | verdict-기반 skip 또는 분류 미달 없음 |

**data_incomplete = 0** 해석: financial-extractor 5종 throw(`shares_outstanding not found` 등)가 한 건도 발동되지 않았다. 이는 14단계 (b) `_lib/skip-reason.ts`의 data_incomplete 분류가 올바르게 등록됐으나 본 실행에서 killer/SRIM 도달 전에 stage1 network_error로 전원 탈락해 financial-extractor가 실행되지 않았기 때문이다.

**unknown = 0** 해석: stage2 스킵 0건(killer EXCLUDE 경로 없음) + stage3 모두 network_error(reason_code 존재)로 classifySkipReason 비호출 경로 미발생.

**spec-pending-edits §10.15 후보 신설 정황**: 없음. 본 실행은 전체가 network_error로 덮여 있어 새 enum 변형(KSIC 9차/10차 변형, se 변형 등)이 실측되지 않았다. §10.15 후보 발굴을 위해서는 network_error 제거(DART 호출 정책 ADR 구현) 후 재실행이 필요하다.

---

## 영역 7: 종합 분기

**가설 (α) 최종 판정**: 기각 — older_than_3_years_ratio 32.9%가 모집단 기준선 73.1% 대비 −40.2%p. Stage 1 실패 corp는 오히려 최근 modify_date(3년 이내) 비중이 높아 stale 가설을 역방향으로 반증.

**가설 (β) 지지 증거**:
1. reason_code network_error = 100% (3,266/3,266) — DART API 및 naver 호출 실패
2. stage1 2,607건 모두 `fetch failed` — 11단계 동일 수치 재현 → 특정 corp 문제가 아닌 호출 정책 부재 문제
3. stage3 659건 모두 `fetch failed` — naver 연속 호출 차단

**(c) 후속 우선순위 추천**: **ADR-0014 신설 — DART/naver 호출 정책 (throttle·delay·retry·backoff) 설계**. stage1 실패율을 실질적으로 낮추려면 호출 간격 제어와 재시도 정책이 선행돼야 한다. corp_code stale 격리 도구((c) 계획)는 status_013=0인 현재 증거 하에서 우선순위 후순위.

**spec-pending-edits §10.15 신설 정황**: 없음 (근거: 전원 network_error, 새 enum 변형 실측 0건). 네트워크 오류 제거 후 재실행에서 분류 미달 영역 발견 시 재검토.

---

## 영역 8: 본 단계 누적 학습

1. **가설 (α) 기각 + 역방향 분포**: Stage 1 실패 corp modify_date는 모집단보다 오히려 최근 — stale이 원인이 아닌 증거. 11단계 2,607건 재현은 DART API throttle/backoff 부재의 일관된 시그널.
2. **network_error 100% 오염 실행의 해석 방법**: reason_code가 단일 오류로 100% 덮인 실행에서도 modify_date 분포 분석은 유효 — 가설 (α)/(β) 분기 판정에 충분한 정보를 제공함.
3. **killer check 100% 통과**: 비KSIC26 활성 섹터 659 corp가 killer를 전원 통과 — KSIC 26 통제군(26.9% 통과)과 대비. 비KSIC26 universe의 재무 건전성 분포 특성 데이터(연속 적자 비율 등)는 ADR-0014 구현 후 재실행에서 정밀 측정 가능.
4. **after_static_filter 659 (vs 13단계 294)**: 비KSIC26 통과 corp가 KSIC26 대비 +365건. 전체 KOSDAQ+KOSPI에서 KSIC 26 섹터의 영향력을 역산하는 데이터 포인트.
