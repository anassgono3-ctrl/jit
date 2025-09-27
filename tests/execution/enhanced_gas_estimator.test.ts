import { expect } from 'chai';
import { estimateGasFees, calculateGasCost, formatGasEstimate } from '../../src/execution/gas_estimator';

describe('Enhanced Gas Estimator', () => {
  const mockProvider = {
    getBlock: async () => ({
      baseFeePerGas: 25_000_000_000n // 25 gwei
    })
  } as any;

  it('derives enhanced fee fields correctly', async () => {
    const estimate = await estimateGasFees({ provider: mockProvider });
    expect(estimate.baseFee).to.equal(25_000_000_000n);
    expect(estimate.maxPriorityFeePerGas).to.equal(1_000_000_000n); // 1 gwei default
    expect(Number(estimate.maxFeePerGas)).to.be.greaterThan(Number(estimate.baseFee));
  });

  it('respects enhanced priority fee cap with minimum', async () => {
    const estimate = await estimateGasFees({
      provider: mockProvider,
      priorityFeeCapGwei: 0.5,  // Fixed property name
      defaultPriorityFeeGwei: 2
    });
    expect(estimate.maxPriorityFeePerGas).to.equal(500_000_000n); // Should be capped at 0.5 gwei
  });

  it('uses enhanced configuration with priority cap', async () => {
    const estimate = await estimateGasFees({
      provider: mockProvider,
      priorityFeeCapGwei: 1.5,  // Fixed property name
      maxBaseFeeMultiplier: 2.5
    });
    // With default priority fee of 1 gwei and cap of 1.5 gwei, should use 1 gwei (default)
    const expectedMaxFee = (25_000_000_000n * 250n) / 100n + 1_000_000_000n;
    expect(estimate.maxFeePerGas).to.equal(expectedMaxFee);
  });

  it('handles enhanced priority fee configuration edge cases', async () => {
    const estimate = await estimateGasFees({
      provider: mockProvider,
      priorityFeeCapGwei: 0.5,  // Fixed property name - cap is lower than default
      defaultPriorityFeeGwei: 1.0
    });
    // Should use the cap since default (1.0) > cap (0.5)
    expect(estimate.maxPriorityFeePerGas).to.equal(500_000_000n);
  });

  it('calculates enhanced gas costs with priority minimum', () => {
    const estimate = {
      baseFee: 25_000_000_000n,
      maxPriorityFeePerGas: 1_500_000_000n,
      maxFeePerGas: 51_500_000_000n
    };
    const gasLimit = 250_000n;
    
    const costs = calculateGasCost(estimate, gasLimit);
    expect(costs.maxCostWei).to.equal(51_500_000_000n * 250_000n);
    expect(costs.expectedCostWei).to.equal(26_500_000_000n * 250_000n);
  });

  it('formats enhanced gas estimate with detailed breakdown', () => {
    const estimate = {
      baseFee: 25_000_000_000n,
      maxPriorityFeePerGas: 1_500_000_000n,
      maxFeePerGas: 51_500_000_000n
    };
    
    const formatted = formatGasEstimate(estimate);
    expect(formatted).to.match(/25\.00.*1\.50.*51\.50.*gwei/);
  });
});