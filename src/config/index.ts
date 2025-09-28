// src/config/index.ts
/**
 * .env-first configuration loader with strict validation and stable summaries.
 * - Provider precedence (highest → lowest): RPC_PROVIDERS, RPC_HTTP_LIST, RPC_HTTP_URLS, RPCS
 * - Optional legacy keys only if LEGACY_RPC_KEYS_ENABLED=true:
 *     PRIMARY_RPC_HTTP, RPC_HTTP, INFURA_URL
 * - Will throw a standardized error if no RPC providers are configured.
 * - Strict bounds validation to satisfy tests that expect throws.
 */

import fs from 'fs';

export type Network = 'mainnet' | 'goerli' | 'sepolia' | string;

export interface RpcEndpoint {
  url: string;
  weight: number;
}

export interface Config {
  DRY_RUN: boolean;
  NETWORK: Network;

  // normalized endpoints
  RPC_HTTP_LIST: RpcEndpoint[];

  // legacy optional single endpoints (only used if LEGACY_RPC_KEYS_ENABLED=true)
  ERIGON_RPC_HTTP?: string | undefined;
  FALLBACK_RPC_HTTP?: string | undefined;

  MIN_PROFIT_USD: number;
  MIN_PROFIT_ETH: number;

  CAPTURE_FRACTION: number;
  INCLUSION_PROBABILITY: number;

  GAS_BASEFEE_BUMP: number;           // also exposed as summary alias gasBaseFeeMultiplier
  PRIORITY_FEE_GWEI_MIN: number;
  PRIORITY_FEE_GWEI_MAX: number;
  MAX_PRIORITY_FEE_GWEI?: number | undefined;

  FLASHBOTS_RPC_URL?: string | undefined;
  SIM_TIMEOUT_MS: number;

  METRICS_PORT: number;

  PRIVATE_KEY?: string | undefined;

  // Maintain compatibility with existing tests
  LOG_LEVEL: string;
  RPC_PROVIDERS?: RpcEndpoint[] | undefined;
  PRIMARY_RPC_HTTP?: string | undefined;
}

/** helpers */
function parseBool(raw?: string | null | undefined, defaultVal = true): boolean {
  if (raw === undefined || raw === null) return defaultVal;
  const v = String(raw).trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return defaultVal;
}

function parseNumber(raw: string | undefined | null, fallback: number): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseListCsvOrJson(raw?: string | null | undefined): string[] {
  if (!raw) return [];
  const s = raw.trim();
  if (!s) return [];
  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr.map(String).map((x) => x.trim()).filter(Boolean);
      }
    } catch {
      // fall through to csv
    }
  }
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

function parseRpcProvidersJson(raw?: string | null | undefined): RpcEndpoint[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr
        .map((item) => {
          if (typeof item === 'string') {
            return { url: item.trim(), weight: 1 };
          }
          if (item && typeof item.url === 'string') {
            const w = Number(item.weight);
            return { url: item.url.trim(), weight: Number.isFinite(w) && w > 0 ? w : 1 };
          }
          return undefined as unknown as RpcEndpoint;
        })
        .filter((x) => x && x.url) as RpcEndpoint[];
    }
  } catch {
    throw new Error('Invalid RPC_PROVIDERS JSON');
  }
  return [];
}

function normalizeRpcList(urls: string[], defaultWeight = 1): RpcEndpoint[] {
  return urls
    .map((u) => u && u.trim())
    .filter(Boolean)
    .map((u) => ({ url: u as string, weight: defaultWeight }));
}

let cached: Config | null = null;

export function resetConfig(): void {
  cached = null;
}

