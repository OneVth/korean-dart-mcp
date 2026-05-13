# 17단계 결정 본문 — candidates 10개 watchlist 일괄 add

## 사이클 시점

- 결정일: 2026-05-14
- baseline: main HEAD `17eb4c6` (16(c) 종결 매듭)
- 출처: `verifications/2026-05-14-stage16c-scan-execute-rerun.json`
- 본 사이클 본질: 결정 사이클 (코드 변경 0, 측정 X)

## 결정 본질

16(c) scan_execute 재측정 (KST 2026-05-12 14:27~14:38)에서 도출한 10개 candidates를 **일괄 watchlist 정착**. 측정 X — 16(c) 도출값 본문 직접 정합.

## 철학 정합

| 7부 영역 | 본문 | 정합 |
|---|---|---|
| 7부 F (스코프) | "10개 내외 종목, 3~5년 장기 보유, 분기/반기 단위 점검" | candidates 10개 ↔ "10개 내외" 직접 정합 |
| 7부 D 2단계 | RIM 싼 회사 필터 | 10개 모두 srim BUY 통과 |
| 7부 A | 사전 솎아내기 | 10개 모두 killer PASS (triggered 0) |
| 7부 B | 위험 신호 | 10개 모두 cashflow CLEAN (concern 0) |
| 7부 C | 선행지표 (시설투자 + 내부자 매수) | #1 신도리코만 capex 신호 발동 (major_capex_existing_business, score 80) |
| 7부 G | 생애주기 보정 — 자산 형성기 | "선행지표에 더 적극적으로 반응" → #1 capex 가중 정합 |

**철학 라벨링 가드**: 본 사이클 진입 프롬프트에서 "7부 G (자산 형성기 관심 종목) + 7부 F (분기 단위 점검)" 라벨 어긋남 — 실제 7부 F는 *스코프* (10개 + 3~5년 + 분기·반기), 7부 G는 *생애주기 보정* (자산 형성기는 G의 한 단계). 누적 학습 17번 정착 (학습 5번 본질 동일 재발).

## 10개 후보 본문

| rank | corp_code | corp_name | corp_cls | induty | composite | srim gap | capex | dividend |
|---|---|---|---|---|---|---|---|---|
| 1 | 00135795 | 신도리코 | Y | 263 | **80** | -38.77 | SIGNAL_DETECTED (80) | D |
| 2 | 00127200 | 삼영전자공업 | Y | 26291 | 0 | -10.69 | NO_SIGNAL | D |
| 3 | 00406727 | 세진티에스 | K | 26211 | 0 | -40.71 | NO_SIGNAL | N/A |
| 4 | 00226866 | 인탑스 | K | 2642 | 0 | -17.23 | NO_SIGNAL | D |
| 5 | 00575106 | 씨유테크 | K | 26224 | 0 | -42.49 | NO_SIGNAL | D |
| 6 | 00525934 | LX세미콘 | Y | 2612 | 0 | -9.58 | NO_SIGNAL | D |
| 7 | 01213586 | 아이디피 | K | 26329 | 0 | -18.51 | NO_SIGNAL | D |
| 8 | 00490151 | 파트론 | K | 2629 | 0 | -17.37 | NO_SIGNAL | A |
| 9 | 00492353 | 파이오링크 | K | 26410 | 0 | -10.07 | NO_SIGNAL | A |
| 10 | 00305297 | 코텍 | K | 26519 | 0 | -31.17 | NO_SIGNAL | N/A |

## 본격 영역 분석

### 1. 공통 시그널 스택 (10개 모두 정합)

| 영역 | 결과 |
|---|---|
| 7부 A killer | PASS, triggered 0 |
| 7부 B cashflow | CLEAN, concern_score 0, signals [] |
| 7부 D srim | BUY |
| 7부 C insider | `signal: "neutral_or_mixed"`, `cluster_quarter: null` (10개 모두 동일) |

→ **10개 모두 watchlist 자격 동등**.

### 2. 차별화 영역 — capex 신호

| corp | capex | opportunity_score |
|---|---|---|
| **#1 신도리코** | **SIGNAL_DETECTED** | **80** |
| #2~#10 | NO_SIGNAL | 0 |

#1만 7부 C 선행지표 confluence 정합. 본 본질: 자기자본 10%+ 시설투자 + 기존 사업 일치 → 매출 증가 선행지표.

**관찰**: capex 본문은 `top_signals` 배열 정착 (`scan-execute` output schema 본문). 신도리코: `top_signals: ["major_capex_existing_business"]`.

