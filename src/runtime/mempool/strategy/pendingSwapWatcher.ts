import { ethers } from 'ethers';
import logger from '../../../modules/logger';
import { executeFlashloanSwapRepay } from '../../../execution/flashloan/path';
import { ProfitGuard } from '../../../strategy/profitGuard';

// Minimal decoding of Uniswap V3 Router swaps (exactInputSingle and exactInput) to compute a simple "signal".
const ROUTER_ABI = [
  'function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) external payable returns (uint256)',
  'function exactInput(bytes) external payable returns (uint256)',
];

export interface PendingSwapWatcherConfig {
  provider: ethers.Provider;
  signer: ethers.Signer;
  minNotionalEth?: number; // fallback threshold if no profit estimate
}

export function startPendingSwapWatcher(cfg: PendingSwapWatcherConfig) {
  const guard = ProfitGuard.fromEnv();
  const minNotional = cfg.minNotionalEth ?? 10;

  const vault = process.env.BALANCER_VAULT_ADDRESS || '';
  const receiver = process.env.RECEIVER_ADDRESS || '';
  const tokens = (process.env.EXEC_TOKENS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const amounts = (process.env.EXEC_AMOUNTS || '').split(',').map((s) => s.trim()).filter(Boolean).map((n) => BigInt(n));
  if (!vault || !receiver || tokens.length === 0 || amounts.length === 0) {
    logger.info('[mempool] execution not configured; watcher will only log');
  }

  const routerIface = new ethers.Interface(ROUTER_ABI);

  cfg.provider.on('pending', async (hash: string) => {
    try {
      const tx = await cfg.provider.getTransaction(hash);
      if (!tx || !tx.to || !tx.data) return;

      // Attempt to parse as a Uniswap V3 router call
      let parsed: ethers.TransactionDescription | null = null;
      try {
        parsed = routerIface.parseTransaction({ data: tx.data, value: tx.value ?? 0n });
      } catch {
        // Not a recognized router call
      }
      if (!parsed) return;

      // Heuristic: estimate "notional" from msg.value when present (rare) or fall back to a minimum threshold
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
        '[mempool] profitable swap opportunity detected'
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
    } catch (e) {
      // keep the watcher resilient
    }
  });

  logger.info('[mempool] pending swap watcher started (Uniswap V3 decode)');
  return () => {
    cfg.provider.removeAllListeners('pending');
    logger.info('[mempool] pending swap watcher stopped');
  };
}
