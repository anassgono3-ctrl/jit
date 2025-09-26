import { ethers } from 'ethers';
import { log } from '../../modules/logger';

export interface RpcEndpoint {
  url: string;
  weight: number;
}

export interface ProviderHealth {
  isHealthy: boolean;
  lastSuccess: number;
  lastFailure: number;
  consecutiveFailures: number;
  cooldownUntil: number;
}

export interface FailoverConfig {
  endpoints: RpcEndpoint[];
  maxRetries: number;
  cooldownMs: number;
  timeoutMs: number;
  healthCheckIntervalMs: number;
  circuitBreakerFailureThreshold: number;
}

/**
 * Multi-RPC failover provider with circuit breaker, health checks and exponential backoff
 */
export class FailoverProvider extends ethers.JsonRpcProvider {
  private config: FailoverConfig;
  private providers: Map<string, ethers.JsonRpcProvider> = new Map();
  private health: Map<string, ProviderHealth> = new Map();
  private currentIndex = 0;
  private lastRequestTime = 0;
  private requestCounter = 0;

  constructor(config: FailoverConfig) {
    // Initialize with the first available endpoint
    const firstEndpoint = config.endpoints[0];
    if (!firstEndpoint) {
      throw new Error('At least one RPC endpoint required');
    }

    super(firstEndpoint.url);
    this.config = config;

    // Initialize providers and health tracking
    for (const endpoint of config.endpoints) {
      const provider = new ethers.JsonRpcProvider(endpoint.url);
      this.providers.set(endpoint.url, provider);
      
      this.health.set(endpoint.url, {
        isHealthy: true,
        lastSuccess: Date.now(),
        lastFailure: 0,
        consecutiveFailures: 0,
        cooldownUntil: 0
      });
    }

    // Start periodic health checks
    if (config.healthCheckIntervalMs > 0) {
      setInterval(() => this.performHealthChecks(), config.healthCheckIntervalMs);
    }
  }

  /**
   * Get the next healthy provider using weighted round-robin
   */
  private getNextProvider(): { provider: ethers.JsonRpcProvider; url: string } | null {
    const now = Date.now();
    const availableEndpoints: Array<{ endpoint: RpcEndpoint; health: ProviderHealth }> = [];

    // Filter healthy endpoints not in cooldown
    for (const endpoint of this.config.endpoints) {
      const health = this.health.get(endpoint.url);
      if (health && health.isHealthy && now >= health.cooldownUntil) {
        availableEndpoints.push({ endpoint, health });
      }
    }

    if (availableEndpoints.length === 0) {
      log.error('All RPC providers are unhealthy or in cooldown');
      return null;
    }

    // Weighted round-robin selection
    const totalWeight = availableEndpoints.reduce((sum, item) => sum + item.endpoint.weight, 0);
    const targetWeight = (this.requestCounter++ % totalWeight);
    
    let currentWeight = 0;
    for (const item of availableEndpoints) {
      currentWeight += item.endpoint.weight;
      if (targetWeight < currentWeight) {
        const provider = this.providers.get(item.endpoint.url);
        if (provider) {
          return { provider, url: item.endpoint.url };
        }
      }
    }

    // Fallback to first available
    const fallback = availableEndpoints[0];
    const provider = this.providers.get(fallback.endpoint.url);
    return provider ? { provider, url: fallback.endpoint.url } : null;
  }

