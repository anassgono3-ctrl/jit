export interface SimulationResult {
  success: boolean;
  profitUsd?: number;
  profitEth?: number;
  error?: string;
  gasUsed?: number;
  revertReason?: string;
}

export interface SimulationOptions {
  // Existing fields in repo
  blockNumber?: number;
  timestamp?: number;
  baseFee?: bigint;
  validateProfit?: boolean;

  // New fields for test compatibility and future integration
  timeoutMs?: number;        // per-test option with env fallback
  flashbotsUrl?: string;     // tests may pass this
  relayUrl?: string;         // alternative caller option
}

// Export a single constant used by tests
export const DEFAULT_MOCK_PROFIT_USD = 0;

/**
 * Stub implementation for Flashbots simulation
 * This provides the interface for future integration with Flashbots simulate API
 */
export async function simulateBundle(
  rawTxs: string[],
  options: SimulationOptions = {}
): Promise<SimulationResult> {
  // Input validation
  if (!rawTxs || rawTxs.length === 0) {
    return { success: false, error: 'No transactions provided' };
  }

  // Normalize timeout (prefer option, fall back to env, default 5000ms)
  const timeoutFromEnv = Number(process.env.SIM_TIMEOUT_MS);
  const defaultTimeout = Number.isFinite(timeoutFromEnv) ? timeoutFromEnv : 5000;
  const timeoutMs =
    typeof options.timeoutMs === 'number' ? options.timeoutMs : defaultTimeout;

  // Normalize relay URL (prefer flashbotsUrl, then relayUrl, then env)
  const relay =
    options.flashbotsUrl ??
    options.relayUrl ??
    (process.env.FLASHBOTS_RPC_URL ? String(process.env.FLASHBOTS_RPC_URL) : undefined);

  // NOTE: This is still a stub. Future real implementation should:
  // 1) POST bundle to relay simulate endpoint (relay || FLASHBOTS_RPC_URL)
  // 2) Respect timeoutMs in the request
  // 3) Parse result into SimulationResult

  void timeoutMs; // suppress unused in stub
  void relay;

  // Mock simulation result with realistic positive profit for strategy acceptance
  return {
    success: true,
    profitUsd: DEFAULT_MOCK_PROFIT_USD,
    profitEth: 0.015, // Equivalent at ~$2000/ETH
    gasUsed: 200000,
  };
}

/**
 * Check if a transaction bundle would be profitable after simulation
 */
export async function wouldBeProfitable(
  rawTxs: string[],
  minProfitUsd: number,
  options: SimulationOptions = {}
): Promise<{ profitable: boolean; reason?: string; result?: SimulationResult }> {
  try {
    const result = await simulateBundle(rawTxs, { ...options, validateProfit: true });
    if (!result.success) {
      return { profitable: false, reason: result.error || 'Simulation failed', result };
    }
    const profitable = (result.profitUsd ?? 0) >= minProfitUsd;
    return {
      profitable,
      reason: profitable ? undefined : `Simulated profit $${result.profitUsd} < min $${minProfitUsd}`,
      result,
    };
  } catch (error) {
    return { profitable: false, reason: `Simulation error: ${error}` };
  }
}

/**
 * Future hook for bundle optimization
 * Could be used to add/remove transactions to maximize profit
 */
export async function optimizeBundle(rawTxs: string[]): Promise<string[]> {
  // Stub - return unchanged for now
  return rawTxs;
}
