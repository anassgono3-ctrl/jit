/**
 * Converts sqrtPriceX96 to human readable price (token1 per token0)
 * @param sqrtX96 The sqrt price as Q64.96 format (string or bigint)
 * @param decimals0 Number of decimals for token0
 * @param decimals1 Number of decimals for token1
 * @returns Human readable price as string
 */
export declare function sqrtPriceX96ToPrice(sqrtX96: string | bigint, decimals0: number, decimals1: number): string;
/**
 * Converts human readable price to sqrtPriceX96
 * @param price The price as string or number (token1 per token0)
 * @param decimals0 Number of decimals for token0
 * @param decimals1 Number of decimals for token1
 * @returns The sqrt price in Q64.96 format as bigint
 */
export declare function priceToSqrtPriceX96(price: string | number, decimals0?: number, decimals1?: number): bigint;
/**
 * Calculates the price impact of a swap
 * @param sqrtPriceBefore The sqrt price before swap
 * @param sqrtPriceAfter The sqrt price after swap
 * @param decimals0 Token0 decimals
 * @param decimals1 Token1 decimals
 * @returns Price impact as percentage (positive for price increase)
 */
export declare function calculatePriceImpact(sqrtPriceBefore: string, sqrtPriceAfter: string, decimals0: number, decimals1: number): string;
/**
 * Gets the price at a specific tick
 * @param tick The tick
 * @param decimals0 Token0 decimals
 * @param decimals1 Token1 decimals
 * @returns The price as string
 */
export declare function getPriceAtTick(tick: number, decimals0: number, decimals1: number): string;
/**
 * Gets the tick at a specific price
 * @param price The price (token1 per token0)
 * @param decimals0 Token0 decimals
 * @param decimals1 Token1 decimals
 * @returns The tick (rounded down)
 */
export declare function getTickAtPrice(price: string | number, decimals0: number, decimals1: number): number;
/**
 * Formats token amount with proper decimals
 * @param amount Raw token amount (string)
 * @param decimals Number of decimals
 * @param displayDecimals Number of decimals to display (optional)
 * @returns Formatted amount string
 */
export declare function formatTokenAmount(amount: string, decimals: number, displayDecimals?: number): string;
/**
 * Parses formatted token amount to raw amount
 * @param amount Formatted amount (string)
 * @param decimals Number of decimals
 * @returns Raw amount string
 */
export declare function parseTokenAmount(amount: string, decimals: number): string;
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
export declare function calculateUsdValue(amount0: string, amount1: string, decimals0: number, decimals1: number, price0Usd: string, price1Usd: string): string;
/**
 * Computes the equivalent token1 amount for a given token0 amount at current price
 * @param amount0 Token0 amount (raw)
 * @param sqrtPriceX96 Current sqrt price
 * @param decimals0 Token0 decimals
 * @param decimals1 Token1 decimals
 * @returns Equivalent token1 amount (raw) as string
 */
export declare function getEquivalentToken1Amount(amount0: string, sqrtPriceX96: string, decimals0: number, decimals1: number): string;
/**
 * Computes the equivalent token0 amount for a given token1 amount at current price
 * @param amount1 Token1 amount (raw)
 * @param sqrtPriceX96 Current sqrt price
 * @param decimals0 Token0 decimals
 * @param decimals1 Token1 decimals
 * @returns Equivalent token0 amount (raw) as string
 */
export declare function getEquivalentToken0Amount(amount1: string, sqrtPriceX96: string, decimals0: number, decimals1: number): string;
//# sourceMappingURL=price_utils.d.ts.map