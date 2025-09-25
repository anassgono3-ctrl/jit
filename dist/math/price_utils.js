"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sqrtPriceX96ToPrice = sqrtPriceX96ToPrice;
exports.priceToSqrtPriceX96 = priceToSqrtPriceX96;
exports.calculatePriceImpact = calculatePriceImpact;
exports.getPriceAtTick = getPriceAtTick;
exports.getTickAtPrice = getTickAtPrice;
exports.formatTokenAmount = formatTokenAmount;
exports.parseTokenAmount = parseTokenAmount;
exports.calculateUsdValue = calculateUsdValue;
exports.getEquivalentToken1Amount = getEquivalentToken1Amount;
exports.getEquivalentToken0Amount = getEquivalentToken0Amount;
const decimal_js_1 = __importDefault(require("decimal.js"));
// Configure decimal.js for high precision
decimal_js_1.default.config({
    precision: 40,
    rounding: decimal_js_1.default.ROUND_HALF_UP,
    toExpNeg: -40,
    toExpPos: 40,
});
// Q96 constant (2^96)
const Q96_DECIMAL = new decimal_js_1.default(2).pow(96);
/**
 * Converts sqrtPriceX96 to human readable price (token1 per token0)
 * @param sqrtX96 The sqrt price as Q64.96 format (string or bigint)
 * @param decimals0 Number of decimals for token0
 * @param decimals1 Number of decimals for token1
 * @returns Human readable price as string
 */
function sqrtPriceX96ToPrice(sqrtX96, decimals0, decimals1) {
    const sqrtPrice = new decimal_js_1.default(sqrtX96.toString());
    // Convert Q64.96 to decimal: (sqrtPrice / 2^96)^2
    const price = sqrtPrice.div(Q96_DECIMAL).pow(2);
    // Adjust for token decimals: price * (10^decimals0 / 10^decimals1)
    const decimalAdjustment = new decimal_js_1.default(10).pow(decimals0).div(new decimal_js_1.default(10).pow(decimals1));
    return price.mul(decimalAdjustment).toString();
}
/**
 * Converts human readable price to sqrtPriceX96
 * @param price The price as string or number (token1 per token0)
 * @param decimals0 Number of decimals for token0
 * @param decimals1 Number of decimals for token1
 * @returns The sqrt price in Q64.96 format as bigint
 */
function priceToSqrtPriceX96(price, decimals0 = 18, decimals1 = 18) {
    const priceDec = new decimal_js_1.default(price.toString());
    // Adjust for token decimals: price * (10^decimals1 / 10^decimals0)
    const decimalAdjustment = new decimal_js_1.default(10).pow(decimals1).div(new decimal_js_1.default(10).pow(decimals0));
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
function calculatePriceImpact(sqrtPriceBefore, sqrtPriceAfter, decimals0, decimals1) {
    const priceBefore = new decimal_js_1.default(sqrtPriceX96ToPrice(sqrtPriceBefore, decimals0, decimals1));
    const priceAfter = new decimal_js_1.default(sqrtPriceX96ToPrice(sqrtPriceAfter, decimals0, decimals1));
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
function getPriceAtTick(tick, decimals0, decimals1) {
    // price = 1.0001^tick
    const price = new decimal_js_1.default(1.0001).pow(tick);
    // Adjust for token decimals
    const decimalAdjustment = new decimal_js_1.default(10).pow(decimals0).div(new decimal_js_1.default(10).pow(decimals1));
    return price.mul(decimalAdjustment).toString();
}
/**
 * Gets the tick at a specific price
 * @param price The price (token1 per token0)
 * @param decimals0 Token0 decimals
 * @param decimals1 Token1 decimals
 * @returns The tick (rounded down)
 */
function getTickAtPrice(price, decimals0, decimals1) {
    const priceDec = new decimal_js_1.default(price.toString());
    // Adjust for token decimals: price * (10^decimals1 / 10^decimals0)
    const decimalAdjustment = new decimal_js_1.default(10).pow(decimals1).div(new decimal_js_1.default(10).pow(decimals0));
    const adjustedPrice = priceDec.mul(decimalAdjustment);
    // tick = log(price) / log(1.0001)
    const tick = adjustedPrice.ln().div(new decimal_js_1.default(1.0001).ln());
    return Math.floor(tick.toNumber());
}
/**
 * Formats token amount with proper decimals
 * @param amount Raw token amount (string)
 * @param decimals Number of decimals
 * @param displayDecimals Number of decimals to display (optional)
 * @returns Formatted amount string
 */
function formatTokenAmount(amount, decimals, displayDecimals) {
    const amountDec = new decimal_js_1.default(amount);
    const divisor = new decimal_js_1.default(10).pow(decimals);
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
function parseTokenAmount(amount, decimals) {
    const amountDec = new decimal_js_1.default(amount);
    const multiplier = new decimal_js_1.default(10).pow(decimals);
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
function calculateUsdValue(amount0, amount1, decimals0, decimals1, price0Usd, price1Usd) {
    const amount0Formatted = new decimal_js_1.default(formatTokenAmount(amount0, decimals0));
    const amount1Formatted = new decimal_js_1.default(formatTokenAmount(amount1, decimals1));
    const value0 = amount0Formatted.mul(new decimal_js_1.default(price0Usd));
    const value1 = amount1Formatted.mul(new decimal_js_1.default(price1Usd));
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
function getEquivalentToken1Amount(amount0, sqrtPriceX96, decimals0, decimals1) {
    const price = sqrtPriceX96ToPrice(sqrtPriceX96, decimals0, decimals1);
    const amount0Formatted = formatTokenAmount(amount0, decimals0);
    const amount1Formatted = new decimal_js_1.default(amount0Formatted).mul(new decimal_js_1.default(price));
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
function getEquivalentToken0Amount(amount1, sqrtPriceX96, decimals0, decimals1) {
    const price = sqrtPriceX96ToPrice(sqrtPriceX96, decimals0, decimals1);
    const amount1Formatted = formatTokenAmount(amount1, decimals1);
    const amount0Formatted = new decimal_js_1.default(amount1Formatted).div(new decimal_js_1.default(price));
    return parseTokenAmount(amount0Formatted.toString(), decimals0);
}
//# sourceMappingURL=price_utils.js.map