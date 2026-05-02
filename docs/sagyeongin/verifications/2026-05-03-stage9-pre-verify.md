# 9단계 사전 검증 보고 — DART insider 시그널 데이터 소스 실측

- 일자: 2026-05-03 (1차 23:56 KST 2026-05-02 / 2차 00:18 KST 2026-05-03)
- 대상: 삼성전자 `00126380`
- 목적: spec §10.12 + ADR-0001 β-iii의 "chg_rsn 필드 존재" 가정 사전 검증
- 결과: 두 endpoint 모두에서 가정 기각 → ADR-0011 채택 근거

## 검증 배경

8단계 학습 정착 정합 — 명세 단계 가정값 vs 사용자 환경 실측값 어긋남 패턴 (5회 누적). spec §10.12 line 901 "`chg_rsn` 필드가 '장내매수'/'시장매수' 등인 항목만 집계" + ADR-0001 line 113 "원본 handler가 거래 항목의 `chg_rsn` 필드를 결과에 보존하지 않는다 (원본 코드 211~228줄 검증)"의 "원본 코드 검증" 본문이 raw response 영역 검증 누락이 의심돼 사전 검증.

검증 영역은 코드 변경 0, 매듭 0, 임시 호출 단독.

## 1차 검증 — `elestock.json` (DS004 임원·주요주주 소유보고)

### 환경

- 호출 시각: 2026-05-02 23:56 KST
- API 응답 status: `000`
- list 길이: 2,615건

### 응답 키 12개

```
rcept_no, rcept_dt, corp_code, corp_name, repror,
isu_exctv_rgist_at, isu_exctv_ofcps, isu_main_shrholdr,
sp_stock_lmp_cnt, sp_stock_lmp_irds_cnt,
sp_stock_lmp_rate, sp_stock_lmp_irds_rate
```

### 검증 결과

| 후보 키 | list[0] 보유 | list 전체 (2,615건) 중 보유 |
|---|---|---|
| `chg_rsn` | 없음 | 0건 |
| `report_tp` | 없음 | 0건 |

→ `chg_rsn` 전수 부재. `report_tp` 전수 부재 — `insider-signal.ts` line 227 "raw items 의 report_tp·chg_rsn 참조 권장" 본문이 elestock 영역에서 잘못된 endpoint 참조.

### 영향

- spec §10.12 line 901 가정 기각
- spec §10.12 line 911 "원본 handler가 chg_rsn 필드를 보존하지 않아" 본문 무효 (handler 보존 이전에 raw response 자체 부재)
- ADR-0001 line 113 "원본 코드 211~228줄 검증" 본문 무효 (코드 영역 검증, raw response 영역 미검증이 hole)
- `insider-signal.ts` line 227 본문 부정확 (정정 또는 삭제)

## 2차 검증 — `majorstock.json` (DS003 대량보유 5%+)

### 환경

- 호출 시각: 2026-05-03 00:18 KST
- API 응답 status: `000`
- list 길이: 40건

### 응답 키 13개

```
rcept_no, rcept_dt, corp_code, corp_name, report_tp, repror,
stkqy, stkqy_irds, stkrt, stkrt_irds, ctr_stkqy, ctr_stkrt, report_resn
```

### 변동사유 후보 키 검증

| 후보 키 | list[0] 보유 | list 전체 (40건) 중 보유 |
|---|---|---|
| `chg_rsn` | 없음 | 0건 |
| `chnge_rsn` | 없음 | 0건 |
| `rsn` | 없음 | 0건 |
| `stkqy_chg_rsn` | 없음 | 0건 |
| `stkrt_chg_rsn` | 없음 | 0건 |
| `chg_cause` | 없음 | 0건 |
| `cause` | 없음 | 0건 |

추가 발견 키 (`_rsn`/`_cause` suffix 패턴): 없음

### 신규 발견 필드 2개

**`report_resn`** — 자유 텍스트 멀티라인 변동사유. 예시:
```
- 보유주식수 변동
- 보유주식등에 관한 계약의 변경
```

**`report_tp`** — 보고 종류 분기. 40건 모두 `"일반"` (다른 값 분포는 다른 corp 영역에서 추가 검증 필요).

### raw list[0] 본문

```json
{
  "rcept_no": "...",
  "rcept_dt": "...",
  "corp_code": "00126380",
  "corp_name": "삼성전자",
  "report_tp": "일반",
  "repror": "삼성물산",
  "stkqy": "1,199,477,193",
  "stkqy_irds": "-62,823",
  "stkrt": "20.09",
  "stkrt_irds": "-0.00",
  "ctr_stkqy": "133,395,104",
  "ctr_stkrt": "2.23",
  "report_resn": "- 보유주식수 변동\n- 보유주식등에 관한 계약의 변경"
}
```

### 영향

- 구조화 변동사유 필드 부재 → 자동화 가능 영역은 `stkqy_irds` 부호 단독
- `report_resn` 자유 텍스트는 §11.1 "주석 원문 파싱 = LLM 비용 폭발" 비목표 정합 — 자동화 영역 0
- `repror = "삼성물산"` 같은 보고자 본문 — 사경인 "최대주주 매수 > 임원 매수" 부분 정합 가능 (후속 정밀화 영역)

## 결론

`elestock.json` + `majorstock.json` 모두 구조화 변동사유 필드 부재. 사경인 7부 C "장내매수 vs 상속/증여 노이즈" 분기 영역 자동 식별 0.

가능한 자동화 영역은 `majorstock.json`의 `stkqy_irds` 부호 기반 매수/매도 분기 단독. 보고자 영역이 5%+ 대량보유자라 사경인 본문 "최대주주 매수 > 임원 매수"의 전자에 부분 정합. 임원 의무공시 영역은 자동 회피.

→ ADR-0011 (B) 채택 근거.

## 학습 정착

- 명세 단계 가정값 vs 사용자 환경 실측값 어긋남 패턴 — 6회 → 7회 누적 (8단계 5회 정착 + 9단계 1차/2차 두 케이스)
- 신규 패턴: spec + ADR이 동시 기각된 첫 케이스 — 사전 검증으로 명세 작성 단계에서 차단 (묶음 1 진입 후 발견 분기 영역 회피)
- 사전 검증 영역의 비용 작음 본질 검증 — 호출 1회 + 보고 단일 양식, 코드 변경 0, 매듭 0

## 참조

- ADR-0011 (이 검증 결과의 결정 본문)
- spec §10.12 (재작성 영역)
- ADR-0001 β-iii (Superseded by 0011)
- philosophy 7부 C "선행 지표 (기회 포착)" line 195
- CLAUDE.md "명세 단계 가정값 vs 사용자 환경 실측값 어긋남 패턴" (line 481)
- 위임 명세: `stage9-pre-verify-chg-rsn.md` (1차), `stage9-pre-verify-majorstock.md` (2차) — 산출 outputs 영역
