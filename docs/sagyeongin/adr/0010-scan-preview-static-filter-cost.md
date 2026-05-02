# 0010 - scan_preview Static Filter 비용 노출 전략

- 상태: Accepted
- 결정일: 2026-05-02
- 결정자: 사용자 + Claude

## 컨텍스트

8단계 `feat/scan-preview` 진입 전 spec §10.7 input 영역의 데이터 소스 결정 필요.

spec §10.7 본문 "corp_code 덤프(서버 기동 시 로드) + 기업개황 캐시만 사용. API 호출 없음" — corp_code 덤프 SQLite 5 컬럼(`corp_code` / `corp_name` / `corp_eng_name` / `stock_code` / `modify_date`, `src/lib/corp-code.ts` line 253-262)에 두 영역 부재:

- **`corp_cls`** (KOSPI/KOSDAQ 분기 — spec §6.4 "Y/K 변환" 본질) — markets 입력 영역 적용 필수
- **`induty_code`** (KSIC 5자리 — 6단계 induty-extractor 추출) — included/excluded_industries 입력 영역 적용 필수

두 영역 모두 `company.json` 응답 영역 — 종목별 1 API 호출. universe 2,400 기준 종목별 1 호출 = 2,400 호출 영역 = spec "API 거의 0" 본질 정면 어긋남.

또한 spec 본문 "기업개황 캐시"는 본 fork에 부재 — corp_code 덤프만 SQLite 캐시 영역, company.json 캐시 영역 0. spec 본문 표현이 미래 인프라 가정 영역 본질.

## 고려한 옵션

- **옵션 A** (실행 시 호출): 8단계 자체 종목별 company.json 호출. 2,400+ 호출 — "API 거의 0" 본질 어긋남.
- **옵션 B** (사전 캐시 누적): 별도 캐시 갱신 명령 또는 server 기동 시 lazy 누적, SQLite `corp_cls` + `induty_code` 컬럼 추가. 인프라 부담 큼 — 캐시 무효화/갱신 ADR 별도 영역, `src/lib/corp-code.ts` 영역 변경 필요(ADR-0001 예외 본질 검토).
- **옵션 C** (input 영역 변경): markets + KSIC 분기를 11단계 scan_execute로 이동. spec §10.7 input 의미 변경 + 8단계 영역 좁아짐 (사용자 워크플로우 영역 변경).
- **옵션 D** (비용 노출 + 실 분기 11단계 영역): 8단계 자체 0 호출 유지. estimated_api_calls 안 `stage1_company_resolution: N` 항목 추가, universe × 1 호출 비용(corp_cls + induty_code 합산 영역 — `company.json` 단일 호출 본질) 명시 노출. 11단계 scan_execute Stage 1에서 실제 분기 영역 + 캐시 누적.

## 결정

**옵션 D 채택**.

spec §10.7 영향 영역 (별도 spec commit으로 반영):
- `estimated_universe` 의미: market+name filter 적용 후 universe (over-estimate 분기 — corp_cls + induty_code 분기 미적용, stock_code 부재 row만 제외)
- `estimated_api_calls.stage1_company_resolution: number` 항목 추가 (universe × 1 호출 — corp_cls + induty_code 합산 영역)
- 본문 "corp_code 덤프 단독 활용. company.json 호출은 11단계 영역" 정정

## 근거

- 옵션 D는 8단계 "API 거의 0" 본질 자연 유지 (단계 자체 호출 영역 0).
- `company.json` 응답이 corp_cls + induty_code 동시 제공 영역 (`killer-check.ts` line 91-96 + `induty-extractor.ts` line 35 동일 endpoint 패턴) — 비용 합산 영역 단일 노출 자연.
- 사용자 의사결정 본질: "이 markets+industries 입력으로 universe N개, 분기 비용 합산 M개 call — daily limit 안?" — over-estimate 본질이 daily limit 도달 사전 회피 자연.
- 옵션 B는 인프라 부담 큼 (캐시 무효화/갱신 ADR + `src/lib/corp-code.ts` 영역 변경 ADR-0001 예외 본질). MVP 스코프 초과 영역 가능성.
- 옵션 C는 spec §10.7 input 의미 변경 — 사용자 워크플로우 영역 변경 (preset의 included_industries 영역 8단계 영역 0 — 사용자 인지 영역 추가 비용).

## 결과

**좋은 점**:
- 8단계 자체 호출 영역 0 — spec "API 거의 0" 본질 정합
- 사용자 의사결정 영역 정밀 (분기 비용 명시 노출)
- 11단계 scan_execute 영역 자연 정합 (Stage 1 company_resolution 호출 누적 — ADR-0009 캐시 영역 결정 시 자연 흡수)
- spec §10.7 input 영역 변경 0 — 사용자 워크플로우 변경 영역 0
- `src/lib/corp-code.ts` 영역 변경 0 — ADR-0001 격리 본질 정합 (sagyeongin _lib 안 SQLite 읽기 전용 연결 영역으로 처리)

**트레이드오프**:
- `estimated_universe` over-estimate 분기 — 사용자 인지 영역 (interpretation_notes 또는 doc 명시 영역)
- estimated_api_calls 추정 정확도 영역 — killer/srim pass rate default 가정 의존 (spec-pending-edits §10.7 누적 영역으로 가정값 명시)
- `stage1_company_resolution`은 11단계 캐시 누적 후 실측 영역에서 0 또는 작은 값 (cold start 본질 — 보수적 over-estimate 본질 정합)

**미래 변경 시 영향**:
- 11단계 ADR-0009 결정 시 stage1_company_resolution 캐시 영역 본질 (24h TTL? scan_execute 안 in-memory? 영구 SQLite 누적?) 통합 검토 영역
- 기업개황 캐시 영역 본격 도입 시 (옵션 B 후속 채택 가능성) 옵션 D는 자연 흡수 — `stage1_company_resolution` 영역이 캐시 hit 시 0 반환 영역 자연
