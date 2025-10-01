// src/metrics.ts
import { collectDefaultMetrics, Counter, Registry } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

// Core counters (extend as needed in strategy pipeline)
export const txSentTotal = new Counter({
  name: 'jit_tx_sent_total',
  help: 'Total transactions sent by the bot',
  registers: [registry],
});

export const txFailedTotal = new Counter({
  name: 'jit_tx_failed_total',
  help: 'Total transactions that failed (send or execution)',
  registers: [registry],
});

export const flashloanAttemptsTotal = new Counter({
  name: 'jit_flashloan_attempts_total',
  help: 'Total flashloan attempts made by strategies',
  registers: [registry],
});

export const flashloanSuccessTotal = new Counter({
  name: 'jit_flashloan_success_total',
  help: 'Total successful flashloans executed by strategies',
  registers: [registry],
});
