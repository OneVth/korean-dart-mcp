# 14단계 (b) 묶음 3 watchlist 통합 검증

- 일자: 2026-05-08
- baseline: `origin/main` HEAD `aba11cf` (묶음 2 머지)
- 검증자: Claude Code (Onev 환경 — Korean IP, OpenDART API key)
- 목적: 13단계 묶음 3 unknown 8건 corp 재실행 — 묶음 1 (se 정정) + 묶음 2 (data_incomplete 분류) 통합 효과 실측

## 호출

`sagyeongin_watchlist_check` 직접 호출 (`check_level: "full"`, 8건 corp_code).

```js
tool.handler({
  check_level: "full",
  corp_codes: [
    "00126371", "00226352", "00525934", "00819374",
    "00447575", "01015160", "01137903", "01035368"
  ]
}, ctx)
```

## 결과 — corp별 분류 변화

| # | corp_name | corp_code | 13단계 결과 | 14단계 srim verdict | 14단계 overall_flag | skip_reason (잔존 시) |
|---|---|---|---|---|---|---|
| 1 | 삼성전기 | 00126371 | unknown (shares_outstanding not found) | SELL | normal | — |
| 2 | 케이엠더블유 | 00226352 | unknown | null (prices ≤0, ADR-0013) | attention | — |
| 3 | LX세미콘 | 00525934 | unknown | BUY | attention (dividend D) | — |
| 4 | 나무가 | 00819374 | unknown | SELL | normal | — |
| 5 | 제이앤티씨 | 00447575 | unknown | null (prices ≤0, ADR-0013) | normal | — |
| 6 | PS일렉트로닉스 | 01015160 | unknown | SELL | normal | — |
| 7 | 디케이티 | 01137903 | unknown | SELL | normal | — |
| 8 | 티에프이 | 01035368 | unknown | SELL | normal | — |

## 분류 카운트 변화

| 분류 | 13단계 | 14단계 | 변화 |
|---|---|---|---|
| srim verdict 정상 (≠null) | 0/8 | 6/8 | +6 |
| srim verdict null (ADR-0013 정상 경로 — prices ≤0) | 0/8 | 2/8 | +2 |
| skip — unknown | 8/8 | 0/8 | −8 |
| skip — data_incomplete | 0/8 | 0/8 | 0 (패일세이프 미발동) |

## 시나리오 판정: A-variant

**A (best case, X=8)** 에 해당 — se 정정으로 8/8 unknown 완전 해소.

단, 6/8만 non-null verdict (SELL×5, BUY×1). 나머지 2건 (케이엠더블유, 제이앤티씨)은 srim verdict null — **skip이 아니라 ADR-0013 정상 경로**: `shares_outstanding` 취득 성공 + srim 계산 실행 + 계산된 prices ≤0 (음수 자본 또는 ROE 극단 적자). 데이터 문제가 아닌 수학적 무효 결과.

data_incomplete 분류 키 진입 0 — 묶음 2 직접 효과 본 표본에서 0이지만 **패일세이프 효과 자체 의미 있음** (financial-extractor 5종 throw 발생 시 흡수 준비 완료).

## 결론

**se 정정 (묶음 1) 단독으로 8/8 unknown 완전 해소.** 13단계 묶음 3 field-test의 `shares_outstanding not found` 8건 전원 — `se === "보통주"` 정확 매치 → `includes("보통주") || includes("의결권 있는")` 헬퍼 정정으로 복구.

srim 복구 후 verdict 분포: SELL 5건 / BUY 1건 / verdict null (ADR-0013) 2건. verdict null 2건은 데이터 문제가 아닌 재무적 근거 (음수 가격 계산) — ADR-0013 spec 정합.

data_incomplete 분류 (묶음 2): 본 표본에서 미발동 — 패일세이프 포지션 확인. financial-extractor 5종 throw 발생 corp가 있을 경우 `data_incomplete` 로 분류 준비 완료.

---

## 참고

- 사전 검증: `feat/stage14-pre-verify` HEAD `67d5837`
- 묶음 1 머지: `93dd670` (se 정정)
- 묶음 2 머지: `aba11cf` (data_incomplete 분류)
- 13단계 묶음 3 field-test: `verifications/2026-05-07-stage13-field-test.md` (8건 unknown 발견 위치)
- ADR-0013: `docs/sagyeongin/adr/0013-srim-null-on-invalid.md` (verdict null 정상 경로 정의)