### 3. 산업 집중 관찰 — KSIC 26 10/10

| corp | induty_code | KSIC 26 본문 |
|---|---|---|
| 신도리코 | 263 | 컴퓨터·사무용기기 |
| 삼영전자공업 | 26291 | 기타 전자부품 |
| 세진티에스 | 26211 | LCD 등 표시장치 |
| 인탑스 | 2642 | 통신·방송장비 |
| 씨유테크 | 26224 | 전자관 |
| LX세미콘 | 2612 | 반도체 |
| 아이디피 | 26329 | 기타 무선통신부품 |
| 파트론 | 2629 | 기타 전자부품 |
| 파이오링크 | 26410 | 유선통신장비 |
| 코텍 | 26519 | 기타 방송·무선통신장비 |

**관찰**: 10/10 모두 KSIC 26 (전자·반도체·통신장비). **7부 B 영역 포트폴리오 집중 리스크** — Onev 환경 position sizing 본문에서 본격 영역.

본 집중 본질 — 스크리닝 본문 (전자/반도체 섹터 srim BUY 다발) 또는 샘플링 본문 (cache/seed 분포) 영역. spec-pending-edits §10.15 (KSIC 9차/10차) 영역 후속 정합 시 본 관찰 영역 evidence 정합.

### 4. srim gap 분포 (싼 순서)

| 순위 | corp | gap |
|---|---|---|
| 1 | #5 씨유테크 | -42.49 |
| 2 | #3 세진티에스 | -40.71 |
| 3 | **#1 신도리코** | **-38.77** |
| 4 | #10 코텍 | -31.17 |
| 5 | #7 아이디피 | -18.51 |
| 6 | #8 파트론 | -17.37 |
| 7 | #4 인탑스 | -17.23 |
| 8 | #2 삼영전자공업 | -10.69 |
| 9 | #9 파이오링크 | -10.07 |
| 10 | #6 LX세미콘 | -9.58 |

**관찰**: #1 신도리코 = capex confluence + gap 3위 (-38.77) → **단일 confluence 후보**. #5 씨유테크 = 가장 싼 gap (-42.49)이지만 capex 없음 → srim 일변 의존.

### 5. dividend grade 분포

| grade | 후보 | 본문 |
|---|---|---|
| A | #8 파트론, #9 파이오링크 | 배당주 본문 영역 (7부 E "배당주 지속성" 정합) |
| D | #1, #2, #4, #5, #6, #7 | 6건 |
| N/A | #3 세진티에스, #10 코텍 | 2건 |

**관찰**: `scan-execute` output schema는 `dividend.grade`만 노출 정합 (line 410 직접 정착). `dividend-check` 도구 단독 호출 시 `avg_payout_ratio` / `avg_dividend_yield` / `payout_stddev` 본격 정착. scan-execute schema 확장 영역 별개 사이클 검토 가치.

### 6. scan-execute output schema 본문 정합 (정정)

본 section은 17단계 작성 시 *키 이름 가정 어긋남*으로 "데이터 누락 영역"으로 잘못 표기되었던 영역. 정정 commit (Stage 18 선행)에서 본문 정합 정정. 실제 본문:

| 도구 | scan-execute output schema | 정합 본문 |
|---|---|---|
| srim | `srim.{verdict, prices, gap_to_fair}` | `prices` = `{buy_price, fair_price, sell_price, current_price}` 본격 정합 (e.g. 신도리코 `prices.current_price = 46700`, `prices.fair_price = 76276`) |
| insider | `insider.{signal, cluster_quarter}` | 10개 모두 `signal: "neutral_or_mixed"`, `cluster_quarter: null` |
| capex | `capex.{verdict, opportunity_score, top_signals}` | 신도리코: `top_signals: ["major_capex_existing_business"]` |
| dividend | `dividend.{grade}` | scan-execute schema 의도적 정합 (line 410). `dividend-check` 도구 단독 호출 시 `avg_payout_ratio` / `avg_dividend_yield` / `payout_stddev` 본격 정착 — 별개 사이클 schema 확장 영역 가치 |

**원본 어긋남 본질**: python `dict.get('fair_value')` 식 키 이름 가정 어긋남 (실제 키 `prices.current_price` 등 별경로). 누적 학습 19번 정착 본문.

### 7. 분기 점검 추적 영역 (7부 G 자산 형성기 정합)

7부 G 자산 형성기 본문 — "선행지표(시설투자 공시, 내부자 매수)에 더 적극적으로 반응". 분기 점검 시 본격 영역:

