import Decimal from 'decimal.js';
import { nearestUsableTick } from '../math/tick_math';

// Configure decimal.js for high precision
Decimal.config({
  precision: 50,
  rounding: Decimal.ROUND_DOWN,
});

/**
 * Range selection result
 */
export interface RangeSelection {
  /** Lower tick of the range */
  lowerTick: number;
  /** Upper tick of the range */
  upperTick: number;
  /** Range width category */
  category: 'narrow' | 'medium' | 'wide';
  /** Confidence score for this range */
  confidence: number;
}

/**
 * Swap direction for range selection
 */
export type SwapDirection = 'up' | 'down' | 'neutral';

/**
 * Liquidity depth information
 */
export interface LiquidityDepth {
  /** Current pool liquidity */
  currentLiquidity: string;
  /** Liquidity within 1% price range */
  liquidityNear: string;
  /** Liquidity within 5% price range */
  liquidityMedium: string;
  /** Average tick spacing utilization */
  utilizationRatio: number;
}

/**
 * Default tick width configurations
 */
const DEFAULT_TICK_WIDTHS = {
  narrow: 10,
  medium: 20,
  wide: 40,
};

/**
 * Selects optimal tick range for JIT strategy
 * @param centerTick Current tick to center range around
 * @param tickSpacing Pool tick spacing
 * @param swapSizeUsd Size of incoming swap in USD
 * @param liquidityDepth Current liquidity depth information
 * @param direction Expected price movement direction
 * @returns Optimal tick range selection
 */
export function selectRange(
  centerTick: number,
  tickSpacing: number,
  swapSizeUsd: string,
  liquidityDepth: string,
  direction: SwapDirection = 'neutral'
): RangeSelection {
  const swapSize = new Decimal(swapSizeUsd);
  const liquidity = new Decimal(liquidityDepth);

  // 1. Determine range width based on swap size and liquidity
  const rangeCategory = determineRangeCategory(swapSize, liquidity);
  
  // 2. Calculate base tick width
  const baseWidth = getBaseTickWidth(rangeCategory, tickSpacing);
  
  // 3. Adjust width based on direction and market conditions
  const adjustedWidth = adjustWidthForConditions(
    baseWidth,
    direction,
    swapSize,
    liquidity
  );
  
  // 4. Calculate tick range bounds
  const { lowerTick, upperTick } = calculateTickBounds(
    centerTick,
    adjustedWidth,
    tickSpacing,
    direction
  );
  
  // 5. Calculate confidence score
  const confidence = calculateRangeConfidence(
    rangeCategory,
    swapSize,
    liquidity,
    direction
  );

  return {
    lowerTick,
    upperTick,
    category: rangeCategory,
    confidence,
  };
}

/**
 * Determines range category based on swap size and liquidity
 */
function determineRangeCategory(
  swapSize: Decimal,
  liquidity: Decimal
): 'narrow' | 'medium' | 'wide' {
  // Calculate liquidity utilization ratio
  const utilizationRatio = swapSize.div(liquidity);
  
  // Thresholds for range categorization
  if (utilizationRatio.lt(0.01)) {
    return 'narrow'; // Small swap relative to liquidity - tight range
  } else if (utilizationRatio.lt(0.05)) {
    return 'medium'; // Medium swap - balanced range
  } else {
    return 'wide'; // Large swap - wider range for price impact
  }
}

/**
 * Gets base tick width for range category
 */
function getBaseTickWidth(
  category: 'narrow' | 'medium' | 'wide',
  tickSpacing: number
): number {
  const multiplier = DEFAULT_TICK_WIDTHS[category];
  return multiplier * tickSpacing;
}

/**
 * Adjusts tick width based on market conditions
 */
function adjustWidthForConditions(
  baseWidth: number,
  direction: SwapDirection,
  swapSize: Decimal,
  liquidity: Decimal
): number {
  let adjustmentFactor = 1.0;

  // 1. Direction-based adjustment
  if (direction === 'up' || direction === 'down') {
    // Narrower range for directional moves (higher concentration)
    adjustmentFactor *= 0.8;
  }

  // 2. Size-based adjustment
  const sizeRatio = swapSize.div(liquidity);
  if (sizeRatio.gt(0.1)) {
    // Wider range for very large swaps
    adjustmentFactor *= 1.5;
  } else if (sizeRatio.lt(0.005)) {
    // Tighter range for very small swaps
    adjustmentFactor *= 0.7;
  }

  // 3. Liquidity-based adjustment
  const liquidityThreshold = new Decimal(1000000); // $1M threshold
  if (liquidity.lt(liquidityThreshold)) {
    // Wider range in shallow pools
    adjustmentFactor *= 1.2;
  }

  return Math.round(baseWidth * adjustmentFactor);
}

/**
 * Calculates actual tick bounds for the range
 */
