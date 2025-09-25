import Decimal from 'decimal.js';
import { PoolState, PoolConfig, validatePoolState } from '../sim/pool_state';

// Configure decimal.js for high precision
Decimal.config({
  precision: 50,
  rounding: Decimal.ROUND_DOWN,
});

/**
 * Pool health metrics
 */
export interface PoolHealth {
  /** Overall health score (0-100) */
  healthScore: number;
  /** Liquidity adequacy (0-1) */
  liquidityScore: number;
  /** Fee tier efficiency (0-1) */
  feeEfficiency: number;
  /** Volatility measure (0-5+) */
  volatility: number;
  /** Trading volume score (0-1) */
  volumeScore: number;
  /** Last update timestamp */
  lastUpdated: number;
  /** Issues detected */
  issues: string[];
}

/**
 * Pool priority configuration
 */
export interface PoolPriority {
  /** Pool address */
  address: string;
  /** Priority weight (higher = more preferred) */
  weight: number;
  /** Minimum swap size for this pool */
  minSwapSize: number;
  /** Maximum position size for this pool */
  maxPositionSize: number;
  /** Enable/disable pool */
  enabled: boolean;
}

/**
 * Pool manager for strategy coordination
 */
export class PoolManager {
  private pools: Map<string, PoolConfig> = new Map();
  private poolStates: Map<string, PoolState> = new Map();
  private poolHealth: Map<string, PoolHealth> = new Map();
  private poolPriorities: Map<string, PoolPriority> = new Map();

  /**
   * Loads pool configurations from JSON
   * @param poolsConfig Array of pool configurations
   */
  loadPoolConfigs(poolsConfig: PoolConfig[]): void {
    for (const config of poolsConfig) {
      this.pools.set(config.address, config);
      
      // Set default priority
      this.poolPriorities.set(config.address, {
        address: config.address,
        weight: this.getDefaultWeight(config),
        minSwapSize: this.getDefaultMinSwapSize(config),
        maxPositionSize: this.getDefaultMaxPositionSize(config),
        enabled: true,
      });
    }
  }

  /**
   * Updates pool state for a specific pool
   * @param address Pool address
   * @param state New pool state
   */
  updatePoolState(address: string, state: PoolState): void {
    if (!this.pools.has(address)) {
      throw new Error(`Pool ${address} not found in configuration`);
    }

    if (!validatePoolState(state)) {
      throw new Error(`Invalid pool state for ${address}`);
    }

    this.poolStates.set(address, state);
    this.updatePoolHealth(address, state);
  }

  /**
   * Gets current pool state
   * @param address Pool address
   * @returns Pool state or null if not found
   */
  getPoolState(address: string): PoolState | null {
    return this.poolStates.get(address) || null;
  }

  /**
   * Gets pool configuration
   * @param address Pool address
   * @returns Pool config or null if not found
   */
  getPoolConfig(address: string): PoolConfig | null {
    return this.pools.get(address) || null;
  }

