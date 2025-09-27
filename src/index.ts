/**
 * Entry point for JIT Liquidity Bot
 *
 * Live-Mode Guard:
 *  - If DRY_RUN=false -> requires a properly formatted PRIVATE_KEY
 *  - PRIVATE_KEY must match /^0x[0-9a-fA-F]{64}$/ (64 hex bytes)
 */

// Load .env first before any other imports
import 'dotenv/config';

import { loadConfig, getConfigSummary } from './config';
import { log } from './modules/logger';

// --- Live-Mode Guard (place before any network connections or async init) ---
(function enforceLiveModeSafety() {
  try {
    const config = loadConfig();
    
    if (config.DRY_RUN) {
      log.info('[STARTUP] DRY_RUN=true (simulation mode). Skipping PRIVATE_KEY validation.', { dryRun: true });
      return;
    }

    if (!config.PRIVATE_KEY) {
      log.error('[STARTUP] DRY_RUN=false but no PRIVATE_KEY provided.', { dryRun: false });
      log.error('[STARTUP] Exiting to prevent accidental live-mode execution.');
      process.exit(1);
    }

    if (!/^0x[0-9a-fA-F]{64}$/.test(config.PRIVATE_KEY)) {
      log.error('[STARTUP] DRY_RUN=false but PRIVATE_KEY invalid format (must be 0x + 64 hex).', { dryRun: false });
      process.exit(1);
    }

    log.info('[STARTUP] Live-mode key validated; proceeding...', { dryRun: false });
  } catch (error) {
    log.error('[STARTUP] Config validation failed:', error instanceof Error ? error : new Error(String(error)));
    log.error('[STARTUP] Exiting to prevent accidental live-mode execution.');
    process.exit(1);
  }
})();

// ---------------------------------------------------------------------------
// Main application logic (placeholder for now)
// This would typically import and start the main bot application

async function main() {
  log.info('[STARTUP] JIT Liquidity Bot starting...');
  
  // Load and log configuration
  const config = loadConfig();
  const configSummary = getConfigSummary();
  log.info('[STARTUP] Resolved config', configSummary);

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