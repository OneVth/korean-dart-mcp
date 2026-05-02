# 0011 - 9단계 insider 시그널 본질 재정의 (elestock chg_rsn 부재 발견 후 majorstock 부호 기반 전환)

- 상태: Accepted
- 결정일: 2026-05-03
- 결정자: 사용자 + Claude

## 컨텍스트

spec §10.12와 ADR-0001 β-iii는 9단계 본질을 다음과 같이 정의했다.

> 원본 `insider-signal.ts`에 `chg_rsn_filter?: "onmarket_only" | "all"` 파라미터를 추가. `"onmarket_only"`면 `chg_rsn` 필드가 "장내매수"/"시장매수" 등인 항목만 집계. (spec §10.12 line 901)

이 본문은 두 가정 위에 서있다.

1. DART `elestock.json` 응답의 raw items에 `chg_rsn` 필드가 존재한다
2. 원본 `insider-signal.ts` handler가 그 `chg_rsn` 필드를 결과에 보존하지 않을 뿐, raw response에는 있다

가정 1을 9단계 진입 전 사전 검증으로 확인했다 (8단계 학습 정착 정합 — 명세 가정값 사전 검증 패턴).

### 1차 검증 (2026-05-02 23:56 KST, 삼성전자 `00126380`, list 2,615건)

- `elestock.json` 응답의 12개 키: `rcept_no`, `rcept_dt`, `corp_code`, `corp_name`, `repror`, `isu_exctv_rgist_at`, `isu_exctv_ofcps`, `isu_main_shrholdr`, `sp_stock_lmp_cnt`, `sp_stock_lmp_irds_cnt`, `sp_stock_lmp_rate`, `sp_stock_lmp_irds_rate`
- `chg_rsn` 키: 2,615건 전수 부재
- `report_tp` 키: 2,615건 전수 부재 (`insider-signal.ts` line 227 본문 "raw items의 report_tp·chg_rsn 참조 권장"이 잘못된 endpoint 참조)

→ 가정 1과 2 모두 기각. spec §10.12 line 901·911 + ADR-0001 line 113 본문 무효.

### 2차 검증 (2026-05-03 00:18 KST, 삼성전자, list 40건)

대량보유 5%+ 영역에 변동사유 필드가 있을지 `majorstock.json`을 확인.

- 응답 13개 키: `rcept_no`, `rcept_dt`, `corp_code`, `corp_name`, `report_tp`, `repror`, `stkqy`, `stkqy_irds`, `stkrt`, `stkrt_irds`, `ctr_stkqy`, `ctr_stkrt`, `report_resn`
- `chg_rsn`/`chnge_rsn`/`rsn`/`stkqy_chg_rsn`/`stkrt_chg_rsn`/`chg_cause`/`cause` 모두 부재
- `report_tp`: 40건 모두 `"일반"` (다른 값 분포는 다른 corp 영역에서 추가 검증 필요)
- `report_resn`: 자유 텍스트 멀티라인. 예시: `"- 보유주식수 변동\n- 보유주식등에 관한 계약의 변경"`

→ majorstock에도 구조화된 변동사유 필드 부재. 단 `stkqy_irds` (보유 변동량, 부호 포함)는 매수/매도 자동 분기 가능. `repror = "삼성물산"` 같은 보고자 식별은 사경인 본문 "최대주주 매수 > 임원 매수"와 부분 정합 가능.

### 결정 필요성

spec §10.12 + ADR-0001 β-iii 본문이 두 endpoint 실측에서 모두 기각된 첫 케이스. 9단계 본질 자체를 재정의해야 하며, 그 결정은 spec 다수 섹션 + ADR-0001 갱신 + 사용자 메모리 정정에 영향을 미친다. ADR README "ADR 작성 기준"의 "도구 추가/삭제, 공식 변경, 룰 정의 변경" 정합 — 새 ADR로 분리 기록.

## 고려한 옵션

### (A) `report_resn` 자유 텍스트 파싱

majorstock의 `report_resn` 필드 (자유 텍스트 멀티라인)를 정규식 또는 LLM으로 파싱해 변동사유 분기 추출.

### (B) `majorstock.json` 단독 + `stkqy_irds` 부호 기반 시그널

