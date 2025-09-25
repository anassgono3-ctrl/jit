import Decimal from 'decimal.js';
import { PoolState, getTickInfo, setTickInfo, updateTimestamp } from './pool_state';
import { getSqrtRatioAtTick, getTickAtSqrtRatio } from '../math/tick_math';

// Configure decimal.js for high precision
Decimal.config({
  precision: 50,
  rounding: Decimal.ROUND_DOWN,
});

/**
 * Direction of swap
 */
export enum SwapDirection {
  /** Swapping token0 for token1 (price increases) */
  ZERO_FOR_ONE = 'ZERO_FOR_ONE',
  /** Swapping token1 for token0 (price decreases) */
  ONE_FOR_ZERO = 'ONE_FOR_ZERO',
}

/**
 * Result of a swap operation
 */
export interface SwapResult {
  /** Amount of input token consumed */
  amountIn: string;
  /** Amount of output token produced */
  amountOut: string;
  /** New sqrt price after swap */
  sqrtPriceX96: string;
  /** New tick after swap */
  tick: number;
  /** Total fees paid */
  feeAmount: string;
  /** Protocol fees generated */
  protocolFeeAmount: string;
  /** New liquidity (if tick crossed) */
  liquidity: string;
  /** Updated pool state */
  poolState: PoolState;
}

/**
 * Step state during swap computation
 */
interface SwapStep {
  /** Target sqrt price for this step */
  sqrtPriceStartX96: string;
  /** Target tick for this step */
  tickNext: number;
  /** Whether tickNext is initialized */
  initialized: boolean;
  /** Target sqrt price for tickNext */
  sqrtPriceNextX96: string;
  /** Amount in for this step */
  amountIn: string;
  /** Amount out for this step */
  amountOut: string;
  /** Fee amount for this step */
  feeAmount: string;
}

/**
 * Current state during swap execution
 */
interface SwapState {
  /** Remaining amount to swap */
  amountSpecifiedRemaining: string;
  /** Amount already calculated */
  amountCalculated: string;
  /** Current sqrt price */
  sqrtPriceX96: string;
  /** Current tick */
  tick: number;
  /** Current fee growth global (token being swapped in) */
  feeGrowthGlobalX128: string;
  /** Protocol fee amount */
  protocolFee: string;
  /** Current liquidity */
  liquidity: string;
}

/**
 * Computes the sqrt price for the next tick in the swap direction
 */
function getNextTick(
  state: PoolState,
  currentTick: number,
  zeroForOne: boolean
): { tick: number; initialized: boolean } {
  const tickSpacing = state.config.tickSpacing;
  
  if (zeroForOne) {
    // Moving down (price decreasing)
    let nextTick = currentTick - tickSpacing;
    
    // Find the next initialized tick below current tick
    while (nextTick >= -887272) {
      const tickInfo = getTickInfo(state, nextTick);
      if (tickInfo.initialized) {
        return { tick: nextTick, initialized: true };
      }
      nextTick -= tickSpacing;
    }
    
    return { tick: -887272, initialized: false };
  } else {
    // Moving up (price increasing)
    let nextTick = currentTick + tickSpacing;
    
    // Find the next initialized tick above current tick
    while (nextTick <= 887272) {
      const tickInfo = getTickInfo(state, nextTick);
      if (tickInfo.initialized) {
        return { tick: nextTick, initialized: true };
      }
      nextTick += tickSpacing;
    }
    
    return { tick: 887272, initialized: false };
  }
}

/**
 * Computes the amount out for a given amount in and price range
 */
function computeSwapStep(
  sqrtRatioCurrentX96: string,
  sqrtRatioTargetX96: string,
  liquidity: string,
  amountIn: string,
  feePips: number,
  zeroForOne: boolean
): SwapStep {
  const sqrtRatioCurrent = new Decimal(sqrtRatioCurrentX96);
  const sqrtRatioTarget = new Decimal(sqrtRatioTargetX96);
  const liquidityDec = new Decimal(liquidity);
  const amountInDec = new Decimal(amountIn);
  
  const exactIn = true; // For simplicity, assume exact input swaps
  
  let amountOut = '0';
  let amountInWithFee = '0';
  let feeAmount = '0';
  
  if (exactIn) {
    // Calculate fee
    const fee = amountInDec.mul(feePips).div(1000000);
    feeAmount = fee.toString();
    amountInWithFee = amountInDec.sub(fee).toString();
    
    if (zeroForOne) {
      // Swapping token0 for token1
      // amountOut = liquidity * (sqrtP - sqrtP_target) / (sqrtP * sqrtP_target)
      const numerator = liquidityDec.mul(sqrtRatioCurrent.sub(sqrtRatioTarget));
      const denominator = sqrtRatioCurrent.mul(sqrtRatioTarget);
      
      if (!denominator.isZero()) {
        amountOut = numerator.div(denominator).toString();
      }
    } else {
      // Swapping token1 for token0
      // amountOut = liquidity * (sqrtP_target - sqrtP)
      amountOut = liquidityDec.mul(sqrtRatioTarget.sub(sqrtRatioCurrent)).toString();
    }
  }
  
  return {
    sqrtPriceStartX96: sqrtRatioCurrentX96,
    tickNext: 0, // Will be set by caller
    initialized: false, // Will be set by caller
    sqrtPriceNextX96: sqrtRatioTargetX96,
    amountIn: amountInWithFee,
    amountOut,
    feeAmount,
  };
}

