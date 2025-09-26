/**
 * Strategy module types for profitability evaluation
 */

/**
 * Simulation result from execution_sim
 */
export interface SimulationResult {
  /** Fees in token0 USD value */
  feesToken0Usd?: number;
  /** Fees in token1 USD value */
  feesToken1Usd?: number;
  /** Flashloan fees USD value */
  flashloanFeesUsd?: number;
  /** Gas cost in USD */
  gasUsd?: number;
  /** Estimated gas units */
  estimatedGas?: number;
  /** Gas price in Gwei */
  gasPriceGwei?: number;
  /** ETH price in USD */
  ethUsdPrice?: number;
}

/**
 * Strategy profitability decision
 */
export interface Decision {
  /** Whether to accept the plan */
  accept: boolean;
  /** Expected net USD profit */
  expectedNetUsd: number;
  /** Strategy score (higher is better) */
  score: number;
  /** Reason for rejection (if any) */
  reason?: string;
}

/**
 * Configuration for profitability evaluation
 */
export interface ProfitabilityConfig {
  /** Minimum profit threshold in USD */
  minProfitUsd: number;
  /** Expected capture fraction (0-1) */
  captureFraction: number;
  /** Expected inclusion probability (0-1) */
  inclusionProbability: number;
}