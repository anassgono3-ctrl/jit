import Decimal from 'decimal.js';
import { PoolState, clonePoolState } from './pool_state';
import { mint, burn, MintResult, BurnResult } from './mint_burn';
import { applySwap, SwapResult } from './swap_engine';
import { calculateUsdValue, formatTokenAmount } from '../math/price_utils';

// Configure decimal.js for high precision
Decimal.config({
  precision: 50,
  rounding: Decimal.ROUND_DOWN,
});

/**
 * JIT strategy plan parameters
 */
export interface JitPlan {
  /** Lower tick of the position */
  lowerTick: number;
  /** Upper tick of the position */
  upperTick: number;
  /** Amount of token0 to provide */
  amount0: string;
  /** Amount of token1 to provide */
  amount1: string;
  /** Expected liquidity to be added */
  liquidity: string;
  /** Expected fee capture (USD) */
  expectedFeeUsd: string;
  /** Expected net profit (USD) after costs */
  expectedNetUsd: string;
  /** Strategy score */
  score: number;
}

/**
 * Swap event to simulate
 */
export interface SwapEvent {
  /** Amount being swapped in */
  amountIn: string;
  /** Token being swapped in ('token0' or 'token1') */
  tokenIn: 'token0' | 'token1';
  /** Estimated USD size of the swap */
  swapSizeUsd: string;
  /** Current price of token1 per token0 */
  priceToken1PerToken0: string;
}

/**
 * Price feed for USD conversion
 */
export interface PriceFeed {
  /** Price of token0 in USD */
  token0PriceUsd: string;
  /** Price of token1 in USD */
  token1PriceUsd: string;
  /** Timestamp of price data */
  timestamp: number;
}

/**
 * Result of a JIT simulation
 */
export interface SimulationResult {
  /** Whether the simulation was successful */
  success: boolean;
  /** Error message if simulation failed */
  error?: string;
  /** Fees captured in token0 */
  feesCapturedToken0: string;
  /** Fees captured in token1 */
  feesCapturedToken1: string;
  /** Net profit in USD */
  netProfitUsd: string;
  /** Gas cost in USD */
  gasCostUsd: string;
  /** Flashloan cost in USD (if applicable) */
  flashloanCostUsd: string;
  /** Price impact of the user swap (%) */
  priceImpact: string;
  /** Share of fees captured (%) */
  captureShare: string;
  /** Debug information */
  debug: {
    /** Initial pool liquidity */
    initialLiquidity: string;
    /** Final pool liquidity */
    finalLiquidity: string;
    /** JIT liquidity added */
    jitLiquidity: string;
    /** User swap details */
    userSwap: SwapResult;
    /** Mint operation result */
    mintResult: MintResult;
    /** Burn operation result */
    burnResult: BurnResult;
  };
}

/**
 * Strategy configuration
 */
export interface StrategyConfig {
  /** Minimum net profit in USD to consider viable */
  minNetProfitUsd: number;
  /** Gas estimate in USD */
  gasEstimateUsd: number;
  /** Flashloan fee in basis points */
  flashloanFeeBps: number;
  /** Maximum slippage tolerance in basis points */
  maxSlippageBps: number;
}

/**
 * Simulates a JIT liquidity strategy attempt
 * @param poolFixture Initial pool state
 * @param plan JIT strategy plan
 * @param swapEvent User swap to front-run
 * @param priceFeed Current token prices
 * @param config Strategy configuration
 * @returns Simulation result with profit/loss analysis
 */
