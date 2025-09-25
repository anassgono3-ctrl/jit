import Decimal from 'decimal.js';

// Configure decimal.js for high precision
Decimal.config({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -40,
  toExpPos: 40,
});

// Q96 constant (2^96)
const Q96_DECIMAL = new Decimal(2).pow(96);

/**
 * Converts sqrtPriceX96 to human readable price (token1 per token0)
 * @param sqrtX96 The sqrt price as Q64.96 format (string or bigint)
 * @param decimals0 Number of decimals for token0
 * @param decimals1 Number of decimals for token1
 * @returns Human readable price as string
 */
export function sqrtPriceX96ToPrice(
  sqrtX96: string | bigint,
  decimals0: number,
  decimals1: number
): string {
  const sqrtPrice = new Decimal(sqrtX96.toString());
  
  // Convert Q64.96 to decimal: (sqrtPrice / 2^96)^2
  const price = sqrtPrice.div(Q96_DECIMAL).pow(2);
  
  // Adjust for token decimals: price * (10^decimals0 / 10^decimals1)
  const decimalAdjustment = new Decimal(10).pow(decimals0).div(new Decimal(10).pow(decimals1));
  
  return price.mul(decimalAdjustment).toString();
}

/**
 * Converts human readable price to sqrtPriceX96
 * @param price The price as string or number (token1 per token0)
 * @param decimals0 Number of decimals for token0  
 * @param decimals1 Number of decimals for token1
 * @returns The sqrt price in Q64.96 format as bigint
 */
export function priceToSqrtPriceX96(
  price: string | number,
  decimals0: number = 18,
  decimals1: number = 18
): bigint {
  const priceDec = new Decimal(price.toString());
  
  // Adjust for token decimals: price * (10^decimals1 / 10^decimals0)
  const decimalAdjustment = new Decimal(10).pow(decimals1).div(new Decimal(10).pow(decimals0));
  const adjustedPrice = priceDec.mul(decimalAdjustment);
  
  // Convert to sqrt price: sqrt(price) * 2^96
  const sqrtPrice = adjustedPrice.sqrt().mul(Q96_DECIMAL);
  
  return BigInt(sqrtPrice.toFixed(0));
}

/**
 * Calculates the price impact of a swap
 * @param sqrtPriceBefore The sqrt price before swap
 * @param sqrtPriceAfter The sqrt price after swap  
 * @param decimals0 Token0 decimals
 * @param decimals1 Token1 decimals
 * @returns Price impact as percentage (positive for price increase)
 */
export function calculatePriceImpact(
  sqrtPriceBefore: string,
  sqrtPriceAfter: string,
  decimals0: number,
  decimals1: number
): string {
  const priceBefore = new Decimal(sqrtPriceX96ToPrice(sqrtPriceBefore, decimals0, decimals1));
  const priceAfter = new Decimal(sqrtPriceX96ToPrice(sqrtPriceAfter, decimals0, decimals1));
  
  const impact = priceAfter.sub(priceBefore).div(priceBefore).mul(100);
  
  return impact.toString();
}

/**
 * Gets the price at a specific tick
 * @param tick The tick
 * @param decimals0 Token0 decimals
 * @param decimals1 Token1 decimals
 * @returns The price as string
 */
export function getPriceAtTick(
  tick: number,
  decimals0: number,
  decimals1: number
): string {
  // price = 1.0001^tick
  const price = new Decimal(1.0001).pow(tick);
  
  // Adjust for token decimals
  const decimalAdjustment = new Decimal(10).pow(decimals0).div(new Decimal(10).pow(decimals1));
  
  return price.mul(decimalAdjustment).toString();
}

/**
 * Gets the tick at a specific price
 * @param price The price (token1 per token0)
 * @param decimals0 Token0 decimals
 * @param decimals1 Token1 decimals
 * @returns The tick (rounded down)
 */
