import Decimal from 'decimal.js';
import {
  PoolState,
  TickInfo,
  Position,
  getTickInfo,
  setTickInfo,
  updateTimestamp,
} from './pool_state';
import {
  liquidityForAmounts,
  getAmountsFromLiquidity,
  addLiquidity,
  subtractLiquidity,
} from '../math/liquidity_math';
import { nearestUsableTick } from '../math/tick_math';

// Configure decimal.js for high precision
Decimal.config({
  precision: 50,
  rounding: Decimal.ROUND_DOWN,
});

/**
 * Result of a mint operation
 */
export interface MintResult {
  /** Position ID */
  positionId: string;
  /** Actual liquidity added */
  liquidity: string;
  /** Actual amount0 used */
  amount0: string;
  /** Actual amount1 used */
  amount1: string;
  /** Updated pool state */
  poolState: PoolState;
}

/**
 * Result of a burn operation
 */
export interface BurnResult {
  /** Position ID that was burned */
  positionId: string;
  /** Liquidity removed */
  liquidity: string;
  /** Amount0 returned */
  amount0: string;
  /** Amount1 returned */
  amount1: string;
  /** Fees collected in token0 */
  feesOwed0: string;
  /** Fees collected in token1 */
  feesOwed1: string;
  /** Updated pool state */
  poolState: PoolState;
}

/**
 * Generates a position ID from owner and tick range
 */
export function generatePositionId(
  owner: string,
  tickLower: number,
  tickUpper: number
): string {
  return `${owner}_${tickLower}_${tickUpper}`;
}

/**
 * Updates tick state when crossing during liquidity operations
 */
function updateTick(
  state: PoolState,
  tick: number,
  liquidityDelta: string,
  upper: boolean
): void {
  const tickInfo = getTickInfo(state, tick);
  
  const liquidityGrossBefore = new Decimal(tickInfo.liquidityGross);
  const liquidityDelta_dec = new Decimal(liquidityDelta);
  
  const liquidityGrossAfter = liquidityGrossBefore.add(liquidityDelta_dec);
  
  const flipped = liquidityGrossAfter.isZero() !== liquidityGrossBefore.isZero();
  
  if (liquidityGrossBefore.isZero()) {
    // Initialize tick if it was previously uninitialized
    tickInfo.initialized = true;
    
    // If we're above the current tick, we need to record fee growth
    if (tick <= state.slot0.tick) {
      tickInfo.feeGrowthOutside0X128 = state.feeGrowthGlobal0X128;
      tickInfo.feeGrowthOutside1X128 = state.feeGrowthGlobal1X128;
    }
  }
  
  tickInfo.liquidityGross = liquidityGrossAfter.toString();
  
  // Update net liquidity
  const liquidityNet = new Decimal(tickInfo.liquidityNet);
  tickInfo.liquidityNet = upper
    ? liquidityNet.sub(liquidityDelta_dec).toString()
    : liquidityNet.add(liquidityDelta_dec).toString();
  
  if (flipped && liquidityGrossAfter.isZero()) {
    // Clear tick if no liquidity remains
    tickInfo.initialized = false;
    tickInfo.feeGrowthOutside0X128 = '0';
    tickInfo.feeGrowthOutside1X128 = '0';
    tickInfo.secondsOutside = 0;
  }
  
  setTickInfo(state, tick, tickInfo);
}

/**
 * Calculates fee growth inside a position's range
 */
function getFeeGrowthInside(
  state: PoolState,
  tickLower: number,
  tickUpper: number
): { feeGrowthInside0X128: string; feeGrowthInside1X128: string } {
  const lowerTick = getTickInfo(state, tickLower);
  const upperTick = getTickInfo(state, tickUpper);
  
  const currentTick = state.slot0.tick;
  const global0 = new Decimal(state.feeGrowthGlobal0X128);
  const global1 = new Decimal(state.feeGrowthGlobal1X128);
  
  let feeGrowthBelow0 = new Decimal(0);
  let feeGrowthBelow1 = new Decimal(0);
  
  if (currentTick >= tickLower) {
    feeGrowthBelow0 = new Decimal(lowerTick.feeGrowthOutside0X128);
    feeGrowthBelow1 = new Decimal(lowerTick.feeGrowthOutside1X128);
  } else {
    feeGrowthBelow0 = global0.sub(new Decimal(lowerTick.feeGrowthOutside0X128));
    feeGrowthBelow1 = global1.sub(new Decimal(lowerTick.feeGrowthOutside1X128));
  }
  
  let feeGrowthAbove0 = new Decimal(0);
  let feeGrowthAbove1 = new Decimal(0);
  
  if (currentTick < tickUpper) {
    feeGrowthAbove0 = new Decimal(upperTick.feeGrowthOutside0X128);
    feeGrowthAbove1 = new Decimal(upperTick.feeGrowthOutside1X128);
  } else {
    feeGrowthAbove0 = global0.sub(new Decimal(upperTick.feeGrowthOutside0X128));
    feeGrowthAbove1 = global1.sub(new Decimal(upperTick.feeGrowthOutside1X128));
  }
  
  return {
    feeGrowthInside0X128: global0.sub(feeGrowthBelow0).sub(feeGrowthAbove0).toString(),
    feeGrowthInside1X128: global1.sub(feeGrowthBelow1).sub(feeGrowthAbove1).toString(),
  };
}