export function loadConfig(): Config {
  if (cached) return cached;

  // Don't load .env in loadConfig when running tests, since test runner already loads it
  // and we want tests to be able to override env vars
  const isTest = process.env.NODE_ENV === 'test' || 
                 process.env.MOCHA === 'true' ||
                 process.argv.some(arg => arg.includes('mocha'));
  if (!isTest && fs.existsSync('.env')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('dotenv').config({ override: false });
    } catch {
      /* ignore */
    }
  }

  const DRY_RUN = parseBool(process.env.DRY_RUN, true);
  const NETWORK = (process.env.NETWORK as Network) || 'mainnet';

  // Provider precedence (highest → lowest)
  // 1) RPC_PROVIDERS as JSON (weighted objects or strings)
  let endpoints: RpcEndpoint[] = parseRpcProvidersJson(process.env.RPC_PROVIDERS);

  // 2) RPC_HTTP_LIST (csv or json array of strings)
  if (endpoints.length === 0) {
    const listUrls =
      parseListCsvOrJson(process.env.RPC_HTTP_LIST) ||
      parseListCsvOrJson(process.env.RPC_HTTP_URLS) ||
      parseListCsvOrJson(process.env.RPCS);
    endpoints = normalizeRpcList(listUrls);
  }

  // 3) Optional legacy keys (only if enabled or if it's the only option available)
  const legacyEnabled = parseBool(process.env.LEGACY_RPC_KEYS_ENABLED, false);
  if ((legacyEnabled || endpoints.length === 0) && process.env.PRIMARY_RPC_HTTP) {
    const legacySingle =
      process.env.PRIMARY_RPC_HTTP ||
      process.env.RPC_HTTP ||
      process.env.INFURA_URL ||
      '';
    const legacyList = parseListCsvOrJson(legacySingle);
    endpoints = normalizeRpcList(legacyList);
  }

  // 4) Explicit single fallback endpoints (NOT auto-promoted unless tests or prod want them)
  const ERIGON_RPC_HTTP = process.env.ERIGON_RPC_HTTP?.trim() || undefined;
  const FALLBACK_RPC_HTTP = process.env.FALLBACK_RPC_HTTP?.trim() || undefined;

  // If nothing configured, throw standardized error (tests expect this)
  if (endpoints.length === 0) {
    throw new Error('At least one RPC provider required (PRIMARY_RPC_HTTP, RPC_PROVIDERS, or RPC_HTTP_LIST)');
  }

  // Numeric fields and strict validation to satisfy tests
  const MIN_PROFIT_USD = parseNumber(process.env.MIN_PROFIT_USD, 25);
  const MIN_PROFIT_ETH = parseNumber(process.env.MIN_PROFIT_ETH, 0);

  const CAPTURE_FRACTION = parseNumber(process.env.CAPTURE_FRACTION, 0.7);
  if (CAPTURE_FRACTION < 0 || CAPTURE_FRACTION > 1) {
    throw new Error('CAPTURE_FRACTION must be between 0 and 1');
  }

  const INCLUSION_PROBABILITY = parseNumber(process.env.INCLUSION_PROBABILITY, 0.35);
  if (INCLUSION_PROBABILITY < 0 || INCLUSION_PROBABILITY > 1) {
    throw new Error('INCLUSION_PROBABILITY must be between 0 and 1');
  }

  const GAS_BASEFEE_BUMP = parseNumber(process.env.GAS_BASEFEE_BUMP, 2.0);
  if (!(GAS_BASEFEE_BUMP > 0)) {
    throw new Error('GAS_BASEFEE_BUMP must be > 0');
  }

  const PRIORITY_FEE_GWEI_MIN = parseNumber(
    process.env.PRIORITY_FEE_GWEI_MIN ?? process.env.MIN_PRIORITY_FEE_GWEI,
    1
  );
  const PRIORITY_FEE_GWEI_MAX = parseNumber(
    process.env.PRIORITY_FEE_GWEI_MAX ?? process.env.MAX_PRIORITY_FEE_GWEI,
    50
  );
  if (PRIORITY_FEE_GWEI_MIN < 0 || PRIORITY_FEE_GWEI_MAX < 0) {
    throw new Error('Priority fee gwei bounds must be non-negative');
  }
  if (PRIORITY_FEE_GWEI_MAX < PRIORITY_FEE_GWEI_MIN) {
    throw new Error('PRIORITY_FEE_GWEI_MAX must be >= PRIORITY_FEE_GWEI_MIN');
  }

  const MAX_PRIORITY_FEE_GWEI = process.env.MAX_PRIORITY_FEE_GWEI
    ? parseNumber(process.env.MAX_PRIORITY_FEE_GWEI, PRIORITY_FEE_GWEI_MAX)
    : undefined;

  const SIM_TIMEOUT_MS = parseNumber(process.env.SIM_TIMEOUT_MS, 5000);
  if (!(SIM_TIMEOUT_MS > 0)) {
    throw new Error('SIM_TIMEOUT_MS must be > 0');
  }

  const METRICS_PORT = parseNumber(process.env.METRICS_PORT, 8080);

  const FLASHBOTS_RPC_URL = process.env.FLASHBOTS_RPC_URL?.trim() || undefined;
  const PRIVATE_KEY = process.env.PRIVATE_KEY?.trim() || undefined;

  // Live mode validation (tests expect these throws)
  if (!DRY_RUN) {
    if (!PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY required in live mode');
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY)) {
      throw new Error('PRIVATE_KEY malformed (expected 0x + 64 hex chars)');
    }
  }

  // Compatibility fields
  const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
  const PRIMARY_RPC_HTTP = process.env.PRIMARY_RPC_HTTP?.trim() || undefined;

  const cfg: Config = {
    DRY_RUN,
    NETWORK,
    RPC_HTTP_LIST: endpoints,
    ERIGON_RPC_HTTP,
    FALLBACK_RPC_HTTP,
    MIN_PROFIT_USD,
    MIN_PROFIT_ETH,
    CAPTURE_FRACTION,
    INCLUSION_PROBABILITY,
    GAS_BASEFEE_BUMP,
    PRIORITY_FEE_GWEI_MIN,
    PRIORITY_FEE_GWEI_MAX,
    MAX_PRIORITY_FEE_GWEI,
    FLASHBOTS_RPC_URL,
    SIM_TIMEOUT_MS,
    METRICS_PORT,
    PRIVATE_KEY,
    LOG_LEVEL,
    RPC_PROVIDERS: endpoints.length > 0 ? endpoints : undefined,
    PRIMARY_RPC_HTTP,
  };

  cached = cfg;
  return cfg;
}

