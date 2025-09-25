/**
 * Centralized environment loading & validation.
 *
 * Precedence:
 *   1. Process environment (exported vars / shell overrides)
 *   2. .env file (loaded via dotenv)
 *   3. Internal defaults
 *
 * Fails fast on invalid combinations (e.g., DRY_RUN=false without valid PRIVATE_KEY).
 */

import 'dotenv/config'; // Loads .env before anything else
import { z } from 'zod';

// Raw values
const raw = {
  DRY_RUN: process.env.DRY_RUN,
  PRIVATE_KEY: process.env.PRIVATE_KEY,
  NETWORK: process.env.NETWORK,
  ERIGON_RPC_HTTP: process.env.ERIGON_RPC_HTTP,
  FALLBACK_RPC_HTTP: process.env.FALLBACK_RPC_HTTP
};

// Schema
const schema = z.object({
  DRY_RUN: z
    .string()
    .optional()
    .transform(v => (v ?? 'true').toLowerCase())
    .refine(v => ['true', 'false'].includes(v), 'DRY_RUN must be true or false'),
  PRIVATE_KEY: z
    .string()
    .optional()
    .transform(v => (v && v.length === 0 ? undefined : v))
    .refine(
      v => !v || /^0x[0-9a-fA-F]{64}$/.test(v),
      'PRIVATE_KEY must be 0x + 64 hex chars if provided'
    ),
  NETWORK: z.string().optional().default('mainnet'),
  ERIGON_RPC_HTTP: z.string().optional(),
  FALLBACK_RPC_HTTP: z.string().optional()
});

const parsed = schema.safeParse(raw);

if (!parsed.success) {
  // Aggregate validation issues
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error('[CONFIG] Validation error:', issue.path.join('.'), issue.message);
  }
  // Fail fast
  throw new Error('Configuration validation failed. See errors above.');
}

type Config = {
  DRY_RUN: boolean;
  PRIVATE_KEY?: string;
  NETWORK: string;
  ERIGON_RPC_HTTP?: string;
  FALLBACK_RPC_HTTP?: string;
};

const cfg: Config = {
  DRY_RUN: parsed.data.DRY_RUN === 'true',
  PRIVATE_KEY: parsed.data.PRIVATE_KEY,
  NETWORK: parsed.data.NETWORK,
  ERIGON_RPC_HTTP: parsed.data.ERIGON_RPC_HTTP,
  FALLBACK_RPC_HTTP: parsed.data.FALLBACK_RPC_HTTP
};

// Live-mode guard centralization (kept here so index.ts just consumes)
export function assertLiveModeSafety() {
  if (!cfg.DRY_RUN) {
    if (!cfg.PRIVATE_KEY) {
      throw new Error('Live mode requires PRIVATE_KEY (missing).');
    }
  }
}

export function sanitizedConfigForLog() {
  return {
    DRY_RUN: cfg.DRY_RUN,
    NETWORK: cfg.NETWORK,
    ERIGON_RPC_HTTP: !!cfg.ERIGON_RPC_HTTP,
    FALLBACK_RPC_HTTP: !!cfg.FALLBACK_RPC_HTTP,
    PRIVATE_KEY: cfg.PRIVATE_KEY
      ? `0x${cfg.PRIVATE_KEY.slice(2, 6)}…${cfg.PRIVATE_KEY.slice(-4)}`
      : '(none)'
  };
}

export const config = cfg;