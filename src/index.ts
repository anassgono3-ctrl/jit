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
  const ws = process.env.PRIMARY_RPC_WS;
  const http = process.env.PRIMARY_RPC_HTTP || process.env.RPC_PROVIDERS?.split(',')?.[0];
  let provider: ethers.WebSocketProvider | ethers.JsonRpcProvider | undefined;
  let signer: ethers.Wallet | undefined;

  if (ws) {
    try {
      provider = new ethers.WebSocketProvider(ws);
      logger.info({ ws }, '[STARTUP] Using WebSocketProvider');
    } catch (e) {
      logger.warn({ ws, err: String((e as any)?.message || e) }, '[STARTUP] Failed WS provider init, will fallback to HTTP if available');
    }
  }
  if (!provider && http) {
    try {
      provider = new ethers.JsonRpcProvider(http);
      logger.info({ http }, '[STARTUP] Using JsonRpcProvider (HTTP)');
    } catch (e) {
      logger.error({ http, err: String((e as any)?.message || e) }, '[STARTUP] Failed HTTP provider init');
    }
  }
  if (!provider) {
    logger.warn('[STARTUP] No usable RPC provider (WS or HTTP) established.');
  }

  if (provider && cfg.PRIVATE_KEY) {
    signer = new ethers.Wallet(cfg.PRIVATE_KEY, provider);
  }

  // Optional one-shot execution path (guarded by env)
  const autoExec = String(process.env.AUTO_EXECUTE_ON_START || '').toLowerCase() === 'true';
  if (autoExec && provider && signer) {
    const vault = process.env.BALANCER_VAULT_ADDRESS || '';
    const receiver = process.env.RECEIVER_ADDRESS || '';
    const tokens = (process.env.EXEC_TOKENS || '').split(',').map(s => s.trim()).filter(Boolean);
    const amounts = (process.env.EXEC_AMOUNTS || '').split(',').map(s => s.trim()).filter(Boolean).map(n => BigInt(n));
    if (vault && receiver && tokens.length === amounts.length && tokens.length > 0) {
      await executeFlashloanSwapRepay(signer, { vault, receiver, tokens, amounts, userData: '0x' });
    } else {
      logger.info('[STARTUP] AUTO_EXECUTE_ON_START set but execution env incomplete; skipping');
    }
  }

  // Mempool watcher
  if (cfg.ENABLE_MEMPOOL) {
    if (!provider) {
      logger.warn('[mempool] ENABLE_MEMPOOL=true but no provider established; disabling mempool features');
    } else if (!signer) {
      logger.warn('[mempool] ENABLE_MEMPOOL=true but signer unavailable (no PRIVATE_KEY in DRY_RUN=false); watcher limited to observe-only');
      startPendingSwapWatcher({
        provider,
        signer: new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider), // ephemeral for decode logging
        minNotionalEth: Number(process.env.MEMPOOL_MIN_VALUE_ETH || 10),
        pollMs: Number(process.env.MEMPOOL_POLL_MS || 1500),
      });
    } else {
      startPendingSwapWatcher({
        provider,
        signer,
        minNotionalEth: Number(process.env.MEMPOOL_MIN_VALUE_ETH || 10),
        pollMs: Number(process.env.MEMPOOL_POLL_MS || 1500),
      });
    }
  } else {
    logger.info('[STARTUP] Mempool disabled (ENABLE_MEMPOOL=false)');
  }

  logger.info('[STARTUP] Bot started successfully');

  process.on('SIGINT', () => {
    logger.info('[SHUTDOWN] SIGINT received, exiting');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    logger.info('[SHUTDOWN] SIGTERM received, exiting');
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('[STARTUP] Failed to start bot:', error);
    process.exit(1);
  });
}