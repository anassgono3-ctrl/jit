import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  /** Enable default Node.js metrics collection */
  collectDefault: boolean;
  /** Metrics collection interval in ms */
  interval: number;
  /** Prefix for all metrics */
  prefix: string;
}

/**
 * Default metrics configuration
 */
const DEFAULT_CONFIG: MetricsConfig = {
  collectDefault: true,
  interval: 10000, // 10 seconds
  prefix: 'jit_bot_',
};

/**
 * Metrics collector for JIT bot performance monitoring
 */
class Metrics {
  private config: MetricsConfig;
  private defaultMetricsTimer?: NodeJS.Timeout;

  // JIT Strategy Metrics
  public readonly jitAttemptsTotal: Counter<string>;
  public readonly jitSuccessTotal: Counter<string>;
  public readonly jitFailuresTotal: Counter<string>;
  public readonly jitProfitUsd: Histogram<string>;
  public readonly jitGasUsed: Histogram<string>;
  public readonly jitLatency: Histogram<string>;

  // Pool Metrics
  public readonly poolHealthScore: Gauge<string>;
  public readonly poolLiquidityUsd: Gauge<string>;
  public readonly poolVolume24h: Gauge<string>;
  public readonly activePoolsCount: Gauge<string>;

  // Transaction Metrics
  public readonly transactionsTotal: Counter<string>;
  public readonly transactionGasPrice: Histogram<string>;
  public readonly transactionConfirmationTime: Histogram<string>;
  public readonly mempoolTransactionsProcessed: Counter<string>;

  // Strategy Performance Metrics
  public readonly strategyScoreDistribution: Histogram<string>;
  public readonly inclusionProbabilityDistribution: Histogram<string>;
  public readonly profitabilityRatio: Histogram<string>;

  // System Metrics
  public readonly errorTotal: Counter<string>;
  public readonly uptime: Gauge<string>;
  public readonly memoryUsage: Gauge<string>;
  public readonly activeBotInstances: Gauge<string>;

  // Bot-level Counters expected by tests
  public readonly botTradesExecutedTotal: Counter<string>;
  public readonly botTradesProfitableTotal: Counter<string>;
  public readonly botRpcFailuresTotal: Counter<string>;
  public readonly botBacktestRunsTotal: Counter<string>;

