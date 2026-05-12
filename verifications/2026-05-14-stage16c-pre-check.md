# 16(c) 묶음 3 진입 사전 검증

## 측정 시점

- UTC: 2026-05-12T14:21:46Z
- KST: 2026-05-12 14:21:46 KST
- 자정 KST 이후 경과: 약 14시간 21분

## 사전 호출 0 정책 정합

- 본 검증 직전까지 호출 0: Y
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
- selector (rate_info_krx + no_today): Y
- verdict: ✓ 정상

### KIS rating HTTP

- URL: kisrating.com/ratingsStatistics/statics_spread.do
- HTTP status: 200
- selector (BBB- 또는 fc_blue_dk): Y
- verdict: ✓ 정상

## 종합 verdict

✓ 통과 — scan_execute 즉시 진입 가능

## 다음 단계

- run-scan-execute.mjs 신설 후 sagyeongin_scan_execute 실행 진입 (즉시)

## 첨부

- 스크립트: verifications/2026-05-14-stage16c-pre-check.sh
- 로그: verifications/2026-05-14-stage16c-pre-check.log
