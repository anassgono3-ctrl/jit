declare const MIN_TICK = -887272;
declare const MAX_TICK = 887272;
declare const MIN_SQRT_RATIO = 4295128739n;
declare const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;
/**
 * Returns the sqrt ratio as a Q64.96 for the given tick.
 * The sqrt ratio is sqrt(1.0001^tick) * 2^96
 * @param tick The tick for which to compute the sqrt ratio
 * @returns The sqrt ratio
 */
export declare function getSqrtRatioAtTick(tick: number): bigint;
/**
 * Returns the tick corresponding to a given sqrt ratio, such that #getSqrtRatioAtTick(tick) <= sqrtRatioX96
 * and #getSqrtRatioAtTick(tick + 1) > sqrtRatioX96
 * @param sqrtRatioX96 The sqrt ratio as a Q64.96 for which to compute the tick
 * @returns The tick
 */
export declare function getTickAtSqrtRatio(sqrtRatioX96: bigint): number;
/**
 * Returns the nearest usable tick given a tick and the tick spacing
 * @param tick The tick to round
 * @param tickSpacing The tick spacing
 * @returns The nearest usable tick
 */
export declare function nearestUsableTick(tick: number, tickSpacing: number): number;
export { MIN_TICK, MAX_TICK, MIN_SQRT_RATIO, MAX_SQRT_RATIO };
//# sourceMappingURL=tick_math.d.ts.map