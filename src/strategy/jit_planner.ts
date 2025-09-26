import Decimal from 'decimal.js';
import { PoolState } from '../sim/pool_state';
import { JitPlan, SwapEvent, PriceFeed } from '../sim/execution_sim';
import { selectRange } from './range_selection';
import { estimateInclusionProbability, scorePlan } from './scoring';
import { liquidityForAmounts, getAmountsFromLiquidity } from '../math/liquidity_math';
import { calculateUsdValue } from '../math/price_utils';
import { evaluatePlan } from './profitability';
import { SimulationResult, ProfitabilityConfig } from './types';

// Configure decimal.js for high precision
Decimal.config({
  precision: 50,
  rounding: Decimal.ROUND_DOWN,
});

/**
 * Strategy configuration loaded from config file
 */
export interface StrategyConfig {
  /** Minimum swap USD value by fee tier */
  minSwapUsdByFeeTier: Record<string, number>;
  /** Minimum net profit in USD */
  minNetProfitUsd: number;
  /** Gas estimate in USD */
  gasEstimateUsd: number;
  /** Default capture fraction */
  captureFractionDefault: number;
  /** Default inclusion probability */
  inclusionProbabilityDefault: number;
  /** Default tick width settings */
  tickWidthDefaults: {
    narrow: number;
    medium: number;
    wide: number;
  };
  /** Flashloan fee in basis points */
  flashloanFeeBps: number;
  /** Maximum slippage in basis points */
  maxSlippageBps: number;
  /** Competition factor multiplier */
  competitionFactor: number;
  /** Risk adjustment factor */
  riskAdjustmentFactor: number;
}

/**
 * Swap size estimation from mempool transaction
 */
export interface SwapEstimate {
  /** Estimated USD size of the swap */
  swapSizeUsd: string;
  /** Estimated amount in */
  amountIn: string;
  /** Token being swapped in */
  tokenIn: 'token0' | 'token1';
  /** Estimated gas price */
  gasPriceGwei: number;
  /** Priority fee for inclusion */
  priorityFeeGwei: number;
  /** Block deadline for the swap */
  blockDeadline: number;
}

/**
 * Core JIT planning logic
 * @param poolState Current pool state
 * @param swapEstimate Candidate swap details
 * @param priceFeed Current token prices
 * @param config Strategy configuration
 * @returns JIT plan if profitable, null otherwise
 */
