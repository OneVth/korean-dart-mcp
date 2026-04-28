/**
 * 사경인 도구 공용 설정 영속화 모듈.
 *
 * 책임: ~/.sagyeongin-dart/config.json 파일을 읽고 쓴다.
 * 도구별 도메인 로직(action 분기, 필드 검증)은 갖지 않는다 — 영속화 계층만.
 *
 * Ref: spec §6.1 (파일 위치), §6.2 (스키마), §6.3 (기본값 근거)
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export type WatchlistEntry = {
  corp_code: string;
  name: string;
  added_at: string; // ISO 8601 date (YYYY-MM-DD)
  tags: string[];
  notes?: string;
};

export type ScanPreset = {
  markets?: Array<"KOSPI" | "KOSDAQ">;
  included_industries?: string[];
  excluded_industries?: string[];
  excluded_name_patterns?: string[];
};

export type SagyeonginParameters = {
  insider_cluster_threshold: number;
  srim_required_return_override: number | null;
  srim_buy_price_basis: "fair" | "buy";
  dividend_payout_healthy_range: [number, number];
};

export type RequiredReturnCache = {
  last_fetched_at: string | null; // ISO 8601 datetime
  value: number | null;
  source: string;
};

export type SagyeonginConfig = {
  version: "0.1";
  watchlist: WatchlistEntry[];
  scan_presets: Record<string, ScanPreset>;
  active_preset: string;
  parameters: SagyeonginParameters;
  required_return_cache: RequiredReturnCache;
};

const DEFAULT_CONFIG: SagyeonginConfig = {
  version: "0.1",
  watchlist: [],
  scan_presets: {
    default: {
      markets: ["KOSPI", "KOSDAQ"],
      excluded_industries: [
        "64", "65", "66",
        "68",
        "35", "36", "37", "38",
        "41", "42",
        "50", "51",
        "55",
        "111", "112", "12", "5621",
        "91",
        "05", "06", "07", "08", "19",
        "5821", "59", "90", "92",
      ],
      excluded_name_patterns: [
        "투자회사", "투자조합", "기업인수목적", "스팩", "리츠", "REIT",
      ],
    },
  },
  active_preset: "default",
  parameters: {
    insider_cluster_threshold: 2,
    srim_required_return_override: null,
    srim_buy_price_basis: "fair",
    dividend_payout_healthy_range: [0.20, 0.40],
  },
  required_return_cache: {
    last_fetched_at: null,
    value: null,
    source: "kisrating.com BBB- 5Y",
  },
};

function getConfigDir(): string {
  return process.env.SAGYEONGIN_CONFIG_DIR ?? path.join(os.homedir(), ".sagyeongin-dart");
}

function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

function mergeWithDefaults(parsed: Record<string, unknown>): SagyeonginConfig {
  const d = DEFAULT_CONFIG;

  const watchlist = parsed.watchlist !== undefined
    ? (parsed.watchlist as WatchlistEntry[])
    : structuredClone(d.watchlist);

  const scan_presets = parsed.scan_presets !== undefined
    ? (parsed.scan_presets as Record<string, ScanPreset>)
    : structuredClone(d.scan_presets);

  const active_preset = parsed.active_preset !== undefined
    ? (parsed.active_preset as string)
    : d.active_preset;

  const rawParams = parsed.parameters as Record<string, unknown> | undefined;
  const parameters: SagyeonginParameters = rawParams === undefined
    ? structuredClone(d.parameters)
    : {
        insider_cluster_threshold: rawParams.insider_cluster_threshold !== undefined
          ? (rawParams.insider_cluster_threshold as number)
          : d.parameters.insider_cluster_threshold,
        srim_required_return_override: rawParams.srim_required_return_override !== undefined
          ? (rawParams.srim_required_return_override as number | null)
          : d.parameters.srim_required_return_override,
        srim_buy_price_basis: rawParams.srim_buy_price_basis !== undefined
          ? (rawParams.srim_buy_price_basis as "fair" | "buy")
          : d.parameters.srim_buy_price_basis,
        dividend_payout_healthy_range: rawParams.dividend_payout_healthy_range !== undefined
          ? (rawParams.dividend_payout_healthy_range as [number, number])
          : d.parameters.dividend_payout_healthy_range,
      };

  const rawCache = parsed.required_return_cache as Record<string, unknown> | undefined;
  const required_return_cache: RequiredReturnCache = rawCache === undefined
    ? structuredClone(d.required_return_cache)
    : {
        last_fetched_at: rawCache.last_fetched_at !== undefined
          ? (rawCache.last_fetched_at as string | null)
          : d.required_return_cache.last_fetched_at,
        value: rawCache.value !== undefined
          ? (rawCache.value as number | null)
          : d.required_return_cache.value,
        source: rawCache.source !== undefined
          ? (rawCache.source as string)
          : d.required_return_cache.source,
      };

  return structuredClone({
    version: "0.1" as const,
    watchlist,
    scan_presets,
    active_preset,
    parameters,
    required_return_cache,
  });
}

export async function loadConfig(): Promise<SagyeonginConfig> {
  const configPath = getConfigPath();

  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return structuredClone(DEFAULT_CONFIG);
    }
    throw e;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`config.json 파싱 실패: ${e}. 파일 경로: ${configPath}. 수동 확인 필요.`);
  }

  if (parsed.version !== "0.1") {
    throw new Error(`지원되지 않는 config 버전: ${parsed.version}. 현재 지원 버전: 0.1.`);
  }

  return mergeWithDefaults(parsed);
}

export async function saveConfig(config: SagyeonginConfig): Promise<void> {
  const configDir = getConfigDir();
  await fs.mkdir(configDir, { recursive: true });
  const configPath = getConfigPath();
  const tmpPath = configPath + ".tmp";
  await fs.writeFile(tmpPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  await fs.rename(tmpPath, configPath);
}
