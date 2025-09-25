"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.liquidityFromToken0 = liquidityFromToken0;
exports.liquidityFromToken1 = liquidityFromToken1;
exports.liquidityForAmounts = liquidityForAmounts;
exports.getAmount0FromLiquidity = getAmount0FromLiquidity;
exports.getAmount1FromLiquidity = getAmount1FromLiquidity;
exports.getAmountsFromLiquidity = getAmountsFromLiquidity;
exports.addLiquidity = addLiquidity;
exports.subtractLiquidity = subtractLiquidity;
const decimal_js_1 = __importDefault(require("decimal.js"));
// Configure decimal.js for high precision
decimal_js_1.default.config({
    precision: 50,
    rounding: decimal_js_1.default.ROUND_DOWN,
    toExpNeg: -50,
    toExpPos: 50,
});
// Q96 constant for scaling
const Q96_DECIMAL = new decimal_js_1.default(2).pow(96);
/**
 * Computes liquidity from token0 amount for a given price range
 * Formula: L = amount0 * (sqrt(upper) * sqrt(current)) / (sqrt(upper) - sqrt(current))
 * @param amount0 The amount of token0 (string to avoid precision loss)
 * @param sqrtP The current sqrt price (Q64.96)
 * @param sqrtUpper The upper sqrt price (Q64.96)
 * @returns The liquidity as a string
 */
function liquidityFromToken0(amount0, sqrtP, sqrtUpper) {
    const amount0Dec = new decimal_js_1.default(amount0);
    const sqrtPDec = new decimal_js_1.default(sqrtP);
    const sqrtUpperDec = new decimal_js_1.default(sqrtUpper);
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
function liquidityFromToken1(amount1, sqrtP, sqrtLower) {
    const amount1Dec = new decimal_js_1.default(amount1);
    const sqrtPDec = new decimal_js_1.default(sqrtP);
    const sqrtLowerDec = new decimal_js_1.default(sqrtLower);
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
function liquidityForAmounts(amount0, amount1, sqrtLower, sqrtP, sqrtUpper) {
    const sqrtPDec = new decimal_js_1.default(sqrtP);
    const sqrtLowerDec = new decimal_js_1.default(sqrtLower);
    const sqrtUpperDec = new decimal_js_1.default(sqrtUpper);
    if (sqrtLowerDec.gte(sqrtUpperDec)) {
        throw new Error('Lower price must be less than upper price');
    }
    let liquidity;
    if (sqrtPDec.lte(sqrtLowerDec)) {
        // Current price is below range - only token0 will be used
        liquidity = new decimal_js_1.default(liquidityFromToken0(amount0, sqrtLowerDec.toString(), sqrtUpperDec.toString()));
    }
    else if (sqrtPDec.lt(sqrtUpperDec)) {
        // Current price is in range - both tokens will be used
        const liquidity0 = new decimal_js_1.default(liquidityFromToken0(amount0, sqrtPDec.toString(), sqrtUpperDec.toString()));
        const liquidity1 = new decimal_js_1.default(liquidityFromToken1(amount1, sqrtPDec.toString(), sqrtLowerDec.toString()));
        // Take the minimum to ensure we don't exceed available amounts
        liquidity = decimal_js_1.default.min(liquidity0, liquidity1);
    }
    else {
        // Current price is above range - only token1 will be used
        liquidity = new decimal_js_1.default(liquidityFromToken1(amount1, sqrtUpperDec.toString(), sqrtLowerDec.toString()));
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
function getAmount0FromLiquidity(liquidity, sqrtP, sqrtUpper) {
    const liquidityDec = new decimal_js_1.default(liquidity);
    const sqrtPDec = new decimal_js_1.default(sqrtP);
    const sqrtUpperDec = new decimal_js_1.default(sqrtUpper);
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
function getAmount1FromLiquidity(liquidity, sqrtP, sqrtLower) {
    const liquidityDec = new decimal_js_1.default(liquidity);
    const sqrtPDec = new decimal_js_1.default(sqrtP);
    const sqrtLowerDec = new decimal_js_1.default(sqrtLower);
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
function getAmountsFromLiquidity(liquidity, sqrtLower, sqrtP, sqrtUpper) {
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
function addLiquidity(liquidity1, liquidity2) {
    return new decimal_js_1.default(liquidity1).add(new decimal_js_1.default(liquidity2)).toFixed(0);
}
/**
 * Subtracts liquidity amounts (helper for removing liquidity)
 * @param liquidity1 First liquidity amount
 * @param liquidity2 Amount to subtract
 * @returns Difference of liquidities as string
 */
function subtractLiquidity(liquidity1, liquidity2) {
    const result = new decimal_js_1.default(liquidity1).sub(new decimal_js_1.default(liquidity2));
    return result.isNegative() ? '0' : result.toFixed(0);
}
//# sourceMappingURL=liquidity_math.js.map