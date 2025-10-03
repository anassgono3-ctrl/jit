// src/metrics.ts
import { collectDefaultMetrics, Counter, Gauge, Registry } from 'prom-client';

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

// Mempool observability
export const mempoolEnabled = new Gauge({
  name: 'mempool_enabled',
  help: 'Mempool watcher enabled (1) or disabled (0)',
  registers: [registry],
});

export const mempoolMode = new Gauge({
  name: 'mempool_mode',
  help: 'Mempool mode: 0=disabled, 1=ws, 2=polling',
  registers: [registry],
});

// RPC mode (external vs fullnode)
export const rpcModeGauge = new Gauge({
  name: 'rpc_mode',
  help: 'RPC mode: 0=unknown, 1=external, 2=fullnode',
  registers: [registry],
});

export type MempoolStatus = { enabled: boolean; mode: 0 | 1 | 2 };
export let lastMempoolStatus: MempoolStatus = { enabled: false, mode: 0 };
export let lastRpcMode: 0 | 1 | 2 = 0;

export function setMempoolStatus(enabled: boolean, mode: 0 | 1 | 2) {
  lastMempoolStatus = { enabled, mode };
  mempoolEnabled.set(enabled ? 1 : 0);
  mempoolMode.set(mode);
}

export function setRpcMode(mode: 'external' | 'fullnode' | 'unknown') {
  lastRpcMode = mode === 'external' ? 1 : mode === 'fullnode' ? 2 : 0;
  rpcModeGauge.set(lastRpcMode);
}
