import Decimal from 'decimal.js';
import { JitPlan } from '../sim/execution_sim';

// Configure decimal.js for high precision
Decimal.config({
  precision: 50,
  rounding: Decimal.ROUND_DOWN,
});

/**
 * Scoring context for plan evaluation
 */
export interface ScoringContext {
  /** USD size of the target swap */
  swapSizeUsd: string;
  /** Estimated inclusion probability */
  inclusionProbability: number;
  /** Gas competition factor */
  gasCompetition: number;
  /** Current pool liquidity */
  poolLiquidity: string;
  /** Historical success rate (optional) */
  historicalSuccessRate?: number;
  /** MEV competition level (optional) */
  mevCompetition?: number;
}

/**
 * Inclusion probability model parameters
 */
interface InclusionModel {
  /** Base inclusion probability */
  baseProbability: number;
  /** Priority fee sensitivity */
  feeSensitivity: number;
  /** Competition adjustment factor */
  competitionFactor: number;
  /** Maximum achievable probability */
  maxProbability: number;
}

/**
 * Default inclusion model parameters (tuned from backtesting)
 */
const DEFAULT_INCLUSION_MODEL: InclusionModel = {
  baseProbability: 0.3,
  feeSensitivity: 0.15,
  competitionFactor: 1.2,
  maxProbability: 0.85,
};

/**
 * Estimates the probability of JIT transaction inclusion
 * @param priorityFeeUsd Priority fee offered in USD
 * @param historicalCompetitionFactor Historical competition level
 * @param model Inclusion model parameters
 * @returns Estimated inclusion probability (0-1)
 */
export function estimateInclusionProbability(
  priorityFeeUsd: string,
  historicalCompetitionFactor: number,
  model: InclusionModel = DEFAULT_INCLUSION_MODEL
): number {
  try {
    const priorityFee = new Decimal(priorityFeeUsd);
    const competition = new Decimal(historicalCompetitionFactor);
    
    // Logistic model for inclusion probability
    // P = base + (max - base) * (1 / (1 + exp(-sensitivity * (fee - competition))))
    
    const feeAdjustment = priorityFee.sub(competition);
    const logitInput = feeAdjustment.mul(model.feeSensitivity);
    
    // Approximate exp(-x) for reasonable range
    const expValue = Math.exp(-logitInput.toNumber());
    const sigmoid = 1 / (1 + expValue);
    
    const probability = model.baseProbability + 
      (model.maxProbability - model.baseProbability) * sigmoid;
    
    return Math.max(0, Math.min(1, probability));
  } catch {
    return model.baseProbability;
  }
}

/**
 * Calculates comprehensive score for a JIT plan
 * @param plan JIT plan to score
 * @param context Scoring context
 * @returns Numerical score (higher is better)
 */
export function scorePlan(
  plan: JitPlan,
  context: ScoringContext
): number {
  try {
    // 1. Profitability Score (40% weight)
    const profitabilityScore = calculateProfitabilityScore(plan, context);
    
    // 2. Risk Score (25% weight)
    const riskScore = calculateRiskScore(plan, context);
    
    // 3. Execution Score (20% weight)
    const executionScore = calculateExecutionScore(plan, context);
    
    // 4. Competition Score (15% weight)
    const competitionScore = calculateCompetitionScore(plan, context);
    
    // Weighted composite score
    const compositeScore = 
      profitabilityScore * 0.40 +
      riskScore * 0.25 +
      executionScore * 0.20 +
      competitionScore * 0.15;
    
    // Apply inclusion probability adjustment
    const inclusionAdjustedScore = compositeScore * context.inclusionProbability;
    
    // Scale to 0-100 range
    return Math.max(0, Math.min(100, inclusionAdjustedScore * 100));
  } catch {
    return 0;
  }
}

/**
 * Calculates profitability component of score
 */
function calculateProfitabilityScore(
  plan: JitPlan,
  context: ScoringContext
): number {
  const expectedNet = new Decimal(plan.expectedNetUsd);
  const swapSize = new Decimal(context.swapSizeUsd);
  
  // Profitability as percentage of swap size
  const profitMargin = expectedNet.div(swapSize);
  
  // Sigmoid scaling for profitability score
  const normalizedMargin = profitMargin.mul(1000); // Scale for typical values
  const score = 1 / (1 + Math.exp(-normalizedMargin.toNumber()));
  
  return Math.max(0, Math.min(1, score));
}

/**
 * Calculates risk component of score
 */
function calculateRiskScore(
  plan: JitPlan,
  context: ScoringContext
): number {
  let riskScore = 1.0; // Start with perfect score
  
  // 1. Liquidity risk - how much of pool liquidity we're adding
  const planLiquidity = new Decimal(plan.liquidity);
  const poolLiquidity = new Decimal(context.poolLiquidity);
  const liquidityRatio = planLiquidity.div(poolLiquidity);
  
  if (liquidityRatio.gt(0.5)) {
    riskScore *= 0.6; // High risk if adding >50% of pool
  } else if (liquidityRatio.gt(0.2)) {
    riskScore *= 0.8; // Medium risk if adding >20% of pool
  }
  
  // 2. Range risk - how wide is our range
  const rangeTicks = plan.upperTick - plan.lowerTick;
  if (rangeTicks < 60) {
    riskScore *= 0.9; // Narrow ranges are riskier but more profitable
  } else if (rangeTicks > 300) {
    riskScore *= 0.7; // Very wide ranges dilute fees
  }
  
  // 3. Size risk - very large positions are riskier
  const netValue = new Decimal(plan.expectedNetUsd);
  if (netValue.gt(1000)) {
    riskScore *= 0.8; // Large positions have higher risk
  }
  
  // 4. Historical success rate adjustment
  if (context.historicalSuccessRate !== undefined) {
    const successRate = Math.max(0.1, Math.min(1, context.historicalSuccessRate));
    riskScore *= successRate;
  }
  
  return Math.max(0, Math.min(1, riskScore));
}

