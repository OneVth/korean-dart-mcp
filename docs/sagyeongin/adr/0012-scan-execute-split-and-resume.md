# 0012 - scan_execute 분할 실행 + 사용자 명시 재개

- 상태: Accepted
- 결정일: 2026-05-03
- 결정자: 사용자 + Claude

## 컨텍스트

8단계 scan_preview field-test에서 daily_limit_usage_pct 163.2% 실측. 11단계 scan_execute는 universe 전체 corp별 6 도구 호출이라 daily limit 도달이 정상 케이스. spec §10.8은 checkpoint/resume + `resume_from` 파라미터를 명시했지만 구체 정책 (분할 단위 / 시점 / 재개 방식)이 미결.

ADR-0009는 rate limit 처리 인프라 (감지·백오프·throw)를 결정. ADR-0012는 그 위에서 scan_execute가 어떻게 분할 처리할지 결정.

## 고려한 옵션

- **옵션 A** (corp 단위 분할 + 사용자 명시 재개): corp 1개를 한 단위로 평가, daily limit 80% 도달 시 checkpoint 저장 + 사용자에게 resume_from 토큰 노출. 사용자가 다음 호출 시 `resume_from` 파라미터 명시적 전달.
- **옵션 B** (corp 단위 분할 + 자동 재개): 동일 분할 단위, 도구가 다음날 자동 재개. 스케줄러 또는 daemon.
- **옵션 C** (stage 단위 분할): Stage 2 모두 → Stage 3 모두 → ... 각 stage 끝에서 checkpoint.

## 결정

**옵션 A**:

- 분할 단위: corp 1개 (corp별 6 도구 호출이 한 묶음)
- checkpoint 시점: daily limit 80% 도달 시 (DartClient 호출 횟수 모니터링 — ADR-0009 wrapper와 정합 필요)
- 우선순위: corp_code 오름차순 (단순 — 향후 `sort_by` 파라미터로 옵션 추가 가능)
- 재개: 사용자가 다음 호출 시 `resume_from` 파라미터 명시적 전달
- 자동 재개 안 함 (스케줄러/daemon 도입 안 함)

## 근거

- **옵션 A 채택**:
  - 사상 5부 "분기 점검으로 충분", "매주·매월 분석하지 말 것" 정합 — 자동 재개는 도구가 스캔 빈도를 강제하는 꼴
  - 사용자가 daily limit 도달을 의식적으로 보고 다음 진행 결정 — 사람 결정 영역 사전 분리
  - corp 단위 분할은 stage 분할보다 단순 — corp 1개의 stages는 의미적 묶음 (watchlist_check도 동일 패턴)
  - daily limit 80%는 안전 마진 — 100% 직전까지 진행 시 다음 호출 첫 시도부터 fail
- **옵션 B 거부**: 5부 어긋남. 단일 사용자에 스케줄러 인프라 부담.
- **옵션 C 거부**: 한 corp의 일부 stages만 평가된 중간 상태가 사용자에게 노출되면 해석 부담.

## 결과

좋은 점:
- 인프라 단순 — 스케줄러/daemon 없음
- 사용자가 daily limit 소진 패턴 보고 universe를 좁힐지 결정 가능
- corp 단위 묶음이 watchlist_check 패턴과 정합

트레이드오프:
- 다일 점검 시 사용자 부담 — 다음날 직접 `resume_from` 호출
- daily limit 80% 임계는 추정 — 실제 도달 직전 보수적 처리. ADR-0009의 단순 retry 1회 + throw 정책상 100% 도달 후 fail보다 80% checkpoint가 자연
- daily limit 카운터 인프라 필요 — DartClient 호출 횟수를 ADR-0009 wrapper에서 노출하거나 scan_execute 자체에서 카운트

미래 변경 시 영향:
- 다중 사용자 환경 시 자동 재개 재검토 — 본 ADR 갱신
- daily limit 임계 변경 시 본 ADR 갱신