  /**
   * Selects best candidate pool for JIT strategy
   * @param swapSizeUsd Size of target swap
   * @param preferredFeeTier Preferred fee tier (optional)
   * @returns Best pool address or null
   */
  selectCandidatePool(
    swapSizeUsd: string,
    preferredFeeTier?: number
  ): string | null {
    const swapSize = new Decimal(swapSizeUsd);
    const candidates: Array<{ address: string; score: number }> = [];

    for (const [address, priority] of this.poolPriorities) {
      if (!priority.enabled) continue;

      const config = this.pools.get(address);
      const health = this.poolHealth.get(address);
      const state = this.poolStates.get(address);

      if (!config || !health || !state) continue;

      // Check minimum swap size
      if (swapSize.lt(priority.minSwapSize)) continue;

      // Check fee tier preference
      if (preferredFeeTier && config.fee !== preferredFeeTier) continue;

      // Calculate selection score
      let score = priority.weight;

      // Health score component (30%)
      score *= (0.7 + 0.3 * (health.healthScore / 100));

      // Liquidity adequacy component (25%)
      score *= (0.75 + 0.25 * health.liquidityScore);

      // Volume activity component (20%)
      score *= (0.8 + 0.2 * health.volumeScore);

      // Fee efficiency component (15%)
      score *= (0.85 + 0.15 * health.feeEfficiency);

      // Volatility penalty (10%) - high volatility reduces score
      const volatilityPenalty = Math.min(1, health.volatility / 3);
      score *= (1 - 0.1 * volatilityPenalty);

      candidates.push({ address, score });
    }

    if (candidates.length === 0) return null;

    // Sort by score and return best candidate
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].address;
  }

  /**
   * Gets all active pools sorted by priority
   * @returns Array of pool addresses sorted by priority
   */
  getActivePoolsSorted(): string[] {
    return Array.from(this.poolPriorities.entries())
      .filter(([, priority]) => priority.enabled)
      .sort((a, b) => b[1].weight - a[1].weight)
      .map(([address]) => address);
  }

  /**
   * Updates pool priority configuration
   * @param address Pool address
   * @param priority New priority configuration
   */
  updatePoolPriority(address: string, priority: Partial<PoolPriority>): void {
    const existing = this.poolPriorities.get(address);
    if (!existing) {
      throw new Error(`Pool ${address} not found`);
    }

    this.poolPriorities.set(address, { ...existing, ...priority });
  }

  /**
   * Gets pool health metrics
   * @param address Pool address
   * @returns Pool health or null if not found
   */
  getPoolHealth(address: string): PoolHealth | null {
    return this.poolHealth.get(address) || null;
  }

  /**
   * Disables a pool (emergency stop)
   * @param address Pool address
   * @param reason Reason for disabling
   */
  disablePool(address: string, reason: string): void {
    const priority = this.poolPriorities.get(address);
    if (priority) {
      priority.enabled = false;
      this.poolPriorities.set(address, priority);
    }

    const health = this.poolHealth.get(address);
    if (health) {
      health.issues.push(`DISABLED: ${reason}`);
      this.poolHealth.set(address, health);
    }
  }

  /**
   * Re-enables a previously disabled pool
   * @param address Pool address
   */
  enablePool(address: string): void {
    const priority = this.poolPriorities.get(address);
    if (priority) {
      priority.enabled = true;
      this.poolPriorities.set(address, priority);
    }

    const health = this.poolHealth.get(address);
    if (health) {
      health.issues = health.issues.filter(issue => !issue.startsWith('DISABLED:'));
      this.poolHealth.set(address, health);
    }
  }

  /**
   * Validates if a pool is suitable for JIT strategy
   * @param address Pool address
   * @param swapSizeUsd Target swap size
   * @returns Validation result with issues
   */
  validatePoolForJit(
    address: string,
    swapSizeUsd: string
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const swapSize = new Decimal(swapSizeUsd);

    const config = this.pools.get(address);
    const state = this.poolStates.get(address);
    const health = this.poolHealth.get(address);
    const priority = this.poolPriorities.get(address);

    if (!config) {
      issues.push('Pool configuration not found');
    }

    if (!state) {
      issues.push('Pool state not available');
    }

    if (!health) {
      issues.push('Pool health data not available');
    }

    if (!priority) {
      issues.push('Pool priority configuration not found');
    }

    if (priority && !priority.enabled) {
      issues.push('Pool is disabled');
    }

    if (priority && swapSize.lt(priority.minSwapSize)) {
      issues.push(`Swap size below minimum (${priority.minSwapSize})`);
    }

    if (state && new Decimal(state.liquidity).lte(0)) {
      issues.push('Pool has no liquidity');
    }

    if (health && health.healthScore < 30) {
      issues.push('Pool health score too low');
    }

    if (health && health.volatility > 4) {
      issues.push('Pool volatility too high');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Gets statistics across all pools
   * @returns Pool manager statistics
   */
  getStatistics(): {
    totalPools: number;
    activePools: number;
    averageHealth: number;
    totalLiquidity: string;
    issuesCount: number;
  } {
    const totalPools = this.pools.size;
    const activePools = Array.from(this.poolPriorities.values())
      .filter(p => p.enabled).length;

    const healthScores = Array.from(this.poolHealth.values())
      .map(h => h.healthScore);
    const averageHealth = healthScores.length > 0
      ? healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length
      : 0;

    const totalLiquidity = Array.from(this.poolStates.values())
      .reduce((sum, state) => sum.add(new Decimal(state.liquidity)), new Decimal(0))
      .toString();

    const issuesCount = Array.from(this.poolHealth.values())
      .reduce((sum, health) => sum + health.issues.length, 0);

    return {
      totalPools,
      activePools,
      averageHealth,
      totalLiquidity,
      issuesCount,
    };
  }

  /**
   * Updates pool health metrics based on current state
   */
  private updatePoolHealth(address: string, state: PoolState): void {
    const config = this.pools.get(address);
    if (!config) return;

    const health: PoolHealth = {
      healthScore: 0,
      liquidityScore: 0,
      feeEfficiency: 0,
      volatility: 1,
      volumeScore: 0.5, // Default middle score
      lastUpdated: Date.now(),
      issues: [],
    };

    // Calculate liquidity score
    const liquidity = new Decimal(state.liquidity);
    const liquidityThreshold = new Decimal(1000000); // $1M threshold
    health.liquidityScore = Math.min(1, liquidity.div(liquidityThreshold).toNumber());

    // Calculate fee efficiency (simplified)
    health.feeEfficiency = Math.min(1, config.fee / 3000); // Normalize to 0.3%

    // Calculate overall health score
    health.healthScore = (
      health.liquidityScore * 40 +
      health.feeEfficiency * 25 +
      health.volumeScore * 100 * 20 +
      (1 / health.volatility) * 15
    );

    // Add issues if any
    if (health.liquidityScore < 0.1) {
      health.issues.push('Low liquidity');
    }
    if (health.volatility > 3) {
      health.issues.push('High volatility');
    }

    this.poolHealth.set(address, health);
  }

  /**
   * Gets default priority weight for a pool
   */
  private getDefaultWeight(config: PoolConfig): number {
    // Higher weights for:
    // - Lower fee tiers (more volume)
    // - Common token pairs
    let weight = 1.0;

    // Fee tier adjustment
    if (config.fee === 500) weight *= 1.5;  // 0.05% pools
    else if (config.fee === 3000) weight *= 1.2; // 0.3% pools
    else if (config.fee === 10000) weight *= 0.8; // 1% pools

    // Token pair popularity (simplified)
    const isEthPair = config.token0.toLowerCase().includes('c02aaa') || 
                      config.token1.toLowerCase().includes('c02aaa');
    const isUsdcPair = config.token0.toLowerCase().includes('a0b869') || 
                       config.token1.toLowerCase().includes('a0b869');
    
    if (isEthPair && isUsdcPair) weight *= 1.8; // ETH/USDC pairs
    else if (isEthPair || isUsdcPair) weight *= 1.3; // ETH or USDC pairs

    return weight;
  }

  /**
   * Gets default minimum swap size for a pool
   */
  private getDefaultMinSwapSize(config: PoolConfig): number {
    // Higher minimums for higher fee tiers
    switch (config.fee) {
      case 500: return 50000;   // 0.05% - $50k minimum
      case 3000: return 10000;  // 0.3% - $10k minimum
      case 10000: return 5000;  // 1% - $5k minimum
      default: return 10000;
    }
  }

  /**
   * Gets default maximum position size for a pool
   */
  private getDefaultMaxPositionSize(config: PoolConfig): number {
    // Conservative position sizing
    return 500000; // $500k max position
  }
}