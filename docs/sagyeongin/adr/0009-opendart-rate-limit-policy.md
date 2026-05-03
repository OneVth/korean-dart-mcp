# 0009 - OpenDART Rate Limit + Backoff 정책

- 상태: Accepted
- 결정일: 2026-05-03
- 결정자: 사용자 + Claude

## 컨텍스트

8단계 scan_preview field-test에서 daily_limit_usage_pct 163.2% 실측 (universe 3,607). `src/lib/dart-client.ts`(92줄)는 단순 fetch 클라이언트로 rate limit 처리가 전혀 없다 — retry, 백오프, 토큰 버킷 모두 부재. 11단계 scan_execute는 corp별 6 도구 호출이라 daily limit 도달이 정상 케이스이며 이를 우아하게 처리하는 정책이 필요하다.

spec §11.3 line 1012에 "Rate limit 도달 시 checkpoint/resume"이 추상 본문으로 명시됐지만 구체 정책 (감지 방법 / 백오프 전략 / 인프라 위치)이 결정 안 됐다.

## 고려한 옵션

처리 정책:

- **옵션 A** (사전 추정 차단): scan_preview에서 limit 초과 예상 시 진입 거부. 8단계 ADR-0010 결정 ("over-estimate + 사용자 결정")과 충돌 — preview는 정확성이 목적이 아니라 사용자 의사결정 정보 노출이 목적.
- **옵션 B** (실제 도달 후 처리): 429 응답 감지 → 단순 retry → 실패 시 daily limit 도달 처리 → checkpoint 저장 + 사용자 신호. 인프라 단순.
- **옵션 C** (사전 + 실제 둘 다): A + B 조합. 구현 부담 큼.
- **옵션 D** (예측 스로틀링/토큰 버킷): 호출 빈도 사전 제어. 단일 사용자 단일 세션에 과한 인프라.

인프라 위치:

- (i) upstream `DartClient` 직접 변경 — ADR-0001 β-ii (upstream 변경), GitHub Issue 선행 mandatory
- (ii) 사경인 디렉토리 wrapper 신설 — β-i 격리 유지

## 결정

**옵션 B + 위치 (ii)**:

- 인프라 위치: `src/tools/sagyeongin/_lib/dart-rate-limit.ts` (wrapper 신설)
- 정책:
  - DART 429 응답 감지 → 단순 retry 1회 (1초 sleep 후)
  - retry 실패 → 별도 에러 클래스 `DartRateLimitError` throw
  - 호출자 (scan_execute)가 catch → checkpoint 저장 + 사용자에게 resume_from 토큰 노출
- 지수 백오프 안 함 — 단순 retry 1회 (단일 사용자에 충분)
- 예측 스로틀링 안 함 — 사전 추정은 scan_preview의 `estimated_api_calls`에서 노출

## 근거

- **옵션 B 채택**: 인프라 단순 + ADR-0010 정합 (사전 추정은 over-estimate, 실제 도달 처리는 인프라). 사용자 결정 영역 사전 분리 (5부).
- **옵션 A 거부**: ADR-0010과 충돌. preview는 정확성이 목적이 아님.
- **옵션 C 거부**: 옵션 A를 거부했으니 자동 거부.
- **옵션 D 거부**: 단일 사용자에 과한 인프라. 토큰 버킷은 다중 동시 호출 대응이지만 본 도구는 순차 호출.
- **위치 (ii) 채택**: β-i 격리 유지. wrapper는 사경인 도구 단독 활용. upstream PR 부담 회피.
- **위치 (i) 거부**: GitHub Issue + PR 검토로 11단계 진입 지연.

## 결과

좋은 점:
- DartClient 변경 없음 (β-i 격리 유지)
- 인프라 단순 — 단순 retry 1회, 실패 시 명시적 throw
- scan_execute 외 다른 사경인 도구도 활용 가능

트레이드오프:
- DART 외 다른 외부 의존 (네이버 가격, K값 캐시)은 wrapper 적용 범위 밖 — 각 도구가 별도 처리. 향후 통합 wrapper 검토 가능.
- 단순 retry 1회는 일시적 네트워크 문제만 처리 — 영구적 limit 도달은 throw로 직접 처리
- 정확한 daily limit 카운터 없음 — scan_execute가 호출 횟수 카운트 (ADR-0012 checkpoint 정책과 정합 필요)

미래 변경 시 영향:
- 다른 외부 의존 wrapper 통합 시 본 ADR 갱신
- 동시 호출 (병렬 처리) 도입 시 토큰 버킷 재검토 — 옵션 D 거부 결정 재고
