// src/index.ts
// Add test-only early-exit and a plain log line for legacy tests.

import 'dotenv/config';
import logger from './modules/logger';
import { loadConfig } from './config';

// Live-mode guard (simplified; your repo may already have this)
function validateLiveMode(cfg: ReturnType<typeof loadConfig>) {
  if (!cfg.DRY_RUN) {
    if (!cfg.PRIVATE_KEY) {
      logger.error('[STARTUP] DRY_RUN=false but no PRIVATE_KEY provided.');
      process.exit(1);
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(cfg.PRIVATE_KEY)) {
      logger.error('[STARTUP] DRY_RUN=false but PRIVATE_KEY invalid format (must be 0x + 64 hex).');
      process.exit(1);
    }
  }
}

export async function main() {
  const cfg = loadConfig();

  // Explicit string for tests that match this legacy line
  if (!cfg.DRY_RUN) {
    logger.info('[STARTUP] DRY_RUN=false (live)');
  } else {
    logger.info('[STARTUP] DRY_RUN=true (simulation mode).');
  }

  validateLiveMode(cfg);

  // Test-only: allow a clean exit before providers start (child-process tests)
  if (process.env.TEST_NO_PROVIDER_START === 'true') {
    // eslint-disable-next-line no-console
    console.log('OK');
    return;
  }

  // ... normal startup (providers, monitors, etc.) ...
  // This placeholder demonstrates where you'd continue initialization.
  logger.info({ cfg: { network: cfg.NETWORK, dryRun: cfg.DRY_RUN } }, 'Bot started successfully');
}

if (require.main === module) {
  // Run main and exit with appropriate code for CI/tests
  main()
    .then(() => {
      if (process.env.TEST_NO_PROVIDER_START === 'true') process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}