/**
 * Calculates execution feasibility score
 */
function calculateExecutionScore(
  plan: JitPlan,
  context: ScoringContext
): number {
  let executionScore = 1.0;
  
  // 1. Inclusion probability factor (already considered in main score)
  executionScore *= context.inclusionProbability;
  
  // 2. Gas competition factor
  const gasCompetition = context.gasCompetition;
  if (gasCompetition > 2.0) {
    executionScore *= 0.6; // High gas competition
  } else if (gasCompetition > 1.5) {
    executionScore *= 0.8; // Medium gas competition
  }
  
  // 3. Plan complexity (simpler plans execute more reliably)
  // For now, all plans have same complexity, but could expand
  
  // 4. MEV competition adjustment
  if (context.mevCompetition !== undefined) {
    const mevFactor = Math.max(0.5, Math.min(1.5, context.mevCompetition));
    executionScore *= (2 - mevFactor) / 2; // Inverse relationship
  }
  
  return Math.max(0, Math.min(1, executionScore));
}

/**
 * Calculates competition-based score adjustment
 */
function calculateCompetitionScore(
  plan: JitPlan,
  context: ScoringContext
): number {
  let competitionScore = 1.0;
  
  // 1. Profit attractiveness - higher profits attract more competition
  const expectedNet = new Decimal(plan.expectedNetUsd);
  if (expectedNet.gt(500)) {
    competitionScore *= 0.7; // High-profit opportunities have more competition
  } else if (expectedNet.gt(100)) {
    competitionScore *= 0.85; // Medium-profit opportunities
  }
  
  // 2. Swap size attractiveness
  const swapSize = new Decimal(context.swapSizeUsd);
  if (swapSize.gt(1000000)) {
    competitionScore *= 0.6; // Large swaps attract MEV bots
  } else if (swapSize.gt(100000)) {
    competitionScore *= 0.8; // Medium swaps
  }
  
  // 3. Pool liquidity factor - less liquid pools have less competition
  const poolLiquidity = new Decimal(context.poolLiquidity);
  const liquidityThreshold = new Decimal(10000000); // $10M threshold
  if (poolLiquidity.lt(liquidityThreshold)) {
    competitionScore *= 1.2; // Less competition in smaller pools
  }
  
  return Math.max(0, Math.min(1, competitionScore));
}

/**
 * Calculates expected value of a plan considering all risks
 * @param plan JIT plan
 * @param context Scoring context
 * @returns Expected value in USD
 */
export function calculateExpectedValue(
  plan: JitPlan,
  context: ScoringContext
): string {
  const expectedNet = new Decimal(plan.expectedNetUsd);
  const inclusionProb = context.inclusionProbability;
  const riskScore = calculateRiskScore(plan, context);
  
  // Expected value = profit * inclusion_probability * risk_adjustment
  const expectedValue = expectedNet.mul(inclusionProb).mul(riskScore);
  
  return expectedValue.toString();
}

/**
 * Compares two JIT plans and returns the better one
 * @param plan1 First plan
 * @param plan2 Second plan
 * @param context Scoring context
 * @returns The plan with higher score
 */
export function comparePlans(
  plan1: JitPlan,
  plan2: JitPlan,
  context: ScoringContext
): JitPlan {
  const score1 = scorePlan(plan1, context);
  const score2 = scorePlan(plan2, context);
  
  return score1 >= score2 ? plan1 : plan2;
}

/**
 * Filters plans that meet minimum score threshold
 * @param plans Array of plans to filter
 * @param context Scoring context
 * @param minScore Minimum acceptable score
 * @returns Filtered and sorted plans
 */
export function filterAndRankPlans(
  plans: JitPlan[],
  context: ScoringContext,
  minScore: number = 50
): JitPlan[] {
  return plans
    .map(plan => ({
      ...plan,
      score: scorePlan(plan, context)
    }))
    .filter(plan => plan.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

/**
 * Calibrates inclusion model based on historical data
 * @param historicalData Array of historical attempts with outcomes
 * @returns Calibrated inclusion model
 */
export function calibrateInclusionModel(
  historicalData: Array<{
    priorityFeeUsd: string;
    included: boolean;
    competitionFactor: number;
  }>
): InclusionModel {
  if (historicalData.length < 10) {
    return DEFAULT_INCLUSION_MODEL; // Need minimum data for calibration
  }
  
  // Simple calibration - in production would use proper regression
  const successRate = historicalData.filter(d => d.included).length / historicalData.length;
  
  return {
    ...DEFAULT_INCLUSION_MODEL,
    baseProbability: Math.max(0.1, Math.min(0.9, successRate)),
  };
}

/**
 * Dynamic scoring weights based on market conditions
 * @param volatility Market volatility measure
 * @param competition Competition level
 * @returns Adjusted scoring weights
 */
export function getAdaptiveWeights(
  volatility: number,
  competition: number
): { profitability: number; risk: number; execution: number; competition: number } {
  // Default weights
  let weights = {
    profitability: 0.40,
    risk: 0.25,
    execution: 0.20,
    competition: 0.15,
  };
  
  // High volatility - increase risk weight
  if (volatility > 1.5) {
    weights.risk *= 1.3;
    weights.profitability *= 0.9;
  }
  
  // High competition - increase execution weight
  if (competition > 2.0) {
    weights.execution *= 1.4;
    weights.competition *= 1.2;
    weights.profitability *= 0.8;
  }
  
  // Normalize weights to sum to 1
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  Object.keys(weights).forEach(key => {
    weights[key as keyof typeof weights] /= total;
  });
  
  return weights;
}