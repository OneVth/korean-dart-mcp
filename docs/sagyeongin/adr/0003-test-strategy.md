# 0003 - Test Strategy

- 상태: Accepted
- 결정일: 2026-04-25
- 결정자: 사용자 + Claude

## 컨텍스트

사경인 도구 11개를 어떻게 검증할지 결정한다. 두 압력이 있다.

첫째, **신뢰성**. 이 도구는 사용자의 투자 결정에 영향을 준다. spec §10의 룰과 공식이 정확히 구현됐는지 검증 가능해야 한다.

둘째, **원작자 컨벤션 일치**. 원본 `korean-dart-mcp`는 의도적으로 전통적 단위 테스트 인프라를 도입하지 않았다 (`package.json`에 `test` 스크립트 없음, vitest/jest 등 의존성 없음). 대신 `scripts/field-test-v0_X.mjs` 패턴으로 빌드 후 실제 API 호출 검증을 한다. 이 결정은 코드로 표명된 의도이므로 우리도 따라야 한다.

ADR-0001의 격리 원칙도 적용된다 — 우리 테스트가 원본에 의존성을 추가하면 격리가 깨진다.

## 고려한 옵션

### 큰 방향

- **TDD 전면 적용** — 테스트 먼저, 구현 나중. 모킹 단위 테스트 중심.
- **샘플 기반 검증 주도** — 구현 후 실제 데이터로 검증. 원작자 컨벤션 일치.

### 단위 테스트 프레임워크

- **D-A**: Node built-in `node --test` (devDep 0, 빌드 후 실행)
- **D-B**: vitest (devDep +1, TS 직접 실행, watch 모드)
- **D-C**: tsx + `node --test` (devDep +1, TS 직접 실행)

## 결정

**TDD 전면 비채택. 샘플 기반 검증 주도. Node built-in `node --test` 채택.**

### 검증 영역 분리

| 영역 | 검증 방식 | 위치 |
|---|---|---|
| 순수 계산 로직 (S-RIM 공식, concern_score 집계, KSIC 매칭, payout_grade 분기) | 단위 테스트 — 입력→기대출력 비교 | `src/tools/sagyeongin/_lib/*.test.ts` |
| 도구 통합 동작 (killer_check 실제 종목, srim 실제 데이터) | field-test 스크립트 — 실제 API 호출 | `scripts/sagyeongin/field-test-*.mjs` |
| 외부 스크래핑 (kisrating, naver) | smoke 스크립트 — 페이지 구조 살아있는지 확인 | `scripts/sagyeongin/smoke-scrapers.mjs` |

### 순수 계산 단위 테스트

- 프레임워크: Node built-in `node --test`
- 위치: `src/tools/sagyeongin/_lib/*.test.ts` (대상 파일과 동일 디렉토리)
- 실행: 빌드 후 `node --test build/tools/sagyeongin/_lib/*.test.js`
- `package.json`에 1줄 추가:
  ```json
  "test:unit": "npm run build && node --test build/tools/sagyeongin/_lib/*.test.js"
  ```
- 입력값: **합성 입력값 + 손산출 expected**. 책 예시값(K=8.05% 등) 사용 안 함 — 책 시점 K값이 현재와 다르고, 깔끔하지 않은 숫자라 가독성 저하.
- 합성 입력값 예: 자본총계 1,000억, ROE 20%, K 10%, 발행주식수 100만주 → W=1.0일 때 적정주가 = 20만원

### 도구 통합 field-test

- 위치: `scripts/sagyeongin/field-test-{도구명}.mjs` (원작자 컨벤션 따름)
- 실제 DART API 호출. VCR(녹화/재생) 도입 안 함.
- 도구당 1개 이상의 field-test 파일.
- 한 파일이 PASS 케이스(삼성전자/현대차)와 EXCLUDE 케이스(상폐 직전 등)를 함께 포함.

### 테스트 종목

- 종목 코드와 기대값을 별도 파일로 분리: `scripts/sagyeongin/fixtures.mjs`
- **PASS 케이스**: 삼성전자(00126380), 현대차(00164742). 안정적 대형주, 향후 5년 내 EXCLUDE 가능성 거의 0.
- **EXCLUDE 케이스**: 구현 중 발견하며 누적. spec §10.1의 7부 A 룰 7개에 대해 각 1개씩 케이스 누적 목표.
- fixture 항목은 컨텍스트 주석 포함:
  ```js
  // 2025년 4월 거래정지. 별도재무제표 영업손실 4년 연속 (2021~2024).
  // killer_check: consecutive_operating_loss
  CONSECUTIVE_LOSS_SAMPLE: { corp_code: "00XXXXXX", expected_rule: "consecutive_operating_loss" }
  ```

### scan_execute / watchlist_check 처리

전체 시장 스캔은 자동 테스트 안 함 (DART 일일 한도 20,000회 소비). 대신 `excluded_industries`로 좁혀 universe 5~10개로 만든 뒤 실행. 사용자 명시 호출 시에만 전체 universe 사용.

