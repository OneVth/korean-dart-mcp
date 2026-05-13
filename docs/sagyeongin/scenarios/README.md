# docs/sagyeongin/scenarios/

사경인 MCP 도구 사용자 흐름 본문 영역 record 정착.

## 영역 본질

사경인 14개 도구의 **실제 사용 흐름** (real use case) 시나리오 명세 + 실행 결과 + 분석 매듭을 정착하는 영역. 도구 동작 검증 (PASS/FAIL)과 사용자 의사결정 본문 (출력 가독성) 양쪽을 기록.

## verifications/ vs scenarios/ 분리

| 영역 | 본문 | 시점 |
|---|---|---|
| `docs/sagyeongin/verifications/` | *사전 검증* (pre-verification) — 도구 구현 *전* 가설/API 동작/raw response 검증 | **구현 사이클 진입 전** |
| `docs/sagyeongin/scenarios/` | *사용자 흐름 검증* (real use case e2e) — 도구 구현 *후* 통합 흐름 + 의사결정 본문 검증 | **도구 정착 후 사용 사이클** |
| `verifications/` (top-level) | runtime data (JSON/MD output, field-test JSON) | 도구 실행 결과 데이터 |

→ scenarios/는 *사전 검증 영역 X / runtime data 영역 X / 사용자 흐름 record 영역*.

## 구조 패턴

```
docs/sagyeongin/scenarios/
├── README.md                   # 본 문서
└── stage18-e2e/                # 각 사이클별 sub-directory
    ├── 00-scope.md             # 사이클 본질 + 측정 정의
    ├── 01-*.md, 02-*.md ...    # 시나리오 명세 (Claude 작성)
    ├── results/                # Onev MCP 등록 세션 실행 결과 회신
    │   └── 0N-*.md
    └── analysis.md             # Claude 검증 매듭 (PASS/FAIL + 가독성/의사결정)
```

## 명명 규칙

- 사이클 디렉토리: `stage{N}-{본질}/` (e.g. `stage18-e2e/`)
- 명세 파일: `0N-{본질}.md` (00-scope, 01, 02, ...)
- 결과 파일: `results/0N-{명세-동일-본질}.md` (명세 ↔ 결과 1:1)
- 분석 파일: `analysis.md` (사이클당 1건)

## 실행 영역 (MCP 도구 호출 본질)

scenarios/의 시나리오 실행은 **MCP 등록 Claude 세션** 영역 (Onev 환경 — Claude desktop 또는 별개 MCP 클라이언트). 본 fork artifact는 명세 + 결과 record + 분석 매듭이며, MCP 도구 호출은 본 영역 외 (학습 #18 정합).

## 정착 본문

각 사이클 종결 시:
1. 명세 + 결과 + 분석 본문 commit (feature branch 또는 main 직접)
2. CLAUDE.md `## 진행 영역` 갱신 (해당 사이클 cross-ref)
3. 학습 정착 (해당 시)

---

Ref: ADR-0001 (β-i 격리), philosophy 7부 F (스코프) + E (정밀 분석 진입 인터페이스)
