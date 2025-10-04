#!/usr/bin/env ts-node
/**
 * Environment sanity validator:
 * - Warns or exits (non-zero) on common misconfigurations.
 * - Safe to run in CI or pre-launch step.
 */
import 'dotenv/config';

function fail(msg: string) {
  console.error(`[env:fail] ${msg}`);
  process.exitCode = 1;
}

function warn(msg: string) {
  console.warn(`[env:warn] ${msg}`);
}

const DRY_RUN = (process.env.DRY_RUN ?? 'true').toLowerCase() === 'true';
const PK = process.env.PRIVATE_KEY;
const ENABLE_MEMPOOL = (process.env.ENABLE_MEMPOOL ?? 'false').toLowerCase() === 'true';
const WS = process.env.PRIMARY_RPC_WS;
const HTTP = process.env.PRIMARY_RPC_HTTP || (process.env.RPC_PROVIDERS || '').split(',').filter(Boolean)[0];

if (!DRY_RUN) {
  if (!PK) fail('DRY_RUN=false but PRIVATE_KEY is missing.');
  else if (!/^0x[0-9a-fA-F]{64}$/.test(PK)) fail('PRIVATE_KEY format invalid (expected 0x + 64 hex chars).');
} else {
  if (!PK) {
    warn('Running in DRY_RUN with no PRIVATE_KEY (ok). Provide one before live mode.');
  }
}

if (ENABLE_MEMPOOL) {
  if (!WS && !HTTP) {
    fail('ENABLE_MEMPOOL=true but no PRIMARY_RPC_WS or PRIMARY_RPC_HTTP / RPC_PROVIDERS provided.');
  } else if (!WS) {
    warn('ENABLE_MEMPOOL=true without PRIMARY_RPC_WS; will attempt HTTP polling fallback (less reliable).');
  }
}

const VAULT = process.env.BALANCER_VAULT_ADDRESS;
const RECEIVER = process.env.RECEIVER_ADDRESS;
const TOKENS = (process.env.EXEC_TOKENS || '').split(',').filter(Boolean);
const AMOUNTS = (process.env.EXEC_AMOUNTS || '').split(',').filter(Boolean);

if (!DRY_RUN) {
  if (!VAULT || !RECEIVER) warn('Live mode without BALANCER_VAULT_ADDRESS or RECEIVER_ADDRESS set; execution will fail.');
}

if (TOKENS.length !== AMOUNTS.length && (TOKENS.length || AMOUNTS.length)) {
  fail('EXEC_TOKENS and EXEC_AMOUNTS length mismatch.');
}

if (process.exitCode) {
  console.error('[env:fail] One or more errors detected.');
} else {
  console.log('[env:ok] Environment validation passed.');
}
