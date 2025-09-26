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
  // New EIP-1559 bounds
  priorityFeeMinGwei?: number;
  priorityFeeMaxGwei?: number;
}

export async function estimateGasFees(cfg: GasEstimatorConfig): Promise<GasEstimate> {
  const block = await cfg.provider.getBlock('latest');
  if (!block || !block.baseFeePerGas) {
    throw new Error('Base fee unavailable - not an EIP-1559 network');
  }

  const baseFee = block.baseFeePerGas;
  
  // Handle backward compatibility first
  if (cfg.priorityFeeCapGwei !== undefined && cfg.priorityFeeMinGwei === undefined && cfg.priorityFeeMaxGwei === undefined) {
    // Legacy mode: use priorityFeeCapGwei as a simple cap
    const defaultPriorityFeeGwei = cfg.defaultPriorityFeeGwei ?? 1;
    const cappedPriorityFeeGwei = Math.min(defaultPriorityFeeGwei, cfg.priorityFeeCapGwei);
    const maxPriorityFeePerGas = BigInt(Math.floor(cappedPriorityFeeGwei * 1e9));
    
    const baseFeeMultiplier = cfg.maxBaseFeeMultiplier ?? 2.0;
    const adjustedBaseFee = BigInt(Math.floor(Number(baseFee) * baseFeeMultiplier));
    const maxFeePerGas = adjustedBaseFee + maxPriorityFeePerGas;

    return {
      baseFee,
      maxPriorityFeePerGas,
      maxFeePerGas
    };
  }
  
  // New logic with bounds
  const minPriorityFeeGwei = cfg.priorityFeeMinGwei ?? 1;
  const maxPriorityFeeGwei = cfg.priorityFeeMaxGwei ?? 
    (cfg.priorityFeeCapGwei ?? 3); // Backward compatibility fallback
  const defaultPriorityFeeGwei = cfg.defaultPriorityFeeGwei ?? minPriorityFeeGwei;
  
  // Clamp priority fee between min and max bounds
  const clampedPriorityFeeGwei = Math.max(
    minPriorityFeeGwei,
    Math.min(maxPriorityFeeGwei, defaultPriorityFeeGwei)
  );
  
  const maxPriorityFeePerGas = BigInt(Math.floor(clampedPriorityFeeGwei * 1e9));
  
  // Apply conservative base fee multiplier with bounds
  const baseFeeMultiplier = cfg.maxBaseFeeMultiplier ?? 2.0;
  const adjustedBaseFee = BigInt(Math.floor(Number(baseFee) * baseFeeMultiplier));
  const maxFeePerGas = adjustedBaseFee + maxPriorityFeePerGas;

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
