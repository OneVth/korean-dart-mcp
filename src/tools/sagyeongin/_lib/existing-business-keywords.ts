/**
 * Existing Business Keyword Matcher
 *
 * ADR-0027 정합. 7부 C 본질 ("긍정 발굴 + 케파 증설 vs 신규 분야") 정합.
 *
 * Matcher 함수 3건 export. Keyword list internal — Stage 30.x 보강 시 호출부 무변경.
 *
 * 분기 우선순위 (judgeExistingBusinessMatch 영역 chain):
 *   blacklist → (whitelist+null 동시 = mixed → null) → whitelist → null pattern → default null
 *
 * Keyword baseline: ADR-0027 §근거 + 회수 F 13건 직접 검증
 * Ref: ADR-0027, spec §10.16, verifications/stage30/tgast-inh-decsn-distribution-2026-05-22.md
 */

// Whitelist — 본 사업 확장 본질 (케파 증설 추정)
const WHITELIST_KEYWORDS = [
  "공장", // 직접 생산 시설 (case 1, 5)
  "제조", // 생산 시설 (case 5)
  "양산", // 글로벌/대량 생산 거점 (case 4)
  "연구개발", // R&D 시설 (case 5)
  "R&D", // 연구개발 시설 (case 11 — mixed 시 null 우선)
  "수요 증가 대응", // 본 사업 수요 직접 대응 (case 10)
];

// Blacklist — 비본업/신규 분야 (신규 분야 추정)
const BLACKLIST_KEYWORDS = [
  "임대수익", // 임대 수익 목적 (case 9)
  "투자수익", // 투자 수익 목적 (case 9)
  "사업다각화", // 신사업/다각화 명시
  "임대", // 임대 목적 포괄 (case 12: "부동산 임대를 통한 수익 창출")
];

// Null pattern — 판단 불가 (모호, 호출자 책임)
const NULL_PATTERN_KEYWORDS = [
  "사옥", // 본사 사옥 (case 3, 6, 8)
  "신사옥", // 신사옥 (case 6, 8, 11 — mixed)
  "업무 공간", // 일반 업무공간 (case 7, 13)
  "업무공간", // 축약형 (case 3)
  "물리적 공간", // 비특정 공간 (case 2)
  "공간 확보", // 목적 불명 (case 2, 13)
];

function matchKeywords(text: string, keywords: string[]): boolean {
  const normalized = (text ?? "").trim();
  if (!normalized) return false;
  return keywords.some((kw) => normalized.includes(kw));
}

/**
 * Whitelist matcher — 본 사업 확장 본질
 *
 * @param text — ast_sen + inh_pp 합본
 * @returns true if any whitelist keyword matched
 */
export function matchWhitelist(text: string): boolean {
  return matchKeywords(text, WHITELIST_KEYWORDS);
}

/**
 * Blacklist matcher — 비본업/신규 분야
 *
 * @param text — ast_sen + inh_pp 합본
 * @returns true if any blacklist keyword matched
 */
export function matchBlacklist(text: string): boolean {
  return matchKeywords(text, BLACKLIST_KEYWORDS);
}

/**
 * Null pattern matcher — 판단 불가 (사옥/업무공간/공간 계열)
 *
 * @param text — ast_sen + inh_pp 합본
 * @returns true if any null pattern keyword matched
 */
export function matchNullPattern(text: string): boolean {
  return matchKeywords(text, NULL_PATTERN_KEYWORDS);
}
