/**
 * Computes liquidity from token0 amount for a given price range
 * Formula: L = amount0 * (sqrt(upper) * sqrt(current)) / (sqrt(upper) - sqrt(current))
 * @param amount0 The amount of token0 (string to avoid precision loss)
 * @param sqrtP The current sqrt price (Q64.96)
 * @param sqrtUpper The upper sqrt price (Q64.96)
 * @returns The liquidity as a string
 */
export declare function liquidityFromToken0(amount0: string, sqrtP: string, sqrtUpper: string): string;
/**
 * Computes liquidity from token1 amount for a given price range
 * Formula: L = amount1 / (sqrt(current) - sqrt(lower))
 * @param amount1 The amount of token1 (string to avoid precision loss)
 * @param sqrtP The current sqrt price (Q64.96)
 * @param sqrtLower The lower sqrt price (Q64.96)
 * @returns The liquidity as a string
 */
export declare function liquidityFromToken1(amount1: string, sqrtP: string, sqrtLower: string): string;
/**
 * Computes the maximum liquidity that can be provided given token amounts and price range
 * @param amount0 The amount of token0 available
 * @param amount1 The amount of token1 available
 * @param sqrtLower The lower sqrt price
 * @param sqrtP The current sqrt price
 * @param sqrtUpper The upper sqrt price
 * @returns The maximum liquidity as a string
 */
export declare function liquidityForAmounts(amount0: string, amount1: string, sqrtLower: string, sqrtP: string, sqrtUpper: string): string;
/**
 * Computes the token0 amount for a given liquidity and price range
 * Formula: amount0 = L * (sqrt(upper) - sqrt(current)) / (sqrt(upper) * sqrt(current))
 * @param liquidity The liquidity amount
 * @param sqrtP The current sqrt price
 * @param sqrtUpper The upper sqrt price
 * @returns The token0 amount as a string
 */
export declare function getAmount0FromLiquidity(liquidity: string, sqrtP: string, sqrtUpper: string): string;
/**
 * Computes the token1 amount for a given liquidity and price range
 * Formula: amount1 = L * (sqrt(current) - sqrt(lower))
 * @param liquidity The liquidity amount
 * @param sqrtP The current sqrt price
 * @param sqrtLower The lower sqrt price
 * @returns The token1 amount as a string
 */
export declare function getAmount1FromLiquidity(liquidity: string, sqrtP: string, sqrtLower: string): string;
/**
 * Computes both token amounts for a given liquidity and price range
 * @param liquidity The liquidity amount
 * @param sqrtLower The lower sqrt price
 * @param sqrtP The current sqrt price
 * @param sqrtUpper The upper sqrt price
 * @returns Object containing amount0 and amount1 as strings
 */
export declare function getAmountsFromLiquidity(liquidity: string, sqrtLower: string, sqrtP: string, sqrtUpper: string): {
    amount0: string;
    amount1: string;
};
/**
 * Adds liquidity amounts (helper for accumulating liquidity across ticks)
 * @param liquidity1 First liquidity amount
 * @param liquidity2 Second liquidity amount
 * @returns Sum of liquidities as string
 */
export declare function addLiquidity(liquidity1: string, liquidity2: string): string;
/**
 * Subtracts liquidity amounts (helper for removing liquidity)
 * @param liquidity1 First liquidity amount
 * @param liquidity2 Amount to subtract
 * @returns Difference of liquidities as string
 */
export declare function subtractLiquidity(liquidity1: string, liquidity2: string): string;
//# sourceMappingURL=liquidity_math.d.ts.map