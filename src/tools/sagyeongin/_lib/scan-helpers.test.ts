/**
 * scan-helpers 단위 테스트.
 *
 * 영역 본질:
 * - filterUniverse: 빈 config / 빈 배열 / 단일 pattern / 다중 pattern / 부분 매칭
 * - estimateApiCalls: 0 universe / typical (1500) / 분기 합산 정합 / custom pass rate
 * - calculateDailyLimitUsagePct: 0 calls / DAILY_LIMIT 정합 / over DAILY_LIMIT / 소수 1자리
 *
 * loadListedCompanies는 I/O 영역 — 단위 테스트 0, field-test 영역 검증.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  filterUniverse,
  estimateApiCalls,
  calculateDailyLimitUsagePct,
  shuffleWithSeed,
  isMarketMatch,
  isIndustryMatch,
  splitUniverseByCacheAndFilter,
  CACHE_COVERAGE_WARM_THRESHOLD_PCT,
  KILLER_PASS_RATE_DEFAULT,
  SRIM_PASS_RATE_DEFAULT,
  type ListedCompany,
} from "./scan-helpers.js";
import { setCorpMeta } from "./corp-meta-cache.js";

const SAMPLE: ListedCompany[] = [
  { corp_code: "00126380", corp_name: "삼성전자", stock_code: "005930" },
  { corp_code: "00164742", corp_name: "현대자동차", stock_code: "005380" },
  { corp_code: "01234567", corp_name: "ABC스팩1호", stock_code: "999991" },
  { corp_code: "02345678", corp_name: "한국리츠", stock_code: "999992" },
  { corp_code: "03456789", corp_name: "투자회사X", stock_code: "999993" },
];

test("filterUniverse: 빈 pattern → 전체 반환", () => {
  const result = filterUniverse(SAMPLE, {});
  assert.equal(result.length, 5);
});

test("filterUniverse: 빈 pattern 배열 → 전체 반환", () => {
  const result = filterUniverse(SAMPLE, { excluded_name_patterns: [] });
  assert.equal(result.length, 5);
});

test("filterUniverse: 단일 pattern 매칭", () => {
  const result = filterUniverse(SAMPLE, { excluded_name_patterns: ["스팩"] });
  assert.equal(result.length, 4);
  assert.ok(!result.some((r) => r.corp_name.includes("스팩")));
});

test("filterUniverse: 다중 pattern (default preset 정합)", () => {
  const result = filterUniverse(SAMPLE, {
    excluded_name_patterns: ["투자회사", "스팩", "리츠", "REIT"],
  });
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((r) => r.corp_name),
    ["삼성전자", "현대자동차"],
  );
});

test("filterUniverse: 부분 매칭 (substring 본질)", () => {
  const result = filterUniverse(SAMPLE, { excluded_name_patterns: ["전자"] });
  assert.equal(result.length, 4);
  assert.ok(!result.some((r) => r.corp_name === "삼성전자"));
});

test("isMarketMatch: undefined markets → 전체 통과", () => {
  assert.equal(isMarketMatch("Y", undefined), true);
  assert.equal(isMarketMatch("K", undefined), true);
  assert.equal(isMarketMatch("N", undefined), true);
});

test("isMarketMatch: 빈 markets [] → 전체 통과", () => {
  assert.equal(isMarketMatch("Y", []), true);
  assert.equal(isMarketMatch("K", []), true);
});

test("isMarketMatch: KOSPI 단일 — Y 통과 K/N 차단", () => {
  assert.equal(isMarketMatch("Y", ["KOSPI"]), true);
  assert.equal(isMarketMatch("K", ["KOSPI"]), false);
  assert.equal(isMarketMatch("N", ["KOSPI"]), false);
});

test("isMarketMatch: KOSDAQ 단일 — K 통과 Y/N 차단", () => {
  assert.equal(isMarketMatch("K", ["KOSDAQ"]), true);
  assert.equal(isMarketMatch("Y", ["KOSDAQ"]), false);
  assert.equal(isMarketMatch("N", ["KOSDAQ"]), false);
});

test("isMarketMatch: KOSPI+KOSDAQ 둘 다 — Y/K 통과, N 차단", () => {
  assert.equal(isMarketMatch("Y", ["KOSPI", "KOSDAQ"]), true);
  assert.equal(isMarketMatch("K", ["KOSPI", "KOSDAQ"]), true);
  assert.equal(isMarketMatch("N", ["KOSPI", "KOSDAQ"]), false);
});

test("isIndustryMatch: included/excluded 둘 다 undefined → 전체 통과", () => {
  assert.equal(isIndustryMatch("264220", undefined, undefined), true);
  assert.equal(isIndustryMatch("64", undefined, undefined), true);
});

test("isIndustryMatch: included only — prefix 매칭 true", () => {
  assert.equal(isIndustryMatch("264220", ["26"], undefined), true);
  assert.equal(isIndustryMatch("27", ["26", "27"], undefined), true);
});

test("isIndustryMatch: included only — 미매칭 false", () => {
  assert.equal(isIndustryMatch("64", ["26"], undefined), false);
});

test("isIndustryMatch: excluded only — 매칭 false", () => {
  assert.equal(isIndustryMatch("64", undefined, ["64", "65"]), false);
  assert.equal(isIndustryMatch("641100", undefined, ["64"]), false);
});

test("isIndustryMatch: excluded only — 미매칭 true", () => {
  assert.equal(isIndustryMatch("264220", undefined, ["64"]), true);
});

test("isIndustryMatch: excluded + included 둘 다 — excluded 우선 false", () => {
  assert.equal(isIndustryMatch("641100", ["64"], ["641"]), false);
});

test("isIndustryMatch: prefix 매칭 정합 — '26'이 '264220' 매칭", () => {
  assert.equal(isIndustryMatch("264220", ["26"], undefined), true);
  assert.equal(isIndustryMatch("265100", ["26"], undefined), true);
});

test("isIndustryMatch: 빈 included [] → 전체 통과 (filterUniverse 양식 정합)", () => {
  assert.equal(isIndustryMatch("64", [], undefined), true);
});

test("isIndustryMatch: 빈 excluded [] → 전체 통과", () => {
  assert.equal(isIndustryMatch("64", undefined, []), true);
});

test("estimateApiCalls: 0 universe → 모든 분기 0", () => {
  const result = estimateApiCalls(0);
  assert.equal(result.stage1_company_resolution, 0);
  assert.equal(result.stage2_killer, 0);
  assert.equal(result.stage3_srim, 0);
  assert.equal(result.stage4_5_6_tags, 0);
  assert.equal(result.total, 0);
});

test("estimateApiCalls: typical universe 1500 (default preset 영역)", () => {
  const result = estimateApiCalls(1500);
  assert.equal(result.stage1_company_resolution, 1500);
  assert.equal(result.stage2_killer, 4500);
  // killer pass = 1500 × 0.8 = 1200 → stage3 = 1200 × 4 = 4800
  assert.equal(result.stage3_srim, 4800);
  // srim pass = 1200 × 0.33 = 396 → stage4_5_6 = 396 × 7 = 2772
  assert.equal(result.stage4_5_6_tags, 2772);
  assert.equal(result.total, 1500 + 4500 + 4800 + 2772);
});

test("estimateApiCalls: 분기 합산 정합", () => {
  const result = estimateApiCalls(237);
  const sum =
    result.stage1_company_resolution +
    result.stage2_killer +
    result.stage3_srim +
    result.stage4_5_6_tags;
  // Math.round 영역 ±1 허용 (반올림 영역 본질)
  assert.ok(Math.abs(result.total - sum) <= 1);
});

test("estimateApiCalls: custom pass rate 영역", () => {
  const result = estimateApiCalls(1000, { killerPassRate: 1.0, srimPassRate: 1.0 });
  // 모든 종목 통과 영역 — stage2 = 3000, stage3 = 4000, stage4_5_6 = 7000
  assert.equal(result.stage2_killer, 3000);
  assert.equal(result.stage3_srim, 4000);
  assert.equal(result.stage4_5_6_tags, 7000);
});

test("estimateApiCalls: cacheHitCount 차감 — stage1 only", () => {
  // universe 1000, cache 200 적중 → effectiveUniverse 800 → stage1 = 800
  const result = estimateApiCalls(1000, { cacheHitCount: 200 });
  assert.equal(result.stage1_company_resolution, 800);
  // stage2~6은 full universe 기준 불변
  assert.equal(result.stage2_killer, 3000);
});

test("calculateDailyLimitUsagePct: 0 calls → 0%", () => {
  assert.equal(calculateDailyLimitUsagePct(0), 0);
});

test("calculateDailyLimitUsagePct: DAILY_LIMIT(20000) → 100%", () => {
  assert.equal(calculateDailyLimitUsagePct(20000), 100);
});

test("calculateDailyLimitUsagePct: over DAILY_LIMIT → 100% 초과 자연", () => {
  const result = calculateDailyLimitUsagePct(30000);
  assert.equal(result, 150);
});

test("calculateDailyLimitUsagePct: 소수 1자리 영역", () => {
  const result = calculateDailyLimitUsagePct(2456);
  // 2456/20000 = 0.1228 → 12.28% → 12.3%
  assert.equal(result, 12.3);
});

test("default 상수 정합", () => {
  assert.equal(KILLER_PASS_RATE_DEFAULT, 0.8);
  assert.equal(SRIM_PASS_RATE_DEFAULT, 0.33);
  assert.equal(CACHE_COVERAGE_WARM_THRESHOLD_PCT, 50);
});

test("shuffleWithSeed: 시드 고정 → 두 번 호출 결과 동일 (결정론)", () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const r1 = shuffleWithSeed(arr, 42);
  const r2 = shuffleWithSeed(arr, 42);
  assert.deepEqual(r1, r2);
  assert.deepEqual(arr, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.notDeepEqual(r1, arr);
});

test("shuffleWithSeed: 시드 미지정 → 두 번 호출 결과 다름 (무작위)", () => {
  // 충분히 큰 배열에서 두 번 무작위 shuffle이 동일할 확률은 1/n! — n=20에서 ~4e-19
  const arr = Array.from({ length: 20 }, (_, i) => i);
  const r1 = shuffleWithSeed(arr);
  const r2 = shuffleWithSeed(arr);
  assert.notDeepEqual(r1, r2);
});

test("shuffleWithSeed: edge — 빈 배열 / 단일 원소 → 동일 반환", () => {
  assert.deepEqual(shuffleWithSeed([]), []);
  assert.deepEqual(shuffleWithSeed([], 42), []);
  assert.deepEqual(shuffleWithSeed([42]), [42]);
  assert.deepEqual(shuffleWithSeed([42], 7), [42]);
});

describe("splitUniverseByCacheAndFilter", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sagyeongin-split-"));
    process.env.SAGYEONGIN_CONFIG_DIR = tmpDir;
  });

  afterEach(async () => {
    delete process.env.SAGYEONGIN_CONFIG_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function mkCompany(corp_code: string, corp_name = "테스트회사"): ListedCompany {
    return { corp_code, corp_name, stock_code: "000000" };
  }

  function mkMetaRecord(corp_code: string, corp_cls: string, induty_code: string) {
    return {
      corp_code,
      induty_code,
      corp_cls,
      modify_date: "20260101",
      fetched_at: new Date().toISOString(),
    };
  }

  test("빈 universe → matched_cached_count 0, cache_miss_count 0", () => {
    const result = splitUniverseByCacheAndFilter([], {});
    assert.equal(result.matched_cached_count, 0);
    assert.equal(result.cache_miss_count, 0);
  });

  test("전 cache miss — universe 전체 cache_miss_count로", () => {
    const universe = [
      mkCompany("00000001"),
      mkCompany("00000002"),
      mkCompany("00000003"),
    ];
    const result = splitUniverseByCacheAndFilter(universe, {});
    assert.equal(result.matched_cached_count, 0);
    assert.equal(result.cache_miss_count, 3);
  });

  test("전 cache hit + 필터 미지정 → 전 matched_cached_count로", () => {
    setCorpMeta(mkMetaRecord("00000001", "Y", "26110"));
    setCorpMeta(mkMetaRecord("00000002", "K", "27290"));
    const universe = [mkCompany("00000001"), mkCompany("00000002")];
    const result = splitUniverseByCacheAndFilter(universe, {});
    assert.equal(result.matched_cached_count, 2);
    assert.equal(result.cache_miss_count, 0);
  });

  test("cache hit + markets 필터 — KOSPI 단일", () => {
    setCorpMeta(mkMetaRecord("00000001", "Y", "26110")); // KOSPI
    setCorpMeta(mkMetaRecord("00000002", "K", "27290")); // KOSDAQ
    setCorpMeta(mkMetaRecord("00000003", "N", "26110")); // 양쪽 아님
    const universe = [
      mkCompany("00000001"),
      mkCompany("00000002"),
      mkCompany("00000003"),
    ];
    const result = splitUniverseByCacheAndFilter(universe, { markets: ["KOSPI"] });
    assert.equal(result.matched_cached_count, 1);
    assert.equal(result.cache_miss_count, 0);
  });

  test("cache hit + excluded industry 필터", () => {
    setCorpMeta(mkMetaRecord("00000001", "Y", "26110")); // 통과
    setCorpMeta(mkMetaRecord("00000002", "Y", "64190")); // excluded "64" 매칭 → 탈락
    setCorpMeta(mkMetaRecord("00000003", "Y", "27290")); // 통과
    const universe = [
      mkCompany("00000001"),
      mkCompany("00000002"),
      mkCompany("00000003"),
    ];
    const result = splitUniverseByCacheAndFilter(universe, { excluded: ["64"] });
    assert.equal(result.matched_cached_count, 2);
    assert.equal(result.cache_miss_count, 0);
  });

  test("cache hit + included industry 필터", () => {
    setCorpMeta(mkMetaRecord("00000001", "Y", "26110"));
    setCorpMeta(mkMetaRecord("00000002", "Y", "27290"));
    setCorpMeta(mkMetaRecord("00000003", "Y", "64190"));
    const universe = [
      mkCompany("00000001"),
      mkCompany("00000002"),
      mkCompany("00000003"),
    ];
    const result = splitUniverseByCacheAndFilter(universe, {
      included: ["26", "27"],
    });
    assert.equal(result.matched_cached_count, 2);
    assert.equal(result.cache_miss_count, 0);
  });

  test("혼합 — cache hit 통과(H') + cache hit 탈락(H'') + cache miss(M)", () => {
    setCorpMeta(mkMetaRecord("00000001", "Y", "26110")); // hit 통과 → H'
    setCorpMeta(mkMetaRecord("00000002", "Y", "64190")); // hit 탈락(excluded) → H'' (반환에 없음)
    // 00000003 cache miss → M
    const universe = [
      mkCompany("00000001"),
      mkCompany("00000002"),
      mkCompany("00000003"),
    ];
    const result = splitUniverseByCacheAndFilter(universe, { excluded: ["64"] });
    assert.equal(result.matched_cached_count, 1); // H'
    assert.equal(result.cache_miss_count, 1); // M
    // H'' = 1은 반환에 없음 (universe.length − H' − M = 3 − 1 − 1 = 1)
  });

  test("excluded + included 둘 다 — excluded 우선 (isIndustryMatch 위임 정합)", () => {
    setCorpMeta(mkMetaRecord("00000001", "Y", "641100")); // included "64" 매칭이지만 excluded "641" 매칭 → 탈락
    setCorpMeta(mkMetaRecord("00000002", "Y", "642100")); // included "64" 매칭, excluded "641" 미매칭 → 통과
    const universe = [mkCompany("00000001"), mkCompany("00000002")];
    const result = splitUniverseByCacheAndFilter(universe, {
      included: ["64"],
      excluded: ["641"],
    });
    assert.equal(result.matched_cached_count, 1);
    assert.equal(result.cache_miss_count, 0);
  });

  test("cache miss + markets 지정 — miss 분 보수적 전부 통과 가정 (필터 무관)", () => {
    // cache miss 분은 induty_code 불명 → 보수적 "전부 통과 가정"이라 markets 필터 적용 부재.
    // 단 본 함수는 단순히 cache_miss_count만 증가시킴 — 필터 적용 fn 호출 0.
    const universe = [mkCompany("00000001"), mkCompany("00000002")];
    const result = splitUniverseByCacheAndFilter(universe, { markets: ["KOSPI"] });
    assert.equal(result.matched_cached_count, 0);
    assert.equal(result.cache_miss_count, 2);
  });
});
