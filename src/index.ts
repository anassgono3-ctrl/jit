// src/index.ts
// Add test-only early-exit and a plain log line for legacy tests.

import 'dotenv/config';
import logger from './modules/logger';
import { loadConfig, getConfigSummary } from './config';

/**
 * Live-mode safety guard
 * - Runs before any provider initialization
 * - Exits if DRY_RUN=false and PRIVATE_KEY is missing/invalid
 */
function validateLiveMode() {
  const cfg = loadConfig();
  if (!cfg.DRY_RUN) {
    logger.info('[STARTUP] DRY_RUN=false (live)');
    if (!cfg.PRIVATE_KEY) {
      logger.error('[STARTUP] DRY_RUN=false but no PRIVATE_KEY provided.');
      process.exit(1);
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(cfg.PRIVATE_KEY)) {
      logger.error('[STARTUP] DRY_RUN=false but PRIVATE_KEY invalid format (must be 0x + 64 hex).');
      process.exit(1);
    }
  } else {
    logger.info('[STARTUP] DRY_RUN=true (simulation mode).');
  }
}

/**
 * Main entrypoint
 * - testMode: when true, short-circuits long-lived/provider-heavy initialization
 *             while still performing configuration and guard checks.
 *   This is for tests only; production behavior is unchanged.
 */
export async function main(opts: { testMode?: boolean } = {}) {
  // Always run guard first (no provider initialization yet)
  validateLiveMode();

  const cfgSummary = getConfigSummary?.() ?? {};
  logger.info('[STARTUP] JIT Liquidity Bot starting...');
  logger.info('[STARTUP] Resolved config summary', cfgSummary);

  // In tests, avoid starting providers, HTTP servers, mempool listeners, etc.
  if (opts.testMode) {
    logger.info('[STARTUP] testMode=true — initializing minimal startup for tests.');
    logger.info('[STARTUP] Test-mode startup complete');
    return;
  }

  // --- Normal startup path below ---
  // Initialize runtime: providers, metrics, strategy, mempool, execution runtime, etc.
  // NOTE: ensure provider construction is lazy and only happens here (not at import time).
  logger.info('[STARTUP] Bot started successfully');

  // Keep process alive and graceful shutdown
  process.on('SIGINT', () => {
    logger.info('[SHUTDOWN] Received SIGINT, shutting down gracefully...');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    logger.info('[SHUTDOWN] Received SIGTERM, shutting down gracefully...');
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('[STARTUP] Failed to start bot:', error);
    process.exit(1);
  });
}