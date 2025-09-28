export interface PendingSwap {
  txHash: string;
  sender: string;
  poolAddress?: string;
  amountIn?: bigint;
  amountOutMin?: bigint;
  path?: string[];
}

export interface LiquidityPlan {
  poolAddress: string;
  feeTier: number;
  notionalUsd: number;
  minProfitUsd: number;
}

export interface CandidateStep {
  type: 'mint' | 'swap-capture' | 'burn';
  data: Record<string, unknown>;
}

export interface CandidateBundle {
  steps: CandidateStep[];
  notes?: string;
}

/**
 * Build a simulation-only sequence (no signing, no submission).
 * This is a deterministic scaffold for tests; integrate real routing later.
 */
export function buildCandidate(pending: PendingSwap, plan: LiquidityPlan): CandidateBundle {
  const steps: CandidateStep[] = [
    { type: 'mint', data: { pool: plan.poolAddress, feeTier: plan.feeTier, notionalUsd: plan.notionalUsd } },
    { type: 'swap-capture', data: { observedTx: pending.txHash, path: pending.path ?? [], minProfitUsd: plan.minProfitUsd } },
    { type: 'burn', data: { pool: plan.poolAddress } },
  ];
  return { steps, notes: 'simulation-only; no signing' };
}