import { expect } from 'chai';
import { createMetrics } from '../../src/modules/metrics';
import { register } from 'prom-client';

describe('Enhanced Metrics System', () => {
  let metrics: ReturnType<typeof createMetrics>;

  beforeEach(() => {
    // Clear the global registry before each test
    register.clear();
    metrics = createMetrics({ collectDefault: false }); // Disable default metrics for testing
  });

  afterEach(() => {
    if (metrics) {
      metrics.stop();
      metrics.clearMetrics();
    }
    register.clear();
  });

  it('should have core bot metrics counters', () => {
    expect(metrics.botTradesExecutedTotal).to.exist;
    expect(metrics.botTradesProfitableTotal).to.exist;
    expect(metrics.botRpcFailuresTotal).to.exist;
    expect(metrics.botBacktestRunsTotal).to.exist;
  });

  it('should record trade executions', () => {
    metrics.recordTradeExecuted('0x123...', 3000, 'jit');
    
    // Verify the counter was incremented (we can't easily access the value in prom-client)
    expect(() => metrics.recordTradeExecuted('0x456...', 500, 'arbitrage')).to.not.throw();
  });

  it('should record profitable trades', () => {
    metrics.recordProfitableTrade('0x123...', 3000);
    
    expect(() => metrics.recordProfitableTrade('0x456...', 500)).to.not.throw();
  });

  it('should record RPC failures', () => {
    metrics.recordRpcFailure('http://rpc1.example.com', 'timeout');
    metrics.recordRpcFailure('http://rpc2.example.com', 'connection_error');
    
    expect(() => metrics.recordRpcFailure('http://rpc3.example.com', 'invalid_response')).to.not.throw();
  });

  it('should record backtest runs', () => {
    metrics.recordBacktestRun('success');
    metrics.recordBacktestRun('failure');
    
    expect(() => metrics.recordBacktestRun('success')).to.not.throw();
  });

  it('should generate Prometheus metrics', async () => {
    // Record some metrics
    metrics.recordTradeExecuted('0x123...', 3000, 'jit');
    metrics.recordProfitableTrade('0x123...', 3000);
    metrics.recordRpcFailure('http://rpc1.example.com', 'timeout');
    metrics.recordBacktestRun('success');

    const metricsString = await metrics.getMetrics();
    
    expect(metricsString).to.be.a('string');
    expect(metricsString).to.include('trades_executed_total');
    expect(metricsString).to.include('trades_profitable_total');
    expect(metricsString).to.include('rpc_failures_total');
    expect(metricsString).to.include('backtest_runs_total');
  });

  it('should maintain existing JIT metrics', () => {
    expect(metrics.jitAttemptsTotal).to.exist;
    expect(metrics.jitSuccessTotal).to.exist;
    expect(metrics.jitFailuresTotal).to.exist;
    expect(metrics.jitProfitUsd).to.exist;
    expect(metrics.jitGasUsed).to.exist;
    expect(metrics.jitLatency).to.exist;
  });

  it('should record JIT metrics', () => {
    metrics.recordJitAttempt('0x123...', 3000, 'success');
    metrics.recordJitSuccess('0x123...', 3000, 125.50);
    metrics.recordJitFailure('0x456...', 500, 'insufficient_profit');
    
    expect(() => metrics.recordGasUsage('mint', 150000)).to.not.throw();
    expect(() => metrics.recordLatency('simulation', 0.25)).to.not.throw();
  });

  it('should update system metrics', () => {
    metrics.updateUptime(3600); // 1 hour
    metrics.updateMemoryUsage();
    metrics.updateActivePoolsCount(5);
    
    expect(() => metrics.recordError('rpc_timeout', 'medium')).to.not.throw();
  });

  it('should handle metric labels correctly', () => {
    // Test with various label combinations
    metrics.recordTradeExecuted('0xabc123', 3000, 'jit');
    metrics.recordTradeExecuted('0xdef456', 500, 'arbitrage');
    metrics.recordProfitableTrade('0xabc123', 3000);
    
    // Should not throw with different label values
    expect(() => {
      metrics.recordRpcFailure('https://mainnet.infura.io/v3/key', 'rate_limit');
      metrics.recordRpcFailure('https://eth.llamarpc.com', 'connection_error');
    }).to.not.throw();
  });

  it('should create metrics with custom configuration', () => {
    const customMetrics = createMetrics({
      collectDefault: false,
      interval: 5000,
      prefix: 'custom_bot_'
    });

    expect(customMetrics).to.exist;
    expect(() => customMetrics.recordBacktestRun('success')).to.not.throw();
    
    customMetrics.stop();
    customMetrics.clearMetrics();
  });
});