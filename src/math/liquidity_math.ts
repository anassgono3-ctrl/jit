import Decimal from 'decimal.js';

// Configure decimal.js for high precision
Decimal.config({
  precision: 50,
  rounding: Decimal.ROUND_DOWN,
  toExpNeg: -50,
  toExpPos: 50,
});

// Q96 constant for scaling
const Q96_DECIMAL = new Decimal(2).pow(96);

/**
 * Computes liquidity from token0 amount for a given price range
 * Formula: L = amount0 * (sqrt(upper) * sqrt(current)) / (sqrt(upper) - sqrt(current))
 * @param amount0 The amount of token0 (string to avoid precision loss)
 * @param sqrtP The current sqrt price (Q64.96)
 * @param sqrtUpper The upper sqrt price (Q64.96)
 * @returns The liquidity as a string
 */
export function liquidityFromToken0(
  amount0: string,
  sqrtP: string,
  sqrtUpper: string
): string {
  const amount0Dec = new Decimal(amount0);
  const sqrtPDec = new Decimal(sqrtP);
  const sqrtUpperDec = new Decimal(sqrtUpper);

  if (sqrtPDec.gte(sqrtUpperDec)) {
    throw new Error('Current price must be less than upper price');
  }

  // L = amount0 * (sqrt(upper) * sqrt(current)) / (sqrt(upper) - sqrt(current))
  // Since sqrtP and sqrtUpper are in Q96 format, we need to adjust scaling
  const numerator = amount0Dec.mul(sqrtUpperDec).mul(sqrtPDec);
  const denominator = sqrtUpperDec.sub(sqrtPDec);

  // The result needs to be scaled properly - multiply by Q96 to get correct liquidity scale
  const liquidity = numerator.div(denominator).div(Q96_DECIMAL);

  return liquidity.toFixed(0);
}

/**
 * Computes liquidity from token1 amount for a given price range
 * Formula: L = amount1 / (sqrt(current) - sqrt(lower))
 * @param amount1 The amount of token1 (string to avoid precision loss)
 * @param sqrtP The current sqrt price (Q64.96)
 * @param sqrtLower The lower sqrt price (Q64.96)
 * @returns The liquidity as a string
 */
export function liquidityFromToken1(
  amount1: string,
  sqrtP: string,
  sqrtLower: string
): string {
  const amount1Dec = new Decimal(amount1);
  const sqrtPDec = new Decimal(sqrtP);
  const sqrtLowerDec = new Decimal(sqrtLower);

  if (sqrtPDec.lte(sqrtLowerDec)) {
    throw new Error('Current price must be greater than lower price');
  }

  // L = amount1 / (sqrt(current) - sqrt(lower))
  // Since sqrtP values are in Q96, we need to scale the result properly
  const denominator = sqrtPDec.sub(sqrtLowerDec);
  const liquidity = amount1Dec.mul(Q96_DECIMAL).div(denominator);

  return liquidity.toFixed(0);
}

/**
 * Computes the maximum liquidity that can be provided given token amounts and price range
 * @param amount0 The amount of token0 available
 * @param amount1 The amount of token1 available
 * @param sqrtLower The lower sqrt price
 * @param sqrtP The current sqrt price
 * @param sqrtUpper The upper sqrt price
 * @returns The maximum liquidity as a string
 */
export function liquidityForAmounts(
  amount0: string,
  amount1: string,
  sqrtLower: string,
  sqrtP: string,
  sqrtUpper: string
): string {
  const sqrtPDec = new Decimal(sqrtP);
  const sqrtLowerDec = new Decimal(sqrtLower);
  const sqrtUpperDec = new Decimal(sqrtUpper);

  if (sqrtLowerDec.gte(sqrtUpperDec)) {
    throw new Error('Lower price must be less than upper price');
  }

  let liquidity: Decimal;

  if (sqrtPDec.lte(sqrtLowerDec)) {
    // Current price is below range - only token0 will be used
    liquidity = new Decimal(liquidityFromToken0(amount0, sqrtLowerDec.toString(), sqrtUpperDec.toString()));
  } else if (sqrtPDec.lt(sqrtUpperDec)) {
    // Current price is in range - both tokens will be used
    const liquidity0 = new Decimal(liquidityFromToken0(amount0, sqrtPDec.toString(), sqrtUpperDec.toString()));
    const liquidity1 = new Decimal(liquidityFromToken1(amount1, sqrtPDec.toString(), sqrtLowerDec.toString()));
    
    // Take the minimum to ensure we don't exceed available amounts
    liquidity = Decimal.min(liquidity0, liquidity1);
  } else {
    // Current price is above range - only token1 will be used
    liquidity = new Decimal(liquidityFromToken1(amount1, sqrtUpperDec.toString(), sqrtLowerDec.toString()));
  }

  return liquidity.toFixed(0);
}

