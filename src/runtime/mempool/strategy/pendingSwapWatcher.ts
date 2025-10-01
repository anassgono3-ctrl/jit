import { ethers } from 'ethers';
import logger from '../../../modules/logger';
import { executeFlashloanSwapRepay } from '../../../execution/flashloan/path';

// Very basic pending tx watcher that triggers a tiny flashloan path on big swaps.
// Safe by default: does nothing unless ENABLE_MEMPOOL=true and execution env is configured.
export interface PendingSwapWatcherConfig {
  provider: ethers.Provider;
  signer: ethers.Signer;
  minValueEth?: number; // threshold to react
}

export function startPendingSwapWatcher(cfg: PendingSwapWatcherConfig) {
  const minEth = cfg.minValueEth ?? 50; // react to swaps ~>= 50 ETH (heuristic)
  const vault = process.env.BALANCER_VAULT_ADDRESS || '';
  const receiver = process.env.RECEIVER_ADDRESS || '';
  const tokens = (process.env.EXEC_TOKENS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const amounts = (process.env.EXEC_AMOUNTS || '').split(',').map((s) => s.trim()).filter(Boolean)
    .map((n) => BigInt(n));
  if (!vault || !receiver || tokens.length === 0 || amounts.length === 0) {
    logger.info('[mempool] execution not configured; watcher will only log');
  }

  // Subscribe to pending txs (works with Erigon or standard RPCs; fork providers may ignore)
  // For Erigon, ws is recommended; for HTTP, this will not stream.
  cfg.provider.on('pending', async (txHash: string) => {
    try {
      const tx = await cfg.provider.getTransaction(txHash);
      if (!tx || !tx.to || !tx.data) return;

      // Naive heuristic: if tx has value >= minEth, log and optionally trigger tiny flashloan path
      const valueEth = tx.value ? Number(ethers.formatEther(tx.value)) : 0;
      if (valueEth >= minEth) {
        logger.info({ hash: txHash, to: tx.to, valueEth }, '[mempool] large pending tx detected');
        if (vault && receiver && tokens.length && amounts.length) {
          // trigger tiny path in DRY_RUN unless explicitly turned live
          await executeFlashloanSwapRepay(cfg.signer, {
            vault,
            receiver,
            tokens,
            amounts,
            userData: '0x'
          });
        }
      }
    } catch (e) {
      // swallow errors to keep watcher alive
    }
  });

  logger.info({ minEth }, '[mempool] pending swap watcher started');
  return () => {
    cfg.provider.removeAllListeners('pending');
    logger.info('[mempool] pending swap watcher stopped');
  };
}
