import { z } from 'zod';
import * as dotenv from 'dotenv';

// Load environment variables early (only in entrypoint)
if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

const rpcArraySchema = z.array(z.object({
  url: z.string().url(),
  weight: z.number().int().positive().default(1)
}));

const configSchema = z.object({
  DRY_RUN: z.boolean().default(true),
  NETWORK: z.enum(['mainnet','goerli','sepolia']).default('mainnet'),
  PRIVATE_KEY: z.string().optional(),
  PRIMARY_RPC_HTTP: z.string().url().optional(),
  FALLBACK_RPC_HTTP: z.string().url().optional(),
  ERIGON_RPC_HTTP: z.string().url().optional(),
  WS_RPC_URL: z.string().url().optional(),
  RPC_PROVIDERS: z.string().transform(val => {
    if (!val) return [];
    try { 
      return rpcArraySchema.parse(JSON.parse(val)); 
    } catch { 
      throw new Error('Invalid RPC_PROVIDERS JSON'); 
    }
  }).optional(),
  MIN_PROFIT_USD: z.coerce.number().min(0).default(0),
  MIN_PROFIT_ETH: z.coerce.number().min(0).default(0),
  MAX_PRIORITY_FEE_GWEI: z.coerce.number().min(0).optional(),
  LOG_LEVEL: z.enum(['debug','info','warn','error']).default('info'),
  HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(9090),
});

export type AppConfig = z.infer<typeof configSchema>;

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  
  const raw: Record<string, unknown> = { ...process.env };
  
  // Normalize booleans
  if ('DRY_RUN' in raw) {
    raw.DRY_RUN = String(raw.DRY_RUN).toLowerCase() === 'true';
  }

  const parsed = configSchema.parse(raw);
  
  // Validation rules for live mode
  if (!parsed.DRY_RUN) {
    if (!parsed.PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY required in live mode');
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(parsed.PRIVATE_KEY)) {
      throw new Error('PRIVATE_KEY malformed (expected 0x + 64 hex chars)');
    }
  }
  
  // Require at least one RPC provider
  if (!parsed.PRIMARY_RPC_HTTP && (!parsed.RPC_PROVIDERS || parsed.RPC_PROVIDERS.length === 0)) {
    throw new Error('At least one RPC provider required (PRIMARY_RPC_HTTP or RPC_PROVIDERS)');
  }
  
  cached = parsed;
  return parsed;
}

export function resetConfig(): void {
  cached = null;
}

export function getConfigSummary(): Record<string, unknown> {
  const config = loadConfig();
  return {
    dryRun: config.DRY_RUN,
    network: config.NETWORK,
    hasPrivateKey: !!config.PRIVATE_KEY,
    rpcProviders: config.RPC_PROVIDERS?.length || 0,
    hasPrimaryRpc: !!config.PRIMARY_RPC_HTTP,
    hasFallbackRpc: !!config.FALLBACK_RPC_HTTP,
    hasErigonRpc: !!config.ERIGON_RPC_HTTP,
    hasWsRpc: !!config.WS_RPC_URL,
    minProfitUsd: config.MIN_PROFIT_USD,
    minProfitEth: config.MIN_PROFIT_ETH,
    logLevel: config.LOG_LEVEL,
    healthPort: config.HEALTH_PORT
  };
}