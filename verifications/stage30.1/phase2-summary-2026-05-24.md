# Stage 30.1 Phase 2 — 변경 내역 summary (2026-05-24)

## 목적

Phase 1 사후 검증 결판 (iii): `classifySignal` ternary에서 null이 falsy로 처리되어
`major_capex_unrelated_diversification` 분기됨 → 7부 C "긍정 발굴 우선" 본질 위반.
Phase 2에서 ADR-0027 정합 정정.

## commit chain (5ef510b 이후)

| commit | 내용 |
|--------|------|
| 5f37773 | docs(adr-0027): signature 정정 + blacklist '임대' 추가 + null 흡수 정책 명시 |
| 6fb2560 | fix(sagyeongin): classifySignal null 흡수 정책 정착 (ternary → if-else strict check) |
| b6fd0da | test(sagyeongin): signalName 분기 검증 신설 (null→existing, false→unrelated) |

## 핵심 변경

### ADR-0027 정정 3건 (5f37773)

1. §결정 signature: `(assetCategory, bsnsObjt, companyInduty)` → `(text: string, _induty_code?: string)`
2. §blacklist: 3건 → 4건 — `임대` standalone 추가 (case 12 한화리츠 커버)
3. §결과: null 흡수 정책 신규 명시 — `existingMatch === null` → `major_capex_existing_business`

### classifySignal 정정 (6fb2560)

FROM (ternary — null=false 흡수):
```typescript
signalName = existingMatch
  ? "major_capex_existing_business"
  : "major_capex_unrelated_diversification";
```

TO (if-else strict check — ADR-0027 §결과 정합):
```typescript
if (existingMatch === false) {
  signalName = "major_capex_unrelated_diversification";
} else {
  // true + null 모두 → 긍정 분기 (7부 C)
  signalName = "major_capex_existing_business";
}
```

### 테스트 추가 (b6fd0da)

- mapToSignalName 인라인 헬퍼 + signalName 분기 3건
- case 11 인콘 (null → existing_business) 명시 검증
- case 12 한화리츠 (false → unrelated_diversification) 명시 검증
- 회수 F 13건 regression 전체 유지 (285 tests, 0 fail)

## β-i 가드 확인

- `src/lib/` — 무변경
- `src/tools/index.ts` — 무변경

## field-test 예정 (phase 3 영역)

MCP 실제 호출 환경에서 `sagyeongin_capex_signal` 도구 호출 후 signalName 분기 확인.
대상: 인콘(468) + 한화리츠(68112) 실제 공시 응답.
