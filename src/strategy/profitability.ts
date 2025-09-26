/**
 * Profitability evaluation module for JIT strategies
 */

import { SimulationResult, Decision, ProfitabilityConfig } from './types';

/**
 * Evaluate a JIT plan based on simulation results and configuration
 * 
 * @param sim Simulation result containing cost and fee data
 * @param cfg Configuration with profit thresholds and expectations
 * @returns Decision whether to accept the plan with metrics
 */
export function evaluatePlan(sim: SimulationResult, cfg: ProfitabilityConfig): Decision {
  // Calculate gross profit from fees
  const feesUsd = (sim.feesToken0Usd ?? 0) + (sim.feesToken1Usd ?? 0);
  const grossProfitUsd = feesUsd - (sim.flashloanFeesUsd ?? 0);

  // Calculate gas cost - use provided gasUsd or estimate from gas units/price/eth price
  const gasUsd = sim.gasUsd !== undefined
    ? sim.gasUsd
    : ((sim.estimatedGas ?? 0) * (sim.gasPriceGwei ?? 0) / 1e9) * (sim.ethUsdPrice ?? 0);

  // Apply capture and inclusion probabilities
  const capture = cfg.captureFraction ?? 0.7;
  const inclusion = cfg.inclusionProbability ?? 0.35;

  const expectedNetUsd = (grossProfitUsd * capture * inclusion) - (gasUsd ?? 0);
  
  // Calculate score as profit/gas ratio for ranking
  const denominator = gasUsd && gasUsd > 0 ? gasUsd : 1;
  const score = expectedNetUsd / denominator;

  // Rejection conditions
  if (grossProfitUsd < 0) {
    return { 
      accept: false, 
      expectedNetUsd, 
      score, 
      reason: 'negativeGrossProfit' 
    };
  }

  if (expectedNetUsd < (cfg.minProfitUsd ?? 25)) {
    return { 
      accept: false, 
      expectedNetUsd, 
      score, 
      reason: 'expectedNetUsdBelowThreshold' 
    };
  }

  // Accept the plan
  return { accept: true, expectedNetUsd, score };
}