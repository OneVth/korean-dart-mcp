# 0030 - scan 2-모드 게이트 (자동 완주 / 단계별 대화)

- 상태: Accepted
- 결정일: 2026-05-31
- 결정자: 사용자 + Claude
- 관계: ADR-0019 부분 개정(아래 §개정 범위). ADR-0028(2-phase 추정)·ADR-0010(over-estimate)과 독립 — 추정 로직 그대로 재사용.

## 컨텍스트

field-test 최상위 결함. 사용자 "저평가 한국 주식 찾아줘" 한 마디 → client(Claude Code)가 묻지도 따지지도 않고 universe 3,967개를 1시간 단독 배치 실행 → DART 일일 한도 80%(16,000/20,000) 소진 → stage 4~6 미완 중단 → candidates 0(SRIM 통과 36개는 심층분석 미완으로 미반환).

핵심 결함은 한도 초과 자체가 아니라 **대화형 funnel 부재**다. 프로그램이 중간에 멈춰 "3,967개 다 뒤지면 한도 넘어요, 범위 좁힐까요/그냥 갈까요?"를 물었어야 했는데 한 번도 안 물었다. 7부 "중요한 결정은 사람" 위반 — 사람이 결정할 *기회 자체*를 주지 않았다.

### 7부 정렬 (S-1)

자동 완주가 7부 위배인가? **사용자가 명시적으로 택한 자동은 위배 아님.** 7부 위반 성립 조건은 결정권 박탈이지 자동 실행 자체가 아니다. 사용자가 "한 번에 알아서"를 고른 행위가 이미 7부가 요구하는 "사람의 결정"이며, 자동 완주는 그 결정의 집행이다.

단 경계 하나 — 자동을 택하는 순간이 **충분히 정보를 가진 선택**이어야 위배가 아니다. 한도 80% 소진·중단 위험을 모른 채 "알아서 해"라고 한 위임은 무지에서 나온 위임이지 결정이 아니다. 따라서 한도 초과 분기는 자동 모드여도 silent 강행 금지 — 고지 후 진행. 양보 불가 멈춤 매듭 = **"한도 초과 시 고지" 단 1개**(S-2). preference/preset 범위/심층분석 깊이는 자동 택하면 건너뛰어도 위배 아님.

## 고려한 옵션

### 강제 메커니즘: 필수 입력(required) vs 제어 흐름

직전 진단의 잠정안은 "범위 확인 신호를 실행 도구 *필수 입력*으로 박으면 사람이 답해야만 채워지니 강제된다"였다. **회수로 반증됨.** Zod `.optional()`/`.default()`/required는 *타입 검증*이지 *제어 흐름 강제*가 아니다. client는 required든 optional이든 임의값을 주입한다 — field-test에서 `min_opportunity_score=50`을 사용자 요청 없이 주입한 사건이 직접 반례다. required 인자도 client 거짓 주입을 막지 못한다.

→ 강제는 **제어 흐름**으로만 가능하다: 신호 부재 시 실행을 거부하고 견적을 반환. client가 신호를 거짓 주입하면 그것은 client가 사용자를 대신해 결정을 위조한 것 — 7부 위반 책임이 client로 이전한다. 도구가 보장하는 범위는 "기본 상태에선 안 멈추고 못 간다"까지이며, 그 이상은 client 책임. 이것이 도구 설계가 박을 수 있는 최대치다.

### 도구 구조: (가) 한 도구 신호 분기 vs (나) 도구 분리

- **(나) scan_precheck / scan_execute 분리**: ADR-0019가 옵션 (c)로 이미 검토·기각한 형태(별 도구 + orchestration 사용자 위임). 기각 근거 "client가 견적 도구를 안 부른다"는 *느슨한 분리* 전제였으나, 제어 흐름 강제(위)를 적용하면 분리해도 강제력은 동일하다 — 강제는 도구 형태와 무관하기 때문. 즉 분리의 강제 이점은 없고 복잡도·ADR-0019 충돌만 증가.
- **(가) scan_execute 한 도구 + 신호 인자 분기**: 기존 게이트(scan-execute.ts pre-check)·신호 인프라(`allow_over_daily_limit`)가 이미 한 도구 안에 있다.

