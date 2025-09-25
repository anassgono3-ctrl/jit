/**
 * Entry point.
 * Ensures deterministic .env loading via config module.
 */

import { log } from './modules/logger';
import { config, assertLiveModeSafety, sanitizedConfigForLog } from './config/env';

(function startup() {
  log.info(`[STARTUP] Mode: ${config.DRY_RUN ? 'DRY_RUN=true (simulation)' : 'DRY_RUN=false (live)'}`);
  try {
    assertLiveModeSafety();
  } catch (err) {
    log.error('[STARTUP] Live-mode safety check failed:', { error: (err as Error).message });
    process.exit(1);
  }

  log.info('[CONFIG] Effective configuration (sanitized):', sanitizedConfigForLog());
})();

// ---------------------------------------------------------------------------
// Main application logic (placeholder for now)
// This would typically import and start the main bot application

async function main() {
  log.info('[STARTUP] JIT Liquidity Bot starting...');
  
  // Log startup configuration
  log.info('[STARTUP] Configuration:', {
    dryRun: config.DRY_RUN,
    network: config.NETWORK,
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