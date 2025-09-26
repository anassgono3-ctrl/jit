import { log } from '../../modules/logger';
import { Backoff } from '../retry/backoff';
import { ErigonTxpoolMonitor } from '../mempool/erigon_txpool';
import { PendingTransactionMonitor } from '../mempool/pending_fallback';

export interface MempoolManagerOptions {
  erigonHttp?: string;
  wsFallback?: string;
  maxRetries?: number;
}

export type MonitorMode = 'erigon' | 'fallback' | 'none';

export interface MempoolManagerStatus {
  mode: MonitorMode;
  erigonConnected: boolean;
  fallbackConnected: boolean;
  retryAttempt: number;
  lastError?: string;
}

export class MempoolManager {
  private erigon?: ErigonTxpoolMonitor;
  private fallback?: PendingTransactionMonitor;
  private activeMode: MonitorMode = 'none';
  private backoff = new Backoff({ baseMs: 1000, jitter: true, maxMs: 30000 });
  private retryTimeout?: NodeJS.Timeout;

  constructor(
    private opts: MempoolManagerOptions,
    private onSwapCandidate: (candidate: any) => void
  ) {}

  async start(): Promise<void> {
    log.info('Starting mempool monitoring');
    
    // Try Erigon first
    if (this.opts.erigonHttp) {
      const success = await this.tryStartErigon();
      if (success) {
        return;
      }
    }

    // Fallback to WebSocket
    await this.startFallback();
  }

  private async tryStartErigon(): Promise<boolean> {
    try {
      this.erigon = new ErigonTxpoolMonitor(this.opts.erigonHttp!, this.onSwapCandidate);
      const supported = await this.erigon.initialize();
      
      if (supported) {
        await this.erigon.start();
        this.activeMode = 'erigon';
        this.backoff.reset();
        log.info('Started in Erigon mode');
        return true;
      } else {
        log.warn('Erigon txpool methods not supported');
        return false;
      }
    } catch (error) {
      log.error('Failed to start Erigon monitor', { error });
      return false;
    }
  }

  private async startFallback(): Promise<void> {
    if (!this.opts.wsFallback) {
      log.warn('No fallback WS RPC configured');
      this.activeMode = 'none';
      return;
    }

    try {
      this.fallback = new PendingTransactionMonitor(this.opts.wsFallback, this.onSwapCandidate);
      await this.fallback.start();
      this.activeMode = 'fallback';
      this.backoff.reset();
      log.info('Started in fallback pending mode');
    } catch (error) {
      log.error('Failed to start fallback monitor', { error });
      this.activeMode = 'none';
      throw error;
    }
  }

  async handleFailure(kind: 'erigon' | 'fallback', error: unknown): Promise<void> {
    log.error(`Monitor failure: ${kind}`, { error });
    
    if (!this.backoff.hasMoreAttempts()) {
      log.error('Maximum retry attempts exceeded');
      this.activeMode = 'none';
      return;
    }

    const wait = this.backoff.next();
    log.warn(`Restarting ${kind} in ${wait}ms`, { 
      attempt: this.backoff.getAttempt() 
    });

    this.retryTimeout = setTimeout(async () => {
      try {
        if (kind === 'erigon' && this.erigon) {
          await this.erigon.stop();
          const success = await this.tryStartErigon();
          if (!success) {
            await this.startFallback();
          }
        } else if (kind === 'fallback' && this.fallback) {
          await this.fallback.stop();
          await this.startFallback();
        }
      } catch (e) {
        log.error(`Retry start failed (${kind})`, { error: e });
        await this.handleFailure(kind, e);
      }
    }, wait);
  }

  async stop(): Promise<void> {
    log.info('Stopping mempool monitoring');
    
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }

    if (this.erigon) {
      await this.erigon.stop();
      this.erigon = undefined;
    }

    if (this.fallback) {
      await this.fallback.stop();
      this.fallback = undefined;
    }

    this.activeMode = 'none';
  }

  getStatus(): MempoolManagerStatus {
    return {
      mode: this.activeMode,
      erigonConnected: this.erigon ? this.activeMode === 'erigon' : false,
      fallbackConnected: this.fallback?.isMonitoring() ?? false,
      retryAttempt: this.backoff.getAttempt()
    };
  }

  isMonitoring(): boolean {
    return this.activeMode !== 'none';
  }
}