export function getTickAtPrice(
  price: string | number,
  decimals0: number,
  decimals1: number
): number {
  const priceDec = new Decimal(price.toString());
  
  // Adjust for token decimals: price * (10^decimals1 / 10^decimals0)
  const decimalAdjustment = new Decimal(10).pow(decimals1).div(new Decimal(10).pow(decimals0));
  const adjustedPrice = priceDec.mul(decimalAdjustment);
  
  // tick = log(price) / log(1.0001)
  const tick = adjustedPrice.ln().div(new Decimal(1.0001).ln());
  
  // Round down to get the floor tick - use decimal floor instead of Number conversion
  return tick.floor().toNumber();
}

/**
 * Formats token amount with proper decimals
 * @param amount Raw token amount (string)
 * @param decimals Number of decimals
 * @param displayDecimals Number of decimals to display (optional)
 * @returns Formatted amount string
 */
export function formatTokenAmount(
  amount: string,
  decimals: number,
  displayDecimals?: number
): string {
  const amountDec = new Decimal(amount);
  const divisor = new Decimal(10).pow(decimals);
  const formatted = amountDec.div(divisor);
  
  if (displayDecimals !== undefined) {
    return formatted.toFixed(displayDecimals);
  }
  
  return formatted.toString();
}

/**
 * Parses formatted token amount to raw amount
 * @param amount Formatted amount (string)
 * @param decimals Number of decimals
 * @returns Raw amount string
 */
export function parseTokenAmount(amount: string, decimals: number): string {
  const amountDec = new Decimal(amount);
  const multiplier = new Decimal(10).pow(decimals);
  
  return amountDec.mul(multiplier).toFixed(0);
}

/**
 * Calculates USD value of token amounts
 * @param amount0 Token0 amount (raw)
 * @param amount1 Token1 amount (raw)
 * @param decimals0 Token0 decimals
 * @param decimals1 Token1 decimals
 * @param price0Usd Token0 price in USD
 * @param price1Usd Token1 price in USD
 * @returns Total USD value as string
 */
export function calculateUsdValue(
  amount0: string,
  amount1: string,
  decimals0: number,
  decimals1: number,
  price0Usd: string,
  price1Usd: string
): string {
  const amount0Formatted = new Decimal(formatTokenAmount(amount0, decimals0));
  const amount1Formatted = new Decimal(formatTokenAmount(amount1, decimals1));
  
  const value0 = amount0Formatted.mul(new Decimal(price0Usd));
  const value1 = amount1Formatted.mul(new Decimal(price1Usd));
  
  return value0.add(value1).toString();
}

/**
 * Computes the equivalent token1 amount for a given token0 amount at current price
 * @param amount0 Token0 amount (raw)
 * @param sqrtPriceX96 Current sqrt price
 * @param decimals0 Token0 decimals
 * @param decimals1 Token1 decimals
 * @returns Equivalent token1 amount (raw) as string
 */
export function getEquivalentToken1Amount(
  amount0: string,
  sqrtPriceX96: string,
  decimals0: number,
  decimals1: number
): string {
  const price = sqrtPriceX96ToPrice(sqrtPriceX96, decimals0, decimals1);
  const amount0Formatted = formatTokenAmount(amount0, decimals0);
  const amount1Formatted = new Decimal(amount0Formatted).mul(new Decimal(price));
  
  return parseTokenAmount(amount1Formatted.toString(), decimals1);
}

/**
 * Computes the equivalent token0 amount for a given token1 amount at current price
 * @param amount1 Token1 amount (raw) 
 * @param sqrtPriceX96 Current sqrt price
 * @param decimals0 Token0 decimals
 * @param decimals1 Token1 decimals
 * @returns Equivalent token0 amount (raw) as string
 */
export function getEquivalentToken0Amount(
  amount1: string,
  sqrtPriceX96: string,
  decimals0: number,
  decimals1: number
): string {
  const price = sqrtPriceX96ToPrice(sqrtPriceX96, decimals0, decimals1);
  const amount1Formatted = formatTokenAmount(amount1, decimals1);
  const amount0Formatted = new Decimal(amount1Formatted).div(new Decimal(price));
  
  return parseTokenAmount(amount0Formatted.toString(), decimals0);
}