export function planJit(
  poolState: PoolState,
  swapEstimate: SwapEstimate,
  priceFeed: PriceFeed,
  config: StrategyConfig
): JitPlan | null {
  try {
    // 1. Check minimum swap size requirements
    const swapSizeUsd = new Decimal(swapEstimate.swapSizeUsd);
    const feeTierStr = (poolState.config.fee / 10000).toString(); // Convert from bps to decimal string
    const minSwapSize = config.minSwapUsdByFeeTier[feeTierStr] || Number.MAX_SAFE_INTEGER;
    
    if (swapSizeUsd.lt(minSwapSize)) {
      return null; // Swap too small for this fee tier
    }

    // 2. Determine optimal tick range using range selection
    const currentTick = poolState.slot0.tick;
    const swapDirection = swapEstimate.tokenIn === 'token0' ? 'up' : 'down'; // Simplification
    
    const { lowerTick, upperTick } = selectRange(
      currentTick,
      poolState.config.tickSpacing,
      swapSizeUsd.toString(),
      poolState.liquidity,
      swapDirection
    );

    // 3. Calculate required liquidity for target capture fraction
    const targetCapture = config.captureFractionDefault;
    const currentLiquidity = new Decimal(poolState.liquidity);
    
    // To capture X% of fees: L_jit / (L_current + L_jit) = X
    // Solving: L_jit = X * L_current / (1 - X)
    const requiredLiquidity = currentLiquidity
      .mul(targetCapture)
      .div(new Decimal(1).sub(targetCapture));

    // 4. Calculate token amounts needed for the liquidity
    const { amount0, amount1 } = getAmountsFromLiquidity(
      requiredLiquidity.toString(),
      poolState.slot0.sqrtPriceX96,
      poolState.slot0.sqrtPriceX96,
      poolState.slot0.sqrtPriceX96
    );

    // 5. Calculate costs
    const providedUsd = calculateUsdValue(
      amount0,
      amount1,
      poolState.config.decimals0,
      poolState.config.decimals1,
      priceFeed.token0PriceUsd,
      priceFeed.token1PriceUsd
    );

    const gasCostUsd = config.gasEstimateUsd;
    const flashloanCostUsd = new Decimal(providedUsd)
      .mul(config.flashloanFeeBps)
      .div(10000);
    const totalCostUsd = new Decimal(gasCostUsd).add(flashloanCostUsd);

    // 6. Estimate fee capture
    const feeTier = new Decimal(poolState.config.fee).div(1000000); // Convert from bps to decimal
    const estimatedFeesUsd = swapSizeUsd.mul(feeTier).mul(targetCapture);

    const netProfitUsd = estimatedFeesUsd.sub(totalCostUsd);

    // 7. Check minimum profit requirement
    if (netProfitUsd.lt(config.minNetProfitUsd)) {
      return null;
    }

    // 8. Estimate inclusion probability
    const priorityFeeUsd = new Decimal(swapEstimate.priorityFeeGwei)
      .mul(21000) // Approximate gas for priority
      .mul(priceFeed.token0PriceUsd) // Assuming ETH price in token0PriceUsd
      .div(1000000000); // Convert from gwei to ETH

    const inclusionProbability = estimateInclusionProbability(
      priorityFeeUsd.toString(),
      config.competitionFactor
    );

    // Apply risk adjustment to expected profits
    const riskAdjustedProfitUsd = netProfitUsd
      .mul(inclusionProbability)
      .mul(config.riskAdjustmentFactor);

    // Final profit check with risk adjustment
    if (riskAdjustedProfitUsd.lt(config.minNetProfitUsd)) {
      return null;
    }

    // 9. Profitability strategy evaluation
    const simResult: SimulationResult = {
      feesToken0Usd: estimatedFeesUsd.toNumber() / 2, // Split fees evenly as approximation
      feesToken1Usd: estimatedFeesUsd.toNumber() / 2,
      flashloanFeesUsd: flashloanCostUsd.toNumber(),
      gasUsd: gasCostUsd,
      estimatedGas: 200000, // Rough estimate for JIT operations
      gasPriceGwei: swapEstimate.priorityFeeGwei,
      ethUsdPrice: parseFloat(priceFeed.token0PriceUsd) // Convert string to number
    };

    const profitabilityConfig: ProfitabilityConfig = {
      minProfitUsd: config.minNetProfitUsd,
      captureFraction: config.captureFractionDefault,
      inclusionProbability: config.inclusionProbabilityDefault
    };

    const decision = evaluatePlan(simResult, profitabilityConfig);
    if (!decision.accept) {
      // TODO: Add proper logging here in production
      // log.info({ reason: decision.reason, expectedNetUsd: decision.expectedNetUsd }, '[STRATEGY] Plan rejected by profitability module');
      return null;
    }

    // 10. Calculate final score
    const plan: JitPlan = {
      lowerTick,
      upperTick,
      amount0,
      amount1,
      liquidity: requiredLiquidity.toString(),
      expectedFeeUsd: estimatedFeesUsd.toString(),
      expectedNetUsd: decision.expectedNetUsd.toString(), // Use strategy decision result
      score: decision.score, // Use strategy score
    };

    // Final score refinement with existing scoring logic
    const finalScore = scorePlan(plan, {
      swapSizeUsd: swapEstimate.swapSizeUsd,
      inclusionProbability,
      gasCompetition: config.competitionFactor,
      poolLiquidity: poolState.liquidity,
    });
    
    plan.score = Math.max(plan.score, finalScore); // Use the higher score

    return plan;

  } catch (error) {
    // Log error in production, return null for now
    return null;
  }
}

/**
 * Validates if a JIT opportunity meets basic criteria
 * @param poolState Current pool state
 * @param swapEstimate Swap details
 * @param config Strategy configuration
 * @returns True if opportunity is worth evaluating
 */
