// Profit guard thresholds and basic evaluation logic.
export interface ProfitThresholds {
  minUsd?: number; // e.g., 10 USD
  minEth?: number; // e.g., 0.005 ETH
}

export interface ProfitSignal {
  // Either of these can be populated by strategy detection
  estProfitUsd?: number;
  estProfitEth?: number;
}

export class ProfitGuard {
  private t: ProfitThresholds;
  constructor(t?: ProfitThresholds) {
    this.t = t ?? {};
  }

  allow(s: ProfitSignal): boolean {
    const usdOk =
      this.t.minUsd === undefined ||
      s.estProfitUsd === undefined ||
      (typeof s.estProfitUsd === 'number' && s.estProfitUsd >= (this.t.minUsd ?? 0));
    const ethOk =
      this.t.minEth === undefined ||
      s.estProfitEth === undefined ||
      (typeof s.estProfitEth === 'number' && s.estProfitEth >= (this.t.minEth ?? 0));
    // Require both to be OK if provided
    return usdOk && ethOk;
  }

  static fromEnv(): ProfitGuard {
    const minUsd = process.env.PROFIT_MIN_USD ? Number(process.env.PROFIT_MIN_USD) : undefined;
    const minEth = process.env.PROFIT_MIN_ETH ? Number(process.env.PROFIT_MIN_ETH) : undefined;
    return new ProfitGuard({ minUsd, minEth });
  }
}
