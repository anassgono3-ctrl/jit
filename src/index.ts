/**
 * Entry point for JIT Liquidity Bot
 *
 * Live-Mode Guard:
 *  - If DRY_RUN=false -> requires a properly formatted PRIVATE_KEY
 *  - PRIVATE_KEY must match /^0x[0-9a-fA-F]{64}$/ (64 hex bytes)
 */

import { log } from './modules/logger';

// --- Live-Mode Guard (place before any network connections or async init) ---
(function enforceLiveModeSafety() {
  const dryRun = (process.env.DRY_RUN ?? 'true').toLowerCase() === 'true';
  if (dryRun) {
    log.info('[STARTUP] DRY_RUN=true (simulation mode). Skipping PRIVATE_KEY validation.');
    return;
  }

  const pk = process.env.PRIVATE_KEY;
  const validFormat = typeof pk === 'string' && /^0x[0-9a-fA-F]{64}$/.test(pk);

  if (!validFormat) {
    if (!pk) {
      log.error('[STARTUP] DRY_RUN=false but no PRIVATE_KEY provided.');
    } else {
      log.error('[STARTUP] DRY_RUN=false but PRIVATE_KEY is malformed (expected 0x + 64 hex chars).');
    }
    log.error('[STARTUP] Exiting to prevent accidental live-mode execution.');
    process.exit(1);
  }

  log.info('[STARTUP] Live-mode key validated; proceeding...');
})();

// ---------------------------------------------------------------------------
// Main application logic (placeholder for now)
// This would typically import and start the main bot application

async function main() {
  log.info('[STARTUP] JIT Liquidity Bot starting...');
  
  // Log startup configuration
  log.info('[STARTUP] Configuration:', {
    dryRun: process.env.DRY_RUN,
    network: process.env.NETWORK,
    logLevel: process.env.LOG_LEVEL,
    metricsPort: process.env.METRICS_PORT,
  });

  // TODO: Initialize main bot components
  // - Strategy engine
  // - Pool manager
  // - Execution runtime
  // - Metrics server
  
  log.info('[STARTUP] Bot started successfully');
  
  // Keep the process running
  process.on('SIGINT', () => {
    log.info('[SHUTDOWN] Received SIGINT, shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log.info('[SHUTDOWN] Received SIGTERM, shutting down gracefully...');
    process.exit(0);
  });
}

// Start the application
if (require.main === module) {
  main().catch((error) => {
    log.error('[STARTUP] Failed to start bot:', error);
    process.exit(1);
  });
}

export { main };