신규 도구 `sagyeongin_insider_signal` 신설 (β-i, 사경인 디렉토리 격리). majorstock 호출 → `stkqy_irds` 부호로 매수/매도 자동 분기 → 5%+ 보고자 영역 단독 집계. `chg_rsn_filter` 영역 폐기. upstream `insider-signal.ts` 직접 수정 0 → ADR-0001 β-iii 영역 사실상 폐기.

### (B') (B) + 보고자 가중

(B) 위에 사경인 "최대주주 매수 > 임원 매수" 본문 정합 — `repror`가 최대주주/특수관계인인 항목에 가중.

### (C) 9단계 폐기 — 사경인 7부 C 자동화 0

`insider_signal` 호출 패턴 자체를 11단계 `scan_execute`에서 그대로 (chg_rsn 필터 0, 노이즈 포함) 사용하거나, 7부 C 내부자 시그널 영역을 spec §11.1 명시적 비목표로 이동.

## 결정

**(B) 채택.** (B')는 9단계 후속 정밀화 영역으로 분리 (이 ADR 영역 0).

핵심:
- 신규 도구 `sagyeongin_insider_signal` 신설 — `src/tools/sagyeongin/insider-signal.ts` (β-i 격리)
- 데이터 소스: `majorstock.json` 단독 (DS003 대량보유 5%+)
- 시그널: `stkqy_irds` 부호 기반 매수/매도 집계 + 분기 클러스터 + 5%+ 보고자 영역 단독
- `chg_rsn_filter` 폐기 — 옵션 자체 영역 0
- upstream `insider-signal.ts` 직접 수정 0 — ADR-0001 β-iii 영역 사실상 폐기 (Superseded by 0011)
- 9단계 자체 verdict 0 (도구 영역, 5부 정합) — 적용은 10·11단계

## 근거

### (A) 거부

- spec §11.1 "주석 원문 파싱 (가족회사 대여금, 고객 집중도, 자금조달 이자율, 감가상각법) = LLM 비용 폭발 위험" 비목표와 본질 동일 — 자유 텍스트 파싱이 비목표
- 실측 예시 `"- 보유주식수 변동\n- 보유주식등에 관한 계약의 변경"`이 사경인 본문 "장내매수만 의미 있음"과 정합 0. "보유주식수 변동"은 매수일 수도 매도일 수도 있어 본질 식별 0
- LLM 호출 비용은 5부 "시간 들이지 않기" 위배

### (C) 거부

- 사경인 7부 C가 spec에서 가장 명확하게 자동화 가능 영역으로 기획된 영역. 폐기 부담이 다른 영역과 비교 불가
- (B)로 부분 자동화 가능 — 폐기보다 (B)가 정보 손실 작음

### (B) 선택

- 자동화 100%, 외부 의존 추가 0 (DART OpenDART 단독, spec §11.3 변경 0)
- majorstock는 5%+ 대량보유자 영역 — 사경인 본문 "최대주주 매수 > 임원 매수"의 전자에 정합
- "임원 변동 의무공시는 노이즈" 영역이 주체 분리로 자동 회피 (elestock 영역 폐기)
- 단점 — "장내매수 vs 상속/증여" 분기 영역 자동 식별 0. 단 (A)/(C)도 동일 분기 영역이라 (B)가 손실 가장 작음
- raw items 영역 (`report_resn` 포함)을 도구 결과에 보존하면 LLM 후속 조사 시 자체 파싱 가능 — 자동화 영역과 LLM 영역 분리 정합

### β-i 격리 회복 — β-iii 폐기 결정

- ADR-0001 line 113 "wrapper 사후 필터링 구조적으로 불가능 → 직접 수정이 유일한 경로" 본문은 elestock raw items에 chg_rsn 영역 존재 가정 위에 서있음. 가정 기각으로 본문 무효
- 직접 수정 영역 0 → upstream PR 영역 부담 0 → 사용자 메모리 12단계 (백그라운드 — Issue → 원작자 의향 → PR) 폐기
- 격리 본질 일관 회복 — 모든 사경인 도구가 `src/tools/sagyeongin/` 안에

## 결과

### 좋은 점

- β-i 격리 본질 일관 회복. ADR-0001 본문이 더 단순해짐 (β-iii 영역 제거)
- upstream `insider-signal.ts` 변경 0 — 머지 충돌 면 ADR-0001 line 119 "정량적 최소" 영역에서 `index.ts` 1줄만 (insider-signal.ts 영역 제거)
- 12단계 (백그라운드 PR) 폐기 → 단계 진행 단순화 (8단계 → 9·10·11 → 끝)
- 신규 도구 영역이라 9단계 작업 본질이 4·5·6·7단계 패턴 정합 (1파일 + field-test)

### 트레이드오프

- 사경인 본문 "장내매수만 의미 있음" 영역 자동 식별 0 — 노이즈 제거 본질 일부 손실
- elestock 임원 영역 시그널 폐기 → 임원 매수 영역 영역 0. 단 사경인 본문 "최대주주 매수 > 임원 매수"라 손실 작음
- `report_resn` 자유 텍스트는 도구 결과에 raw 포함 → LLM 후속 조사 영역 (도구 verdict 영역 0 정합)

### 미래 변경 시 영향

**spec 갱신** (별도 위임 명세):
- §10.12 전면 재작성 (chg_rsn_filter → majorstock stkqy_irds 부호)
- §5.1 사경인 신규 도구 9 → 10 (`sagyeongin_insider_signal` 추가)
- §5.3 `insider_signal` 항목 정정 (수정 0 — 재사용만)
- §4 line 109 매핑 표 정정 (`반자동 (chg_rsn 필터)` → `완전 자동 (majorstock 5%+ 부호)`)
- §11.3 변경 0 (DART OpenDART 단독 유지)
- 헤더 수정 이력에 `(ADR-0011 반영)` 추가, 버전 v0.6

**ADR-0001 갱신**:
- β-iii 영역 (line 85-93) Superseded by 0011 표시
- line 113 정당성 본문 갱신 또는 삭제
- 디렉토리 구조 (line 51-75)에서 `insider-signal.ts # chg_rsn_filter 추가 수정` 영역 제거
- 인덱스 표 (README.md line 65) 0001 상태에 "(β-iii Superseded by 0011)" 추가

**spec-pending-edits 갱신**:
- 기존 line 53 "[§4] 매핑 표의 '재사용 + 래퍼' 표현" 영역은 새 본질로 갱신 또는 폐기 (정정 후 새 표현)

**CLAUDE.md "자주 막히는 곳" 누적**:
- 8단계 5회 → 1차/2차 검증 7회 누적 정착 (사용자 메모리 영역에는 6회 → 7회)
- 신규 패턴: "spec + ADR 동시 기각 첫 케이스 — 사전 검증으로 명세 단계 차단" 영역 메모

**사용자 메모리 정정**:
- 12단계 (백그라운드 — Issue/PR) 폐기
- 9단계 본질 재정의 (chg_rsn_filter → majorstock 부호)
- ADR 번호: 0009 (외부 스크래핑 영역 예약 유지) / 0011 = 9단계 (이 ADR) / 0012 = 11단계 분할 실행 (메모리에 ADR-0011 가칭으로 적힌 영역 정정)

**11단계 (`scan_execute`) + 10단계 (`watchlist_check`) 호출 본문**:
- spec line 903 "내부에서 `chg_rsn_filter: "onmarket_only"`로 호출" 폐기
- 신규 도구 `sagyeongin_insider_signal`을 그대로 호출 (옵션 0, 5%+ 보고자 단독이라 임원 노이즈 자연 회피)

## 참조

- **사전 검증 보고**: `docs/sagyeongin/verifications/2026-05-03-stage9-pre-verify.md` — 1차 (elestock 2,615건) + 2차 (majorstock 40건) 통합 본문, raw items 첫 항목 + 응답 키 전수 보존
- spec §10.12 (재작성 영역)
- spec §4 line 109, §5.1, §5.3 (정정 영역)
- ADR-0001 β-iii (Superseded by 0011)
- philosophy 7부 C "선행 지표 (기회 포착)" line 195
- CLAUDE.md "명세 단계 가정값 vs 사용자 환경 실측값 어긋남 패턴" (line 481, 7회 누적 정착)
- DART API 응답 실측: `elestock.json` 12개 키 / `majorstock.json` 13개 키