`scan_preview`가 사실상 "API 0 dry-run" 역할을 하므로 (spec §10.7) VCR 등 별도 인프라 불필요.

### fixture 신선도 점검

상폐 종목은 실제로 상폐되면 DART 응답이 달라질 수 있다 (공시 갱신 중단). 정기 점검 필요.

- **점검 시점**: 분기 watchlist_check 실행 시 fixture 종목도 함께 검증
- **죽은 케이스 발견 시**: fixtures.mjs 갱신 (해당 종목 제거 또는 새 케이스로 교체)
- 이는 운영 사항이라 spec에 없지만 명시 안 하면 silently broken 테스트 발생 가능

### CI

**도입 안 함**. 모든 검증은 로컬 명시 실행.

근거:
- GitHub Actions에서 실제 DART API 호출은 비현실적 (API 키 secrets, 한도 소비, 네트워크 안정성)
- 원작자도 CI 없음
- 1인 개발이라 PR이 없어 CI 가치 낮음
- 5부 "시간 들이지 않기" 원칙 — CI 인프라 유지보수 부담

## 근거

### TDD가 거부된 이유

DART API 응답은 모킹으로 정확히 재현하기 어렵다 (계정명 변형, fs_div=OFS 처리 등). API 래핑은 실제 응답을 봐야 검증 가능. 모킹으로 만든 테스트는 거짓 안전감을 준다.

원작자가 의도적으로 단위 테스트 인프라를 안 만들었다는 것은 코드로 표명된 결정. 우리가 도입하면 격리 원칙(ADR-0001)과 마찰.

### vitest (D-B)가 거부된 이유

격리 원칙 일관성. ADR-0001에서 격리를 우선했으니 테스트도 같은 원칙. 다른 결정에서는 격리, 여기만 DX 우선이면 일관성 깨짐.

테스트 케이스 양이 작다 (30~50개 추정). 빌드+실행 사이클 부담이 견딜 만한 수준.

reversibility — D-A로 시작했다가 답답하면 D-B로 옮기는 것은 30분 작업 (vitest API가 `node --test`와 거의 호환). 가벼운 쪽에서 시작.

### 책 예시값 거부 이유

책의 K값(8.05%)은 책 시점 값이고 현재와 다르다. 도구 통합 검증(K 자동 조회)에서 무의미. 순수 계산 검증에서는 K도 입력으로 고정하면 책 결과 재현 가능하지만, 깔끔하지 않은 숫자(자본총계 1,513억, ROE 15.22%)라 미래의 자신이 "왜 이 값이지?" 컨텍스트를 다시 복원해야 함. 합성 입력값으로 동일 검증 가치, 더 높은 가독성.

### VCR 거부 이유

원작자 컨벤션 (실제 API 호출) 일치. VCR 인프라 (캡처/재생, fixture 관리) 비용. "녹화된 응답이 현재 API와 일치하는가" 자체가 검증 불가. spec §10.7의 `scan_preview`가 dry-run 역할을 이미 함.

## 결과

### 좋은 점

- **원작자 컨벤션 일치** — 미래의 Claude 세션이 같은 멘탈 모델로 읽음.
- **격리 원칙 일관** — ADR-0001과 정합. 원본에 새 의존성 추가 0.
- **신뢰성 — 실제 API 응답으로 검증** — 모킹의 거짓 안전감 회피.
- **빠른 시작** — 별도 프레임워크 학습/설정 불필요.

### 트레이드오프

- **TS 단위 테스트 작성이 약간 어색** — `.ts`로 쓰지만 빌드 후 `.js`를 실행. import 경로를 빌드 산물에서 풀어야 함.
- **field-test가 DART 한도 소비** — 매 실행마다 종목당 ~6~8 호출. scan_execute는 universe 좁혀야 함.
- **CI 없으므로 로컬에서만 검증** — 다른 환경에서의 회귀 발견은 사용자 명시 실행에 의존.
- **fixture 신선도가 운영 부담** — 분기마다 점검 필요. 자동화되지 않은 휴먼 프로세스.

### 미래 변경 시 영향

- **fixture 케이스 누적이 핵심**. 도구 구현하며 발견되는 EXCLUDE 케이스를 fixtures.mjs에 추가하지 않으면 테스트 가치 저하.
- **DART 한도가 부담되면** field-test를 더 좁은 universe / 더 적은 케이스로 조정. 또는 일부 결과를 캐시.
- **vitest 도입이 정당화되는 시점** — 단위 테스트 케이스가 100개를 넘거나, watch 모드 부재가 일상 마찰을 일으킬 때. 그때 ADR 갱신.
- **CI 도입이 정당화되는 시점** — 협업자 합류 또는 PR 워크플로 도입 시.

## 참조

- spec §10 (도구 명세)
- spec §10.7 (scan_preview의 dry-run 역할)
- spec §11.3 (외부 의존)
- ADR-0001 (격리 원칙)
- 원본 컨벤션: `korean-dart-mcp/scripts/field-test-v0_9.mjs`, `package.json`