export function isViableOpportunity(
  poolState: PoolState,
  swapEstimate: SwapEstimate,
  config: StrategyConfig
): boolean {
  try {
    // Check pool has enough liquidity for meaningful JIT
    const poolLiquidity = new Decimal(poolState.liquidity);
    if (poolLiquidity.lte(0)) return false;

    // Check swap size meets minimum
    const swapSizeUsd = new Decimal(swapEstimate.swapSizeUsd);
    const feeTierStr = (poolState.config.fee / 10000).toString();
    const minSwapSize = config.minSwapUsdByFeeTier[feeTierStr] || 0;
    
    if (swapSizeUsd.lt(minSwapSize)) return false;

    // Check we have enough time to execute (rough heuristic)
    const blocksRemaining = swapEstimate.blockDeadline;
    if (blocksRemaining < 1) return false; // Need at least 1 block

    // Check gas price isn't too high (would eat profits)
    const gasPrice = swapEstimate.gasPriceGwei;
    const maxProfitableGasPrice = 200; // Conservative limit in gwei
    if (gasPrice > maxProfitableGasPrice) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Quick profit estimation without full planning
 * @param poolState Current pool state
 * @param swapEstimate Swap details
 * @param config Strategy configuration
 * @returns Estimated profit in USD, or null if not profitable
 */
export function quickProfitEstimate(
  poolState: PoolState,
  swapEstimate: SwapEstimate,
  config: StrategyConfig
): string | null {
  try {
    const swapSizeUsd = new Decimal(swapEstimate.swapSizeUsd);
    const feeTier = new Decimal(poolState.config.fee).div(1000000);
    
    // Estimate fees with default capture fraction
    const estimatedFeesUsd = swapSizeUsd
      .mul(feeTier)
      .mul(config.captureFractionDefault);

    // Rough cost estimate
    const totalCostUsd = new Decimal(config.gasEstimateUsd)
      .add(swapSizeUsd.mul(config.flashloanFeeBps).div(10000));

    const netProfitUsd = estimatedFeesUsd.sub(totalCostUsd);

    return netProfitUsd.gte(config.minNetProfitUsd) 
      ? netProfitUsd.toString() 
      : null;
  } catch {
    return null;
  }
}

/**
 * Determines the optimal position size based on available capital
 * @param maxCapitalUsd Maximum capital available
 * @param poolState Current pool state  
 * @param config Strategy configuration
 * @returns Recommended position multiplier (0-1)
 */
export function calculatePositionSize(
  maxCapitalUsd: string,
  poolState: PoolState,
  config: StrategyConfig
): number {
  try {
    const maxCapital = new Decimal(maxCapitalUsd);
    const poolLiquidityUsd = new Decimal(poolState.liquidity)
      .mul(1000); // Rough conversion, would need proper price calculation
    
    // Don't risk more than 10% of capital on single position
    const maxRiskRatio = 0.1;
    
    // Don't add more than 50% of current pool liquidity
    const maxPoolRatio = 0.5;
    
    const capitalConstraint = maxCapital.mul(maxRiskRatio);
    const poolConstraint = poolLiquidityUsd.mul(maxPoolRatio);
    
    const recommendedCapital = Decimal.min(capitalConstraint, poolConstraint);
    const positionMultiplier = recommendedCapital.div(maxCapital);
    
    return Math.min(1, Math.max(0, positionMultiplier.toNumber()));
  } catch {
    return 0.1; // Conservative default
  }
}

/**
 * Loads strategy configuration from JSON
 * @param configPath Path to strategy config file
 * @returns Parsed strategy configuration
 */
export function loadStrategyConfig(configData: unknown): StrategyConfig {
  const config = configData as Record<string, unknown>;
  
  return {
    minSwapUsdByFeeTier: config.minSwapUsdByFeeTier as Record<string, number>,
    minNetProfitUsd: config.minNetProfitUsd as number,
    gasEstimateUsd: config.gasEstimateUsd as number,
    captureFractionDefault: config.captureFractionDefault as number,
    inclusionProbabilityDefault: config.inclusionProbabilityDefault as number,
    tickWidthDefaults: config.tickWidthDefaults as {
      narrow: number;
      medium: number;
      wide: number;
    },
    flashloanFeeBps: config.flashloanFeeBps as number,
    maxSlippageBps: config.maxSlippageBps as number,
    competitionFactor: config.competitionFactor as number,
    riskAdjustmentFactor: config.riskAdjustmentFactor as number,
  };
}