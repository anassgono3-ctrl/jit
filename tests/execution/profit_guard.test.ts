import { expect } from 'chai';
import { evaluateProfit, formatProfitDecision } from '../../src/execution/profit_guard';

describe('Profit Guard', () => {
  const defaultConfig = { minProfitUsd: 10, minProfitEth: 0.01 };

  it('blocks below min USD threshold', () => {
    const decision = evaluateProfit(
      { estProfitUsd: 15, gasCostUsd: 10 }, // Net: $5
      defaultConfig
    );
    expect(decision.execute).to.be.false;
    expect(decision.reason).to.match(/netUsd < minProfitUsd/);
    expect(decision.netProfitUsd).to.equal(5);
  });

  it('blocks below min ETH threshold', () => {
    const decision = evaluateProfit(
      { estProfitEth: 0.02, gasCostEth: 0.015 }, // Net: 0.005 ETH
      { minProfitUsd: 0, minProfitEth: 0.01 } // No USD requirement
    );
    expect(decision.execute).to.be.false;
    expect(decision.reason).to.match(/netEth < minProfitEth/);
    expect(decision.netProfitEth).to.be.closeTo(0.005, 0.0001);
  });

  it('allows above thresholds', () => {
    const decision = evaluateProfit(
      { estProfitUsd: 25, gasCostUsd: 5, estProfitEth: 0.02, gasCostEth: 0.002 },
      defaultConfig
    );
    expect(decision.execute).to.be.true;
    expect(decision.netProfitUsd).to.equal(20);
    expect(decision.netProfitEth).to.be.closeTo(0.018, 0.0001);
  });

  it('blocks non-positive profit', () => {
    const decision = evaluateProfit(
      { estProfitUsd: 5, gasCostUsd: 10 }, // Negative profit
      { minProfitUsd: 0, minProfitEth: 0 }
    );
    expect(decision.execute).to.be.false;
    expect(decision.reason).to.match(/non-positive profitability/);
  });

  it('handles missing values gracefully', () => {
    const decision = evaluateProfit({}, defaultConfig);
    expect(decision.execute).to.be.false;
    expect(decision.netProfitUsd).to.equal(0);
    expect(decision.netProfitEth).to.equal(0);
  });

  it('formats decisions correctly', () => {
    const executeDecision = evaluateProfit(
      { estProfitUsd: 100, gasCostUsd: 10 },
      { minProfitUsd: 50, minProfitEth: 0 }
    );
    const formatted = formatProfitDecision(executeDecision);
    expect(formatted).to.match(/EXECUTE.*\$90\.00/);

    const skipDecision = evaluateProfit(
      { estProfitUsd: 5, gasCostUsd: 10 },
      { minProfitUsd: 0, minProfitEth: 0 } // Test non-positive case
    );
    const formattedSkip = formatProfitDecision(skipDecision);
    expect(formattedSkip).to.match(/SKIP.*non-positive/);
  });
});
