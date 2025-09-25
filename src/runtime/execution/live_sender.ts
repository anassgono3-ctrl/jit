import { ethers } from 'ethers';
import { log } from '../../modules/logger';

/**
 * Live transaction sender for mainnet execution
 * This component is only active when DRY_RUN=false
 */
export class LiveTransactionSender {
  private wallet: ethers.Wallet | null = null;
  private provider: ethers.Provider;
  private isDryRun: boolean;

  constructor(
    provider: ethers.Provider,
    privateKey?: string,
    isDryRun: boolean = true
  ) {
    this.provider = provider;
    this.isDryRun = isDryRun;

    if (!isDryRun) {
      if (!privateKey) {
        throw new Error('PRIVATE_KEY is required when DRY_RUN=false');
      }
      
      this.wallet = new ethers.Wallet(privateKey, provider);
      log.info('[EXEC] Live transaction sender initialized', {
        address: this.wallet.address,
        isDryRun: false
      });
    } else {
      log.info('[EXEC] Dry-run mode enabled - no transactions will be sent', {
        isDryRun: true
      });
    }
  }

  /**
   * Send a transaction (only when not in dry-run mode)
   */
  async sendTransaction(
    to: string,
    data: string,
    value: bigint = 0n,
    gasLimit?: bigint,
    gasPrice?: bigint
  ): Promise<{ hash: string; success: boolean; error?: string }> {
    
    // Dry-run mode: simulate the transaction
    if (this.isDryRun) {
      return this.simulateTransaction(to, data, value, gasLimit, gasPrice);
    }

    // Live mode: send actual transaction
    if (!this.wallet) {
      throw new Error('Wallet not initialized for live mode');
    }

    try {
      const txRequest: ethers.TransactionRequest = {
        to,
        data,
        value: value.toString(),
      };

      // Set gas parameters
      if (gasLimit) {
        txRequest.gasLimit = gasLimit.toString();
      }
      
      if (gasPrice) {
        txRequest.gasPrice = gasPrice.toString();
      } else {
        // Auto-estimate gas price
        const feeData = await this.provider.getFeeData();
        if (feeData.gasPrice) {
          txRequest.gasPrice = feeData.gasPrice.toString();
        }
      }

      // Auto-estimate gas limit if not provided
      if (!gasLimit) {
        try {
          const estimatedGas = await this.wallet.estimateGas(txRequest);
          txRequest.gasLimit = (estimatedGas * 110n / 100n).toString(); // 10% buffer
        } catch (gasEstimateError) {
          log.warn('[EXEC] Gas estimation failed, using default', {
            error: gasEstimateError,
            defaultGasLimit: '500000'
          });
          txRequest.gasLimit = '500000';
        }
      }

      log.info('[EXEC] Sending transaction', {
        to: txRequest.to,
        value: txRequest.value,
        gasLimit: txRequest.gasLimit,
        gasPrice: txRequest.gasPrice,
        dataLength: data.length
      });

      const tx = await this.wallet.sendTransaction(txRequest);

      log.info('[EXEC] Transaction sent successfully', {
        hash: tx.hash,
        nonce: tx.nonce,
        to: tx.to,
        value: tx.value.toString(),
        gasLimit: tx.gasLimit.toString(),
        gasPrice: tx.gasPrice?.toString()
      });

      return {
        hash: tx.hash,
        success: true
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      log.error('[EXEC] Transaction failed', {
        error: errorMessage,
        to,
        value: value.toString()
      });

      return {
        hash: '',
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Simulate transaction execution (dry-run mode)
   */
  private async simulateTransaction(
    to: string,
    data: string,
    value: bigint,
    gasLimit?: bigint,
    gasPrice?: bigint
  ): Promise<{ hash: string; success: boolean; error?: string }> {
    
    try {
      // Generate a fake transaction hash for simulation
      const fakeHash = ethers.keccak256(
        ethers.toUtf8Bytes(`sim-${to}-${data}-${Date.now()}`)
      );

      // Try to estimate gas and simulate call
      const txRequest: ethers.TransactionRequest = {
        to,
        data,
        value: value.toString(),
      };

      // Simulate gas estimation
      let estimatedGas = gasLimit;
      if (!estimatedGas) {
        try {
          estimatedGas = await this.provider.estimateGas(txRequest);
        } catch (gasError) {
          log.debug('[SIM] Gas estimation failed in simulation', { error: gasError });
          estimatedGas = 500000n; // Default
        }
      }

      // Simulate static call to check for reverts
      try {
        await this.provider.call(txRequest);
      } catch (callError) {
        const errorMsg = callError instanceof Error ? callError.message : 'Call failed';
        
        log.warn('[SIM] Simulated transaction would revert', {
          hash: fakeHash,
          to,
          error: errorMsg,
          value: value.toString(),
          estimatedGas: estimatedGas.toString()
        });

        return {
          hash: fakeHash,
          success: false,
          error: `Simulation failed: ${errorMsg}`
        };
      }

      log.info('[SIM] Transaction simulation successful', {
        hash: fakeHash,
        to,
        value: value.toString(),
        estimatedGas: estimatedGas.toString(),
        dataLength: data.length
      });

      return {
        hash: fakeHash,
        success: true
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown simulation error';
      
      log.error('[SIM] Transaction simulation failed', {
        error: errorMessage,
        to,
        value: value.toString()
      });

      return {
        hash: '',
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForConfirmation(
    txHash: string,
    confirmations: number = 1,
    timeout: number = 60000
  ): Promise<{ success: boolean; receipt?: ethers.TransactionReceipt; error?: string }> {
    
    if (this.isDryRun) {
      // Simulate confirmation delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      log.info('[SIM] Simulated transaction confirmation', {
        hash: txHash,
        confirmations,
        status: 'success'
      });

      return { success: true };
    }

    try {
      log.info('[EXEC] Waiting for transaction confirmation', {
        hash: txHash,
        requiredConfirmations: confirmations,
        timeoutMs: timeout
      });

      const receipt = await this.provider.waitForTransaction(
        txHash,
        confirmations,
        timeout
      );

      if (!receipt) {
        return {
          success: false,
          error: 'Transaction receipt not found'
        };
      }

      const success = receipt.status === 1;
      
      log.info('[EXEC] Transaction confirmed', {
        hash: txHash,
        status: success ? 'success' : 'failed',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        confirmations
      });

      return {
        success,
        receipt,
        error: success ? undefined : 'Transaction reverted'
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      log.error('[EXEC] Transaction confirmation failed', {
        hash: txHash,
        error: errorMessage,
        timeout
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Get current wallet address (if in live mode)
   */
  getAddress(): string | null {
    return this.wallet?.address || null;
  }

  /**
   * Check if in dry-run mode
   */
  isDryRunMode(): boolean {
    return this.isDryRun;
  }

  /**
   * Get nonce for transaction ordering
   */
  async getNonce(): Promise<number> {
    if (this.isDryRun || !this.wallet) {
      return Math.floor(Math.random() * 1000000); // Fake nonce for simulation
    }

    return await this.wallet.getNonce();
  }

  /**
   * Get current balance
   */
  async getBalance(): Promise<bigint> {
    if (this.isDryRun || !this.wallet) {
      return 1000000000000000000n; // Fake 1 ETH balance for simulation
    }

    const balance = await this.provider.getBalance(this.wallet.address);
    return BigInt(balance.toString());
  }
}