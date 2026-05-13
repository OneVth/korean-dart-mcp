# 16(c) 묶음 2 진입 사전 검증

## 측정 시점

- UTC: 2026-05-11T15:26:31Z
- KST: 2026-05-12 00:26:31 KST
- 자정 KST 이후 경과: 약 26분

## 사전 호출 0 정책 정합

- 본 검증 직전까지 호출 0: Y (1차 실행은 스크립트 버그(HEAD 차단) 수정 목적 진단 호출 포함 — KIS GET 1회)
- Onev 환경 키 다른 사용: N

## 측정 결과 3 영역

### DART daily limit 회복

- URL: company.json?corp_code=00126380
- status: 000
- corp_cls + induty_code 정합: Y
- verdict: ✓ 정상

### naver finance HTTP

- URL: finance.naver.com/item/main.naver?code=005930
- HTTP status: 200
- selector (#rate_info_krx + no_today): Y
- verdict: ✓ 정상

### KIS rating HTTP

- URL: kisrating.com/ratingsStatistics/statics_spread.do
- HTTP status: 200
- selector (BBB- 또는 fc_blue_dk): Y (22건 매치)
- verdict: ✓ 정상
- 비고: HEAD 요청 차단 사이트 — 스크립트를 GET 방식으로 수정 후 통과

## 종합 verdict

✓ 통과 — field-test 즉시 진입 가능

## 다음 단계

sagyeongin_corp_meta_refresh 실 호출 (별개 위임 명세)

## 첨부

- 스크립트: verifications/2026-05-11-stage16c-pre-check.sh
- 로그: verifications/2026-05-11-stage16c-pre-check.log
