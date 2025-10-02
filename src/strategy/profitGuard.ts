// Profit guard thresholds, evaluation, and logging.
// - evaluateAndLog: wraps an estimator (e.g., RPC-based) in try/catch and logs decisions.
// - fromEnv: reads PROFIT_MIN_USD, PROFIT_MIN_ETH, MAX_TX_GAS_USD from process.env.

import logger from '../modules/logger';

export interface ProfitThresholds {
  minUsd?: number;    // e.g., 10 USD
  minEth?: number;    // e.g., 0.005 ETH
  maxGasUsd?: number; // optional per-tx gas cap in USD (blocks if gasUsd > cap)
}

export interface ProfitSignal {
  estProfitUsd?: number; // estimated gross profit in USD
  estProfitEth?: number; // estimated gross profit in ETH
  estGasUsd?: number;    // estimated gas cost in USD for the tx
}

export type ProfitEstimator = () => Promise<ProfitSignal> | ProfitSignal;

function fmtUsd(v?: number): string {
  if (v === undefined || Number.isNaN(v)) return '$?';
  return `$${v.toFixed(2)}`;
}

export class ProfitGuard {
  private t: ProfitThresholds;
  constructor(t?: ProfitThresholds) {
    this.t = t ?? {};
  }

  // Core rule checks without logging; returns reason if blocked
  private check(signal: ProfitSignal): { allowed: boolean; reason?: string } {
    const { minUsd, minEth, maxGasUsd } = this.t;

    if (minUsd !== undefined && signal.estProfitUsd !== undefined) {
      if (signal.estProfitUsd < minUsd) {
        return { allowed: false, reason: `profit < min ${minUsd}` };
      }
    }
    if (minEth !== undefined && signal.estProfitEth !== undefined) {
      if (signal.estProfitEth < minEth) {
        return { allowed: false, reason: `profit < min ${minEth} ETH` };
      }
    }
    if (maxGasUsd !== undefined && signal.estGasUsd !== undefined) {
      if (signal.estGasUsd > maxGasUsd) {
        return { allowed: false, reason: `gas > cap ${maxGasUsd}` };
      }
    }
    return { allowed: true };
  }

  // Evaluate using a provided estimator; catch errors, log, and fail closed.
  async evaluateAndLog(estimator: ProfitEstimator): Promise<boolean> {
    let signal: ProfitSignal = {};
    try {
      signal = await estimator();
    } catch (err) {
      logger.warn({ err: String((err as any)?.message || err) }, '[profit-guard] estimator failed; blocking execution');
      return false;
    }

    const { allowed, reason } = this.check(signal);

    const line =
      `[profit-guard] Profit=${fmtUsd(signal.estProfitUsd)} ` +
      `Gas=${fmtUsd(signal.estGasUsd)} -> ${allowed ? 'PASS' : `BLOCKED (${reason})`}`;

    // Include thresholds for auditability
    const thresholds = {
      minUsd: this.t.minUsd,
      minEth: this.t.minEth,
      maxGasUsd: this.t.maxGasUsd,
    };

    if (allowed) {
      logger.info({ thresholds, signal }, line);
    } else {
      logger.warn({ thresholds, signal }, line);
    }

    return allowed;
  }

  // Simple boolean check without calling an estimator
  allow(signal: ProfitSignal): boolean {
    return this.check(signal).allowed;
  }

  static fromEnv(): ProfitGuard {
    const minUsd = process.env.PROFIT_MIN_USD ? Number(process.env.PROFIT_MIN_USD) : undefined;
    const minEth = process.env.PROFIT_MIN_ETH ? Number(process.env.PROFIT_MIN_ETH) : undefined;
    const maxGasUsd = process.env.MAX_TX_GAS_USD ? Number(process.env.MAX_TX_GAS_USD) : undefined;
    return new ProfitGuard({ minUsd, minEth, maxGasUsd });
  }
}