/**
 * Crosses a tick and updates liquidity
 */
function crossTick(
  state: PoolState,
  tick: number,
  feeGrowthGlobal0X128: string,
  feeGrowthGlobal1X128: string
): string {
  const tickInfo = getTickInfo(state, tick);
  
  if (!tickInfo.initialized) {
    return state.liquidity;
  }
  
  // Update fee growth outside
  tickInfo.feeGrowthOutside0X128 = new Decimal(feeGrowthGlobal0X128)
    .sub(new Decimal(tickInfo.feeGrowthOutside0X128))
    .toString();
  tickInfo.feeGrowthOutside1X128 = new Decimal(feeGrowthGlobal1X128)
    .sub(new Decimal(tickInfo.feeGrowthOutside1X128))
    .toString();
  
  setTickInfo(state, tick, tickInfo);
  
  // Update liquidity by net amount
  const liquidityNet = new Decimal(tickInfo.liquidityNet);
  const currentLiquidity = new Decimal(state.liquidity);
  
  return currentLiquidity.add(liquidityNet).toString();
}

/**
 * Executes a swap on the pool
 * @param state Pool state (will be modified)
 * @param amountIn Amount of input token
 * @param tokenIn Token being swapped in ('token0' or 'token1')
 * @param sqrtPriceLimitX96 Price limit for the swap (optional)
 * @returns SwapResult with amounts and updated state
 */