/**
 * Mints liquidity to a position
 * @param state Pool state (will be modified)
 * @param owner Position owner address
 * @param tickLower Lower tick (must be aligned to tickSpacing)
 * @param tickUpper Upper tick (must be aligned to tickSpacing)
 * @param amount0Desired Desired amount of token0 to add
 * @param amount1Desired Desired amount of token1 to add
 * @returns MintResult with actual amounts used and liquidity added
 */
export function mint(
  state: PoolState,
  owner: string,
  tickLower: number,
  tickUpper: number,
  amount0Desired: string,
  amount1Desired: string
): MintResult {
  // Validate and align ticks
  const alignedLower = nearestUsableTick(tickLower, state.config.tickSpacing);
  const alignedUpper = nearestUsableTick(tickUpper, state.config.tickSpacing);
  
  if (alignedLower >= alignedUpper) {
    throw new Error('Invalid tick range');
  }
  
  // Calculate liquidity for the given amounts
  const liquidityToAdd = liquidityForAmounts(
    amount0Desired,
    amount1Desired,
    state.slot0.sqrtPriceX96,
    state.slot0.sqrtPriceX96,
    state.slot0.sqrtPriceX96
  );
  
  if (new Decimal(liquidityToAdd).isZero()) {
    throw new Error('No liquidity to add');
  }
  
  // Calculate actual amounts that will be used
  const { amount0, amount1 } = getAmountsFromLiquidity(
    liquidityToAdd,
    state.slot0.sqrtPriceX96,
    state.slot0.sqrtPriceX96,
    state.slot0.sqrtPriceX96
  );
  
  // Update tick states
  updateTick(state, alignedLower, liquidityToAdd, false);
  updateTick(state, alignedUpper, liquidityToAdd, true);
  
  // If current tick is in range, update global liquidity
  const currentTick = state.slot0.tick;
  if (currentTick >= alignedLower && currentTick < alignedUpper) {
    state.liquidity = addLiquidity(state.liquidity, liquidityToAdd);
  }
  
  // Create position
  const positionId = generatePositionId(owner, alignedLower, alignedUpper);
  const feeGrowthInside = getFeeGrowthInside(state, alignedLower, alignedUpper);
  
  // Update timestamp
  updateTimestamp(state);
  
  return {
    positionId,
    liquidity: liquidityToAdd,
    amount0,
    amount1,
    poolState: state,
  };
}

/**
 * Burns liquidity from a position
 * @param state Pool state (will be modified)
 * @param owner Position owner address
 * @param tickLower Lower tick of position
 * @param tickUpper Upper tick of position
 * @param liquidityToBurn Amount of liquidity to burn
 * @returns BurnResult with amounts returned and fees collected
 */
export function burn(
  state: PoolState,
  owner: string,
  tickLower: number,
  tickUpper: number,
  liquidityToBurn: string
): BurnResult {
  if (new Decimal(liquidityToBurn).lte(0)) {
    throw new Error('Invalid liquidity amount');
  }
  
  const positionId = generatePositionId(owner, tickLower, tickUpper);
  
  // Calculate amounts to return
  const { amount0, amount1 } = getAmountsFromLiquidity(
    liquidityToBurn,
    state.slot0.sqrtPriceX96,
    state.slot0.sqrtPriceX96,
    state.slot0.sqrtPriceX96
  );
  
  // Calculate fees owed (simplified - in real implementation would track position state)
  const feeGrowthInside = getFeeGrowthInside(state, tickLower, tickUpper);
  
  // For simplicity, assume no fees accumulated (would need position tracking for accurate fees)
  const feesOwed0 = '0';
  const feesOwed1 = '0';
  
  // Update tick states
  updateTick(state, tickLower, `-${liquidityToBurn}`, false);
  updateTick(state, tickUpper, `-${liquidityToBurn}`, true);
  
  // If current tick is in range, update global liquidity
  const currentTick = state.slot0.tick;
  if (currentTick >= tickLower && currentTick < tickUpper) {
    state.liquidity = subtractLiquidity(state.liquidity, liquidityToBurn);
  }
  
  // Update timestamp
  updateTimestamp(state);
  
  return {
    positionId,
    liquidity: liquidityToBurn,
    amount0,
    amount1,
    feesOwed0,
    feesOwed1,
    poolState: state,
  };
}

/**
 * Collects fees from a position
 * @param state Pool state
 * @param owner Position owner
 * @param tickLower Lower tick of position
 * @param tickUpper Upper tick of position
 * @returns Fees available for collection
 */
export function collectFees(
  state: PoolState,
  owner: string,
  tickLower: number,
  tickUpper: number
): { amount0: string; amount1: string } {
  // In a full implementation, this would calculate fees based on position state
  // and fee growth inside the range. For now, return zero fees.
  return {
    amount0: '0',
    amount1: '0',
  };
}

/**
 * Gets the current liquidity in a specific tick range
 * @param state Pool state
 * @param tickLower Lower tick
 * @param tickUpper Upper tick
 * @returns Current liquidity in the range
 */
export function getLiquidityInRange(
  state: PoolState,
  tickLower: number,
  tickUpper: number
): string {
  const currentTick = state.slot0.tick;
  
  if (currentTick >= tickLower && currentTick < tickUpper) {
    return state.liquidity;
  }
  
  // If current tick is outside range, need to calculate available liquidity
  // This is a simplified version - real implementation would sum tick liquidity
  return '0';
}