# 사경인식 DART 에이전트 — 기능 명세 문서

**버전**: v0.3 (구현 전략 합의 + ADR 도입 반영)
**작성일**: 2026-04-24 (v0.1), 마지막 갱신 2026-04-25 (v0.3)
**수정 이력**:
- v0.1 (2026-04-24): 초안
- v0.2 (2026-04-24): K값 처리 방식 수정 — 하드코딩 제거, `sagyeongin_required_return` 도구 신설 (wikidocs.net/94787 근거)
- v0.3 (2026-04-25): 구현 전략 합의 결과 반영. ADR-0001~0006 도입. §10.12 insider PR 절차 강화 (Issue 필수). 메타 결정의 단일 출처가 ADR로 이동. spec은 도구 명세 reference 역할에 집중.

**참조 문서**: 
- `sakyeongin_philosophy.md` — 사상 토대
- `adr/README.md` — 메타 결정 인덱스 (구현 전략, 디렉토리 구조, 브랜치/테스트/커밋 등)
- `spec-pending-edits.md` — 표현 정정 누적 (마일스톤 시 일괄 반영)

**이전 프로젝트**: [dart-agent](https://github.com/OneVth/dart-agent) (2024 중단)
**참조 구현**: [korean-dart-mcp](https://github.com/chrisryugj/korean-dart-mcp) (MIT, v0.9.2)

---

## 1. 배경 및 목적

이 도구의 목적은 **사경인 회계사의 투자 철학을 반영한 한국 주식 스크리닝/점검 도구**를 구축하는 것이다. 이전 dart-agent 프로젝트는 "S-RIM 계산 + LLM 보고서 생성기"로 설계되어 사경인 철학의 극히 일부(7부 D-2단계)만 반영했고, 핵심인 7부 A(상장폐지 위험 솎아내기)를 거의 구현하지 못한 채 스코프 폭발로 중단되었다.

이번 재정의의 두 목적은 명확하다.

- **목적 ①**: 상장폐지 위험 회사를 자동으로 솎아낸다 (5부 "수익의 80%는 리스크 관리")
- **목적 ②**: 장기 지속 가능한 회사를 탐색·선별한다 (1부 "시스템 수익", 2부 "배당 중심 가치투자")

두 목적은 동등하지 않다. **목적 ①이 목적 ②에 선행한다.** 사경인 5부의 "찢어지지 않은 그물을 만드는 것이 실력이다" 원칙에 따라, 망할 회사를 거르는 일이 좋은 회사를 찾는 일보다 우선이다. MVP는 목적 ①을 완성형으로 구현하고, 목적 ②는 부분 구현한다.

---

## 2. 사용자 컨텍스트

### 2.1 사용자 배경

- **연령/자산 단계**: 20대 중반, 사경인 7부 G의 "자산 형성기"
- **회계 배경**: 회계 교양 학습 완료, 재무제표 독해 가능
- **기술 배경**: TypeScript, Python 모두 사용 경험 있음
- **현재 투자**: 해외 ETF 위주, 한국 개별 종목은 미보유

### 2.2 "공격적"의 정의 (사경인 철학 내)

*공격성은 도구 내 파라미터가 아니다.* 사경인 철학에서 공격성은 **포지션 사이징** — 보유 자산의 얼마를 투자 자산에 배분할 것인가 — 의 영역이며, 이는 DART 에이전트의 스코프 밖이다.

단, 생애 단계는 다음 세 지점에만 간접 반영된다:

1. **관심 분야 선택**: "기술주 위주", "코스닥 중심" 같은 스캔 범위 (scan_preset으로 표현)
2. **MDD 허용치**: 포지션 사이징의 결과로 나타남 (이 도구에서 다루지 않음)
3. **목표 수익률**: 6~15%, 사경인 초기 궤적 근처. 도구 동작에 영향 없음

### 2.3 관심 분야

- **주 관심**: 한국 주식 장기 가치투자 (5~15종목)
- **별개 트랙**: 모션 캡처/버추얼 콘텐츠는 별도 프로젝트로 분리

---

## 3. 아키텍처 결정

### 3.1 결정 1 — korean-dart-mcp 포크 기반

이전 dart-agent(Python CLI)를 이어가지 않고, **korean-dart-mcp(TypeScript MCP 서버)를 포크하여 사경인 도구를 추가하는 방식**으로 재출발한다.

**근거**:
- korean-dart-mcp는 OpenDART 83개 API를 15개 MCP 도구로 이미 래핑 (MIT)
- `disclosure_anomaly` 도구가 사경인 7부 A 공시 기반 항목(감사인 변경, CB/BW/유증 클러스터, 비적정 감사의견)을 이미 70% 수준으로 구현
- `insider_signal` 도구가 7부 C 내부자 매수를 거의 그대로 구현
- 이전 dart-agent의 자산 중 **고유 가치를 가진 것은 `analysis/srim.py` 하나뿐**
- 인프라(HTTP 클라이언트, rate limiter, corp_code 리졸버, 캐싱)는 korean-dart-mcp가 더 완성도 높음

**원칙**: 기존 korean-dart-mcp 도구는 수정하지 않는다. 사경인 도구는 `tools/sagyeongin/` 하위에 격리한다. 업스트림 머지 충돌을 최소화한다.

### 3.2 결정 2 — MCP 서버 우선, CLI 포스트-MVP

MVP는 MCP 서버로만 제공한다. CLI는 korean-dart-mcp가 이미 `bin` 엔트리를 가지고 있으므로 포스트-MVP에서 추가 가능.

**근거**: 5부 "시간을 들이지 않는 것이 최선". 분기 점검 시 "Claude에게 자연어로 분기 체크 돌려달라"가 가장 마찰 없는 워크플로우.

### 3.3 결정 3 — 프로파일 체계 없음, 평면 설정 파일

`aggressive/balanced/conservative` 같은 프로파일 enum을 도입하지 않는다. 설정 파일을 평면 구조로 두고 사용자가 필요시 직접 편집한다.

**근거**:
- 단일 사용자 도구에 프로파일 체계는 과잉 설계
- 생애 단계는 2~3년 단위로 바뀌므로 설정 파일 수동 편집으로 충분
- 5부 "시간을 들이지 않는 것이 최선" — 추상화 레이어가 마찰을 만든다

---

## 4. 철학 7부 → 도구 매핑 분류

| 7부 항목 | 자동화 가능성 | 담당 도구 |
|---|---|---|
| A 재무: 4년 연속 영업손실 (별도) | 완전 자동 | `sagyeongin_killer_check` |
| A 재무: 매출 30억 미만 (코스닥) | 완전 자동 | `sagyeongin_killer_check` |
| A 공시: 감사인 변경 | 완전 자동 | `sagyeongin_killer_check` |
| A 공시: 계속기업 가정 불확실성 | 반자동 (감사의견 기반) | `sagyeongin_killer_check` |
| A 공시: CB/BW/잦은 유상증자 | 완전 자동 | `sagyeongin_killer_check` |
| A: 코스닥 소속부 (기술성장기업부 예외) | 자동 불가 (KRX 데이터) | **명시적 비목표** (§11) |
| B: 영업CF 지속 마이너스 + 투자 활발 | 완전 자동 | `sagyeongin_cashflow_check` |
| B: 영업이익(+)/현금흐름(−) 괴리 | 완전 자동 | `sagyeongin_cashflow_check` |
| B: 가족회사 대여금 | 자동 불가 (주석 파싱) | **명시적 비목표** (§11) |
| B: 고객 집중도 | 자동 불가 (주석 파싱) | **명시적 비목표** (§11) |
| B: 무관 분야 신규 투자 | 반자동 | `sagyeongin_capex_signal` |
| C: 신규 시설투자 공시 (자기자본 10%+) | 완전 자동 | `sagyeongin_capex_signal` |
| C: 내부자 장내매수 | 반자동 (chg_rsn 필터) | `insider_signal` (재사용 + 래퍼) |
| D-1: ROE/ROA | 완전 자동 | `buffett_quality_snapshot` (재사용, 참고용) |
| D-2: RIM 적정가 | 완전 자동 | `sagyeongin_srim` |
| D-3: 애널리스트 컨센서스 | 자동 불가 (FnGuide) | **명시적 비목표** (§11) |
| E: FCF 계산 | 완전 자동 | `sagyeongin_srim` 내부 |
| E: 배당주 지속성 (배당성향) | 완전 자동 | `sagyeongin_dividend_check` |
| E: 순환주 ROE 보수적 보정 | MVP 제외 | **명시적 비목표** (§11) |
| E: 자금조달 이자율/감가상각법 | 자동 불가 (주석 파싱) | **명시적 비목표** (§11) |
| F: 스코프 (10개, 분기) | 설계 전제 | — |
| G: 생애주기 | 설계 전제 | — |

---

## 5. 도구 목록 전체 (총 14개)

### 5.1 사경인 신규 도구 (9개)

`tools/sagyeongin/` 하위에 구현:

| 도구명 | 철학 매핑 | 역할 |
|---|---|---|
| `sagyeongin_killer_check` | 7부 A | 재무 + 공시 통합, 상폐 위험 binary 판정 |
| `sagyeongin_cashflow_check` | 7부 B | 현금흐름 위험 신호 태깅 |
| `sagyeongin_capex_signal` | 7부 C 시설투자 | 유형자산 양수 결정 + 기존 사업 일치 판정 |
| `sagyeongin_required_return` | 7부 D-2 선행 | 한국신용평가 BBB- 5년 채권 수익률 조회 (K값) |
| `sagyeongin_srim` | 7부 D-2 | S-RIM Buy/Fair/Sell 트리플 가격 |
| `sagyeongin_dividend_check` | 7부 E 배당 | 배당성향 추이 + 지속 가능성 평가 |
| `sagyeongin_scan_preview` | 배치 Phase 1 | 스캔 범위 확정 (API 거의 0) |
| `sagyeongin_scan_execute` | 배치 Phase 2 | 시장 스캔 실제 실행 |
| `sagyeongin_watchlist_check` | 배치 | 관심 종목 분기 점검 |

### 5.2 관리 도구 (2개)

관심 종목과 스캔 프리셋을 관리:

| 도구명 | 역할 |
|---|---|
| `sagyeongin_update_watchlist` | 관심 종목 추가/제거/조회 |
| `sagyeongin_update_scan_preset` | 스캔 프리셋 저장/수정 |

### 5.3 korean-dart-mcp 재사용 (3개, 사경인 파이프라인 포함)

사경인 파이프라인에서 직접 호출하는 기존 도구:

| 도구명 | 수정 필요 |
|---|---|
| `resolve_corp_code`, `get_company`, `get_financials` | 없음 (인프라) |
| `search_disclosures`, `get_corporate_event` | 없음 (인프라) |
| `insider_signal` | **옵션 추가**: `chg_rsn_filter` 파라미터로 "장내매수"만 필터링 가능 |

### 5.4 korean-dart-mcp 재사용 (사경인 파이프라인과 분리, 참고용)

LLM이 후속 조사 시 직접 호출:

- `disclosure_anomaly` — 공시 이상징후 전반 조회용
- `buffett_quality_snapshot` — 버핏식 퀄리티 체크리스트 참고용 (4부 "좋은 기업 ≠ 좋은 주식" 경고 유의)

---

## 6. 설정 파일 스키마

### 6.1 파일 위치

`~/.sagyeongin-dart/config.json`

### 6.2 스키마

```json
{
  "version": "0.1",
  "watchlist": [
    {
      "corp_code": "00126380",
      "name": "삼성전자",
      "added_at": "2026-04-24",
      "tags": ["대형", "반도체"],
      "notes": "2026 Q1 스캔에서 추가"
    }
  ],
  "scan_presets": {
    "default": {
      "markets": ["KOSPI", "KOSDAQ"],
      "excluded_industries": [
        "64", "65", "66",
        "68",
        "35", "36", "37", "38",
        "41", "42",
        "50", "51",
        "55",
        "111", "112", "12", "5621",
        "91",
        "05", "06", "07", "08", "19",
        "5821", "59", "90", "92"
      ],
      "excluded_name_patterns": [
        "투자회사", "투자조합", "기업인수목적", "스팩", "리츠", "REIT"
      ]
    },
    "tech_focus": {
      "markets": ["KOSDAQ"],
      "included_industries": ["26", "62", "63"],
      "excluded_name_patterns": ["투자회사", "스팩", "리츠"]
    }
  },
  "active_preset": "default",
  "parameters": {
    "insider_cluster_threshold": 2,
    "srim_required_return_override": null,
    "srim_buy_price_basis": "fair",
    "dividend_payout_healthy_range": [0.20, 0.40]
  },
  "required_return_cache": {
    "last_fetched_at": null,
    "value": null,
    "source": "kisrating.com BBB- 5Y"
  }
}
```

### 6.3 기본값 설계 근거

- **`insider_cluster_threshold: 2`** — 사경인 원문 "2명 이상 동시 매수는 강한 신호"
- **`srim_required_return_override: null`** — **K값은 상수가 아니다.** 사경인 원칙(위키독스 wikidocs.net/94787)에 따라 `sagyeongin_required_return` 도구가 한국신용평가(kisrating.com) BBB- 5년 채권 수익률을 자동 스크래핑한다. `null`이면 자동 조회, 숫자가 지정되면 해당 값으로 수동 오버라이드 (스크래핑 장애 시 또는 의도적 민감도 분석 용도).
- **`srim_buy_price_basis: "fair"`** — 20대 자산형성기. 적정가(W=0.9) 이하면 매수 고려. 보수 지향은 `"buy"` (W=0.8) 이하로 변경
- **`dividend_payout_healthy_range: [0.20, 0.40]`** — 사경인 원문 "20~30%"에 공격성 반영하여 40%까지 확장
- **제외 업종 리스트** — 이전 dart-agent `filters.py` 그대로 이식 (KSIC 기반)
- **`required_return_cache`** — 스크래핑 결과 캐시. 일 1회 갱신. `sagyeongin_required_return` 도구가 관리.

### 6.4 내부 market 코드 매핑

사용자 입력은 `KOSPI | KOSDAQ`로 받고, 도구 내부에서 DART `corp_cls` 코드로 변환:

```
KOSPI  → Y (유가증권시장)
KOSDAQ → K (코스닥)
```

---

## 7. 파이프라인 구조 (Stage 1~6)

### 7.1 스캔 모드 파이프라인

시장 스캔에서 2,400여 종목을 후보군(5~15개)으로 좁히는 경로:

```
Stage 1. 정적 필터
  ├─ markets (KOSPI/KOSDAQ 선택)
  ├─ excluded_industries (KSIC 프리픽스)
  ├─ excluded_name_patterns (기업명 키워드)
  └─ included_industries (프리셋에 있으면 교집합)
  → ~1,500 (default preset 기준)

Stage 2. killer_check (7부 A)
  └─ 재무 + 공시 통합 binary 판정
  → ~1,200 passed (EXCLUDE 제외)

Stage 3. srim (7부 D-2)
  └─ Buy/Fair/Sell 트리플 계산, 매수 임계값 이하만 통과
  → 시장 상황에 따라 변동, 평균 ~200~400 추정

Stage 4. cashflow_check (7부 B) — 태그만, 탈락 아님
  └─ concern_score 부여

Stage 5. capex_signal + insider_signal (7부 C) — 태그만
  └─ opportunity_score 부여

Stage 6. dividend_check (7부 E) — 태그만
  └─ 배당 지속성 등급 부여
```

상위 N개(기본 30~50)를 `composite_score = opportunity_score - concern_score` 정렬로 반환.

### 7.2 단계 순서의 철학적 근거

**Stage 2(A) → Stage 3(D-2) → Stage 4~6(B/C/E)** 순서가 핵심. 각각 의미:

- Stage 2(A): 망할 회사 제거 — 5부 "리스크 관리 80%"
- Stage 3(D-2): 비싼 회사 제거 — 4부 "좋은 기업 ≠ 좋은 주식"
- Stage 4~6: 남은 것에 정보 부여 — 6부 "재무제표는 이야기"

**A와 D-2만이 탈락 기준**이다. B/C/E는 태그만 부여하며 사용자 판단에 재료를 제공한다 (8부 "수동 판단 보조 원칙" 참조).

### 7.3 점검 모드 파이프라인

관심 종목에 대해서는 **전체 Stage를 모든 종목에 적용**. 10개 내외이므로 조기 탈락이 의미 없음. 모든 종목이 A/D-2/B/C/E 결과를 받음. 단 Stage 2(A) EXCLUDE 종목은 "watchlist에서 제거 권장" 플래그와 함께 반환.

---

## 8. 수동 판단 보조 원칙

### 8.1 세 장르의 출력 형태

사경인 철학은 7부를 세 장르로 구분한다. 도구 출력도 이를 반영한다.

| 장르 | 예시 | 출력 형태 |
|---|---|---|
| **즉시 솎아내기** | A, D-2 | `verdict: EXCLUDE/PASS` (binary) + 증거 |
| **주의 깊게 검토** | B | `verdict: REVIEW_REQUIRED/CLEAN` + concern_score + flags + **investigation_hints** |
| **기회 포착** | C, E | `verdict: SIGNAL_DETECTED/NO_SIGNAL` + opportunity_score + signals + **interpretation_notes** |

### 8.2 LLM은 사용자에게 질문하지 않는다

10개 종목에 대해 B/C flag가 각각 2~3개씩 나오면 질문이 20~30개가 된다. 5부 "시간을 들이지 않는 것이 최선"과 충돌. 대신:

1. 도구가 **구조화된 데이터 + 후속 조사 방향 힌트**를 반환
2. 사용자가 한 화면 요약표에서 판단 가능하면 종료
3. 추가 조사 필요 시 사용자가 명시적으로 도구 호출 (LLM이 오케스트레이션만 담당)

이 방식이 3부 "전략은 가치투자, 실행은 시스템화"와 맞는다. 시스템은 데이터를 제공, 판단은 인간이.

### 8.3 investigation_hints 예시

`cashflow_check`의 "영업이익(+)/현금흐름(−)" 시그널에 대해:

```json
"investigation_hints": [
  "매출채권 추이 확인 — 외상 매출 누적인가?",
  "재고자산 추이 확인 — 안 팔리는 재고가 쌓이는가?",
  "특정 고객 집중도 확인 — 대형 고객사의 결제 지연인가?"
]
```

사용자가 이 힌트에 따라 `get_financials`, `search_disclosures` 등을 직접 호출.

---

## 9. 핵심 워크플로우

### 9.1 워크플로우 A — 부트스트랩 (관심 종목 발굴)

```
[초기 1회 셋업]
  update_scan_preset({
    name: "tech_focus",
    config: {markets: ["KOSDAQ"], included_industries: ["26", "62"]}
  })

[부트스트랩 실행]
  1. scan_preview({preset: "default"})
     → "1,521개, 예상 12,000 API call"
  
  2. [사용자: 너무 많음. 범위 좁힘]
     scan_preview({preset: "tech_focus"})
     → "237개, 예상 2,010 API call"
  
  3. [사용자: 적절]
     scan_execute({preset: "tech_focus"})
     → Stage 1~6 실행
     → 상위 30개 composite_score 정렬 반환
  
  4. [사용자: 상위 30개 검토, 5~10개 선택]
     update_watchlist({
       action: "add",
       corp_codes: ["00XXXXXX", "00YYYYYY", ...]
     })
```

### 9.2 워크플로우 B — 분기 점검 (관심 종목 재평가)

```
매 분기 1회 실행:

  watchlist_check({check_level: "full"})
  → 각 관심 종목에 대해 A/D-2/B/C/E 전체 결과
  → 한 화면 요약표:
     - A EXCLUDE: n개 → 제거 권장
     - D-2: 현재가 위치 (buy/fair/sell 대비)
     - B 경고 flag: 종목별 flag 목록
     - C 신규 시그널: 종목별 signal 목록
     - E 배당 지속성 등급

  [사용자: B flag 있는 종목에 대해 investigation_hints 참고]
  [필요시 get_financials / search_disclosures 직접 호출]
  [판단 확정 후 update_watchlist로 조정]
```

### 9.3 두 사이클의 관계

```
부트스트랩 (분기 1~2회) ──→ 관심 종목 리스트 갱신
                                  │
                                  ↓
              분기 점검 (분기마다) ──→ 판단·조정
                                  │
                                  └─→ 필요시 부트스트랩 재실행
```

---

## 10. 개별 도구 명세

### 10.1 `sagyeongin_killer_check`

**목적**: 상장폐지/관리종목 위험 binary 판정 (7부 A)

**Input**:
```typescript
{
  corp_code: string,
  check_financial: boolean = true,   // 재무 기반 룰 활성화
  check_disclosure: boolean = true,  // 공시 기반 룰 활성화
}
```

**Output**:
```typescript
{
  corp_code: string,
  corp_name: string,
  verdict: "EXCLUDE" | "PASS",
  triggered_rules: Array<{
    rule: string,
    detail: string,
    evidence: object,
    dart_reference: string | null
  }>
}
```

**룰 리스트**:

| rule | 조건 | 데이터 소스 |
|---|---|---|
| `consecutive_operating_loss` | 별도기준 영업이익 4년 연속 음수 | `get_financials(fs_div="OFS")` × 4년 |
| `low_revenue_kosdaq` | 코스닥 + 매출 < 30억 | `get_financials` + `get_company(corp_cls)` |
| `auditor_change` | 최근 3년 감사인 2회 이상 변경 | `accnutAdtorNmNdAdtOpinion` × 3년 |
| `non_clean_opinion` | 감사의견 "적정" 외 | 동 |
| `frequent_cb_issuance` | 최근 3년 CB 발행 2회 이상 | `get_corporate_event(event_type="convertible_bond")` |
| `frequent_bw_issuance` | 최근 3년 BW 발행 2회 이상 | 동 (신주인수권부사채) |
| `frequent_rights_offering` | 최근 3년 유상증자 3회 이상 | 동 |

**PASS 조건**: 위 모든 룰에 해당하지 않음.

---

### 10.2 `sagyeongin_cashflow_check`

**목적**: 현금흐름 기반 위험 신호 태깅 (7부 B)

**Input**:
```typescript
{
  corp_code: string,
  years: number = 3,  // 분석 대상 연수
}
```

**Output**:
```typescript
{
  corp_code: string,
  corp_name: string,
  verdict: "REVIEW_REQUIRED" | "CLEAN",
  concern_score: number,  // 0-100
  flags: Array<{
    flag: string,
    severity: "low" | "medium" | "high",
    description: string,
    evidence: object,
    investigation_hints: string[]
  }>
}
```

**플래그 리스트**:

| flag | 조건 | severity | 점수 |
|---|---|---|---|
| `oi_cf_divergence` | 영업이익(+) + 영업CF(−) — 2년 이상 | high | 40 |
| `negative_ocf_persistent` | 영업CF 3년 연속 음수 | high | 30 |
| `negative_ocf_with_active_icf` | 영업CF(−) + 투자CF 활발(자산총계 10%+) | medium | 20 |
| `cf_pattern_risky` | 영업(−)/투자(+)/재무(+) 패턴 — 외부 자금 의존 | medium | 15 |

**계산 근거**: 사경인 6부 "초보자에게는 현금흐름표" + 7부 B.

**investigation_hints 예시** (`oi_cf_divergence`):
- 매출채권 변동 확인 (외상 매출 누적?)
- 재고자산 변동 확인 (재고 적체?)
- 고객 집중도 주석 확인 (대형 고객 결제 지연?)

---

### 10.3 `sagyeongin_capex_signal`

**목적**: 신규 시설투자 공시 포착 (7부 C)

**Input**:
```typescript
{
  corp_code: string,
  lookback_months: number = 12,
}
```

**Output**:
```typescript
{
  corp_code: string,
  corp_name: string,
  verdict: "SIGNAL_DETECTED" | "NO_SIGNAL",
  opportunity_score: number,  // 0-100
  signals: Array<{
    signal: string,
    description: string,
    evidence: {
      date: string,
      amount: number,
      equity_ratio: number,  // 자기자본 대비 비율
      category: string,
      existing_business_match: boolean,
      dart_reference: string
    },
    interpretation_notes: string[]
  }>
}
```

**시그널**:

| signal | 조건 | score |
|---|---|---|
| `major_capex_existing_business` | 유형자산 양수, 자기자본 10%+, 기존 KSIC 일치 | +80 |
| `major_capex_unrelated_diversification` | 유형자산 양수, 자기자본 10%+, 기존 KSIC 불일치 | −40 (경고성) |
| `minor_capex` | 유형자산 양수, 자기자본 5~10% | +30 |

**사경인 원칙**: "케파 증설은 긍정, 신규 분야 확장은 부정" — `existing_business_match` 판정이 핵심. KSIC 업종 코드 비교로 자동화.

---

### 10.4 `sagyeongin_srim`

**목적**: S-RIM Buy/Fair/Sell 트리플 가격 (7부 D-2)

**Input**:
```typescript
{
  corp_code: string,
  years: number = 3,          // 가중평균 ROE 연수
  override_K?: number,         // 명시적 수동 오버라이드 (비권장). 미지정 시 sagyeongin_required_return 자동 호출
}
```

**K 조회 순서**:
1. `override_K`가 지정되면 그 값 사용
2. 설정 `parameters.srim_required_return_override`가 null이 아니면 그 값 사용
3. 위 둘 다 없으면 `sagyeongin_required_return` 도구 호출 (기본 경로)
4. 스크래핑 실패 시 에러 반환 — `override_K` 지정 요구

**Output**:
```typescript
{
  corp_code: string,
  corp_name: string,
  inputs: {
    equity_current: number,     // 자본총계 (억원)
    avg_roe: number,             // 3년 가중평균 ROE (%)
    required_return_K: number,
    shares_outstanding: number,
  },
  prices: {
    buy_price: number,           // W=0.8, 초과이익 연 20% 감소 전제 — 매수 기준
    fair_price: number,          // W=0.9, 초과이익 연 10% 감소 전제 — 적정 가격
    sell_price: number,          // W=1.0, 초과이익 영구 지속 전제 — 매도 기준
    current_price: number,       // 네이버 금융 크롤링
  },
  verdict: "BUY" | "BUY_FAIR" | "HOLD" | "SELL",
  gap_to_buy: number,            // % (현재가 대비 buy_price 괴리)
  gap_to_fair: number,
  gap_to_sell: number,
  note: string
}
```

**공식**:
```
초과이익 = 자기자본 × (가중평균ROE − K)
기업가치(W) = 자기자본 + 초과이익 × W / (1 + K − W)
적정주가(W) = 기업가치(W) / 발행주식수
```

**verdict 판정** (설정의 `srim_buy_price_basis`에 따라):
- `buy_price_basis: "fair"` (기본, 공격적):
  - 현재가 ≤ buy_price: BUY
  - buy_price < 현재가 ≤ fair_price: BUY_FAIR
  - fair_price < 현재가 ≤ sell_price: HOLD
  - 현재가 > sell_price: SELL
- `buy_price_basis: "buy"` (보수적):
  - 현재가 ≤ buy_price: BUY
  - buy_price < 현재가 ≤ sell_price: HOLD
  - 현재가 > sell_price: SELL

**구현 참조**: 이전 dart-agent `analysis/srim.py`를 TypeScript로 포팅. 계정명 변형 처리, CFS/OFS 폴백, 3년 폴백 로직 모두 이식.

---

### 10.5 `sagyeongin_required_return`

**목적**: 사경인 S-RIM의 요구수익률(K) 자동 조회 — 한국신용평가(kisrating.com) BBB- 등급 5년 채권 수익률

**사경인 원칙**: S-RIM의 할인율(K)은 하드코딩된 상수가 아니라 **"주주의 요구수익률"**이며, 사경인 책은 이를 "5년 회사채의 수익률"로 정의한다. 위키독스(wikidocs.net/94787)의 상세 설명에 따르면 구체적 산출 방법은 **한국신용평가 홈페이지 → 신용등급 → 등급통계 → 등급별 금리스프레드 → BBB- 등급 5년 채권 수익률**이다. 이 도구는 해당 값을 스크래핑하여 반환한다.

**Input**:
```typescript
{
  force_refresh?: boolean = false,  // true면 캐시 무시하고 재스크래핑
}
```

**Output**:
```typescript
{
  value: number,                 // 연율, 예: 0.0742 (7.42%)
  fetched_at: string,            // ISO 8601
  source: "kisrating.com BBB- 5Y",
  from_cache: boolean,
  cache_age_hours: number | null
}
```

**캐싱 정책**:
- `~/.sagyeongin-dart/config.json`의 `required_return_cache` 필드에 저장
- 갱신 주기: 24시간 (시장 금리 변동은 일 단위면 충분)
- `force_refresh: true`일 때만 즉시 재조회
- `sagyeongin_srim`이 내부 호출할 때는 캐시 우선 사용

**Fallback 전략**:
1. 스크래핑 성공 → 값 반환 + 캐시 갱신
2. 스크래핑 실패 (네트워크/구조 변경) + 유효 캐시 있음 → 캐시값 반환 + `cache_age_hours` 경고
3. 스크래핑 실패 + 캐시 없음 → **에러 반환**. 사용자가 `sagyeongin_srim` 호출 시 `override_K` 수동 지정 필요
4. **하드코딩 백업값 사용하지 않음**. 5부 "과학적 접근" 원칙 — 오래된 값으로 몰래 계산하게 두지 않는다.

**구현 노트**:
- 한국신용평가 페이지 구조는 시간이 지나며 변경될 수 있음. 스크래핑 로직은 구조 변경에 민감하므로 실패 시 명확한 에러 메시지 필요 ("kisrating.com 페이지 구조 변경 감지. 수동 확인 필요.")
- HTML 파싱은 JSDOM 또는 cheerio 사용 고려 (korean-dart-mcp의 기존 의존성과 호환성 확인)
- MVP에서는 단순 스크래핑. 포스트-MVP에서 API 대안(있을 경우) 검토

---

### 10.6 `sagyeongin_dividend_check`

**목적**: 배당주 지속 가능성 평가 (7부 E)

**Input**:
```typescript
{
  corp_code: string,
  years: number = 5,
}
```

**Output**:
```typescript
{
  corp_code: string,
  corp_name: string,
  sustainability_grade: "A" | "B" | "C" | "D" | "N/A",
  metrics: {
    avg_payout_ratio: number,       // 평균 배당성향
    avg_dividend_yield: number,     // 평균 배당수익률
    payout_stddev: number,           // 배당성향 변동성
    years_of_dividend: number,       // 연속 배당 연수
    recent_cut: boolean,             // 최근 배당 삭감 여부
  },
  series: Array<{
    year: string,
    payout_ratio: number,
    dividend_yield: number,
    net_income: number,
    dividend_total: number,
  }>,
  interpretation_notes: string[]
}
```

**등급 기준**:

| 등급 | 조건 |
|---|---|
| A | 5년 연속 배당 + 성향 20~40% + 변동성 낮음 + 삭감 없음 |
| B | 5년 연속 배당 + 성향 20~50% + 삭감 1회 이내 |
| C | 3년+ 배당 + 성향 50~70% 또는 변동성 높음 |
| D | 성향 > 70% 또는 최근 삭감 있음 |
| N/A | 배당 이력 없음 |

**사경인 원칙**: "배당성향이 20~30%로 낮으면서 배당률이 높으면 지속 가능. 성향이 너무 높으면 이익 소폭 감소에도 배당 급감 위험."

---

### 10.7 `sagyeongin_scan_preview`

**목적**: 스캔 범위 확정 (Phase 1, API 거의 0)

**Input**:
```typescript
{
  preset?: string,  // scan_presets 키
  // 또는 직접 지정:
  markets?: Array<"KOSPI" | "KOSDAQ">,
  included_industries?: string[],   // KSIC prefix
  excluded_industries?: string[],
  excluded_name_patterns?: string[],
}
```

**Output**:
```typescript
{
  preset_used: string | null,
  filter_summary: {
    markets: string[],
    included_industries: string[] | null,
    excluded_industries_count: number,
    excluded_name_patterns: string[],
  },
  estimated_universe: number,
  estimated_api_calls: {
    stage2_killer: number,
    stage3_srim: number,       // killer 통과 예상 종목 수 기반 추정
    stage4_5_6_tags: number,
    total: number,
  },
  daily_limit_usage_pct: number,  // 20,000 중 몇 % 사용 예상
  sample_companies: Array<{corp_code: string, corp_name: string}>  // 앞 10개
}
```

**구현**: corp_code 덤프(서버 기동 시 로드) + 기업개황 캐시만 사용. API 호출 없음.

---

### 10.8 `sagyeongin_scan_execute`

**목적**: 시장 스캔 실제 실행 (Phase 2)

**Input**:
```typescript
{
  preset?: string,
  // 또는 scan_preview와 동일한 직접 지정:
  markets?: Array<"KOSPI" | "KOSDAQ">,
  included_industries?: string[],
  excluded_industries?: string[],
  excluded_name_patterns?: string[],
  
  limit?: number = 30,           // 반환 후보 수
  min_opportunity_score?: number,
  sort_by?: "composite" | "opportunity" | "concern_asc",
  resume_from?: string | null,   // checkpoint resume
}
```

**Output**:
```typescript
{
  scan_id: string,
  pipeline_stats: {
    initial_universe: number,
    after_static_filter: number,
    after_killer_check: number,
    after_srim_filter: number,
    returned_candidates: number,
  },
  candidates: Array<{
    rank: number,
    corp_code: string,
    corp_name: string,
    composite_score: number,
    stages: {
      killer: {verdict: "PASS"},
      srim: {verdict: "BUY" | "BUY_FAIR", prices: {...}, gap_to_fair: number},
      cashflow: {verdict: string, concern_score: number, top_flags: string[]},
      capex: {verdict: string, opportunity_score: number, top_signals: string[]},
      insider: {signal: string, cluster_quarter: string | null},
      dividend: {grade: string},
    },
    quick_summary: string
  }>,
  checkpoint: string | null,  // 일일 제한 도달 시 resume 토큰
  next_actions_suggested: string[]
}
```

**체크포인트/리줌**: Stage 2~6 중 API 제한 도달 시 현재 진행 상태를 SQLite에 저장. `resume_from` 파라미터로 다음 호출에서 이어서 진행. 이전 dart-agent `watchlist/batch.py`의 패턴 참조.

---

### 10.9 `sagyeongin_watchlist_check`

**목적**: 관심 종목 분기 점검

**Input**:
```typescript
{
  check_level?: "A" | "full" = "full",  // A만 하면 빠르게 위험 체크, full은 전체
  corp_codes?: string[]  // 지정 안 하면 watchlist 전체
}
```

**Output**:
```typescript
{
  checked_at: string,
  summary: {
    total: number,
    A_excluded: number,
    srim_buy_zone: number,      // BUY 또는 BUY_FAIR
    B_review_required: number,
    C_signal_detected: number,
  },
  results: Array<{
    corp_code: string,
    corp_name: string,
    stages: { /* scan_execute의 stages와 동일 구조 */ },
    overall_flag: "watchlist_remove_recommended" | "attention" | "normal",
    notes: string[]
  }>,
  next_actions_suggested: string[]
}
```

---

### 10.10 `sagyeongin_update_watchlist`

**Input**:
```typescript
{
  action: "add" | "remove" | "list" | "update_tags",
  corp_codes?: string[],
  tags?: string[],
  notes?: string
}
```

**Output**: 갱신된 watchlist 전체.

---

### 10.11 `sagyeongin_update_scan_preset`

**Input**:
```typescript
{
  action: "create" | "update" | "delete" | "list" | "set_active",
  preset_name?: string,
  config?: {
    markets?: Array<"KOSPI" | "KOSDAQ">,
    included_industries?: string[],
    excluded_industries?: string[],
    excluded_name_patterns?: string[],
  }
}
```

**Output**: 갱신된 scan_presets 전체.

---

### 10.12 `insider_signal` (재사용 + 직접 수정)

기존 korean-dart-mcp 도구를 그대로 사용하되, **`chg_rsn` 필드 기반 필터링 옵션**을 추가한다. 이는 사경인 원문 "상속/증여 시점의 매수는 의도적 주가 하락 가능성 있어 노이즈"에 대응.

**수정**: 원본 도구의 `handler` 내부에 `chg_rsn_filter?: "onmarket_only" | "all"` 파라미터 추가. `"onmarket_only"`면 `chg_rsn` 필드가 "장내매수"/"시장매수" 등인 항목만 집계. 기본값 `"all"` (원본 동작 유지).

**적용**: `sagyeongin_scan_execute`와 `sagyeongin_watchlist_check`는 내부에서 `chg_rsn_filter: "onmarket_only"`로 호출.

**구현 절차** (ADR-0001 β-iii 결정):
- **14a**: 포크 로컬에서 `chg_rsn_filter` 구현 + field test
- **14b**: GitHub Issue 생성 (필수). 원작자에게 이 로직을 업스트림에 추가할 의향이 있는지 문의. 레퍼런스 PR 형태로 구현 첨부.
- **14c**: 원작자 긍정 응답 후에만 PR 제출
- **14d**: 거부되거나 응답 없으면 포크에만 유지

원본 handler가 거래 항목의 `chg_rsn` 필드를 결과에 보존하지 않아 wrapper 사후 필터링 불가능. 직접 수정이 유일한 경로.

---

## 11. 명시적 비목표

이 도구가 **하지 않는 것**을 명시한다. 스코프 관리 실패(이전 dart-agent 중단의 근본 원인)를 방지한다.

### 11.1 MVP 비목표

| 항목 | 이유 | 재검토 시점 |
|---|---|---|
| 주석 원문 파싱 (가족회사 대여금, 고객 집중도, 자금조달 이자율, 감가상각법) | 자연어 파싱 필요, LLM 비용 폭발 위험 | 포스트-MVP |
| 코스닥 소속부 판정 (기술성장기업부 예외) | KRX 외부 데이터 필요 | 포스트-MVP |
| 애널리스트 컨센서스 추이 (7부 D-3) | FnGuide/증권사 외부 데이터 | 포스트-MVP |
| 순환주 ROE 자동 보정 | 순환주 판별 기준이 사경인 원문에 없음 | 재검토 불확실 |
| 시가총액 기반 필터 (scan_preview) | 네이버 금융 크롤링 필요, MVP 스코프 초과 | 포스트-MVP |
| BBB- 이외 등급 K값 사용 | 사경인 원칙상 BBB- 5년 고정. 등급 선택 UI 불필요 | 재검토 불확실 |
| K값 하드코딩 백업 | 5부 "과학적 접근" 원칙. 스크래핑 실패 시는 에러 반환 + 수동 `override_K`로 처리 | **영구 비목표** |
| 금융주 분석 | 재무제표 구조 자체가 다름. scan에서 자동 제외 | 별도 프로젝트 가능 |
| LLM 기반 보고서 자동 생성 | 이전 프로젝트 스코프 폭발 주범. 5부 "시간 들이지 않기" 위배 | 재검토 불확실 |
| 실시간 모니터링/알림 | 5부 "분기 점검으로 충분" | 재검토 불확실 |
| 포지션 사이징/자산 배분 계산 | 도구 스코프 밖 (1부 영역) | 재검토 불확실 |
| MDD 관리 | 동 (4부 영역) | 재검토 불확실 |

### 11.2 기존 dart-agent에서 폐기하는 것

| 컴포넌트 | 폐기 이유 |
|---|---|
| `chat/`, `llm/`, `vectorstore.py`, `rag.py`, `sql_generator.py`, `web_search.py` | LLM 레이어 전체 폐기. MCP를 통해 Claude가 직접 담당 |
| `report/generator.py`의 LLM 부분 | 위와 동일 |
| `batch.py`의 "2,000개 전체 분석" 배치 | 스코프 전환 (scan_preview 2-phase로 대체) |
| `embed` 명령 | 벡터DB 전체 폐기 |

### 11.3 외부 데이터 의존성

MVP에서 허용되는 외부 소스는 다음 세 가지로 **한정**한다. 나머지는 §11.1 비목표.

| 외부 소스 | 용도 | 사용 도구 | 장애 시 대응 |
|---|---|---|---|
| **OpenDART** (opendart.fss.or.kr) | 재무제표, 공시, 감사의견, 지분공시 등 | 거의 모든 사경인 도구 + 재사용 도구 | Rate limit 도달 시 checkpoint/resume. 서비스 장애 시 전체 도구 정지 |
| **한국신용평가** (kisrating.com) | BBB- 5년 채권 수익률 (K값) | `sagyeongin_required_return` → `sagyeongin_srim` | 24시간 캐시 우선 사용 → 캐시 없으면 에러 반환, 사용자가 `override_K` 지정 |
| **네이버 금융** | 현재가 크롤링 | `sagyeongin_srim` 내부 (current_price 조회) | 실패 시 `srim` 결과에서 `current_price: null` + verdict 계산 불가 표시 |

**원칙**: 외부 의존 추가는 스코프 확장이다. 새 외부 소스 추가는 §11.3 표에 반드시 기록한다.

---

## 12. 기존 dart-agent 자산 재활용 계획

### 12.1 TypeScript 포팅 대상

**단 하나 — `analysis/srim.py`**. 이전 프로젝트의 유일한 고유 자산.

포팅 시 이식할 세부 로직:
- 3년 가중평균 ROE 계산 (최근 연도 가중치 ↑)
- 연속 감소 추세 시 최근 ROE만 적용 (보수적)
- 시나리오별 기업가치 산출 (W=0.8/0.9/1.0)
- CFS → OFS 폴백 (종속회사 없는 기업 대응)
- 계정명 변형 리스트 (당기순이익/연결당기순이익/자본총계 등)
- 연도 폴백 (사업보고서 미공시 기업)

### 12.2 korean-dart-mcp에 있는 것은 재사용, 없으면 포팅

| 기능 | korean-dart-mcp 제공 | 조치 |
|---|---|---|
| HTTP 클라이언트 | `lib/dart-client.ts` | 재사용 |
| Rate limiter | `lib/dart-client.ts` 내장 | 재사용 |
| 캐시 | SQLite 기반 | 재사용 |
| corp_code 리졸버 | `lib/corp-code.ts` (FTS) | 재사용 |
| CFS/OFS 폴백 | `get_financials` 지원 | 재사용 |
| 계정명 변형 처리 | `buffett-quality-snapshot.ts`에 부분 있음 | 필요 로직 추출 후 사경인 도구 내부로 포팅 |

### 12.3 문서 자산

이전 dart-agent의 `docs/roadmap/ROADMAP.md`는 **역사 기록**으로 보관. 설계 결정 근거 추적 시 참조 가능. 현재 명세와의 충돌은 본 문서(v0.1)를 기준으로 해결.

---

## 13. 포스트-MVP 로드맵

### 13.1 Phase 2 후보

우선순위 순:

1. **CLI 인터페이스 추가** — korean-dart-mcp의 `bin` 엔트리 활용, `korean-dart scan --preset tech_focus` 등
2. **시가총액 기반 필터** — 네이버 금융 크롤링 (이전 dart-agent `api/stock.py` 이식)
3. **순환주 판별 지원** — 수동 태그 방식 (watchlist 항목에 `is_cyclical: true`)
4. **애널리스트 컨센서스 (7부 D-3)** — FnGuide 연동, 선택적
5. **주석 파싱 LLM 파이프라인** — 가족회사 대여금, 고객 집중도 (LLM 비용 주의)

### 13.2 Phase 3 후보

- 코스닥 소속부 판정 (KRX 데이터)
- 포트폴리오 레벨 뷰 (MDD 계산, 비중 시뮬레이션)
- 배당주 실시간 알림 (7부 E 심화)

---

## 14. 문서 관리

- **이 문서 버전**: v0.1 (MVP 명세 확정)
- **다음 수정 조건**: 구현 착수 시 기술적 이슈 발견 → v0.2
- **참조 필수 문서**: `sakyeongin_philosophy.md` (설계 결정의 모든 근거)

---

*이 문서는 DART 에이전트 구현의 기준점이다. 스코프 확장 결정 시 §11(명시적 비목표)부터 확인하고, 새 도구 추가 시 §4(철학 매핑)와 §7(파이프라인 구조)과의 정합성을 검증한다.*