function calculateTickBounds(
  centerTick: number,
  width: number,
  tickSpacing: number,
  direction: SwapDirection
): { lowerTick: number; upperTick: number } {
  let lowerTick: number;
  let upperTick: number;

  if (direction === 'up') {
    // Bias range upward for expected price increase
    lowerTick = centerTick - Math.round(width * 0.3);
    upperTick = centerTick + Math.round(width * 0.7);
  } else if (direction === 'down') {
    // Bias range downward for expected price decrease
    lowerTick = centerTick - Math.round(width * 0.7);
    upperTick = centerTick + Math.round(width * 0.3);
  } else {
    // Symmetric range for neutral direction
    const halfWidth = Math.round(width / 2);
    lowerTick = centerTick - halfWidth;
    upperTick = centerTick + halfWidth;
  }

  // Align to tick spacing
  lowerTick = nearestUsableTick(lowerTick, tickSpacing);
  upperTick = nearestUsableTick(upperTick, tickSpacing);

  // Ensure minimum range width
  const minWidth = tickSpacing * 2;
  if (upperTick - lowerTick < minWidth) {
    const adjustment = Math.round((minWidth - (upperTick - lowerTick)) / 2);
    lowerTick -= adjustment;
    upperTick += adjustment;
    
    // Re-align after adjustment
    lowerTick = nearestUsableTick(lowerTick, tickSpacing);
    upperTick = nearestUsableTick(upperTick, tickSpacing);
  }

  return { lowerTick, upperTick };
}

/**
 * Calculates confidence score for range selection
 */
function calculateRangeConfidence(
  category: 'narrow' | 'medium' | 'wide',
  swapSize: Decimal,
  liquidity: Decimal,
  direction: SwapDirection
): number {
  let confidence = 0.5; // Base confidence

  // 1. Category-based confidence
  const categoryScores = {
    narrow: 0.8, // High confidence for focused ranges
    medium: 0.7, // Good confidence for balanced ranges
    wide: 0.6,   // Lower confidence for wide ranges
  };
  confidence = categoryScores[category];

  // 2. Direction confidence adjustment
  if (direction === 'neutral') {
    confidence *= 0.9; // Slightly lower for uncertain direction
  }

  // 3. Size-to-liquidity ratio adjustment
  const sizeRatio = swapSize.div(liquidity);
  if (sizeRatio.gt(0.02) && sizeRatio.lt(0.1)) {
    confidence *= 1.1; // Sweet spot for JIT
  } else if (sizeRatio.gt(0.2)) {
    confidence *= 0.8; // Very large swaps are riskier
  }

  // 4. Liquidity depth adjustment
  const liquidityScore = Math.min(1, liquidity.div(1000000).toNumber()); // Normalize to $1M
  confidence *= (0.7 + 0.3 * liquidityScore);

  // Clamp confidence between 0.1 and 0.95
  return Math.max(0.1, Math.min(0.95, confidence));
}

/**
 * Analyzes optimal range for multiple swap scenarios
 * @param centerTick Current tick
 * @param tickSpacing Pool tick spacing
 * @param scenarios Array of potential swap scenarios
 * @returns Best range selection across scenarios
 */
export function selectRangeForScenarios(
  centerTick: number,
  tickSpacing: number,
  scenarios: Array<{
    swapSizeUsd: string;
    direction: SwapDirection;
    probability: number;
  }>,
  liquidityDepth: string
): RangeSelection {
  // Weight each scenario by probability and calculate optimal range
  let weightedLower = 0;
  let weightedUpper = 0;
  let totalWeight = 0;
  let avgConfidence = 0;
  let dominantCategory: 'narrow' | 'medium' | 'wide' = 'medium';

  for (const scenario of scenarios) {
    const range = selectRange(
      centerTick,
      tickSpacing,
      scenario.swapSizeUsd,
      liquidityDepth,
      scenario.direction
    );

    const weight = scenario.probability;
    weightedLower += range.lowerTick * weight;
    weightedUpper += range.upperTick * weight;
    avgConfidence += range.confidence * weight;
    totalWeight += weight;

    // Track dominant category
    if (weight > totalWeight * 0.4) {
      dominantCategory = range.category;
    }
  }

  if (totalWeight === 0) {
    // Fallback to neutral scenario
    return selectRange(centerTick, tickSpacing, '100000', liquidityDepth, 'neutral');
  }

  const finalLower = nearestUsableTick(Math.round(weightedLower / totalWeight), tickSpacing);
  const finalUpper = nearestUsableTick(Math.round(weightedUpper / totalWeight), tickSpacing);
  const finalConfidence = avgConfidence / totalWeight;

  return {
    lowerTick: finalLower,
    upperTick: finalUpper,
    category: dominantCategory,
    confidence: finalConfidence,
  };
}

/**
 * Validates if a range selection is reasonable
 * @param range Range to validate
 * @param centerTick Current tick
 * @param tickSpacing Pool tick spacing
 * @returns True if range is valid
 */
export function validateRange(
  range: RangeSelection,
  centerTick: number,
  tickSpacing: number
): boolean {
  try {
    // Check basic validity
    if (range.lowerTick >= range.upperTick) return false;
    
    // Check tick alignment
    if (range.lowerTick % tickSpacing !== 0) return false;
    if (range.upperTick % tickSpacing !== 0) return false;
    
    // Check minimum width
    const minWidth = tickSpacing * 2;
    if (range.upperTick - range.lowerTick < minWidth) return false;
    
    // Check reasonable distance from center
    const maxDistance = tickSpacing * 200; // Reasonable max distance
    if (Math.abs(range.lowerTick - centerTick) > maxDistance) return false;
    if (Math.abs(range.upperTick - centerTick) > maxDistance) return false;
    
    // Check confidence is reasonable
    if (range.confidence < 0 || range.confidence > 1) return false;
    
    return true;
  } catch {
    return false;
  }
}