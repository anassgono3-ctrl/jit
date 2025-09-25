import { ethers } from 'ethers';
import { log } from '../../modules/logger';

/**
 * Transaction candidate from Erigon txpool
 */
export interface SwapCandidate {
  txHash: string;
  from: string;
  to: string;
  value: string;
  gasPrice: string;
  gasLimit: string;
  data: string;
  decodedRoute?: {
    tokenIn: string;
    tokenOut: string;
    feeTier: number;
  };
  amountIn?: string;
  estimatedAmountOut?: string;
}

/**
 * Erigon txpool integration for efficient mempool monitoring
 */
export class ErigonTxpoolMonitor {
  private provider: ethers.JsonRpcProvider;
  private isErigonSupported: boolean = false;
  private pollingInterval: number = 1000; // 1 second
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;

  constructor(
    rpcUrl: string,
    private onSwapCandidate: (candidate: SwapCandidate) => void
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Initialize and detect Erigon support
   */
  async initialize(): Promise<boolean> {
    try {
      // Probe for Erigon-specific txpool methods
      await this.provider.send('txpool_status', []);
      await this.provider.send('txpool_content', []);
      
      this.isErigonSupported = true;
      log.info('[ERIGON-TXPOOL] Erigon txpool support detected', {
        rpcUrl: this.provider._getConnection().url
      });
      
      return true;
    } catch (error) {
      this.isErigonSupported = false;
      log.info('[ERIGON-TXPOOL] Erigon txpool not supported, will use fallback', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }

  /**
   * Start monitoring the txpool
   */
  async start(): Promise<void> {
    if (!this.isErigonSupported) {
      throw new Error('Erigon txpool not supported. Use fallback monitor instead.');
    }

    if (this.isRunning) {
      log.warn('[ERIGON-TXPOOL] Monitor already running');
      return;
    }

    this.isRunning = true;
    log.info('[ERIGON-TXPOOL] Starting txpool monitoring', {
      pollingInterval: this.pollingInterval
    });

    // Start polling loop
    this.intervalId = setInterval(() => {
      this.pollTxpool().catch(error => {
        log.error('[ERIGON-TXPOOL] Polling error', { error });
      });
    }, this.pollingInterval);

    // Initial poll
    await this.pollTxpool();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    log.info('[ERIGON-TXPOOL] Stopped txpool monitoring');
  }

  /**
   * Poll txpool for new transactions
   */
  private async pollTxpool(): Promise<void> {
    try {
      // Get pending transactions from Erigon txpool
      const txpoolContent = await this.provider.send('txpool_content', []);
      const pendingTxs = txpoolContent.pending || {};

      // Process transactions from each account
      for (const [account, nonceTxs] of Object.entries(pendingTxs)) {
        if (typeof nonceTxs !== 'object' || !nonceTxs) continue;

        for (const [nonce, tx] of Object.entries(nonceTxs as Record<string, any>)) {
          if (typeof tx === 'object' && tx) {
            await this.processPendingTx(tx);
          }
        }
      }
    } catch (error) {
      log.error('[ERIGON-TXPOOL] Failed to poll txpool', { error });
    }
  }

  /**
   * Process a pending transaction and extract swap candidates
   */
  private async processPendingTx(tx: any): Promise<void> {
    try {
      // Basic transaction validation
      if (!tx.hash || !tx.to || !tx.data) {
        return;
      }

      // Skip non-contract calls
      if (!tx.data || tx.data === '0x') {
        return;
      }

      // Decode transaction data to identify swaps
      const decodedRoute = await this.decodeSwapTransaction(tx);
      if (!decodedRoute) {
        return; // Not a swap transaction
      }

      const candidate: SwapCandidate = {
        txHash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value || '0',
        gasPrice: tx.gasPrice || '0',
        gasLimit: tx.gas || '0',
        data: tx.data,
        decodedRoute,
        amountIn: decodedRoute.amountIn,
      };

      log.debug('[ERIGON-TXPOOL] Swap candidate identified', {
        txHash: candidate.txHash,
        tokenIn: decodedRoute.tokenIn,
        tokenOut: decodedRoute.tokenOut,
        feeTier: decodedRoute.feeTier,
        amountIn: candidate.amountIn
      });

      // Forward to callback
      this.onSwapCandidate(candidate);

    } catch (error) {
      log.debug('[ERIGON-TXPOOL] Failed to process pending tx', { 
        txHash: tx.hash,
        error 
      });
    }
  }

  /**
   * Decode swap transaction data to extract route information
   */
  private async decodeSwapTransaction(tx: any): Promise<SwapCandidate['decodedRoute'] & { amountIn?: string } | null> {
    try {
      const data = tx.data;
      
      // Common Uniswap V3 swap function selectors
      const swapSelectors = {
        // exactInputSingle
        '0x414bf389': this.decodeExactInputSingle.bind(this),
        // exactOutputSingle  
        '0xdb3e2198': this.decodeExactOutputSingle.bind(this),
        // exactInput (multi-hop)
        '0xc04b8d59': this.decodeExactInput.bind(this),
        // exactOutput (multi-hop)
        '0xf28c0498': this.decodeExactOutput.bind(this),
      };

      const selector = data.slice(0, 10);
      const decoder = swapSelectors[selector as keyof typeof swapSelectors];
      
      if (decoder) {
        return await decoder(data);
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Decode exactInputSingle function call
   */
  private decodeExactInputSingle(data: string): SwapCandidate['decodedRoute'] & { amountIn?: string } | null {
    try {
      // exactInputSingle(ExactInputSingleParams calldata params)
      // struct ExactInputSingleParams {
      //     address tokenIn;
      //     address tokenOut;
      //     uint24 fee;
      //     address recipient;
      //     uint256 deadline;
      //     uint256 amountIn;
      //     uint256 amountOutMinimum;
      //     uint160 sqrtPriceLimitX96;
      // }
      
      const iface = new ethers.Interface([
        'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params)'
      ]);
      
      const decoded = iface.parseTransaction({ data });
      if (!decoded) return null;

      const params = decoded.args[0];
      
      return {
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        feeTier: params.fee,
        amountIn: params.amountIn.toString()
      };
    } catch {
      return null;
    }
  }

  /**
   * Decode exactOutputSingle function call
   */
  private decodeExactOutputSingle(data: string): SwapCandidate['decodedRoute'] & { amountIn?: string } | null {
    try {
      const iface = new ethers.Interface([
        'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96) params)'
      ]);
      
      const decoded = iface.parseTransaction({ data });
      if (!decoded) return null;

      const params = decoded.args[0];
      
      return {
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        feeTier: params.fee,
        amountIn: params.amountInMaximum.toString() // Max amount in for exact output
      };
    } catch {
      return null;
    }
  }

  /**
   * Decode exactInput multi-hop function call
   */
  private decodeExactInput(data: string): SwapCandidate['decodedRoute'] & { amountIn?: string } | null {
    try {
      const iface = new ethers.Interface([
        'function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum) params)'
      ]);
      
      const decoded = iface.parseTransaction({ data });
      if (!decoded) return null;

      const params = decoded.args[0];
      const path = params.path;
      
      // Decode path to get first hop
      const firstHop = this.decodeFirstHopFromPath(path);
      if (!firstHop) return null;
      
      return {
        tokenIn: firstHop.tokenIn,
        tokenOut: firstHop.tokenOut,
        feeTier: firstHop.feeTier,
        amountIn: params.amountIn.toString()
      };
    } catch {
      return null;
    }
  }

  /**
   * Decode exactOutput multi-hop function call
   */
  private decodeExactOutput(data: string): SwapCandidate['decodedRoute'] & { amountIn?: string } | null {
    try {
      const iface = new ethers.Interface([
        'function exactOutput((bytes path, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum) params)'
      ]);
      
      const decoded = iface.parseTransaction({ data });
      if (!decoded) return null;

      const params = decoded.args[0];
      const path = params.path;
      
      // Decode path to get first hop (note: exactOutput path is reversed)
      const firstHop = this.decodeFirstHopFromPath(path, true);
      if (!firstHop) return null;
      
      return {
        tokenIn: firstHop.tokenIn,
        tokenOut: firstHop.tokenOut, 
        feeTier: firstHop.feeTier,
        amountIn: params.amountInMaximum.toString()
      };
    } catch {
      return null;
    }
  }

  /**
   * Decode first hop from Uniswap V3 path encoding
   */
  private decodeFirstHopFromPath(path: string, reversed: boolean = false): { tokenIn: string; tokenOut: string; feeTier: number } | null {
    try {
      // Uniswap V3 path format: token0 (20 bytes) + fee (3 bytes) + token1 (20 bytes) + ...
      const pathBytes = ethers.getBytes(path);
      
      if (pathBytes.length < 43) { // 20 + 3 + 20 = 43 bytes minimum
        return null;
      }

      const token0 = ethers.getAddress('0x' + Buffer.from(pathBytes.slice(0, 20)).toString('hex'));
      const feeBytes = pathBytes.slice(20, 23);
      const fee = (feeBytes[0] << 16) | (feeBytes[1] << 8) | feeBytes[2];
      const token1 = ethers.getAddress('0x' + Buffer.from(pathBytes.slice(23, 43)).toString('hex'));

      if (reversed) {
        return {
          tokenIn: token1,
          tokenOut: token0,
          feeTier: fee
        };
      } else {
        return {
          tokenIn: token0,
          tokenOut: token1,
          feeTier: fee
        };
      }
    } catch {
      return null;
    }
  }

  /**
   * Get txpool status
   */
  async getStatus(): Promise<{ pending: number; queued: number } | null> {
    if (!this.isErigonSupported) {
      return null;
    }

    try {
      const status = await this.provider.send('txpool_status', []);
      return {
        pending: parseInt(status.pending, 16) || 0,
        queued: parseInt(status.queued, 16) || 0
      };
    } catch {
      return null;
    }
  }
}