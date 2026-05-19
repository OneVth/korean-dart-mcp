# 0024 - srim K 본질 baseline (자본비용 + BBB- 5Y proxy)

- 상태: Accepted
- 결정일: 2026-05-19
- 결정자: 사용자 + Claude

## 컨텍스트

Stage 18(iii) baseline 10건 (`63c1e60`) §T1 sagyeongin_srim 영역에서 9건 ROE < K (분포 역전) 식별. ADR-0023 분기 Y 가드 (`judgeSrimVerdict` invariant) 정착으로 symptom 영역 처리 완료 — verdict null + reason "srim_inverted_roe_below_K".

다만 ADR-0023은 symptom 단독 정착 — cause 영역 (K 본질 정의 + 9건 분포 본질 분기) 정착 영역 부재. 9건 ROE < K 본질 분기 3건:

- (a) 9건 비정상 분포 (시장 조건)
- (b) K 값 부적정 (BBB- 5Y 자본비용 어긋남)
- (c) ROE 측정 부적정 (산식 정밀화 영역)

본 ADR은 cause 영역 baseline 영구 정착. K 본질 정의 + 분포 본질 분기 결판 + 보정 정책 결정.

## 고려한 옵션

**K 산식**:
- (a) BBB- 5Y 단독 유지 (현재 산식, spec §10.5)
- (b) Damodaran CAPM (Rf + β × ERP)
- (c) 산업별 보정 (BBB- 5Y + KSIC spread)
- (d) 종목별 차등 K (분포/규모/업종)

**보정 정책**:
- (0) 보정 0 (현재 산식 영구 정착)
- (i) K 직접 정정 (kis-rating-scraper 새 산식)
- (ii) ROE/K 양쪽 정밀화 (별 ADR 영역)
- (iii) K 유지 + verdict 별 산식 (ADR-0023 우회)

## 결정

**K 산식 (a) BBB- 5Y 단독 유지 + 보정 정책 (0) 보정 0 채택.**

K 본질 = **주주의 요구수익률 (자본비용)** — 투자자 기회비용 ↔ 회사 자기자본비용 동전 양면. 구현 proxy = **BBB- 5Y 채권 수익률** (한국신용평가 kisrating.com). 두 층위 분리 정합.

ROE 측정 정밀화 영역 (분기 (c)) → **ADR-0025 후보** cross-reference. 별 결정 사이클 영역.

## 근거

### (a) BBB- 5Y 채택 근거

- **spec §10.5 직접 인용** (line 611): "S-RIM의 할인율(K)은 ... '주주의 요구수익률'이며, 사경인 책은 이를 '5년 회사채의 수익률'로 정의한다. 위키독스(wikidocs.net/94787) ... 한국신용평가 ... BBB- 등급 5년 채권 수익률"
- **사경인 책 본문 직접 정합** — 본질 (자본비용) + 구현 (BBB- 5Y proxy) 두 층위 분리 본문 직접 정착
- **spec §10.5 line 641 정직성 원칙** — "하드코딩 백업값 사용하지 않음. 5부 '과학적 접근' 원칙 — 오래된 값으로 몰래 계산하게 두지 않는다"
- (b) CAPM 거부 — 사경인 본문 영역 외 (β 미도입), (c) 산업별 거부 — 출처 영역 미정, (d) 종목별 거부 — 본질 어긋남

### (0) 보정 0 채택 근거

- (i) K 직접 정정 거부 — spec §10.5 + 사경인 본문 직접 정합 영역 어긋남
- (ii) ROE/K 양쪽 → ROE 측정 정밀화 영역 분리 (ADR-0025 후보)
- (iii) verdict 별 산식 거부 — ADR-0023 분기 Y 가드 우회, 사경인 7부 D-2 "초과이익 양수 종목 발견" 본질 어긋남

### 9건 분포 본질 분기 결판

Stage 18(iii) baseline 10건 ROE 평균 6.064% vs K 10.54% (K가 평균 ROE 1.74배):

- (a) 9건 비정상 분포: ADR-0023 분기 Y 가드 이미 정착 → 추가 결정 0
- (b) K 부적정: spec §10.5 + wikidocs.net/94787 직접 정합 → 거부
- (c) ROE 측정 부적정: 7부 E "순환주 ROE 과거 고점 × 60~70%" 보정 본문 직접 근거 → ADR-0025 후보

## 적용 범위

- 코드 변경 0 (phase 1 결정 사이클 단독, 학습 #29 정합)
- ADR-0024 본문 단독 + verifications baseline (`verifications/2026-05-19-adr-0024-K-baseline.md`) 신설
- adr/README 인덱스 0024 line 1줄 추가 (작성 절차 #3 정합)
- β-i 가드 외 (사경인 영역 단독)

## Ref

spec §10.5 (요구수익률 K 정의), philosophy 7부 D-2 (RIM 초과이익 양수 종목 발견) + 7부 E (순환주 ROE 보정), ADR-0023 (srim 분포 역전 verdict 가드, symptom), wikidocs.net/94787 (BBB- 5Y 산출), 학습 #1~#37
