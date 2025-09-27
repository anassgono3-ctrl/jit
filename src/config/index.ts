// src/config/index.ts
/**
 * RPC config normalization + safe summary.
 * Always provide RPC_HTTP_LIST as RpcEndpoint[]: { url: string; weight: number }.
 * Accepts CSV or JSON (strings or objects) for maximum compatibility.
 * Maintains compatibility with existing tests.
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

  // raw user input for debugging
  RPC_HTTP_LIST_RAW: (string | { url: string; weight?: number })[];

  // normalized endpoints
  RPC_HTTP_LIST: RpcEndpoint[];

  // Keep existing properties for compatibility
  PRIMARY_RPC_HTTP?: string | undefined;
  RPC_PROVIDERS?: { url: string; weight: number }[] | undefined;
  ERIGON_RPC_HTTP?: string | undefined;
  FALLBACK_RPC_HTTP?: string | undefined;

  MIN_PROFIT_USD: number;
  MIN_PROFIT_ETH: number;

  CAPTURE_FRACTION: number;
  INCLUSION_PROBABILITY: number;

  GAS_BASEFEE_BUMP: number;
  PRIORITY_FEE_GWEI_MIN: number;
  PRIORITY_FEE_GWEI_MAX: number;
  MAX_PRIORITY_FEE_GWEI?: number | undefined;

  FLASHBOTS_RPC_URL?: string | undefined;
  SIM_TIMEOUT_MS: number;

  METRICS_PORT: number;
  LOG_LEVEL: string;

  PRIVATE_KEY?: string | undefined;
}

function parseBool(raw?: string | null | undefined, defaultVal = true): boolean {
  if (raw === undefined || raw === null) return defaultVal;
  const v = String(raw).trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return defaultVal;
}

function parseNumber(raw: string | undefined | null, fallback: number) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseRpcListRaw(raw?: string | null | undefined): (string | { url: string; weight?: number })[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  // allow JSON array string or comma-separated list
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((p) => p);
    } catch {
      // fallthrough to comma parse
    }
  }
  // comma separated list of urls -> return strings
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseRpcProvidersJson(raw?: string | null | undefined): (string | { url: string; weight?: number })[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((p) => p);
    } catch {
      throw new Error('Invalid RPC_PROVIDERS JSON');
    }
  }
  // For RPC_PROVIDERS, we expect JSON format
  throw new Error('Invalid RPC_PROVIDERS JSON');
}

/** normalize raw RPC list into array of { url, weight } */
function normalizeRpcList(rawList: (string | { url: string; weight?: number })[]): RpcEndpoint[] {
  const out: RpcEndpoint[] = [];
  const DEFAULT_WEIGHT = 1;
  for (const item of rawList) {
    if (!item) continue;
    if (typeof item === 'string') {
      if (item.trim()) out.push({ url: item.trim(), weight: DEFAULT_WEIGHT });
      continue;
    }
    // object case
    const url = (item as any).url ?? (item as any).endpoint ?? (item as any).rpc;
    const weightRaw = (item as any).weight;
    const weight = typeof weightRaw === 'number' && Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : DEFAULT_WEIGHT;
    if (typeof url === 'string' && url.trim()) {
      out.push({ url: url.trim(), weight });
    }
  }
  return out;
}

let cached: Config | null = null;

export function resetConfig(): void {
  cached = null;
  _loadedConfig = null;
}

