/**
 * Profitability evaluation module for JIT strategies
 */

import { ethers } from 'ethers';
import { SimulationResult, Decision, ProfitabilityConfig } from './types';
import { ProfitGuard } from './profitGuard';
import logger from '../modules/logger';

export interface ProfitEstimateResult {
  estProfitEth: number;   // estimated profit in ETH (approx)
  estProfitUsd: number;   // estimated profit in USD (approx)
  gasEth: number;         // estimated gas cost in ETH
  gasUsd: number;         // estimated gas cost in USD
  allowed: boolean;       // whether ProfitGuard + gas caps allow execution
  details?: Record<string, any>;
}

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

/**
 * Conservative profitability + gas guard for flashloan execution
 *
 * - Estimates a conservative profit (configurable bps of notional).
 * - Estimates gas cost (gas price + fixed overhead).
 * - Converts gas to USD using ETH_USD env var (user-controlled).
 * - Returns an object with estimates and allow/deny decision using ProfitGuard.
 *
 * Notes:
 * - This is intentionally simple and auditable. Replace with richer on-chain quoter
 *   + route estimators when you want more accuracy later.
 * - All values are conservative defaults; tune via env variables.
 */

// Heuristics (all tunable via env)
const DEFAULT_ESTIMATED_PROFIT_BPS = Number(process.env.ESTIMATED_PROFIT_BPS || '5');     // 5 bps => 0.05%
const DEFAULT_GAS_OVERHEAD = BigInt(Number(process.env.EST_GAS_OVERHEAD || '200000'));    // gas units buffer
const DEFAULT_ETH_USD = Number(process.env.ETH_USD || '2000');                            // USD per ETH default

export async function estimateProfitAndGas(
  provider: ethers.Provider | undefined,
  _tokens: string[],
  _amounts: bigint[],
  options?: { notionalEth?: number } // optional pre-supplied notional (in ETH)
): Promise<ProfitEstimateResult> {
  // 1) Determine a conservative notional in ETH
  const notionalEth = options?.notionalEth ?? 0; // caller may supply; if unknown, keep 0 (conservative)

  // Profit estimate (in ETH) using bps of notional
  const profitBps = DEFAULT_ESTIMATED_PROFIT_BPS;
  const estProfitEth = notionalEth * (profitBps / 10000);

  // 2) Estimate gas cost
  const gasUnits = DEFAULT_GAS_OVERHEAD; // default overhead
  let gasPriceWei: bigint = 0n;

  try {
    if (provider) {
      // v6: getFeeData returns FeeData with gasPrice as bigint
      const feeData = await provider.getFeeData();
      gasPriceWei = feeData.gasPrice ?? 0n;
    }
  } catch {
    // Keep defaults if provider fails
  }

  // Gas in ETH (approx; precision not critical for guard)
  // gasWeiTotal = gasUnits * gasPriceWei
  let gasEth = 0;
  try {
    const gasWeiTotal = gasUnits * gasPriceWei;
    gasEth = Number(gasWeiTotal.toString()) / 1e18;
  } catch {
    gasEth = 0;
  }

  // USD conversion
  const ethUsdPrice = Number(process.env.ETH_USD || DEFAULT_ETH_USD);
  const gasUsd = gasEth * ethUsdPrice;
  const estProfitUsd = estProfitEth * ethUsdPrice;

  // 3) Apply ProfitGuard thresholds
  const pg = ProfitGuard.fromEnv();
  const allowedByProfit = pg.allow({ estProfitUsd, estProfitEth });

  // 4) Apply per-execution gas cap (25% of daily cap)
  const maxDailyGasUsd = process.env.MAX_DAILY_GAS_USD ? Number(process.env.MAX_DAILY_GAS_USD) : undefined;
  const allowedByGas = maxDailyGasUsd === undefined || gasUsd <= maxDailyGasUsd * 0.25;

  const allowed = allowedByProfit && allowedByGas;

  const details = {
    profitBps,
    notionalEth,
    estProfitEth,
    estProfitUsd,
    gasUnits: gasUnits.toString(),
    gasPriceWei: gasPriceWei.toString(),
    gasEth,
    gasUsd,
    ethUsdPrice,
    allowedByProfit,
    allowedByGas,
  };

  logger.info({ details }, '[profit] profit+gas estimate');

  return {
    estProfitEth,
    estProfitUsd,
    gasEth,
    gasUsd,
    allowed,
    details,
  };
}