**강제력은 (가)·(나) 동률**(제어 흐름 강제는 도구 형태 무관 — 위 귀결). 따라서 결정 근거는 강제력이 아니라 **기존 인프라 재사용·최소 변경**이다.

### 신호 인자: 신설 `scope_confirmed` vs 기존 `allow_over_daily_limit` 재사용

- **재사용**: 인자 안 늘어 지금은 깔끔. 단 `allow_over_daily_limit`의 의미는 "한도 초과 수용"이고 2-모드가 가르려는 건 "범위 확인 후 자동 완주 택함"이다. 현재 게이트가 한도 분기 한 곳뿐이라 둘이 겹쳐 보이나, funnel이 자라 한도와 무관한 멈춤(preference/preset 범위/심층깊이)이 생기면 "한도 초과 허용" 이름의 인자로 "범위 전반 확인됨"을 표현하게 되어 이름과 의미가 어긋난다. description으로 의미를 덮는 것은 학습 #63이 기각한 패턴(코드/이름이 안 받치는데 description으로 의미 욱여넣기)이다.

## 결정

**(가) scan_execute 한 도구 + 신설 `scope_confirmed` 신호 + 제어 흐름 강제(throw → 견적 반환) 채택.**

### 신호 인자: `scope_confirmed` 신설

