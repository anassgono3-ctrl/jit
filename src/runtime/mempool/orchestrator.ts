import { EventEmitter } from 'events';
import { ErigonTxpoolAdapter, PendingSwapDetected } from './erigon_txpool_adapter';
import { loadConfig } from '../../config';
import logger from '../../modules/logger';

export class MempoolOrchestrator extends EventEmitter {
  private erigon?: ErigonTxpoolAdapter;
  private started = false;

  constructor() {
    super();
  }

  async start() {
    if (this.started) return;
    this.started = true;
    const cfg = loadConfig();

    const erigonUrl = process.env.ERIGON_RPC_HTTP || cfg.ERIGON_RPC_HTTP;
    if (erigonUrl) {
      this.erigon = new ErigonTxpoolAdapter({
        rpcUrl: erigonUrl,
        uniswapRouters: (process.env.UNISWAP_ROUTERS || '').split(',').map((s) => s.trim()).filter(Boolean),
      });
      this.erigon.on('pendingSwap', (evt: PendingSwapDetected) => this.emit('pendingSwap', evt));
      this.erigon.start();
      logger.info({ erigonUrl }, '[mempool] using Erigon txpool adapter');
    } else {
      logger.warn('[mempool] no ERIGON_RPC_HTTP configured; mempool disabled');
    }
  }

  async stop() {
    if (!this.started) return;
    this.started = false;
    this.erigon?.stop();
  }

  onPendingSwap(fn: (evt: PendingSwapDetected) => void) {
    this.on('pendingSwap', fn);
  }

  /** test/backtest helper */
  feedFixture(tx: Parameters<ErigonTxpoolAdapter['feedFixture']>[0]) {
    this.erigon?.feedFixture(tx);
  }
}