  constructor(config: Partial<MetricsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize JIT Strategy Metrics
    this.jitAttemptsTotal = new Counter({
      name: `${this.config.prefix}jit_attempts_total`,
      help: 'Total number of JIT attempts',
      labelNames: ['pool_address', 'fee_tier', 'result'],
    });

    this.jitSuccessTotal = new Counter({
      name: `${this.config.prefix}jit_success_total`,
      help: 'Total number of successful JIT executions',
      labelNames: ['pool_address', 'fee_tier'],
    });

    this.jitFailuresTotal = new Counter({
      name: `${this.config.prefix}jit_failures_total`,
      help: 'Total number of failed JIT executions',
      labelNames: ['pool_address', 'fee_tier', 'reason'],
    });

    this.jitProfitUsd = new Histogram({
      name: `${this.config.prefix}jit_profit_usd`,
      help: 'JIT profit in USD',
      labelNames: ['pool_address', 'fee_tier'],
      buckets: [0, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    });

    this.jitGasUsed = new Histogram({
      name: `${this.config.prefix}jit_gas_used`,
      help: 'Gas used for JIT transactions',
      labelNames: ['transaction_type'],
      buckets: [50000, 100000, 150000, 200000, 300000, 500000],
    });

    this.jitLatency = new Histogram({
      name: `${this.config.prefix}jit_latency_seconds`,
      help: 'JIT execution latency in seconds',
      labelNames: ['phase'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    });

    // Initialize Pool Metrics
    this.poolHealthScore = new Gauge({
      name: `${this.config.prefix}pool_health_score`,
      help: 'Pool health score (0-100)',
      labelNames: ['pool_address', 'pool_name'],
    });

    this.poolLiquidityUsd = new Gauge({
      name: `${this.config.prefix}pool_liquidity_usd`,
      help: 'Pool liquidity in USD',
      labelNames: ['pool_address', 'pool_name'],
    });

    this.poolVolume24h = new Gauge({
      name: `${this.config.prefix}pool_volume_24h_usd`,
      help: '24h pool volume in USD',
      labelNames: ['pool_address', 'pool_name'],
    });

    this.activePoolsCount = new Gauge({
      name: `${this.config.prefix}active_pools_count`,
      help: 'Number of active pools being monitored',
    });

    // Initialize Transaction Metrics
    this.transactionsTotal = new Counter({
      name: `${this.config.prefix}transactions_total`,
      help: 'Total number of transactions',
      labelNames: ['type', 'status'],
    });

    this.transactionGasPrice = new Histogram({
      name: `${this.config.prefix}transaction_gas_price_gwei`,
      help: 'Transaction gas price in gwei',
      labelNames: ['transaction_type'],
      buckets: [10, 20, 50, 100, 200, 500, 1000],
    });

    this.transactionConfirmationTime = new Histogram({
      name: `${this.config.prefix}transaction_confirmation_time_seconds`,
      help: 'Transaction confirmation time in seconds',
      labelNames: ['transaction_type'],
      buckets: [12, 24, 48, 96, 192, 384, 768],
    });

    this.mempoolTransactionsProcessed = new Counter({
      name: `${this.config.prefix}mempool_transactions_processed_total`,
      help: 'Total mempool transactions processed',
      labelNames: ['action'],
    });

    // Initialize Strategy Performance Metrics
    this.strategyScoreDistribution = new Histogram({
      name: `${this.config.prefix}strategy_score_distribution`,
      help: 'Distribution of strategy scores',
      labelNames: ['pool_address'],
      buckets: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    });

    this.inclusionProbabilityDistribution = new Histogram({
      name: `${this.config.prefix}inclusion_probability_distribution`,
      help: 'Distribution of inclusion probabilities',
      buckets: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
    });

    this.profitabilityRatio = new Histogram({
      name: `${this.config.prefix}profitability_ratio`,
      help: 'Profit to swap size ratio',
      labelNames: ['pool_address'],
      buckets: [0, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1],
    });

    // Initialize System Metrics
    this.errorTotal = new Counter({
      name: `${this.config.prefix}errors_total`,
      help: 'Total number of errors',
      labelNames: ['type', 'severity'],
    });

    this.uptime = new Gauge({
      name: `${this.config.prefix}uptime_seconds`,
      help: 'Bot uptime in seconds',
    });

    this.memoryUsage = new Gauge({
      name: `${this.config.prefix}memory_usage_bytes`,
      help: 'Memory usage in bytes',
      labelNames: ['type'],
    });

    this.activeBotInstances = new Gauge({
      name: `${this.config.prefix}active_bot_instances`,
      help: 'Number of active bot instances',
    });

    // Bot-level Counters (test compatibility)
    this.botTradesExecutedTotal = new Counter({
      name: `${this.config.prefix}bot_trades_executed_total`,
      help: 'Total number of trades the bot attempted/executed',
      labelNames: ['strategy'],
    });

    this.botTradesProfitableTotal = new Counter({
      name: `${this.config.prefix}bot_trades_profitable_total`,
      help: 'Total number of trades with positive profit',
      labelNames: ['strategy'],
    });

    this.botRpcFailuresTotal = new Counter({
      name: `${this.config.prefix}bot_rpc_failures_total`,
      help: 'Total number of RPC failures encountered',
      labelNames: ['endpoint', 'reason'],
    });

    this.botBacktestRunsTotal = new Counter({
      name: `${this.config.prefix}bot_backtest_runs_total`,
      help: 'Total number of backtest runs',
      labelNames: ['status'],
    });

    // Start collecting default metrics if enabled
    if (this.config.collectDefault) {
      this.startDefaultMetricsCollection();
    }
  }

  /**
   * Record JIT attempt
   */
  recordJitAttempt(poolAddress: string, feeTier: number, result: 'success' | 'failure'): void {
    this.jitAttemptsTotal.inc({
      pool_address: poolAddress,
      fee_tier: feeTier.toString(),
      result,
    });
  }

  /**
   * Record JIT success
   */
  recordJitSuccess(poolAddress: string, feeTier: number, profitUsd: number): void {
    this.jitSuccessTotal.inc({
      pool_address: poolAddress,
      fee_tier: feeTier.toString(),
    });

    this.jitProfitUsd.observe(
      {
        pool_address: poolAddress,
        fee_tier: feeTier.toString(),
      },
      profitUsd
    );
  }

  /**
   * Record JIT failure
   */
  recordJitFailure(poolAddress: string, feeTier: number, reason: string): void {
    this.jitFailuresTotal.inc({
      pool_address: poolAddress,
      fee_tier: feeTier.toString(),
      reason,
    });
  }

  /**
   * Record gas usage
   */
  recordGasUsage(transactionType: string, gasUsed: number): void {
    this.jitGasUsed.observe({ transaction_type: transactionType }, gasUsed);
  }

  /**
   * Record execution latency
   */
  recordLatency(phase: string, latencySeconds: number): void {
    this.jitLatency.observe({ phase }, latencySeconds);
  }

  /**
   * Update pool health metrics
   */
  updatePoolHealth(poolAddress: string, poolName: string, healthScore: number, liquidityUsd: number): void {
    this.poolHealthScore.set({ pool_address: poolAddress, pool_name: poolName }, healthScore);
    this.poolLiquidityUsd.set({ pool_address: poolAddress, pool_name: poolName }, liquidityUsd);
  }

  /**
   * Update active pools count
   */
  updateActivePoolsCount(count: number): void {
    this.activePoolsCount.set(count);
  }

  /**
   * Record transaction
   */
  recordTransaction(type: string, status: 'pending' | 'confirmed' | 'failed', gasPriceGwei?: number): void {
    this.transactionsTotal.inc({ type, status });

    if (gasPriceGwei) {
      this.transactionGasPrice.observe({ transaction_type: type }, gasPriceGwei);
    }
  }

  /**
   * Record strategy score
   */
  recordStrategyScore(poolAddress: string, score: number): void {
    this.strategyScoreDistribution.observe({ pool_address: poolAddress }, score);
  }

  /**
   * Record inclusion probability
   */
  recordInclusionProbability(probability: number): void {
    this.inclusionProbabilityDistribution.observe(probability);
  }

  /**
   * Record error
   */
  recordError(type: string, severity: 'low' | 'medium' | 'high' | 'critical'): void {
    this.errorTotal.inc({ type, severity });
  }

  /**
   * Update system uptime
   */
  updateUptime(uptimeSeconds: number): void {
    this.uptime.set(uptimeSeconds);
  }

  /**
   * Update memory usage
   */
  updateMemoryUsage(): void {
    const memUsage = process.memoryUsage();
    this.memoryUsage.set({ type: 'rss' }, memUsage.rss);
    this.memoryUsage.set({ type: 'heap_total' }, memUsage.heapTotal);
    this.memoryUsage.set({ type: 'heap_used' }, memUsage.heapUsed);
    this.memoryUsage.set({ type: 'external' }, memUsage.external);
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    register.clear();
  }

  /**
   * Start collecting default Node.js metrics
   */
  private startDefaultMetricsCollection(): void {
    collectDefaultMetrics({
      register,
      prefix: this.config.prefix,
    });

    // Update custom system metrics periodically
    this.defaultMetricsTimer = setInterval(() => {
      this.updateMemoryUsage();
      this.updateUptime(process.uptime());
    }, this.config.interval);
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.defaultMetricsTimer) {
      clearInterval(this.defaultMetricsTimer);
      this.defaultMetricsTimer = undefined;
    }
  }

  // ---------------------------
  // Bot-level API (Test Compat)
  // ---------------------------

  /**
   * Record a trade execution attempt (bot-level)
   */
  recordTradeExecuted(txHash: string, notionalUsd: number, strategy: string): void {
    // Labels avoid high-cardinality values like txHash; include only strategy.
    this.botTradesExecutedTotal.inc({ strategy });
    // Optionally, reflect into generic transactions metric:
    this.transactionsTotal.inc({ type: strategy || 'trade', status: 'executed' });
    // Note: notionalUsd is currently unused in counters; can be routed to a histogram if needed.
    void txHash;
    void notionalUsd;
  }

  /**
   * Record a profitable trade (bot-level)
   */
  recordProfitableTrade(txHash: string, profitUsd: number, strategy: string = 'jit'): void {
    this.botTradesProfitableTotal.inc({ strategy });
    // Also mirror profit in JIT histogram if appropriate:
    if (strategy === 'jit') {
      this.jitProfitUsd.observe({ pool_address: 'n/a', fee_tier: 'n/a' }, profitUsd);
    }
    void txHash;
  }

  /**
   * Record an RPC failure (bot-level)
   */
  recordRpcFailure(endpoint: string, reason: string): void {
    this.botRpcFailuresTotal.inc({ endpoint, reason });
  }

  /**
   * Record a backtest run (bot-level)
   */
  recordBacktestRun(status: 'success' | 'failure'): void {
    this.botBacktestRunsTotal.inc({ status });
  }
}

/**
 * Default metrics instance
 */
export const metrics = new Metrics();

/**
 * Create a new metrics instance with custom configuration
 */
export function createMetrics(config: Partial<MetricsConfig> = {}): Metrics {
  return new Metrics(config);
}

/**
 * Middleware to create HTTP server for metrics endpoint
 */
export function createMetricsServer(port: number = 9090): void {
  const http = require('http');

  const server = http.createServer(async (req: unknown, res: unknown) => {
    // Type assertions for basic HTTP server
    const request = req as { url?: string; method?: string };
    const response = res as {
      writeHead: (code: number, headers?: Record<string, string>) => void;
      end: (data?: string) => void;
    };

    if (request.url === '/metrics' && request.method === 'GET') {
      const metricsData = await metrics.getMetrics();
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end(metricsData);
    } else if (request.url === '/health' && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
    } else {
      response.writeHead(404);
      response.end('Not Found');
    }
  });

  server.listen(port, () => {
    console.log(`Metrics server listening on port ${port}`);
  });
}
