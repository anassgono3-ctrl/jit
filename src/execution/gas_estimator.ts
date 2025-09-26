import { ethers } from 'ethers';

export interface GasEstimate {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  baseFee: bigint;
  gasLimit?: bigint;
}

export interface GasEstimatorConfig {
  provider: ethers.JsonRpcProvider;
  priorityFeeCapGwei?: number;
  defaultPriorityFeeGwei?: number;
  maxBaseFeeMultiplier?: number;
}

export async function estimateGasFees(cfg: GasEstimatorConfig): Promise<GasEstimate> {
  const block = await cfg.provider.getBlock('latest');
  if (!block || !block.baseFeePerGas) {
    throw new Error('Base fee unavailable - not an EIP-1559 network');
  }

  const baseFee = block.baseFeePerGas;
  const priorityGwei = BigInt(Math.floor((cfg.defaultPriorityFeeGwei ?? 1) * 1e9));
  const capPriority = cfg.priorityFeeCapGwei
    ? BigInt(Math.floor(cfg.priorityFeeCapGwei * 1e9))
    : priorityGwei;

  const maxPriorityFeePerGas = priorityGwei > capPriority ? capPriority : priorityGwei;
  
  // Use a multiplier for baseFee to account for potential base fee increases
  const baseFeeMultiplier = BigInt(Math.floor((cfg.maxBaseFeeMultiplier ?? 2) * 100));
  const maxFeePerGas = (baseFee * baseFeeMultiplier) / 100n + maxPriorityFeePerGas;

  return {
    baseFee,
    maxPriorityFeePerGas,
    maxFeePerGas
  };
}

export function calculateGasCost(gasEstimate: GasEstimate, gasLimit: bigint): {
  maxCostWei: bigint;
  expectedCostWei: bigint;
} {
  const maxCostWei = gasEstimate.maxFeePerGas * gasLimit;
  const expectedCostWei = (gasEstimate.baseFee + gasEstimate.maxPriorityFeePerGas) * gasLimit;
  
  return {
    maxCostWei,
    expectedCostWei
  };
}

export function formatGasEstimate(estimate: GasEstimate): string {
  const baseFeeGwei = Number(estimate.baseFee) / 1e9;
  const priorityFeeGwei = Number(estimate.maxPriorityFeePerGas) / 1e9;
  const maxFeeGwei = Number(estimate.maxFeePerGas) / 1e9;

  return `Gas: ${baseFeeGwei.toFixed(2)} + ${priorityFeeGwei.toFixed(2)} = ${maxFeeGwei.toFixed(2)} gwei`;
}
