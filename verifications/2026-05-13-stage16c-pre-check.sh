#!/usr/bin/env bash
# 16(c) 묶음 2 진입 사전 검증 — DART / naver / KIS 회복 측정
#
# 본 검증 통과 시에만 field-test (sagyeongin_corp_meta_refresh) 진입.
# 사전 호출 0 정책 — 본 스크립트 호출 직전까지 다른 호출 0.
#
# 환경 변수: DART_API_KEY (필수)
# 종료 코드: 0 = 통과 / 1 = 영역 어긋남 (보고 후 대기)
#
# Ref: ADR-0015, ADR-0016, 16(b) 학습 7+8

set -u

MEAS_TIME_UTC=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
MEAS_TIME_KST=$(TZ=Asia/Seoul date +'%Y-%m-%d %H:%M:%S KST')

echo "=== 16(c) 묶음 2 진입 사전 검증 ==="
echo "측정 시점 (UTC): $MEAS_TIME_UTC"
echo "측정 시점 (KST): $MEAS_TIME_KST"
echo

if [ -z "${DART_API_KEY:-}" ]; then
  echo "✗ DART_API_KEY 환경 변수 부재 — 측정 진입 X"
  exit 1
fi

PASS=true

# === [1/3] DART daily limit 회복 검증 ===
echo "[1/3] DART company.json (corp_code=00126380, 삼성전자)..."
DART_URL="https://opendart.fss.or.kr/api/company.json?crtfc_key=${DART_API_KEY}&corp_code=00126380"
DART_RESPONSE=$(curl -s --max-time 10 "$DART_URL" || echo "")
DART_STATUS=$(echo "$DART_RESPONSE" | grep -oE '"status"[[:space:]]*:[[:space:]]*"[0-9]+"' | head -1 | grep -oE '[0-9]+')

echo "  응답: $DART_RESPONSE" | head -c 300
echo
echo "  status: ${DART_STATUS:-(미파싱)}"

if [ "$DART_STATUS" = "000" ]; then
  if echo "$DART_RESPONSE" | grep -q '"corp_cls"' && echo "$DART_RESPONSE" | grep -q '"induty_code"'; then
    echo "  ✓ DART 정상 (status=000 + corp_cls + induty_code 정합)"
  else
    echo "  △ DART status=000이나 corp_cls/induty_code 부재 — 응답 본문 확인 필요"
    PASS=false
  fi
elif [ "$DART_STATUS" = "020" ]; then
  echo "  ✗ DART daily limit (status=020) — field-test 진입 X"
  PASS=false
else
  echo "  ✗ DART 영역 어긋남 (status=${DART_STATUS:-미파싱}) — 보고 후 대기"
  PASS=false
fi
echo

# === [2/3] naver finance HTTP 200 + selector 검증 ===
echo "[2/3] naver finance (code=005930, 삼성전자)..."
NAVER_URL="https://finance.naver.com/item/main.naver?code=005930"
NAVER_BODY=$(curl -s --max-time 10 "$NAVER_URL" 2>/dev/null || echo "")
NAVER_STATUS=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" "$NAVER_URL" 2>/dev/null || echo "")

echo "  HTTP: ${NAVER_STATUS:-(부재)}"

if [ "$NAVER_STATUS" = "200" ]; then
  if echo "$NAVER_BODY" | grep -q 'rate_info_krx' && echo "$NAVER_BODY" | grep -q 'no_today'; then
    echo "  ✓ naver 정상 (rate_info_krx + no_today selector 매치)"
  else
    echo "  ✗ naver HTTP 200이나 selector 미매치 — 페이지 구조 변경 또는 본문 어긋남"
    PASS=false
  fi
else
  echo "  ✗ naver HTTP 영역 어긋남 — 보고 후 대기"
  PASS=false
fi
echo

# === [3/3] KIS rating HTTP 200 + selector 검증 (GET — HEAD 차단 사이트) ===
echo "[3/3] KIS statics_spread.do..."
KIS_URL="https://www.kisrating.com/ratingsStatistics/statics_spread.do"
KIS_BODY=$(curl -s --max-time 10 "$KIS_URL" 2>/dev/null || echo "")
KIS_STATUS=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" "$KIS_URL" 2>/dev/null || echo "")

echo "  HTTP: ${KIS_STATUS:-(부재)}"

if [ "$KIS_STATUS" = "200" ]; then
  if echo "$KIS_BODY" | grep -q 'BBB-' || echo "$KIS_BODY" | grep -q 'fc_blue_dk'; then
    echo "  ✓ KIS 정상 (BBB- 또는 fc_blue_dk selector 매치)"
  else
    echo "  ✗ KIS HTTP 200이나 selector 미매치 — 페이지 구조 변경 또는 본문 어긋남"
    PASS=false
  fi
else
  echo "  ✗ KIS HTTP 영역 어긋남 — 보고 후 대기"
  PASS=false
fi
echo

# === 종합 결과 ===
if [ "$PASS" = "true" ]; then
  echo "=== ✓ 사전 검증 통과 — field-test 진입 가능 ==="
  echo "다음 단계: sagyeongin_corp_meta_refresh 실 호출 (즉시 진입 권고)"
  exit 0
else
  echo "=== ✗ 사전 검증 영역 어긋남 — field-test 진입 X ==="
  echo "Onev 보고 후 대기"
  exit 1
fi
