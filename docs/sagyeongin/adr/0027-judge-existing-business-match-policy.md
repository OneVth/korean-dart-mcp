# 0027 - judgeExistingBusinessMatch 텍스트 매칭 정책 baseline

- 상태: Accepted
- 결정일: 2026-05-22
- 결정자: 사용자 + Claude

## 컨텍스트

Stage 30.0 capex-signal 7부 C (`judgeExistingBusinessMatch`) 구현을 앞두고,
DART `tgastInhDecsn` (DS005 유형자산 양수 결정) 응답의 `inh_pp`(취득 목적) 텍스트를
어떻게 분류할지 정책이 필요하다.

회수 F (verifications/stage30/tgast-inh-decsn-distribution-2026-05-22.md):
- 상장사 전수 3,967건 × 최근 3개월 회수 결과 13건 (0.33%)
- `ast_sen` (자산 구분): "토지 및 건물" 12건 (92.3%), "기계장치" 1건 (7.7%)
- `inh_pp` 분류: whitelist 4건 / blacklist 2건 / null 7건

`ast_sen` 단조 baseline → assetCategory 단독 keyword matching으로는 케파 증설 여부 판별 불가.
판별 실질 정보는 `inh_pp` + `inh_af` 복합 텍스트에 집중.

## 고려한 옵션

- 옵션 A: `ast_sen` keyword matching만 — 92.3% 단조로 판별력 없음
- 옵션 B: `inh_pp` 단독 keyword matching — whitelist/blacklist 명확한 케이스만 분류
- 옵션 C: `inh_pp` + `inh_af` 복합 매칭 + induty cross-reference 보조

## 결정

**옵션 C 채택**: signature `(text: string, _induty_code?: string) → boolean | null`

- text = ast_sen + inh_pp 합본 (`classifySignal` 영역 조립). `_induty_code` = Stage 30.x 인계 (induty cross-reference 본질).

- whitelist 매칭 시 `true` (케파 증설 추정)
- blacklist 매칭 시 `false` (신규 분야 추정)
- 모호 패턴 시 `null` (호출자 책임 — 상위 판단에 위임)
- `induty` (업종 코드) cross-reference 보조: REIT(68112) 등 업종 사전 필터 후보

## 근거

### whitelist 카테고리 (→ true)
1. **직접 생산**: `공장`, `제조` keyword — 본 사업 생산 시설 확충
2. **R&D**: `연구개발`, `R&D` keyword — 직접 생산 연계 시설
3. **본 사업 수요**: `수요 증가 대응` 등 — 기계장치(테스트 장비 등) 포함
4. **사업장 확충**: `양산` keyword — 글로벌/대량 생산 거점 신설

### blacklist 카테고리 (→ false)
1. **사업다각화**: `사업다각화` keyword 명시
2. **임대수익**: `임대수익` keyword — 부동산 임대 목적 명시
3. **투자수익**: `투자수익` keyword — 투자 수익 목적 명시
4. **임대**: `임대` keyword standalone — case 12 "부동산 임대를 통한 수익 창출" 커버 (임대수익 미포함 본문 흡수)

### null 카테고리 (→ null, 모호)
1. **사옥/업무공간**: `사옥`, `업무공간`, `업무 공간`, `임직원 공간` — 생산성 연결 불명
2. **비특정 공간 확보**: `물리적 공간`, `공간 확보` — 맥락 불명
3. **혼합 목적**: whitelist + blacklist/null 동시 기재 — 결정 불가

### 거부된 옵션
- 옵션 A (ast_sen 단독): 92.3% 단조 baseline으로 판별력 없음. 회수 F 직접 근거.
- 옵션 B (inh_pp 단독): inh_af 추가 정보(성호전자 "사업다각화 기대" 등)를 버림. 손실.

## 결과

- 좋은 점: 모호 케이스를 `null`로 명시 → 상위 호출자가 스킵/경고 처리 가능
- 트레이드오프: null 53.8% (7/13건) — 판별 실패율 높음. 표본 13건으로 keyword 미성숙.
- 미래 변경 시 영향: Stage 30.x 표본 확장(기간 연장) 후 keyword 보강 예정. ADR-0023 cross-reference (ROE < K 역전과 동일 분리 본질 — 모호 케이스 null + 호출자 책임).
- REIT 업종(induty_code=68112) 사전 솎아내기: Stage 30.x 검토 후보.
- **null 흡수 정책 (Phase 2 정착)**: `existingMatch === null` 시 → `major_capex_existing_business` 흡수. 7부 C 긍정 발굴 우선 본질 정합 (케파 증설 추정 우선, 명확한 `false`만 unrelated 분기). 구현: `if (existingMatch === false) ... else ...` (ternary 본문 정정).

## 변경 이력

- Stage 30.1 phase 1 (2026-05-24): 초기 결정
- Stage 30.1 phase 2 (2026-05-24): signature 정정 (3 params → 2 params), blacklist `임대` standalone 추가, §결과 null 흡수 정책 명시
