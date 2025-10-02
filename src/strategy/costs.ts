// Placeholder cost/profit estimation helpers (optional).
// Not used directly in unit tests; can be injected into ProfitGuard.evaluateAndLog.
// Supports an ETH_USD override via env for simple local estimation.

import { ethers } from 'ethers';

export interface EstimationInput {
  provider: ethers.Provider;
  tx?: ethers.TransactionRequest; // optional tx for gas estimation
  profitUsd?: number;             // if known externally
  profitEth?: number;             // if known externally
}

export async function estimateProfitAndGasUSD(input: EstimationInput): Promise<{ profitUsd?: number; profitEth?: number; gasUsd?: number; }> {
  const ethUsd = process.env.ETH_USD ? Number(process.env.ETH_USD) : undefined;

  let gasUsd: number | undefined = undefined;
  if (input.tx && input.provider) {
    const gas = await input.provider.estimateGas(input.tx);
    const fee = await input.provider.getFeeData();
    const gasPrice = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
    const weiCost = gas * (gasPrice as bigint);
    const ethCost = Number(ethers.formatEther(weiCost));
    gasUsd = ethUsd !== undefined ? ethUsd * ethCost : undefined;
  }

  let profitUsd = input.profitUsd;
  if (profitUsd === undefined && input.profitEth !== undefined && ethUsd !== undefined) {
    profitUsd = input.profitEth * ethUsd;
  }

  return { profitUsd, profitEth: input.profitEth, gasUsd };
}
