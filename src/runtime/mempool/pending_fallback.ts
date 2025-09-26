import { ethers } from 'ethers';
import { log } from '../../modules/logger';
import { SwapCandidate } from './erigon_txpool';

/**
 * Fallback mempool monitor using standard eth_subscribe pendingTransactions
 */
export class PendingTransactionMonitor {
  private provider: ethers.WebSocketProvider;
  private subscription: string | null = null;
  private isRunning: boolean = false;

  constructor(
    wsUrl: string,
    private onSwapCandidate: (candidate: SwapCandidate) => void
  ) {
    this.provider = new ethers.WebSocketProvider(wsUrl);
  }

  /**
   * Start monitoring pending transactions
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn('[ETH-PENDING] Monitor already running');
      return;
    }

    try {
      this.isRunning = true;
      
      // Subscribe to pending transactions
      this.subscription = await this.provider.send('eth_subscribe', ['pendingTransactions']);
      
      log.info('[ETH-PENDING] Started pending transaction monitoring', {
        subscription: this.subscription
      });

      // Listen for new pending transactions
      this.provider.on('pending', async (txHash: string) => {
        try {
          await this.processPendingTransaction(txHash);
        } catch (error) {
          log.debug('[ETH-PENDING] Failed to process pending transaction', {
            txHash,
            error
          });
        }
      });

      // Handle WebSocket connection errors
      if (this.provider.websocket && 'on' in this.provider.websocket) {
        (this.provider.websocket as any).on('error', (error: Error) => {
          log.error('[ETH-PENDING] WebSocket error', { error });
          this.handleConnectionError();
        });

        (this.provider.websocket as any).on('close', () => {
          log.warn('[ETH-PENDING] WebSocket connection closed');
          this.handleConnectionError();
        });
      }

    } catch (error) {
      this.isRunning = false;
      log.error('[ETH-PENDING] Failed to start pending transaction monitor', { error });
      throw error;
    }
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    try {
      // Unsubscribe from pending transactions
      if (this.subscription) {
        await this.provider.send('eth_unsubscribe', [this.subscription]);
        this.subscription = null;
      }

      // Close WebSocket connection
      if (this.provider.websocket) {
        this.provider.websocket.close();
      }

      log.info('[ETH-PENDING] Stopped pending transaction monitoring');
    } catch (error) {
      log.error('[ETH-PENDING] Error stopping monitor', { error });
    }
  }

  /**
   * Process a pending transaction
   */
  private async processPendingTransaction(txHash: string): Promise<void> {
    try {
      // Get transaction details
      const tx = await this.provider.getTransaction(txHash);
      if (!tx) {
        return;
      }

      // Skip if not a contract call
      if (!tx.to || !tx.data || tx.data === '0x') {
        return;
      }

      // Decode swap transaction
      const decodedRoute = await this.decodeSwapTransaction(tx);
      if (!decodedRoute) {
        return; // Not a swap transaction
      }

      const candidate: SwapCandidate = {
        txHash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value.toString(),
        gasPrice: tx.gasPrice?.toString() || '0',
        gasLimit: tx.gasLimit.toString(),
        data: tx.data,
        decodedRoute,
        amountIn: decodedRoute.amountIn,
      };

      log.debug('[ETH-PENDING] Swap candidate identified', {
        txHash: candidate.txHash,
        tokenIn: decodedRoute.tokenIn,
        tokenOut: decodedRoute.tokenOut,
        feeTier: decodedRoute.feeTier,
        amountIn: candidate.amountIn
      });

      // Forward to callback
      this.onSwapCandidate(candidate);

    } catch (error) {
      log.debug('[ETH-PENDING] Failed to process pending transaction', {
        txHash,
        error
      });
    }
  }

  /**
   * Decode swap transaction (reuse logic from ErigonTxpoolMonitor)
   */
  private async decodeSwapTransaction(tx: ethers.TransactionResponse): Promise<SwapCandidate['decodedRoute'] & { amountIn?: string } | null> {
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
        amountIn: params.amountInMaximum.toString()
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
      
      // Decode path to get first hop (exactOutput path is reversed)
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
      const pathBytes = ethers.getBytes(path);
      
      if (pathBytes.length < 43) {
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
   * Handle connection errors and attempt reconnect
   */
  private handleConnectionError(): void {
    if (!this.isRunning) {
      return;
    }

    log.warn('[ETH-PENDING] Connection error, attempting to reconnect in 5 seconds');
    
    setTimeout(async () => {
      if (this.isRunning) {
        try {
          await this.stop();
          await this.start();
        } catch (error) {
          log.error('[ETH-PENDING] Failed to reconnect', { error });
        }
      }
    }, 5000);
  }

  /**
   * Check if monitor is running
   */
  isMonitoring(): boolean {
    return this.isRunning;
  }
}