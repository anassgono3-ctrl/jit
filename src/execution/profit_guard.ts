export interface ProfitContext {
  estProfitUsd?: number;
  estProfitEth?: number;
  gasCostUsd?: number;
  gasCostEth?: number;
  reason?: string;
}

export interface ProfitGuardConfig {
  minProfitUsd: number;
  minProfitEth: number;
}

export interface Decision {
  execute: boolean;
  reason?: string;
  netProfitUsd?: number;
  netProfitEth?: number;
}

export function evaluateProfit(ctx: ProfitContext, cfg: ProfitGuardConfig): Decision {
  const netUsd = (ctx.estProfitUsd ?? 0) - (ctx.gasCostUsd ?? 0);
  const netEth = (ctx.estProfitEth ?? 0) - (ctx.gasCostEth ?? 0);

  // Check USD profit threshold
  if (cfg.minProfitUsd > 0 && netUsd < cfg.minProfitUsd) {
    return { 
      execute: false, 
      reason: `netUsd < minProfitUsd (${netUsd.toFixed(2)} < ${cfg.minProfitUsd})`, 
      netProfitUsd: netUsd, 
      netProfitEth: netEth 
    };
  }

  // Check ETH profit threshold
  if (cfg.minProfitEth > 0 && netEth < cfg.minProfitEth) {
    return { 
      execute: false, 
      reason: `netEth < minProfitEth (${netEth} < ${cfg.minProfitEth})`, 
      netProfitUsd: netUsd, 
      netProfitEth: netEth 
    };
  }

  // Check for non-positive profitability
  if (netUsd <= 0 && netEth <= 0) {
    return { 
      execute: false, 
      reason: 'non-positive profitability', 
      netProfitUsd: netUsd, 
      netProfitEth: netEth 
    };
  }

  return { 
    execute: true, 
    netProfitUsd: netUsd, 
    netProfitEth: netEth 
  };
}

export function formatProfitDecision(decision: Decision): string {
  const { execute, reason, netProfitUsd, netProfitEth } = decision;
  
  if (execute) {
    return `EXECUTE - Profit: $${netProfitUsd?.toFixed(2)} / ${netProfitEth?.toFixed(6)} ETH`;
  } else {
    return `SKIP - ${reason} (Net: $${netProfitUsd?.toFixed(2)} / ${netProfitEth?.toFixed(6)} ETH)`;
  }
}