| 추적 영역 | 우선 영역 |
|---|---|
| capex 진행도 (신규시설투자 후속 공시) | **#1 신도리코** (기 신호 발동 후 진행 본문 추적) |
| 신규 capex 신호 발동 | #2~#10 (현재 NO_SIGNAL → 신호 발동 시 confluence 진입) |
| insider cluster 진입 (2명+ 매수) | 10개 모두 (현재 `signal: "neutral_or_mixed"`, 후속 사이클 cluster 발동 시 confluence 진입) |
| srim gap 변화 (가격/이익 변동) | 10개 모두 (분기 elapsed 후 신규 데이터) |
| dividend grade 변화 | 10개 모두 (특히 D → A/B 변화 추적) |

### 8. #1 신도리코 spotlight

| 영역 | 본문 |
|---|---|
| 사업 | 디지털 복합기·프린터 (induty 263 컴퓨터·사무용기기) — 성숙 사업 |
| 시그널 | srim BUY (-38.77) + capex 80 (major_capex_existing_business) + cashflow CLEAN + killer PASS + dividend D |
| 본질 | 기존 사업 케파 증설 → 매출 증가 선행지표 (7부 C 직접 정합) |
| 분기 점검 영역 | capex 후속 공시 본문 + 신규시설투자 진행도 + 매출/영업이익 변화 직접 추적 |

## 일괄 add 정합 본질

composite_score = capex.opportunity_score - cashflow.concern_score = **신호 confluence 강도** (자격 영역 X).

- composite 80 (#1): srim + capex confluence (다중 신호)
- composite 0 (#2~#10): srim BUY만 (단일 신호, 7부 D 통과)

7부 D 2단계 통과 → **watchlist 자격 동등**. composite는 (a) position sizing 가중, (b) 분기 점검 시 신호 변화 추적 가중 영역만 정합. 선별 add 시 2차 필터 본문 부재 (composite는 강도 영역) — arbitrariness 회피로 **일괄 add**.

## position sizing 가이드 (참고)

본 영역 본격 영역 X — Onev 환경 영역 직접 결정. 단 7부 G 자산 형성기 "선행지표에 더 적극적 반응" 본문 정합으로:

- #1 신도리코: capex 신호 발동 → 가중 정당화
- #2~#10: srim BUY만 → 균등 가중 또는 srim gap 정합 가중

## MCP 도구 호출 — `sagyeongin_update_watchlist`

본 fork TOOL_REGISTRY 29 (사경인 14) 정착 MCP 도구. 호출 영역 분리:

- **호출 주체**: MCP 등록 Claude 세션 (Onev 일반 작업 영역, 사경인 MCP 서버 등록 상태). Claude Code 세션은 *코드/git 작업* 영역 — MCP 등록 X, 도구 노출 X
- **저장 위치**: `~/.sagyeongin-dart/config.json` (Onev 로컬 환경, fork commit X)

호출 본문:

```json
{
  "action": "add",
  "corp_codes": [
    "00135795",
    "00127200",
    "00406727",
    "00226866",
    "00575106",
    "00525934",
    "01213586",
    "00490151",
    "00492353",
    "00305297"
  ],
  "tags": ["stage17-2026-05-14", "ksic-26"],
  "notes": "16(c) scan_execute (2026-05-12) 도출. 7부 D 2단계 RIM 통과 + 7부 A killer PASS + 7부 B cashflow CLEAN. #1 신도리코는 7부 C capex 선행지표 confluence."
}
```

**결과 검증**: 호출 후 `sagyeongin_update_watchlist` action `list` 호출 → 10개 정착 확인 (MCP 등록 세션).

## 다음 사이클 (분기 점검)

본 사이클 직후 분기 점검 X — 동일 데이터 즉시 점검 시 측정 의미 X (7부 F "매주·매월 분석 X" 본문 정합). 분기 elapsed 후 (2026-08~) 신호 변화 본격 측정 영역.

분기 점검 도구: `sagyeongin_watchlist_check` (`check_level: "full"` 또는 `"A"`). 별개 사이클 영역.

## Ref

- philosophy: 7부 F (스코프), 7부 D 2단계 (RIM), 7부 A (killer), 7부 B (cashflow), 7부 C (capex), 7부 G (자산 형성기)
- ADR-0001 (β-i 격리), ADR-0005 (commit conventions)
- spec-pending-edits §10.15 (KSIC 9차/10차) — KSIC 26 집중 영역 후속 정합
- 출처: `verifications/2026-05-14-stage16c-scan-execute-rerun.json`