- `scope_confirmed: z.boolean().optional()` — `.optional()` 채택으로 기존 호출 회귀 0(학습 #58).
- 의미: "사용자가 스캔 범위를 확인하고 진행을 택했다"(상위 — funnel 전체의 "사람이 봤다").
- `allow_over_daily_limit`와 위계 분리: `scope_confirmed`는 범위 전반 확인(상위), `allow_over_daily_limit`는 한도 초과라는 특정 위험 한 건의 수용(하위). 지금은 게이트가 한도 분기뿐이라 둘이 겹쳐 보여도, 위계를 분리해두면 funnel이 자랄 때 `scope_confirmed`가 새 멈춤 매듭들을 자연히 흡수한다.

### 게이트 동작 (2-모드)

scan_execute pre-check(scan-execute.ts fresh 분기, resolveInput 직후)의 한도 분기를 다음으로 확장:

| 조건 | 동작 | 루트 |
|---|---|---|
| 한도 안전권(usagePct ≤ 100) | 그대로 완주 | (신호 불필요) |
| 초과 ∧ `scope_confirmed`(또는 `allow_over_daily_limit`) | 고지 후 완주 | (1) 자동 완주 |
| 초과 ∧ 신호 부재 | **throw 대신 견적·분기 구조화 응답 반환 + 사용자 턴** | (2) 단계별 대화 |

대화 루트 응답에 담을 분기(사용자 lever):
1. 범위 좁히기(included/excluded_industries, markets)
2. 한도 감수(`allow_over_daily_limit` 또는 `scope_confirmed`)
3. warm cache(corp_meta_refresh 선행 — ADR-0028 cache_coverage 낮을 때)

### 재실행 흐름 (fresh, resume 아님)

견적 반환은 stage1 진입 *전*(throw 위치 = stage1·saveCheckpoint·generateScanId보다 앞)이므로 견적 시점엔 scan_id·checkpoint가 없다. → 사용자 OK 후 재호출은 **fresh + `scope_confirmed=true`**이며 resume이 아니다. checkpoint/resume 인프라(ADR-0014)는 *실행 도중* 한도 도달 복구 전용 — 사전 분기와 다른 층, 재사용 불가/불필요.

### 적용 범위

`sagyeongin_scan_execute` 단독. `watchlist_check`(10개 내외)·`corp_meta_refresh`는 한도 초과 대상 아님 — ADR-0019 적용 범위 그대로.

## 개정 범위 (ADR-0019)

ADR-0019는 **Superseded 아님 — 부분 개정**. 본 ADR은 0019의 자동 throw 게이트를 *버리는* 게 아니라 신호 분기로 *확장*한다. 0019의 (c) 기각 근거가 *느슨한 분리* 전제였음을 0019 개정 section에 명기하고, 결정 (a)의 "초과 시 throw"를 "초과 ∧ 신호 부재 시 throw가 아니라 견적 반환"으로 확장한다. 한도 안전권 자동 완주·override(`allow_over_daily_limit`) 동작은 불변.

## 결과

- `scope_confirmed` 신호 신설(`.optional()`).
- pre-check 한도 분기 3-way 확장(완주 / 고지 후 완주 / 견적 반환).
- DailyLimitPreCheckError → throw 경로는 신호 부재 시 견적 구조화 응답으로 대체(대화 루트). 신호 있으면 throw 없이 완주.
- mvp-funnel.md 3단계 "대화 funnel" 책임 재정의 — client 통째 위임에서 도구가 견적 반환으로 매듭을 *강제*하는 구조로(별 변경, 본 ADR 결선 시).

## 미해결 / 후속

- 견적 반환 응답 양식 상세(필드명·구조) — 결선 spec 단계.
- funnel 추가 멈춤 매듭(preference/preset 범위/심층깊이)에서 `scope_confirmed` 흡수 — funnel 성장 시 별 ADR.

## 재개정 (2026-06-02) — 임계: 한도 % → 절대 규모

### 배경
field-test 실측(빌드 검증 후 파일 로그):
`estimate.total=17875 usagePct=89.4 matched_cached=2221 cache_miss=0 → 완주`

빈 호출 `{}`은 default preset + user-preference 필터가 적용되어 universe=2,221(전체 3,967 아님), estimate 17,875콜=한도 89.4%. 원 결정 표의 임계 `usagePct ≤ 100`에서 89.4%는 안전권 → 완주. 그러나 이는 "전체 다 뒤지기"(16,002콜 실소진)이며 본 ADR이 잡으려던 바로 그 시나리오다.

### 결함
본 ADR 컨텍스트는 "핵심 결함은 한도 초과가 아니라 funnel 부재"로 규모를 가리켰으나, 임계는 `usagePct ≤ 100`(한도 %)로 구현됐다. 한도가 89%든 99%든 한도 *안*이면 아무리 큰 스캔도 안 멈춘다 — 분석(규모)과 구현(한도 %)의 어긋남.

게이트 코드 버그 없음·client 우회 없음·universe 3,967 가정 오류(실측 2,221)·min_opportunity_score 가설 폐기 — 모두 실측으로 확정. **임계 정의가 유일 결함.**

### 개정
결정 표 첫 두 행의 임계를 교체:

| 조건(개정 전) | 조건(개정 후) | 동작 |
|---|---|---|
| usagePct ≤ 100 | estimate.total ≤ N (N=10000) | 완주 |
| usagePct > 100 ∧ 신호 | estimate.total > N ∧ 신호 | 고지 후 완주 |
| usagePct > 100 ∧ 신호 부재 | estimate.total > N ∧ 신호 부재 | 견적 반환 |

- 단위: `estimate.total`(콜수). cache-hit 보정·passRate 반영된 상위 정보(C-1).
- N=10000: 하루 한도(20000)의 절반. 빈 호출 전체(17,875)를 ~7,900 마진으로 거르고, 중범위(universe ~1,200 이하)는 통과. field-test 실측점 1개(17,875)뿐이라 중범위 분포 미지 — 운영 피드백으로 상수 조정(MVP).
- 상수 하드코딩(`SCAN_SCALE_GATE_CALLS`, scan-helpers.ts). preset/preference 분리는 과설계로 보류(C-3).
- usagePct 계산·견적 응답 % 표시는 유지(사용자 직관). 게이트 *조건*만 콜수.

### 범위
잔여 한도 보정(usagePct 분모가 기 사용분 무시)은 본 개정 제외 — 규모 임계(1차)와 자원 보정(2차)은 별 축(C-2). ADR-0014/0015와 별 사이클.

골격(2-모드·scope_confirmed·제어 흐름 강제·buildPreviewResponse) 전부 불변. 임계 조건만 교체.
