import 'dotenv/config';
import logger from './modules/logger';
import { loadConfig, getConfigSummary } from './config';
import { startHealthServer } from './health';
import { buildProvider } from './provider/factory';
import { setRpcMode } from './metrics';
import { executeFlashloanSwapRepay } from './execution/flashloan/path';
import { startPendingSwapWatcher } from './runtime/mempool/strategy/pendingSwapWatcher';
import { ethers } from 'ethers';

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

  // Provider build
  const info = await buildProvider();
  let signer: ethers.Wallet | undefined;
  if (info) {
    setRpcMode(info.mode);
    if (cfg.PRIVATE_KEY) {
      signer = new ethers.Wallet(cfg.PRIVATE_KEY, info.provider);
    }
  } else {
    setRpcMode('unknown');
    logger.warn('[STARTUP] No RPC provider configured; mempool & execution disabled');
  }

  // Optional one-shot execution path (guarded by env)
  const autoExec = String(process.env.AUTO_EXECUTE_ON_START || '').toLowerCase() === 'true';
  if (autoExec && info?.provider && signer) {
    const vault = process.env.BALANCER_VAULT_ADDRESS || '';
    const receiver = process.env.RECEIVER_ADDRESS || '';
    const tokens = (process.env.EXEC_TOKENS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const amounts = (process.env.EXEC_AMOUNTS || '').split(',').map((s) => s.trim()).filter(Boolean)
      .map((n) => BigInt(n));
    if (vault && receiver && tokens.length && amounts.length) {
      await executeFlashloanSwapRepay(signer, { vault, receiver, tokens, amounts, userData: '0x' });
    } else {
      logger.info('[STARTUP] AUTO_EXECUTE_ON_START set but execution env incomplete; skipping');
    }
  }

  // Mempool watcher
  if (cfg.ENABLE_MEMPOOL && info?.provider && signer) {
    const stop = startPendingSwapWatcher({
      provider: info.provider,
      signer,
      minNotionalEth: Number(process.env.MEMPOOL_MIN_VALUE_ETH || 10),
      pollMs: Number(process.env.MEMPOOL_POLL_MS || 1500),
      maxFilterResets: Number(process.env.MEMPOOL_MAX_FILTER_RESETS || 3),
    });
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } else {
    logger.info('[STARTUP] Mempool disabled (ENABLE_MEMPOOL=false or RPC/keys missing)');
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