  /**
   * Mark a provider as failed and apply circuit breaker logic
   */
  private markProviderFailed(url: string, error: unknown): void {
    const health = this.health.get(url);
    if (!health) return;

    const now = Date.now();
    health.lastFailure = now;
    health.consecutiveFailures++;

    // Apply exponential backoff cooldown
    const backoffMs = Math.min(
      this.config.cooldownMs * Math.pow(2, health.consecutiveFailures - 1),
      this.config.cooldownMs * 8 // Cap at 8x base cooldown
    );
    health.cooldownUntil = now + backoffMs;

    // Circuit breaker: mark as unhealthy if too many consecutive failures
    if (health.consecutiveFailures >= this.config.circuitBreakerFailureThreshold) {
      health.isHealthy = false;
      log.warn('RPC provider marked unhealthy due to circuit breaker', {
        url,
        consecutiveFailures: health.consecutiveFailures,
        cooldownUntil: new Date(health.cooldownUntil).toISOString()
      });
    }

    log.debug('RPC provider failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
      consecutiveFailures: health.consecutiveFailures,
      cooldownMs: backoffMs
    });
  }

  /**
   * Mark a provider as successful
   */
  private markProviderSuccess(url: string): void {
    const health = this.health.get(url);
    if (!health) return;

    health.lastSuccess = Date.now();
    health.consecutiveFailures = 0;
    health.cooldownUntil = 0;
    health.isHealthy = true;
  }

  /**
   * Perform health checks on all providers
   */
  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.providers.entries()).map(async ([url, provider]) => {
      try {
        // Simple health check: get latest block number
        await provider.getBlockNumber();
        this.markProviderSuccess(url);
      } catch (error) {
        this.markProviderFailed(url, error);
      }
    });

    await Promise.allSettled(healthCheckPromises);
  }

  /**
   * Execute a request with failover logic
   */
  private async executeWithFailover<T>(
    operation: (provider: ethers.JsonRpcProvider) => Promise<T>
  ): Promise<T> {
    let lastError: unknown;
    let attempts = 0;

    while (attempts < this.config.maxRetries) {
      const providerInfo = this.getNextProvider();
      if (!providerInfo) {
        throw new Error('No healthy RPC providers available');
      }

      try {
        const result = await Promise.race([
          operation(providerInfo.provider),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), this.config.timeoutMs)
          )
        ]);

        this.markProviderSuccess(providerInfo.url);
        return result;
      } catch (error) {
        lastError = error;
        attempts++;
        this.markProviderFailed(providerInfo.url, error);

        if (attempts < this.config.maxRetries) {
          // Add jitter to prevent thundering herd
          const jitterMs = Math.random() * 100;
          await new Promise(resolve => setTimeout(resolve, jitterMs));
        }
      }
    }

    throw lastError || new Error('All failover attempts exhausted');
  }

  // Override key JsonRpcProvider methods to use failover logic

  override async getBlockNumber(): Promise<number> {
    return this.executeWithFailover(provider => provider.getBlockNumber());
  }

  override async getBlock(blockHashOrBlockTag: string | number): Promise<ethers.Block | null> {
    return this.executeWithFailover(provider => provider.getBlock(blockHashOrBlockTag));
  }

  override async getTransaction(hash: string): Promise<ethers.TransactionResponse | null> {
    return this.executeWithFailover(provider => provider.getTransaction(hash));
  }

  override async getTransactionReceipt(hash: string): Promise<ethers.TransactionReceipt | null> {
    return this.executeWithFailover(provider => provider.getTransactionReceipt(hash));
  }

  override async estimateGas(tx: ethers.TransactionRequest): Promise<bigint> {
    return this.executeWithFailover(provider => provider.estimateGas(tx));
  }

  override async call(tx: ethers.TransactionRequest, blockTag?: ethers.BlockTag): Promise<string> {
    return this.executeWithFailover(provider => {
      const callTx = blockTag !== undefined ? { ...tx, blockTag } : tx;
      return provider.call(callTx);
    });
  }

  async broadcastTransaction(signedTx: string): Promise<ethers.TransactionResponse> {
    return this.executeWithFailover(provider => provider.broadcastTransaction(signedTx));
  }

  override async getFeeData(): Promise<ethers.FeeData> {
    return this.executeWithFailover(provider => provider.getFeeData());
  }

  /**
   * Get health status of all providers
   */
  getProviderHealthStatus(): Record<string, ProviderHealth & { url: string }> {
    const status: Record<string, ProviderHealth & { url: string }> = {};
    
    for (const [url, health] of this.health.entries()) {
      status[url] = { ...health, url };
    }
    
    return status;
  }

  /**
   * Get configuration summary
   */
  getConfigSummary(): { totalProviders: number; healthyProviders: number; config: FailoverConfig } {
    const now = Date.now();
    const healthyCount = Array.from(this.health.values())
      .filter(health => health.isHealthy && now >= health.cooldownUntil).length;

    return {
      totalProviders: this.config.endpoints.length,
      healthyProviders: healthyCount,
      config: this.config
    };
  }

  /**
   * Force health check on all providers
   */
  async forceHealthCheck(): Promise<void> {
    await this.performHealthChecks();
  }
}

/**
 * Create a failover provider from configuration
 */
export function createFailoverProvider(endpoints: RpcEndpoint[]): FailoverProvider {
  const config: FailoverConfig = {
    endpoints,
    maxRetries: 3,
    cooldownMs: 5000, // 5 seconds base cooldown
    timeoutMs: 10000, // 10 seconds request timeout
    healthCheckIntervalMs: 30000, // 30 seconds health check interval
    circuitBreakerFailureThreshold: 5 // Mark unhealthy after 5 consecutive failures
  };

  return new FailoverProvider(config);
}