// NOTE: Do not export a cached singleton for tests that mutate env.
// Modules may still import default config; they should re-run loadConfig()
// if they need dynamic behavior in tests. We still export a default
// for code that expects it, but it reflects the process env at import time.
export const config = new Proxy({} as Config, {
  get(target, prop) {
    return loadConfig()[prop as keyof Config];
  }
});
export default config;

/**
 * getConfigSummary
 * Summary safe for logs; also includes some legacy alias keys used in tests.
 */
export function getConfigSummary() {
  const c = loadConfig();
  return {
    // New style (structured keys)
    NETWORK: c.NETWORK,
    DRY_RUN: c.DRY_RUN,
    RPC_HTTP_LIST_LENGTH: c.RPC_HTTP_LIST.length,
    ERIGON_RPC_HTTP_SET: !!c.ERIGON_RPC_HTTP,
    MIN_PROFIT_USD: c.MIN_PROFIT_USD,
    CAPTURE_FRACTION: c.CAPTURE_FRACTION,
    INCLUSION_PROBABILITY: c.INCLUSION_PROBABILITY,
    METRICS_PORT: c.METRICS_PORT,
    FLASHBOTS_RPC_URL_SET: !!c.FLASHBOTS_RPC_URL,
    GAS_BASEFEE_BUMP: c.GAS_BASEFEE_BUMP,
    // legacy alias some tests expect
    gasBaseFeeMultiplier: c.GAS_BASEFEE_BUMP,
    
    // Test compatibility fields (camelCase)
    dryRun: c.DRY_RUN,
    network: c.NETWORK,
    hasPrivateKey: !!c.PRIVATE_KEY,
    rpcProviders: (c.RPC_PROVIDERS || []).length,
    rpcHttpList: c.RPC_HTTP_LIST.length,
    hasPrimaryRpc: !!c.PRIMARY_RPC_HTTP,
    hasFallbackRpc: !!c.FALLBACK_RPC_HTTP,
    hasErigonRpc: !!c.ERIGON_RPC_HTTP,
    minProfitUsd: c.MIN_PROFIT_USD,
    minProfitEth: c.MIN_PROFIT_ETH,
    captureFraction: c.CAPTURE_FRACTION,
    inclusionProbability: c.INCLUSION_PROBABILITY,
    logLevel: c.LOG_LEVEL,
    healthPort: c.METRICS_PORT,
  };
}