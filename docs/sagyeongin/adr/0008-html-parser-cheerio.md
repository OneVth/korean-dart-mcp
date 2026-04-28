# 0008 - HTML 파서 도입 (cheerio)

- 상태: Accepted
- 결정일: 2026-04-28
- 결정자: 사용자 + Claude

## 컨텍스트

3단계 `feat/srim-stack`에서 두 외부 페이지를 스크래핑한다 — 한국신용평가(kisrating.com)에서 BBB- 5Y 채권 수익률, 네이버 금융에서 종목 현재가. 두 모듈은 ADR-0001 디렉토리 구조의 `src/tools/sagyeongin/_lib/kis-rating-scraper.ts` / `naver-price.ts`로 위치 확정.

spec §10.5 642줄에 "HTML 파싱은 JSDOM 또는 cheerio 사용 고려 (korean-dart-mcp의 기존 의존성과 호환성 확인)"이 유일 명시. 어느 라이브러리를 채택할지는 spec/ADR 어디에도 결정 없음. 묶음 2(두 스크래퍼) 시작 전에 결정 필요.

upstream `package.json` 확인 결과:
- cheerio, jsdom 둘 다 부재
- 기존 dependencies에 `@xmldom/xmldom` ^0.9.8 (XML DOM 파서, DART XBRL 처리용 추정), `pdfjs-dist` ^4.10.38 (PDF 파싱) 존재
- `"type": "module"` (ESM)

## 고려한 옵션

- **cheerio ^1.0.0** — jQuery 셀렉터, 정적 HTML 전용, ~2MB
- **JSDOM** — 표준 DOM 완전 구현, JS 실행 가능, ~10MB+
- **@xmldom/xmldom 재사용** — 이미 fork에 존재 (의존성 +0)
- **정규식** — 의존성 0

## 결정

**cheerio ^1.0.0 채택. `package.json`의 `dependencies` (production)에 추가.**

근거 사용처:
- `src/tools/sagyeongin/_lib/kis-rating-scraper.ts`
- `src/tools/sagyeongin/_lib/naver-price.ts`

> *2026-04-28 install 결과: npm semver 해결로 cheerio 1.2.0 lock. ^1.x 의도 정합. 실제 `package.json` 추가 위치는 알파벳 순(better-sqlite3 다음, commander 앞) — ADR 본문 "끝부분" 표기는 일반 정신("사경인 변경이 분리되어 충돌 면 작음") 영역으로 해석.*

## 근거

### cheerio가 채택된 이유

spec §10.5 642줄이 두 후보(JSDOM, cheerio)를 동급으로 제시했지만, 이번 작업은 두 정적 HTML 페이지에서 각각 한두 개의 셀렉터를 뽑는 단순 작업이다. JSDOM의 표준 DOM 완전 구현 + JS 실행은 과잉이며, 무게(~10MB+)도 부담.

cheerio 1.0.0(2024 stable)은 ESM 완전 지원으로 fork의 `"type": "module"`과 자연 호환. jQuery 셀렉터 표현력은 단순 셀렉터부터 복잡한 nth-child/has 등까지 충분.

### @xmldom/xmldom 재사용이 거부된 이유

`@xmldom/xmldom`은 XML 파서이며 XML well-formed 가정이 강함. 실제 웹 HTML5(특히 네이버 같은 큰 사이트)는 비정상 종료 태그, 따옴표 없는 속성, 자체 닫힘 태그 등을 흔히 포함하고, XML 파서는 이런 입력에서 throw하거나 잘못된 트리를 만든다. HTML5 전용 파서가 안전.

### 정규식이 거부된 이유

의존성 0의 매력은 있으나, ADR-0003 40줄 `smoke-scrapers.mjs`("페이지 구조 살아있는지 확인")의 깨짐 빈도를 정규식이 가장 자주 만든다. 디버깅 비용 ↑, 페이지 변경 시 셀렉터 변경보다 정규식 패턴 변경이 어려움.

### ADR-0001 격리 정신과의 정합

ADR-0001의 격리 본질은 "upstream 머지 충돌 면 최소화"다. 신규 npm 의존성은 `package.json`의 `dependencies` 객체 안 한 줄 추가 + `package-lock.json` 갱신.

- `package.json`은 upstream에서 빈번히 수정되는 영역이 아님 (원작자 30 커밋 중 dep 변경은 소수)
- 우리 추가가 항상 `dependencies` 객체 끝부분이라 git auto-merge가 보통 처리
- 이미 fork에 `pdfjs-dist`(수 MB) 같은 무거운 dep이 존재 — "새 dep = 격리 위배" 절대 기준 없음

따라서 ADR-0001 격리 정신과 충돌 없음.

### dependencies vs devDependencies

런타임 영역. `kis-rating-scraper.ts`와 `naver-price.ts`는 사용자가 도구 호출 시 실행되는 production 코드 — `dependencies`에 위치 정확.

## 결과

### 좋은 점

- jQuery 셀렉터로 페이지 구조 변경 시 셀렉터 한 줄 수정으로 대응
- ESM 호환, fork `"type": "module"`과 자연 통합
- ADR-0003 `smoke-scrapers.mjs` 깨짐 빈도 ↓ — 정규식 대비 셀렉터 안정성
- 정적 HTML 작업에 충분, JSDOM의 무게 회피

### 트레이드오프

- 새 production 의존성 1개 (~2MB). fork 빌드/설치 시간 미세 증가
- upstream sync 시 `package.json` 충돌 가능성. 단 우리 추가가 항상 dep 객체 끝부분이라 거의 자동 처리
- JS 렌더링 페이지(SPA) 대응 불가. 두 대상 페이지(kisrating, 네이버 금융)는 정적이라 영향 없음

### 미래 변경 시 영향

- 페이지 구조 변경 시 영향은 각 스크래퍼 안에서 격리 — 한 모듈 셀렉터만 수정
- 새 외부 스크래핑 추가 시 동일 라이브러리 재사용 (의존성 +0)
- **JSDOM 도입이 정당화되는 시점** — 동적 페이지(JS 렌더링) 스크래핑 필요 발생, 또는 cheerio가 처리 못 하는 표준 DOM API 필요. 그때 ADR 갱신
- spec §11.3 "외부 데이터 의존성" 표는 데이터 소스 의존성 표라 갱신 불필요. npm 의존성은 별개 영역

## 참조

- spec §10.5 642줄 (HTML 파싱 명시 — JSDOM 또는 cheerio "사용 고려")
- spec §11.3 (외부 데이터 의존성 표 — kisrating, 네이버)
- ADR-0001 (격리 정신 — `_lib` 위치)
- ADR-0003 (`smoke-scrapers.mjs` 책임)
- 사용처 (예정): `src/tools/sagyeongin/_lib/kis-rating-scraper.ts`, `src/tools/sagyeongin/_lib/naver-price.ts`
- upstream `package.json` 확인 (2026-04-28 세션, cheerio/jsdom 둘 다 부재 확인)