export function simulateJitAttempt(
  poolFixture: PoolState,
  plan: JitPlan,
  swapEvent: SwapEvent,
  priceFeed: PriceFeed,
  config: StrategyConfig
): SimulationResult {
  try {
    // Clone pool state for simulation
    const poolState = clonePoolState(poolFixture);
    const initialLiquidity = poolState.liquidity;

    // Step 1: Mint JIT position
    const mintResult = mint(
      poolState,
      'jit-bot', // Simulated bot address
      plan.lowerTick,
      plan.upperTick,
      plan.amount0,
      plan.amount1
    );

    if (new Decimal(mintResult.liquidity).lte(0)) {
      return {
        success: false,
        error: 'Failed to mint liquidity',
        feesCapturedToken0: '0',
        feesCapturedToken1: '0',
        netProfitUsd: '0',
        gasCostUsd: config.gasEstimateUsd.toString(),
        flashloanCostUsd: '0',
        priceImpact: '0',
        captureShare: '0',
        debug: {
          initialLiquidity,
          finalLiquidity: poolState.liquidity,
          jitLiquidity: '0',
          userSwap: {} as SwapResult,
          mintResult,
          burnResult: {} as BurnResult,
        },
      };
    }

    // Step 2: Apply user swap
    const userSwap = applySwap(
      poolState,
      swapEvent.amountIn,
      swapEvent.tokenIn
    );

    // Step 3: Burn JIT position and collect fees
    const burnResult = burn(
      poolState,
      'jit-bot',
      plan.lowerTick,
      plan.upperTick,
      mintResult.liquidity
    );

    // Calculate fees captured
    const feesCapturedToken0 = burnResult.feesOwed0;
    const feesCapturedToken1 = burnResult.feesOwed1;

    // For simplification, estimate fees based on swap fees and liquidity share
    const totalFees = userSwap.feeAmount;
    const poolLiquidityBeforeSwap = new Decimal(mintResult.poolState.liquidity);
    const jitLiquidityShare = new Decimal(mintResult.liquidity).div(poolLiquidityBeforeSwap);
    
    // Estimate fees captured as share of total fees
    const estimatedFeesCaptured = new Decimal(totalFees).mul(jitLiquidityShare);
    const estimatedFees0 = swapEvent.tokenIn === 'token0' ? estimatedFeesCaptured.toString() : '0';
    const estimatedFees1 = swapEvent.tokenIn === 'token1' ? estimatedFeesCaptured.toString() : '0';

    // Calculate USD values
    const feesUsd = calculateUsdValue(
      estimatedFees0,
      estimatedFees1,
      poolState.config.decimals0,
      poolState.config.decimals1,
      priceFeed.token0PriceUsd,
      priceFeed.token1PriceUsd
    );

    // Calculate costs
    const gasCostUsd = config.gasEstimateUsd;
    
    // Calculate flashloan cost (if needed)
    const providedValue = calculateUsdValue(
      mintResult.amount0,
      mintResult.amount1,
      poolState.config.decimals0,
      poolState.config.decimals1,
      priceFeed.token0PriceUsd,
      priceFeed.token1PriceUsd
    );
    
    const flashloanCostUsd = new Decimal(providedValue)
      .mul(config.flashloanFeeBps)
      .div(10000)
      .toString();

    // Calculate net profit
    const netProfitUsd = new Decimal(feesUsd)
      .sub(gasCostUsd)
      .sub(flashloanCostUsd)
      .toString();

    // Calculate capture share
    const totalFeesUsd = new Decimal(totalFees)
      .mul(priceFeed.token0PriceUsd) // Simplified - assumes fees are in token0
      .div(new Decimal(10).pow(poolState.config.decimals0))
      .toString();
    
    const captureShare = new Decimal(totalFeesUsd).gt(0)
      ? new Decimal(feesUsd).div(totalFeesUsd).mul(100).toString()
      : '0';

    // Calculate price impact
    const priceBefore = new Decimal(poolFixture.slot0.sqrtPriceX96).pow(2);
    const priceAfter = new Decimal(userSwap.sqrtPriceX96).pow(2);
    const priceImpact = priceAfter.sub(priceBefore).div(priceBefore).mul(100).toString();

    return {
      success: true,
      feesCapturedToken0: estimatedFees0,
      feesCapturedToken1: estimatedFees1,
      netProfitUsd,
      gasCostUsd: gasCostUsd.toString(),
      flashloanCostUsd,
      priceImpact,
      captureShare,
      debug: {
        initialLiquidity,
        finalLiquidity: poolState.liquidity,
        jitLiquidity: mintResult.liquidity,
        userSwap,
        mintResult,
        burnResult,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      feesCapturedToken0: '0',
      feesCapturedToken1: '0',
      netProfitUsd: '0',
      gasCostUsd: config.gasEstimateUsd.toString(),
      flashloanCostUsd: '0',
      priceImpact: '0',
      captureShare: '0',
      debug: {
        initialLiquidity: poolFixture.liquidity,
        finalLiquidity: poolFixture.liquidity,
        jitLiquidity: '0',
        userSwap: {} as SwapResult,
        mintResult: {} as MintResult,
        burnResult: {} as BurnResult,
      },
    };
  }
}

/**
 * Validates a JIT plan for feasibility
 * @param plan JIT plan to validate
 * @param poolState Current pool state
 * @param config Strategy configuration
 * @returns True if plan is feasible
 */
export function validateJitPlan(
  plan: JitPlan,
  poolState: PoolState,
  config: StrategyConfig
): boolean {
  try {
    // Check tick range validity
    if (plan.lowerTick >= plan.upperTick) return false;
    
    // Check tick alignment
    if (plan.lowerTick % poolState.config.tickSpacing !== 0) return false;
    if (plan.upperTick % poolState.config.tickSpacing !== 0) return false;
    
    // Check amounts are positive
    if (new Decimal(plan.amount0).lt(0) || new Decimal(plan.amount1).lt(0)) return false;
    
    // Check at least one amount is positive
    if (new Decimal(plan.amount0).eq(0) && new Decimal(plan.amount1).eq(0)) return false;
    
    // Check expected profit meets minimum
    if (new Decimal(plan.expectedNetUsd).lt(config.minNetProfitUsd)) return false;
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Estimates the gas cost for JIT operations
 * @param plan JIT plan
 * @param gasPrice Gas price in gwei
 * @param ethPriceUsd ETH price in USD
 * @returns Estimated gas cost in USD
 */
export function estimateGasCost(
  plan: JitPlan,
  gasPrice: number,
  ethPriceUsd: string
): string {
  // Estimated gas usage for JIT strategy:
  // - Mint: ~150k gas
  // - Burn: ~100k gas  
  // - Flashloan overhead: ~50k gas
  const estimatedGas = 300000; // Conservative estimate
  
  const gasCostEth = new Decimal(estimatedGas)
    .mul(gasPrice)
    .div(1000000000) // Convert gwei to ETH
    .toString();
  
  return new Decimal(gasCostEth).mul(ethPriceUsd).toString();
}

/**
 * Calculates the optimal liquidity amount for maximum fee capture
 * @param poolState Current pool state
 * @param swapAmount Size of incoming swap
 * @param targetCaptureRatio Desired share of fees to capture (0-1)
 * @returns Optimal liquidity to add
 */
export function calculateOptimalLiquidity(
  poolState: PoolState,
  swapAmount: string,
  targetCaptureRatio: number
): string {
  const currentLiquidity = new Decimal(poolState.liquidity);
  const targetRatio = new Decimal(targetCaptureRatio);
  
  // To capture X% of fees, need to add liquidity such that:
  // added_liquidity / (current_liquidity + added_liquidity) = X
  // Solving: added_liquidity = X * current_liquidity / (1 - X)
  
  if (targetRatio.gte(1)) {
    throw new Error('Target capture ratio must be less than 1');
  }
  
  const optimalLiquidity = currentLiquidity
    .mul(targetRatio)
    .div(new Decimal(1).sub(targetRatio));
  
  return optimalLiquidity.toString();
}