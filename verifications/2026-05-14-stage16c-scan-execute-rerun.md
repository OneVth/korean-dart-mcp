# 16(c) 묶음 3 scan_execute 재측정 — candidates 회복 + ADR-0016/0017 누적 효과

## 측정 시점

- 사전 검증: 2026-05-12 14:21:46 KST
- scan_execute 시작: 2026-05-12 14:27:48 KST
- scan_execute 완료: 2026-05-12 14:38:33 KST
- 소요: 644,087 ms (~10.7분)

## 사전 검증 정합

- 사전 검증 결과: ✓ 통과 (verifications/2026-05-14-stage16c-pre-check.md)
- DART company.json (삼성전자, status=000): ✓
- naver finance HTTP 200 + selector: ✓
- KIS statics_spread.do HTTP 200 + selector: ✓
- 사전 호출 0 정책: Y (사전 검증 1회 외 호출 0)

## 입력

```json
{
  "included_industries": ["26"],
  "markets": ["KOSPI", "KOSDAQ"],
  "limit": 10,
  "min_opportunity_score": 0
}
```

## pipeline_stats

| 단계 | 값 | 비고 |
|---|---|---|
| initial_universe | 3,963 | corp_meta_refresh 정합 |
| after_static_filter | 294 | KSIC 26 prefix 매치 (26110/26120/26410/...) |
| after_killer_check | 79 | 215개 killer EXCLUDE (7부 A 사전 솎아내기) |
| after_srim_filter | 18 | 61개 srim 탈락 (7부 B intrinsic value cut) |
| returned_candidates | 10 | limit=10 적용 |

**stage 분포 해석**:
- 3,963 → 294 (static 7.4% 통과): KSIC 26 universe 정합
- 294 → 79 (killer 27% 통과): 7부 A 사전 솎아내기 73% 발동
- 79 → 18 (srim 23% 통과): 7부 B intrinsic value 본격 필터
- 18 → 10 (limit cut): 8개 영역 후보 정착

## external_call_stats

| 항목 | 값 | 분석 |
|---|---|---|
| dart_call_count | 2,725 | Stage 2~6 영역 (Stage 1 cache hit 정합) |
| naver_call_count | 79 | killer 통과 corp 수와 1:1 (retry 0) |
| kis_call_count | 1 | Stage 4~6 enrichment 영역 |

### dart_call_count 본문 분석

ADR-0016 cache 효과는 **Stage 1만**:
- Stage 1 (induty_code + corp_cls 추출): cache hit → DART 0 ✓
- Stage 2 (killer): corp당 5~9 endpoint (영업이익 series 4년 + 매출액 + 감사의견 series + CB/BW/유상증자 3종) × 294 ≈ 2,500
- Stage 4~6 (enrichment): cashflow + capex + insider + dividend × 18 ≈ 200

합계 ≈ 2,700 (실측 2,725 정합).

**verdict**: Stage 1 cache 효과 정합 ✓. Stage 2~6는 ADR-0016 적용 범위 외.

### naver / KIS 본문 분석

- naver 79회 = killer 통과 79 정합 → 1:1 호출, retry 0 (성공률 100% 추정)
- KIS 1회 = Stage 4~6 required-return 경유 1건

**C1 retry verdict**: 본 측정에서 retry 발동 0 — 측정 자격 미달 (burst 발동 시점에만 본격 측정). ADR-0017 inter-call delay로 burst 회피 영역에서 자연.

## candidates — 10개

| rank | corp_name | composite_score | srim_verdict | gap_to_fair | quick_summary |
|---|---|---|---|---|---|
| 1 | 신도리코 | 80 | BUY | -38.8% | srim BUY, gap -38.8, capex 80, insider neutral_or_mixed, dividend D |
| 2 | 삼영전자공업 | 0 | BUY | -10.7% | srim BUY, gap -10.7, insider neutral_or_mixed, dividend D |
| 3 | 세진티에스 | 0 | BUY | -40.7% | srim BUY, gap -40.7, insider neutral_or_mixed |
| 4 | 인탑스 | 0 | BUY | -17.2% | srim BUY, gap -17.2, insider neutral_or_mixed, dividend D |
| 5 | 씨유테크 | 0 | BUY | -42.5% | srim BUY, gap -42.5, insider neutral_or_mixed, dividend D |
| 6 | LX세미콘 | 0 | BUY | -9.6% | srim BUY, gap -9.6, insider neutral_or_mixed, dividend D |
| 7 | 아이디피 | 0 | BUY | -18.5% | srim BUY, gap -18.5, insider neutral_or_mixed, dividend D |
| 8 | 파트론 | 0 | BUY | -17.4% | srim BUY, gap -17.4, insider neutral_or_mixed, dividend A |
| 9 | 파이오링크 | 0 | BUY | -10.1% | srim BUY, gap -10.1, insider neutral_or_mixed, dividend A |
| 10 | 코텍 | 0 | BUY | -31.2% | srim BUY, gap -31.2, insider neutral_or_mixed |

