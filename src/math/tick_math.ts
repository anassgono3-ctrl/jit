import Decimal from 'decimal.js';

// Configure decimal.js for high precision
Decimal.config({
  precision: 50,
  rounding: Decimal.ROUND_DOWN,
  toExpNeg: -40,
  toExpPos: 40,
});

// Constants from Uniswap V3 TickMath
const MIN_TICK = -887272;
const MAX_TICK = 887272;

const MIN_SQRT_RATIO = 4295128739n;
const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;

// Q96 constant (2^96)
const Q96 = 2n ** 96n;
const Q96_DECIMAL = new Decimal(2).pow(96);

/**
 * Returns the sqrt ratio as a Q64.96 for the given tick.
 * The sqrt ratio is sqrt(1.0001^tick) * 2^96
 * @param tick The tick for which to compute the sqrt ratio
 * @returns The sqrt ratio
 */
export function getSqrtRatioAtTick(tick: number): bigint {
  if (tick < MIN_TICK || tick > MAX_TICK) {
    throw new Error(`Tick ${tick} is out of bounds [${MIN_TICK}, ${MAX_TICK}]`);
  }

  // Use precise decimal arithmetic: sqrt(1.0001^tick) * 2^96
  const base = new Decimal(1.0001);
  const price = base.pow(tick);
  const sqrtPrice = price.sqrt();
  const sqrtPriceX96 = sqrtPrice.mul(Q96_DECIMAL);
  
  // Convert to bigint, rounding down
  return BigInt(sqrtPriceX96.toFixed(0));
}

/**
 * Returns the tick corresponding to a given sqrt ratio, such that #getSqrtRatioAtTick(tick) <= sqrtRatioX96
 * and #getSqrtRatioAtTick(tick + 1) > sqrtRatioX96
 * @param sqrtRatioX96 The sqrt ratio as a Q64.96 for which to compute the tick
 * @returns The tick
 */
export function getTickAtSqrtRatio(sqrtRatioX96: bigint): number {
  if (sqrtRatioX96 < MIN_SQRT_RATIO || sqrtRatioX96 >= MAX_SQRT_RATIO) {
    throw new Error('sqrt ratio out of bounds');
  }

  // Convert sqrtRatioX96 back to price and then to tick
  // price = (sqrtRatioX96 / 2^96)^2
  // tick = log(price) / log(1.0001)
  
  const sqrtPriceX96Dec = new Decimal(sqrtRatioX96.toString());
  const sqrtPrice = sqrtPriceX96Dec.div(Q96_DECIMAL);
  const price = sqrtPrice.pow(2);
  
  const base = new Decimal(1.0001);
  const tick = price.ln().div(base.ln());
  
  // Round down to get the floor tick
  return Math.floor(tick.toNumber());
}

/**
 * Returns the nearest usable tick given a tick and the tick spacing
 * @param tick The tick to round
 * @param tickSpacing The tick spacing
 * @returns The nearest usable tick
 */
export function nearestUsableTick(tick: number, tickSpacing: number): number {
  if (tickSpacing <= 0) {
    throw new Error('tickSpacing must be greater than 0');
  }

  // Round to nearest multiple of tickSpacing
  const rounded = Math.round(tick / tickSpacing) * tickSpacing;
  
  // Ensure it's within bounds
  if (rounded < MIN_TICK) {
    // Find the smallest valid tick >= MIN_TICK
    const remainder = MIN_TICK % tickSpacing;
    return remainder === 0 ? MIN_TICK : MIN_TICK + (tickSpacing - remainder);
  } else if (rounded > MAX_TICK) {
    // Find the largest valid tick <= MAX_TICK
    const remainder = MAX_TICK % tickSpacing;
    return MAX_TICK - remainder;
  } else {
    return rounded;
  }
}

// Export constants for use in other modules
export { MIN_TICK, MAX_TICK, MIN_SQRT_RATIO, MAX_SQRT_RATIO };