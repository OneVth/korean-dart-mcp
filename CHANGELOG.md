# Changelog

## [0.2.0] - 2026-04-18

P1 릴리스 — 8/15 도구 완성. enum 압축 핵심 도구 `get_periodic_report` 포함.

### Added
- **`get_full_financials`**: 전체 재무제표(BS/IS/CF/CIS/SCE 수백 행). `fs` 로 연결(CFS)/별도(OFS) 선택.
- **`download_document`**: 공시 원문 XML(DART 전용 마크업) ZIP 해제 → UTF-8 텍스트. 대형 보고서 `truncate_at` 절단 (기본 10만 자).
- **`get_xbrl`**: XBRL 원본 ZIP 을 `~/.korean-dart-mcp/xbrl/{rcept_no}_{reprt_code}/` 로 해제. 파싱 없이 원본 경로 반환 — Claude 가 직접 파일 업로드해 임의 집계하는 패턴 지원.
- **`get_periodic_report`**: 사업보고서 29개 섹션(주주·임직원·보수·감사인·배당·자기주식·채권·자금사용 등)을 `report_type` enum 단일화. OpenDartReader 매핑 기반.
- `iconv-lite` 의존성 추가 (원문 XML 의 EUC-KR 인코딩 대응 예비)

### Fixed
- `DartClient.getZip` 가 DART 에러 응답(JSON/HTML)을 ZIP 으로 받아 파싱 실패하던 문제 — PK 매직 넘버 검사 + JSON 에러 파싱 추가
- `get_xbrl` 엔드포인트 `xbrl.xml` → `fnlttXbrl.xml` 로 수정

### Verified
- 삼성전자 2023 사업보고서 원문 6MB XML 정상 추출, XBRL 8개 파일(.xbrl/.xsd/lab/pre/cal/def) 총 20MB+ 정상 해제
- `get_periodic_report` 로 배당·최대주주·회계감사 섹션 교차 검증 완료

## [0.1.0] - 2026-04-18

초기 릴리스 — P0 MVP. 4개 도구 + corp_code 자동 해결.

### Added
- **corp_code 자동 해결**: 서버 기동 시 OpenDART `corpCode.xml` 전량(≈11.6만 건)을 내려받아 SQLite 에 선적재. 24시간 TTL, `~/.korean-dart-mcp/corp_code.sqlite` 캐시. 회사명·6자리 종목코드·8자리 corp_code 어느 것으로 넘겨도 자동 해석.
- **`resolve_corp_code`**: 회사명 → 후보 리스트 (상장사 / 완전일치 / 짧은 이름 순)
- **`search_disclosures`**: DART 공시 목록. 10개 공시유형 `kind` enum(periodic/major/issuance/holdings/audit/…), 기본 최근 3개월 자동.
- **`get_company`**: 기업 개황 (업종·대표자·설립일·홈페이지 등)
- **`get_financials`**: 단일사 → `fnlttSinglAcnt`, 다중사(≥2) → `fnlttMultiAcnt` 자동 분기. 보고서 종류 `q1/half/q3/annual` enum.

### Architecture
- zod 스키마 → JSON Schema 자동 변환 (`z.toJSONSchema({ io: "input" })`) — `default()` 필드는 required 에서 제외되어 MCP 클라이언트 호환성 향상
- 도구별 파일 분리 (`src/tools/<tool>.ts`), 공용 유틸은 `_helpers.ts` 로
- MCP 서버가 첫 툴 호출 직전까지 `resolver.init()` 프라미스를 대기 — 기동 지연 없이 첫 요청만 ≤5s 초기화 비용

### Security
- `.env.example` 에서 실제 API 키 제거 (placeholder 만 유지), 실제 키는 `.env` 로 이전 (`.gitignore` 이미 포함)

### 미구현 (P1 예정)
- `download_document`, `get_full_financials`, `get_xbrl`, `get_periodic_report`
