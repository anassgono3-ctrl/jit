import { expect } from 'chai';
import { estimateGasFees, calculateGasCost, formatGasEstimate } from '../../src/execution/gas_estimator';

describe('Gas Estimator', () => {
  const mockProvider = {
    getBlock: async () => ({
      baseFeePerGas: 20_000_000_000n // 20 gwei
    })
  } as any;

  it('derives fee fields correctly', async () => {
    const estimate = await estimateGasFees({ provider: mockProvider });
    expect(estimate.baseFee).to.equal(20_000_000_000n);
    expect(estimate.maxPriorityFeePerGas).to.equal(1_000_000_000n); // 1 gwei default
    expect(Number(estimate.maxFeePerGas)).to.be.greaterThan(Number(estimate.baseFee));
  });

  it('respects priority fee cap', async () => {
    const estimate = await estimateGasFees({
      provider: mockProvider,
      priorityFeeCapGwei: 0.5,
      defaultPriorityFeeGwei: 2
    });
    expect(estimate.maxPriorityFeePerGas).to.equal(500_000_000n); // Capped at 0.5 gwei
  });

  it('uses custom base fee multiplier', async () => {
    const estimate = await estimateGasFees({
      provider: mockProvider,
      maxBaseFeeMultiplier: 3
    });
    const expectedMaxFee = (20_000_000_000n * 3n) + 1_000_000_000n;
    expect(estimate.maxFeePerGas).to.equal(expectedMaxFee);
  });

  it('throws on missing base fee', async () => {
    const noBaseFeeProvider = {
      getBlock: async () => ({ baseFeePerGas: null })
    } as any;
    
    try {
      await estimateGasFees({ provider: noBaseFeeProvider });
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).to.match(/Base fee unavailable/);
    }
  });

  it('calculates gas costs correctly', () => {
    const estimate = {
      baseFee: 20_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      maxFeePerGas: 41_000_000_000n
    };
    const gasLimit = 200_000n;
    
    const costs = calculateGasCost(estimate, gasLimit);
    expect(costs.maxCostWei).to.equal(41_000_000_000n * 200_000n);
    expect(costs.expectedCostWei).to.equal(21_000_000_000n * 200_000n);
  });

  it('formats gas estimate readably', () => {
    const estimate = {
      baseFee: 20_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      maxFeePerGas: 41_000_000_000n
    };
    
    const formatted = formatGasEstimate(estimate);
    expect(formatted).to.match(/20\.00.*1\.00.*41\.00.*gwei/);
  });
});
