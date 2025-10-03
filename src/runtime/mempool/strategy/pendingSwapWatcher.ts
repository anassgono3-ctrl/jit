import { ethers } from 'ethers';
import logger from '../../../modules/logger';
import { executeFlashloanSwapRepay } from '../../../execution/flashloan/path';
import { ProfitGuard } from '../../../strategy/profitGuard';
import { setMempoolStatus } from '../../../metrics';

// Minimal decoding of Uniswap V3 Router swaps (exactInputSingle and exactInput) to compute a simple "signal".
const ROUTER_ABI = [
  'function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) external payable returns (uint256)',
  'function exactInput(bytes) external payable returns (uint256)',
];

// Default router addresses (Uniswap V3 + Universal Router placeholder)
const DEFAULT_ROUTERS = [
  '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap V3 SwapRouter
  '0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B', // Universal Router
];

export interface PendingSwapWatcherConfig {
  provider: ethers.Provider;
  signer: ethers.Signer;
  minNotionalEth?: number; // fallback threshold if no profit estimate
  pollMs?: number;         // polling interval when in HTTP filter mode
  maxFilterResets?: number;
}

type StopFn = () => void;

function isWebSocketProvider(p: ethers.Provider): p is ethers.WebSocketProvider {
  return (p as any)?._websocket !== undefined || p.constructor?.name === 'WebSocketProvider';
}

export function parseRouterList(): string[] {
  const raw = process.env.ROUTER_ADDRS;
  if (!raw) return DEFAULT_ROUTERS;
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(a => a.toLowerCase());
}

async function startPollingMode(
  provider: ethers.Provider,
  onHash: (hash: string) => Promise<void>,
  pollMs: number,
  maxResets: number
): Promise<StopFn> {
  let filterId: string | null = null;
  let timer: NodeJS.Timeout | null = null;
  let resets = 0;

  async function createFilter(): Promise<boolean> {
    try {
      filterId = await (provider as any).send('eth_newPendingTransactionFilter', []);
      return true;
    } catch (e) {
      logger.warn('[mempool] RPC does not support eth_newPendingTransactionFilter; disabling watcher');
      setMempoolStatus(false, 0);
      return false;
    }
  }

  if (!(await createFilter())) {
    return () => {};
  }

  setMempoolStatus(true, 2);
  logger.info('[mempool] polling mode enabled');

  const loop = async () => {
    try {
      if (!filterId) return;
      const hashes: string[] = await (provider as any).send('eth_getFilterChanges', [filterId]);
      for (const h of hashes) {
        await onHash(h);
      }
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (/filter not found/i.test(msg)) {
        resets += 1;
        if (resets > maxResets) {
          logger.warn('[mempool] pending filter lost repeatedly; disabling watcher');
          clearIntervalSafe();
          setMempoolStatus(false, 0);
          return;
        }
        logger.warn({ attempt: resets }, '[mempool] filter lost; recreating');
        if (!(await createFilter())) {
          clearIntervalSafe();
          return;
        }
      }
      // Other errors ignored to keep loop resilient
    }
  };

  timer = setInterval(loop, Math.max(500, pollMs));
  return () => {
    clearIntervalSafe();
    if (filterId) {
      (provider as any).send('eth_uninstallFilter', [filterId]).catch(() => {});
    }
    setMempoolStatus(false, 0);
    logger.info('[mempool] polling mode stopped');
  };

  function clearIntervalSafe() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
}

export function startPendingSwapWatcher(cfg: PendingSwapWatcherConfig): StopFn {
  const guard = ProfitGuard.fromEnv();
  const minNotional = cfg.minNotionalEth ?? 10;
  const pollMs = cfg.pollMs ?? 1500;
  const maxResets = cfg.maxFilterResets ?? Number(process.env.MEMPOOL_MAX_FILTER_RESETS || 3);

  const vault = process.env.BALANCER_VAULT_ADDRESS || '';
  const receiver = process.env.RECEIVER_ADDRESS || '';
  const tokens = (process.env.EXEC_TOKENS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const amounts = (process.env.EXEC_AMOUNTS || '').split(',').map((s) => s.trim()).filter(Boolean).map((n) => BigInt(n));
  if (!vault || !receiver || tokens.length === 0 || amounts.length === 0) {
    logger.info('[mempool] execution not configured; watcher will only log');
  }

  const routerIface = new ethers.Interface(ROUTER_ABI);
  const routerFilter = parseRouterList();
  logger.info({ routers: routerFilter }, '[mempool] watching router(s)');

  const onHash = async (hash: string) => {
    try {
      const tx = await cfg.provider.getTransaction(hash);
      if (!tx || !tx.to || !tx.data) return;

      const toLower = tx.to.toLowerCase();
      if (!routerFilter.includes(toLower)) {
        return;
      }

      // Attempt to parse as a Uniswap V3 router call
      let parsed: ethers.TransactionDescription | null = null;
      try {
        parsed = routerIface.parseTransaction({ data: tx.data, value: tx.value ?? 0n });
      } catch {
        // Not a recognized router call
        return;
      }
      if (!parsed) return;

      // Heuristic: estimate "notional" from msg.value when present (rare) or fallback to a minimum threshold
      const notionalEth = tx.value ? Number(ethers.formatEther(tx.value)) : minNotional;

      const signal = {
        estProfitUsd: undefined as number | undefined,
        estProfitEth: (notionalEth || 0) * 0.0005, // placeholder: 5 bps of notional as hypothetical profit
      };

      // Enforce profit guard
      if (!guard.allow(signal)) {
        return;
      }

      logger.info(
        { hash, to: tx.to, method: parsed.name, estProfitEth: signal.estProfitEth },
        '[mempool] profitable swap opportunity (router matched)'
      );

      if (vault && receiver && tokens.length && amounts.length) {
        await executeFlashloanSwapRepay(cfg.signer, {
          vault,
          receiver,
          tokens,
          amounts,
          userData: '0x'
        });
      }
    } catch {
      // keep the watcher resilient
    }
  };

  // Mode selection
  if (isWebSocketProvider(cfg.provider)) {
    // WS subscription mode
    setMempoolStatus(true, 1);
    cfg.provider.on('pending', onHash);
    logger.info('[mempool] websocket mode enabled');
    if (process.env.RPC_MODE !== 'fullnode') {
      logger.warn('[mempool] external WS may be partial; for full coverage use a local full node');
    }
    return () => {
      cfg.provider.removeAllListeners('pending');
      setMempoolStatus(false, 0);
      logger.info('[mempool] websocket mode stopped');
    };
  }

  // Fallback to polling mode if RPC supports filters
  let stop: StopFn = () => {};
  startPollingMode(cfg.provider, onHash, pollMs, maxResets).then((s) => (stop = s));
  return () => stop();
}