/**
 * Computes the token0 amount for a given liquidity and price range
 * Formula: amount0 = L * (sqrt(upper) - sqrt(current)) / (sqrt(upper) * sqrt(current))
 * @param liquidity The liquidity amount
 * @param sqrtP The current sqrt price
 * @param sqrtUpper The upper sqrt price
 * @returns The token0 amount as a string
 */
export function getAmount0FromLiquidity(
  liquidity: string,
  sqrtP: string,
  sqrtUpper: string
): string {
  const liquidityDec = new Decimal(liquidity);
  const sqrtPDec = new Decimal(sqrtP);
  const sqrtUpperDec = new Decimal(sqrtUpper);

  if (sqrtPDec.gte(sqrtUpperDec)) {
    return '0';
  }

  // amount0 = L * (sqrt(upper) - sqrt(current)) / (sqrt(upper) * sqrt(current))
  // Account for Q96 scaling in sqrtP values
  const numerator = liquidityDec.mul(sqrtUpperDec.sub(sqrtPDec));
  const denominator = sqrtUpperDec.mul(sqrtPDec);

  return numerator.mul(Q96_DECIMAL).div(denominator).toFixed(0);
}

/**
 * Computes the token1 amount for a given liquidity and price range
 * Formula: amount1 = L * (sqrt(current) - sqrt(lower))
 * @param liquidity The liquidity amount
 * @param sqrtP The current sqrt price
 * @param sqrtLower The lower sqrt price
 * @returns The token1 amount as a string
 */
export function getAmount1FromLiquidity(
  liquidity: string,
  sqrtP: string,
  sqrtLower: string
): string {
  const liquidityDec = new Decimal(liquidity);
  const sqrtPDec = new Decimal(sqrtP);
  const sqrtLowerDec = new Decimal(sqrtLower);

  if (sqrtPDec.lte(sqrtLowerDec)) {
    return '0';
  }

  // amount1 = L * (sqrt(current) - sqrt(lower))
  // Account for Q96 scaling 
  return liquidityDec.mul(sqrtPDec.sub(sqrtLowerDec)).div(Q96_DECIMAL).toFixed(0);
}

/**
 * Computes both token amounts for a given liquidity and price range
 * @param liquidity The liquidity amount
 * @param sqrtLower The lower sqrt price
 * @param sqrtP The current sqrt price
 * @param sqrtUpper The upper sqrt price
 * @returns Object containing amount0 and amount1 as strings
 */
export function getAmountsFromLiquidity(
  liquidity: string,
  sqrtLower: string,
  sqrtP: string,
  sqrtUpper: string
): { amount0: string; amount1: string } {
  return {
    amount0: getAmount0FromLiquidity(liquidity, sqrtP, sqrtUpper),
    amount1: getAmount1FromLiquidity(liquidity, sqrtP, sqrtLower),
  };
}

/**
 * Adds liquidity amounts (helper for accumulating liquidity across ticks)
 * @param liquidity1 First liquidity amount
 * @param liquidity2 Second liquidity amount
 * @returns Sum of liquidities as string
 */
export function addLiquidity(liquidity1: string, liquidity2: string): string {
  return new Decimal(liquidity1).add(new Decimal(liquidity2)).toFixed(0);
}

/**
 * Subtracts liquidity amounts (helper for removing liquidity)
 * @param liquidity1 First liquidity amount
 * @param liquidity2 Amount to subtract
 * @returns Difference of liquidities as string
 */
export function subtractLiquidity(liquidity1: string, liquidity2: string): string {
  const result = new Decimal(liquidity1).sub(new Decimal(liquidity2));
  return result.isNegative() ? '0' : result.toFixed(0);
}