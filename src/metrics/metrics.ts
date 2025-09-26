/**
 * Lightweight metrics interface
 * Provides hooks for future Prometheus/OpenTelemetry integration
 */

export interface MetricLabels {
  [key: string]: string | number;
}

export interface CounterMetric {
  inc(value?: number, labels?: MetricLabels): void;
}

export interface GaugeMetric {
  set(value: number, labels?: MetricLabels): void;
  inc(value?: number, labels?: MetricLabels): void;
  dec(value?: number, labels?: MetricLabels): void;
}

export interface HistogramMetric {
  observe(value: number, labels?: MetricLabels): void;
}

export interface MetricsRegistry {
  counter(name: string, help: string, labelNames?: string[]): CounterMetric;
  gauge(name: string, help: string, labelNames?: string[]): GaugeMetric;
  histogram(name: string, help: string, buckets?: number[], labelNames?: string[]): HistogramMetric;
}

// Default no-op implementation
class NoOpCounter implements CounterMetric {
  inc(_value?: number, _labels?: MetricLabels): void {
    // No-op
  }
}

class NoOpGauge implements GaugeMetric {
  set(_value: number, _labels?: MetricLabels): void {
    // No-op
  }
  inc(_value?: number, _labels?: MetricLabels): void {
    // No-op
  }
  dec(_value?: number, _labels?: MetricLabels): void {
    // No-op
  }
}

class NoOpHistogram implements HistogramMetric {
  observe(_value: number, _labels?: MetricLabels): void {
    // No-op
  }
}

class NoOpRegistry implements MetricsRegistry {
  counter(_name: string, _help: string, _labelNames?: string[]): CounterMetric {
    return new NoOpCounter();
  }
  
  gauge(_name: string, _help: string, _labelNames?: string[]): GaugeMetric {
    return new NoOpGauge();
  }
  
  histogram(_name: string, _help: string, _buckets?: number[], _labelNames?: string[]): HistogramMetric {
    return new NoOpHistogram();
  }
}

// Global registry instance
let registry: MetricsRegistry = new NoOpRegistry();

export function setMetricsRegistry(newRegistry: MetricsRegistry): void {
  registry = newRegistry;
}

export function getMetricsRegistry(): MetricsRegistry {
  return registry;
}

// Pre-defined application metrics
export const Metrics = {
  // Mempool monitoring
  swapCandidatesDetected: registry.counter('jit_swap_candidates_detected', 'Number of swap candidates detected'),
  mempoolConnectionErrors: registry.counter('jit_mempool_connection_errors', 'Mempool connection errors', ['source']),
  mempoolReconnections: registry.counter('jit_mempool_reconnections', 'Mempool reconnection attempts', ['source']),
  
  // JIT execution
  jitPlansGenerated: registry.counter('jit_plans_generated', 'Number of JIT plans generated'),
  jitPlansExecuted: registry.counter('jit_plans_executed', 'Number of JIT plans executed'),
  jitExecutionErrors: registry.counter('jit_execution_errors', 'JIT execution errors', ['reason']),
  jitProfitUsd: registry.histogram('jit_profit_usd', 'JIT profit in USD', [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000]),
  
  // Gas and profit
  gasEstimationErrors: registry.counter('jit_gas_estimation_errors', 'Gas estimation errors'),
  profitGuardRejections: registry.counter('jit_profit_guard_rejections', 'Profit guard rejections', ['reason']),
  avgGasPriceGwei: registry.gauge('jit_avg_gas_price_gwei', 'Average gas price in gwei'),
  
  // Health and performance
  uptimeSeconds: registry.gauge('jit_uptime_seconds', 'Uptime in seconds'),
  lastBlockNumber: registry.gauge('jit_last_block_number', 'Last processed block number'),
  processingLatencyMs: registry.histogram('jit_processing_latency_ms', 'Processing latency in milliseconds', [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500]),
};

// Helper function to refresh metrics with new registry
export function refreshMetrics(): void {
  const reg = getMetricsRegistry();
  
  (Metrics as any).swapCandidatesDetected = reg.counter('jit_swap_candidates_detected', 'Number of swap candidates detected');
  (Metrics as any).mempoolConnectionErrors = reg.counter('jit_mempool_connection_errors', 'Mempool connection errors', ['source']);
  (Metrics as any).mempoolReconnections = reg.counter('jit_mempool_reconnections', 'Mempool reconnection attempts', ['source']);
  (Metrics as any).jitPlansGenerated = reg.counter('jit_plans_generated', 'Number of JIT plans generated');
  (Metrics as any).jitPlansExecuted = reg.counter('jit_plans_executed', 'Number of JIT plans executed');
  (Metrics as any).jitExecutionErrors = reg.counter('jit_execution_errors', 'JIT execution errors', ['reason']);
  (Metrics as any).jitProfitUsd = reg.histogram('jit_profit_usd', 'JIT profit in USD', [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000]);
  (Metrics as any).gasEstimationErrors = reg.counter('jit_gas_estimation_errors', 'Gas estimation errors');
  (Metrics as any).profitGuardRejections = reg.counter('jit_profit_guard_rejections', 'Profit guard rejections', ['reason']);
  (Metrics as any).avgGasPriceGwei = reg.gauge('jit_avg_gas_price_gwei', 'Average gas price in gwei');
  (Metrics as any).uptimeSeconds = reg.gauge('jit_uptime_seconds', 'Uptime in seconds');
  (Metrics as any).lastBlockNumber = reg.gauge('jit_last_block_number', 'Last processed block number');
  (Metrics as any).processingLatencyMs = reg.histogram('jit_processing_latency_ms', 'Processing latency in milliseconds', [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500]);
}
