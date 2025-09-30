import 'dotenv/config';
import logger from './modules/logger';
import { loadConfig, getConfigSummary } from './config';
import { startHealthServer } from './health';

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
    if (process.env.NODE_ENV === 'production') {
      logger.warn('[STARTUP] DRY_RUN=true while NODE_ENV=production. Are you intentionally running in sim mode?');
    }
  }
}

export async function main(opts: { testMode?: boolean } = {}) {
  validateLiveMode();

  const cfg = loadConfig();
  const cfgSummary = getConfigSummary?.() ?? {};
  logger.info('[STARTUP] JIT Liquidity Bot starting...');
  logger.info('[STARTUP] Resolved config summary', cfgSummary);

  if (opts.testMode) {
    logger.info('[STARTUP] testMode=true — initializing minimal startup for tests.');
    logger.info('[STARTUP] Test-mode startup complete');
    return;
  }

  // Health/metrics server
  const healthPort = Number(process.env.HEALTHCHECK_PORT || 9090);
  startHealthServer(healthPort);

  // Enable mempool only when explicitly configured, and only in live mode
  if (cfg.ENABLE_MEMPOOL && !cfg.DRY_RUN) {
    const { MempoolOrchestrator } = await import('./runtime/mempool/orchestrator');
    const orchestrator = new MempoolOrchestrator();
    await orchestrator.start();
    logger.info('[STARTUP] Mempool orchestrator started');
  } else {
    logger.info('[STARTUP] Mempool disabled (ENABLE_MEMPOOL=false or DRY_RUN=true)');
  }

  logger.info('[STARTUP] Bot started successfully');

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