export function loadConfig(): Config {
  if (cached) return cached;

  // best-effort dotenv load early
  if (!process.env.NODE_ENV && fs.existsSync('.env')) {
    try {
      // Dynamic import to avoid circular dependencies
      require('dotenv').config(); // eslint-disable-line
    } catch {
      /* ignore */
    }
  }

  // raw rpc list: accept several env names for compatibility
  const rawRpcString =
    process.env.RPC_HTTP_LIST ||
    process.env.RPC_HTTP_URLS ||
    process.env.RPCS ||
    process.env.RPC_HTTP ||
    process.env.INFURA_URL ||
    '';

  const rawList = parseRpcListRaw(rawRpcString);

  // Also check for RPC_PROVIDERS JSON format for compatibility
  const rpcProvidersRaw = process.env.RPC_PROVIDERS ? parseRpcProvidersJson(process.env.RPC_PROVIDERS) : [];
  const allRawList = rawList.length > 0 ? rawList : rpcProvidersRaw;

  const cfgPartial = {
    DRY_RUN: parseBool(process.env.DRY_RUN, true),
    NETWORK: (process.env.NETWORK as Network) || 'mainnet',
    RPC_HTTP_LIST_RAW: allRawList,
    PRIMARY_RPC_HTTP: process.env.PRIMARY_RPC_HTTP,
    ERIGON_RPC_HTTP: process.env.ERIGON_RPC_HTTP,
    FALLBACK_RPC_HTTP: process.env.FALLBACK_RPC_HTTP,

    MIN_PROFIT_USD: parseNumber(process.env.MIN_PROFIT_USD, 25),
    MIN_PROFIT_ETH: parseNumber(process.env.MIN_PROFIT_ETH, 0),

    CAPTURE_FRACTION: parseNumber(process.env.CAPTURE_FRACTION, 0.7),
    INCLUSION_PROBABILITY: parseNumber(process.env.INCLUSION_PROBABILITY, 0.35),

    GAS_BASEFEE_BUMP: parseNumber(process.env.GAS_BASEFEE_BUMP, 2.0),
    PRIORITY_FEE_GWEI_MIN: parseNumber(process.env.PRIORITY_FEE_GWEI_MIN, parseNumber(process.env.MIN_PRIORITY_FEE_GWEI, 1)),
    PRIORITY_FEE_GWEI_MAX: parseNumber(process.env.PRIORITY_FEE_GWEI_MAX, parseNumber(process.env.MAX_PRIORITY_FEE_GWEI, 50)),
    MAX_PRIORITY_FEE_GWEI: process.env.MAX_PRIORITY_FEE_GWEI ? parseNumber(process.env.MAX_PRIORITY_FEE_GWEI, 0) : undefined,

    FLASHBOTS_RPC_URL: process.env.FLASHBOTS_RPC_URL,
    SIM_TIMEOUT_MS: parseNumber(process.env.SIM_TIMEOUT_MS, 5000),

    METRICS_PORT: parseNumber(process.env.METRICS_PORT, 8080),
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',

    PRIVATE_KEY: process.env.PRIVATE_KEY,
  };

  const normalized = normalizeRpcList(cfgPartial.RPC_HTTP_LIST_RAW);
  const endpoints: RpcEndpoint[] = [...normalized];

  // Add PRIMARY_RPC_HTTP to the list if available
  if (cfgPartial.PRIMARY_RPC_HTTP && endpoints.length === 0) {
    endpoints.push({ url: cfgPartial.PRIMARY_RPC_HTTP, weight: 1 });
  }

  // fallback: if list empty and FALLBACK_RPC_HTTP provided, use it
  if (endpoints.length === 0) {
    const fallbackRaw = (cfgPartial.FALLBACK_RPC_HTTP || '').trim();
    if (fallbackRaw) {
      endpoints.push({ url: fallbackRaw, weight: 1 });
    }
  }

  // Validation rules for live mode
  if (!cfgPartial.DRY_RUN) {
    if (!cfgPartial.PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY required in live mode');
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(cfgPartial.PRIVATE_KEY)) {
      throw new Error('PRIVATE_KEY malformed (expected 0x + 64 hex chars)');
    }
  }

  // Require at least one RPC provider (but allow tests to test this validation)
  if (!cfgPartial.PRIMARY_RPC_HTTP && endpoints.length === 0) {
    throw new Error('At least one RPC provider required (PRIMARY_RPC_HTTP or RPC_PROVIDERS)');
  }

  const cfg: Config = {
    ...(cfgPartial as any),
    RPC_HTTP_LIST: endpoints,
    // For compatibility, also set RPC_PROVIDERS
    RPC_PROVIDERS: endpoints.length > 0 ? endpoints : undefined,
  };

  cached = cfg;
  return cfg as Config;
}

// Defer config loading to avoid test issues
let _loadedConfig: Config | null = null;

function getConfig(): Config {
  if (!_loadedConfig) _loadedConfig = loadConfig();
  return _loadedConfig;
}

/* eslint-disable no-undef */
export const config = new Proxy({} as Config, {
  get(target, prop) {
    return getConfig()[prop as keyof Config];
  }
});
/* eslint-enable no-undef */

export default config;

/** safe summary for logging (no secrets) */
export function getConfigSummary() {
  const c = loadConfig();
  return {
    dryRun: c.DRY_RUN,
    network: c.NETWORK,
    hasPrivateKey: !!c.PRIVATE_KEY,
    rpcProviders: (c.RPC_PROVIDERS || []).length,
    rpcHttpList: (c.RPC_HTTP_LIST || []).length,
    hasPrimaryRpc: !!c.PRIMARY_RPC_HTTP,
    hasFallbackRpc: !!c.FALLBACK_RPC_HTTP,
    hasErigonRpc: !!c.ERIGON_RPC_HTTP,
    minProfitUsd: c.MIN_PROFIT_USD,
    minProfitEth: c.MIN_PROFIT_ETH,
    captureFraction: c.CAPTURE_FRACTION,
    inclusionProbability: c.INCLUSION_PROBABILITY,
    logLevel: c.LOG_LEVEL,
    healthPort: c.METRICS_PORT,
    RPC_HTTP_LIST_LENGTH: (c.RPC_HTTP_LIST || []).length,
    ERIGON_RPC_HTTP_SET: !!c.ERIGON_RPC_HTTP,
    FLASHBOTS_RPC_URL_SET: !!c.FLASHBOTS_RPC_URL,
    GAS_BASEFEE_BUMP: c.GAS_BASEFEE_BUMP,
  };
}