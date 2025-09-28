import { EventEmitter } from 'events';
import logger from '../../modules/logger';

export interface PendingSwapDetected {
  txHash: string;
  sender: string;
  target?: string;
  poolAddress?: string;
  amountIn?: bigint;
  amountOutMin?: bigint;
  path?: string[]; // token path when detectable
  gasLimit?: bigint;
  nonce?: number;
  maxFeePerGasGwei?: number;
  maxPriorityFeePerGasGwei?: number;
  raw?: {
    to?: string;
    input?: string;
    value?: string;
  };
}

export interface ErigonTxpoolAdapterOptions {
  rpcUrl: string;
  pollMs?: number;
  uniswapRouters?: string[]; // optional allow-list of router addresses
}

/**
 * Erigon txpool adapter (polling-focused; watch hook is pluggable later).
 * This is a safe scaffold: it parses minimal tx fields and emits PendingSwapDetected
 * for plausible router calls; decoding is intentionally basic and can be extended.
 */
export class ErigonTxpoolAdapter extends EventEmitter {
  private readonly rpcUrl: string;
  private readonly pollMs: number;
  private readonly routers: Set<string>;

  private running = false;
  private seen = new Set<string>();
  private timer?: NodeJS.Timeout;

  constructor(opts: ErigonTxpoolAdapterOptions) {
    super();
    this.rpcUrl = opts.rpcUrl;
    this.pollMs = opts.pollMs ?? 1500;
    this.routers = new Set((opts.uniswapRouters ?? []).map((a) => a.toLowerCase()));
  }

  start() {
    if (this.running) return;
    this.running = true;
    logger.info({ rpcUrl: this.rpcUrl }, '[erigon-txpool] starting poll loop');
    // For now, no live polling: keep as a placeholder; real integration will use txpool_content.
    // We expose feedFixture() for tests/backtests.
    this.schedule();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    logger.info('[erigon-txpool] stopped');
  }

  /** Test/backtest hook to inject a raw tx-like object */
  feedFixture(tx: { hash: string; from: string; to?: string; input?: string; gas?: string; nonce?: number; maxFeePerGas?: string; maxPriorityFeePerGas?: string; value?: string; }) {
    const evt = this.tryParse(tx);
    if (evt && !this.seen.has(evt.txHash)) {
      this.seen.add(evt.txHash);
      this.emit('pendingSwap', evt);
    }
  }

  private schedule() {
    if (!this.running) return;
    this.timer = setTimeout(() => this.schedule(), this.pollMs);
  }

  private tryParse(tx: { hash: string; from: string; to?: string; input?: string; gas?: string; nonce?: number; maxFeePerGas?: string; maxPriorityFeePerGas?: string; value?: string; }): PendingSwapDetected | null {
    const to = (tx.to || '').toLowerCase();
    const input = (tx.input || '').toLowerCase();
    
    // Allow all addresses if no router filter is configured (for tests)
    const isRouter = this.routers.size === 0 ? true : this.routers.has(to);
    const looksLikeSwap = input && input.startsWith('0x') && input.length >= 10; // Changed from > 10 to >= 10

    if (!isRouter || !looksLikeSwap) {
      return null;
    }

    // Minimal, selector-only heuristic (extend later)
    // We do not fully decode here; that belongs to a robust ABI layer.
    const gasLimit = tx.gas ? BigInt(tx.gas) : undefined;
    const maxFeePerGasGwei = tx.maxFeePerGas ? Math.round(Number(BigInt(tx.maxFeePerGas) / BigInt(1e9))) : undefined;
    const maxPriorityFeePerGasGwei = tx.maxPriorityFeePerGas ? Math.round(Number(BigInt(tx.maxPriorityFeePerGas) / BigInt(1e9))) : undefined;

    const evt: PendingSwapDetected = {
      txHash: tx.hash,
      sender: tx.from,
      target: tx.to,
      gasLimit,
      nonce: tx.nonce,
      maxFeePerGasGwei,
      maxPriorityFeePerGasGwei,
      raw: { to: tx.to, input: tx.input, value: tx.value },
      // Optional parsed fields to be filled when decoding is added:
      poolAddress: undefined,
      amountIn: undefined,
      amountOutMin: undefined,
      path: undefined,
    };

    logger.info({ txHash: evt.txHash, to: evt.target }, '[erigon-txpool] pending swap candidate');
    return evt;
  }
}