export function applySwap(
  state: PoolState,
  amountIn: string,
  tokenIn: 'token0' | 'token1',
  sqrtPriceLimitX96?: string
): SwapResult {
  const zeroForOne = tokenIn === 'token0';
  const feePips = state.config.fee; // fee in pips (e.g., 3000 for 0.3%)
  
  if (new Decimal(amountIn).lte(0)) {
    throw new Error('Invalid swap amount');
  }
  
  if (new Decimal(state.liquidity).lte(0)) {
    throw new Error('No liquidity available');
  }
  
  // Initialize swap state
  const swapState: SwapState = {
    amountSpecifiedRemaining: amountIn,
    amountCalculated: '0',
    sqrtPriceX96: state.slot0.sqrtPriceX96,
    tick: state.slot0.tick,
    feeGrowthGlobalX128: zeroForOne ? state.feeGrowthGlobal0X128 : state.feeGrowthGlobal1X128,
    protocolFee: '0',
    liquidity: state.liquidity,
  };
  
  let totalAmountIn = '0';
  let totalAmountOut = '0';
  let totalFees = '0';
  
  // Continue swapping until amount is exhausted or price limit is reached
  while (new Decimal(swapState.amountSpecifiedRemaining).gt(0)) {
    // Find next tick to swap to
    const { tick: tickNext, initialized } = getNextTick(
      state,
      swapState.tick,
      zeroForOne
    );
    
    let sqrtPriceNextX96: string;
    try {
      sqrtPriceNextX96 = getSqrtRatioAtTick(tickNext).toString();
    } catch {
      // If we can't get sqrt ratio, we've hit a boundary
      break;
    }
    
    // Check price limit
    if (sqrtPriceLimitX96) {
      const limitPrice = new Decimal(sqrtPriceLimitX96);
      const nextPrice = new Decimal(sqrtPriceNextX96);
      
      if (zeroForOne && nextPrice.lt(limitPrice)) {
        sqrtPriceNextX96 = sqrtPriceLimitX96;
      } else if (!zeroForOne && nextPrice.gt(limitPrice)) {
        sqrtPriceNextX96 = sqrtPriceLimitX96;
      }
    }
    
    // Compute swap step
    const step = computeSwapStep(
      swapState.sqrtPriceX96,
      sqrtPriceNextX96,
      swapState.liquidity,
      swapState.amountSpecifiedRemaining,
      feePips,
      zeroForOne
    );
    
    // Update running totals
    totalAmountIn = new Decimal(totalAmountIn).add(step.amountIn).toString();
    totalAmountOut = new Decimal(totalAmountOut).add(step.amountOut).toString();
    totalFees = new Decimal(totalFees).add(step.feeAmount).toString();
    
    // Update swap state
    swapState.amountSpecifiedRemaining = new Decimal(swapState.amountSpecifiedRemaining)
      .sub(new Decimal(step.amountIn).add(step.feeAmount))
      .toString();
    swapState.amountCalculated = new Decimal(swapState.amountCalculated)
      .add(step.amountOut)
      .toString();
    swapState.sqrtPriceX96 = sqrtPriceNextX96;
    
    // Update tick if we've moved to next initialized tick
    if (new Decimal(swapState.sqrtPriceX96).eq(new Decimal(getSqrtRatioAtTick(tickNext).toString()))) {
      swapState.tick = tickNext;
      
      // Cross the tick if it's initialized
      if (initialized) {
        swapState.liquidity = crossTick(
          state,
          tickNext,
          state.feeGrowthGlobal0X128,
          state.feeGrowthGlobal1X128
        );
      }
    } else {
      // Update tick based on current price
      swapState.tick = getTickAtSqrtRatio(BigInt(swapState.sqrtPriceX96));
    }
    
    // Break if we've hit price limit or run out of liquidity
    if (new Decimal(swapState.liquidity).lte(0)) {
      break;
    }
  }
  
  // Update pool state
  state.slot0.sqrtPriceX96 = swapState.sqrtPriceX96;
  state.slot0.tick = swapState.tick;
  state.liquidity = swapState.liquidity;
  
  // Update fee growth global
  if (new Decimal(totalFees).gt(0)) {
    const feeGrowthDelta = new Decimal(totalFees)
      .mul(new Decimal(2).pow(128))
      .div(new Decimal(state.liquidity))
      .toString();
    
    if (zeroForOne) {
      state.feeGrowthGlobal0X128 = new Decimal(state.feeGrowthGlobal0X128)
        .add(feeGrowthDelta)
        .toString();
    } else {
      state.feeGrowthGlobal1X128 = new Decimal(state.feeGrowthGlobal1X128)
        .add(feeGrowthDelta)
        .toString();
    }
  }
  
  // Update timestamp
  updateTimestamp(state);
  
  return {
    amountIn: totalAmountIn,
    amountOut: totalAmountOut,
    sqrtPriceX96: state.slot0.sqrtPriceX96,
    tick: state.slot0.tick,
    feeAmount: totalFees,
    protocolFeeAmount: '0', // Simplified - no protocol fees for now
    liquidity: state.liquidity,
    poolState: state,
  };
}

/**
 * Estimates the output amount for a given input amount (read-only)
 * @param state Pool state (not modified)
 * @param amountIn Amount of input token
 * @param tokenIn Token being swapped in
 * @returns Estimated output amount
 */
export function estimateSwapOutput(
  state: PoolState,
  amountIn: string,
  tokenIn: 'token0' | 'token1'
): string {
  // Clone state to avoid modifying original
  const stateCopy = JSON.parse(JSON.stringify(state));
  stateCopy.ticks = new Map(state.ticks);
  
  try {
    const result = applySwap(stateCopy, amountIn, tokenIn);
    return result.amountOut;
  } catch {
    return '0';
  }
}

/**
 * Calculates price impact of a swap
 * @param state Pool state
 * @param amountIn Amount of input token
 * @param tokenIn Token being swapped in
 * @returns Price impact as percentage (string)
 */
export function calculatePriceImpact(
  state: PoolState,
  amountIn: string,
  tokenIn: 'token0' | 'token1'
): string {
  const priceBefore = new Decimal(state.slot0.sqrtPriceX96).pow(2);
  
  const stateCopy = JSON.parse(JSON.stringify(state));
  stateCopy.ticks = new Map(state.ticks);
  
  try {
    const result = applySwap(stateCopy, amountIn, tokenIn);
    const priceAfter = new Decimal(result.sqrtPriceX96).pow(2);
    
    const impact = priceAfter.sub(priceBefore).div(priceBefore).mul(100);
    return impact.toString();
  } catch {
    return '0';
  }
}