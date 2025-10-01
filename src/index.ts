import 'dotenv/config';
import logger from './modules/logger';
import { loadConfig, getConfigSummary } from './config';
import { startHealthServer } from './health';
import { ethers } from 'ethers';
import { executeFlashloanSwapRepay } from './execution/flashloan/path';
import { startPendingSwapWatcher } from './runtime/mempool/strategy/pendingSwapWatcher';

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

  // Build provider/signer for optional execution & mempool
  let rpc: string | undefined;
  if (cfg.PRIMARY_RPC_HTTP) {
    rpc = cfg.PRIMARY_RPC_HTTP;
  } else if (cfg.RPC_PROVIDERS && cfg.RPC_PROVIDERS.length > 0) {
    rpc = cfg.RPC_PROVIDERS[0].url;
  }
  
  let provider: ethers.JsonRpcProvider | undefined;
  let signer: ethers.Wallet | undefined;
  if (rpc) {
    provider = new ethers.JsonRpcProvider(rpc);
    if (cfg.PRIVATE_KEY) signer = new ethers.Wallet(cfg.PRIVATE_KEY, provider);
  } else {
    logger.warn('[STARTUP] No PRIMARY_RPC_HTTP/RPC_PROVIDERS configured; live execution/mempool disabled');
  }

  // Optional one-shot execution path (guarded by env)
  const autoExec = String(process.env.AUTO_EXECUTE_ON_START || '').toLowerCase() === 'true';
  if (autoExec && provider && signer) {
    const vault = process.env.BALANCER_VAULT_ADDRESS || '';
    const receiver = process.env.RECEIVER_ADDRESS || '';
    const tokens = (process.env.EXEC_TOKENS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const amounts = (process.env.EXEC_AMOUNTS || '').split(',').map((s) => s.trim()).filter(Boolean)
      .map((n) => BigInt(n));
    if (vault && receiver && tokens.length && amounts.length) {
      await executeFlashloanSwapRepay(signer, { vault, receiver, tokens, amounts, userData: '0x' });
    } else {
      logger.info('[STARTUP] AUTO_EXECUTE_ON_START set but execution env not fully configured; skipping');
    }
  }

  // Optional mempool strategy (basic watcher)
  if (cfg.ENABLE_MEMPOOL && provider && signer) {
    const stop = startPendingSwapWatcher({ provider, signer, minValueEth: Number(process.env.MEMPOOL_MIN_VALUE_ETH || 50) });
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
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