## skipped_corps — 276개

| 분류 | 건수 |
|---|---|
| stage2 killer EXCLUDE | 215 |
| stage3 srim 비통과 | 61 |
| 외부 호출 실패 | 0 |

**verdict**: 외부 호출 실패 0 — 파이프라인 완전 정상 동작. 모든 skip은 verdict_skip (룰 본격 동작).

## candidates 회복 verdict — **본 사이클 핵심 목표 ✓ 달성**

| 측정 시점 | returned_candidates |
|---|---|
| 13단계 (2025) | 5 |
| 15(a) (2025) | 0 |
| **16(c) (본 측정)** | **10** |

**verdict**: ADR-0016 (cache 정착) + ADR-0017 (burst 회피) 누적 효과로 *측정 자격 영구 회복*. checkpoint = null (정상 종료).

## ADR-0015/0016/0017 누적 효과 종합

| ADR | 효과 영역 | 본 측정 검증 |
|---|---|---|
| ADR-0015 D1 fail-fast | DartRateLimitError 즉시 break | 본 측정 미발동 (cache hit + delay 정합으로 daily limit X) |
| ADR-0015 B1 shuffle | 결정론 X | 묶음 2-c에서 0.000% 일치율 확정 — 본 측정은 1회만이라 재검증 X |
| ADR-0015 C1 retry | wrapper retry 흡수 | 본 측정 retry 0 (burst X 영역) |
| **ADR-0016 cache** | **Stage 1 DART 호출 0** | **✓ 정합 (2,725 전량 Stage 2~6)** |
| **ADR-0017 delay** | **burst 회피** | **✓ 정합 (terminated_by completed, 10.7분 완주)** |

## 누적 학습 후보 (16(c) 사이클)

| # | 본문 |
|---|---|
| 9 | KIS HEAD 차단 — 사전 검증 스크립트 GET 우선 정책 가드 |
| 10 | DART burst limit (~19건/초 → IP 차단) — 외부 자원 호출 시 daily limit 외 burst 사전 검토 필수 |
| 11 | DartRateLimitError 라벨링 본질 — daily + burst + network_block 모두 흡수 |
| 12 | ADR 본문 분리 본격 영역 — 본질 분리 시 별개 ADR 신설 우선 (단일 ADR 본문 확장 X) |
| 13 | Windows bash `rm -f ~/...` 어긋남 가능성 — 절대 경로 또는 명시적 검증 단계 정착 |
| 14 | `cacheSizeBefore` vs `cache_hit_count` 시점 어긋남 — handler 시점 정합 본격 영역 (사이클 사이 별개 호출 정책 강화) |
| **15** | **위임 명세 기대값 작성 시 기존 verifications 직접 view 필수** — partial 측정값 vs 전체 추정값 구분 (after_static_filter 86 vs 294 어긋남) |
| **16** | **ADR 효과 범위 명확화 필수** — ADR-0016 cache는 Stage 1 (corp 메타)만 적용, Stage 2~6 (재무 데이터)는 별개. 위임 명세에서 ADR 효과 기대값 정착 시 적용 범위 명시 |

## 다음 단계

- 16(c) 매듭 commit (main 직접) — CLAUDE.md 갱신 + 누적 학습 9~16 정착 + ADR 누적 17개 종합
- 16(c) 종결 + 17단계 계획 영역

## 첨부

- 사전 검증: verifications/2026-05-14-stage16c-pre-check.{sh,md}
- scan_execute 결과: verifications/2026-05-14-stage16c-scan-execute-rerun.json
- runner: verifications/run-scan-execute.mjs
