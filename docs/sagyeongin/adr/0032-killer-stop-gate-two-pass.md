# 0032 - killer 멈춤 게이트 + 스캔 두 패스 재편

- 상태: Accepted
- 결정일: 2026-06-02
- 결정자: 사용자 + Claude
- 관계: ADR-0012/0014(중단·재개) 구조를 두 패스로 재편. ADR-0030(스캔 전 규모 게이트)와 게이트 2개 공존.

## 컨텍스트

사용자 피드백: "killer check에서 한 번 멈췄으면 좋겠다. killer 통과만으로도 검토해볼 가치가 있다."

7부 철학상 killer(7부 A)는 "탈락 종목 거르기"이며, 통과 명단 자체가 1차 선별 결과다. 현재 스캔은 killer(stage2) 통과 후 곧바로 srim(stage3)·태그(stage4~6)까지 자동 완주하여, 사용자가 killer 1차 선별 결과를 보고 판단할 기회가 없다. 이는 funnel 원칙("기계가 거르고 사람이 결정")에 어긋난다.

멈춤의 가치는 규모에 따라 다르다. 통과가 수백~천 개면 명단이 무의미하나, 수십 개면 훑어볼 만하다. 따라서 **항상 멈추되 표시 방식을 규모로 적응**한다.

### 구조적 제약 (회수 확정)

현재 스캔은 killer와 srim이 **한 루프에서 회사별로 연달아** 돈다(scan-execute.ts 회사별 killer→srim). killer 통과를 다 모은 뒤 멈추려면 두 패스 분리가 필요하다.

한 루프인 이유는 호출/캐시 효율이 아니다(killer=DART 재무, srim=DART 재무+naver 현재가+KIS 자본비용, 각자 독립 호출). 진짜 이유는 **checkpoint(중단·재개) 구조** — universe를 단일 인덱스로 순회하여 "i번까지 완료 = i번까지 killer+srim 끝"으로 떨어지며, 한도 80% 도달 시 i와 partial을 저장한다(ADR-0012/0014).

두 패스로 분리하면 "killer만 완료, srim 미완"이라는 제3상태와 "멈춤(선택 대기)" 상태가 생겨, checkpoint가 phase를 추적해야 한다.

## 고려한 옵션

- **(가) 두 패스 분리 [채택]**: 패스1(killer 전체) → 멈춤 → 패스2(srim 선택분). checkpoint에 phase 추가. 사용자 원안에 충실하고, srim(콜 무거움)을 선택분에만 돌려 콜 절약. 단 중단·재개 인프라 재편 — 작업 크고 ADR-0012/0014 회귀 위험.
- **(나) killer-only 별도 모드**: 기존 루프 유지 + killer까지만 도는 모드 추가, 명단을 단일분석(watchlist_check)으로 별도 핸드오프. checkpoint 무변경, 작고 안전. 단 한 흐름 내 매끄러운 멈춤 아님(두 번 호출).
- **(다) 구조 유지 + 중간 보고**: 한 루프 그대로, 결과에 killer 단계 정보만 함께 노출. 멈춤 없음·콜 절약 없음 → 원안 불충족.

## 결정

**(가) 두 패스 분리 채택.**

### 동작
- killer 통과 후 **항상 멈춤**.
- 표시: 통과 N ≤ 10 → 종목명까지. N > 10 → 개수만("killer 통과 N개").
- 멈춤 명단 정보: **종목명만**(+필요 시 업종). killer 단계엔 srim·ROE 없으며, killer check 특성상 세부 불요(D-C).
- 선택지(규모 무관 동일):
  1. **전부 srim 분석** — 통과 전체를 패스2로.
  2. **골라서 분석** — 명단에서 사용자가 종목명/코드로 지정, 그것만 패스2(D-A).
  3. **명단으로 충분** — srim 생략, killer 명단이 최종 결과. composite_score(srim 의존) 없으므로 **종목명 가나다순** 정렬(D-B).

### 흐름
```
스캔 → [ADR-0030 게이트] 전체 규모 > 10,000콜? → 견적 멈춤 (그대로)
→ stage1 static filter
→ 패스1: for universe { killer만 }   (80% 도달 시 phase:"killer" checkpoint·중단)
→ killer 통과 N개 → [멈춤] phase:"awaiting_choice" checkpoint, 선택지 제시, 턴 종료
→ 사용자 선택 (resume_from + choice [+ selected_corp_codes])
     ③ 명단으로 충분 → 가나다순 명단 반환, 종료
     ②/① → 패스2: for 선택corp { srim → stage4~6 }   (80% 도달 시 phase:"srim" checkpoint·중단)
→ composite 정렬 → candidates
```

### checkpoint 확장 (scan-checkpoint.ts)
신규 필드 추가:
- `phase: "killer" | "awaiting_choice" | "srim"` — 현재 단계
- `killer_passed_corp_codes: string[]` — killer 통과 명단 (현재 killer_passed_cumulative는 카운트만이라 패스2 대상 식별 불가 → 명단 필요)
- `user_choice: "all" | "selected" | "list_only"` + `selected_corp_codes: string[]` — 멈춤 선택 보존

**backward-compatibility 불요(D-D)**: 아직 공개 전·기존 사용자 없음. 구버전 checkpoint(phase 미존재) 호환 처리 생략 — 구조 단순화. (이전 묶음 3A의 optional 점진확장 원칙과 달리, 여기선 신규 필드를 정식 도입 가능.)

### 게이트 공존(D-E)
(1) ADR-0030 스캔 전 규모 게이트(콜>10,000) + (2) 본 killer 멈춤(항상). 시점·목적 상이, 충돌 없음. skill에 두 흐름 모두 명시.

## 근거

- **7부 정합**: killer 통과 = 1차 선별. 항상 멈춰 사람에게 보이는 것이 "기계가 거르고 사람이 결정"에 충실. 규모별 표시로 대량 통과 시 무의미한 명단 나열 회피.
- **콜 절약**: srim은 회사당 콜이 무겁다(DART+naver+KIS). 패스 분리로 srim을 선택분에만 돌려, "골라서/명단으로 충분" 시 콜 대폭 절감. killer 멈춤이 자연스레 효율로 이어짐.
- **두 패스 채택 이유**: (나)는 안전하나 "두 번 호출" UX로 흐름이 끊김. (다)는 원안 불충족. (가)만이 한 흐름 내 매끄러운 멈춤 + 콜 절약을 동시에 만족. 사용자가 (가) 명시 선택.
- **backward-compat 생략 정당성**: 공개 전·사용자 없음(ADR-0031 분리는 MVP 검증 후). 구 checkpoint 호환은 떠받칠 대상이 없어 무의미하며, 생략이 구조를 단순화한다.
- **위험 통제**: checkpoint 재편은 ADR-0012/0014 회귀 위험. 구현은 페이즈 분리(checkpoint 확장 → 두 패스 → 멈춤 → resume → skill → 테스트)로, 각 단계 기존 resume 테스트 전수 통과 확인. 단일 인덱스 순회가 두 패스로 바뀌므로 pipeline_stats 산출도 조정.
- **β-i 가드**: src/lib 무변경. 작업은 scan-execute.ts + _lib/scan-checkpoint.ts(사경인 영역).

## 후속

- D-C(멈춤 명단 표시 보강): 종목명만으로 구현, 추후 필요 시 업종/시총 등 보강 — 구현 후 논의.
- 구현 후 실사용 검증: 제약(21)·기계(29) 업종으로 killer 멈춤·선택지·resume 무결 확인.
