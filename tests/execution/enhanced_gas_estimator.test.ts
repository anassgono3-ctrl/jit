import { expect } from 'chai';
import { estimateGasFees } from '../../src/execution/gas_estimator';

describe('Enhanced Gas Estimator (EIP-1559)', () => {
  const mockProvider = {
    getBlock: async () => ({
      baseFeePerGas: 20_000_000_000n // 20 gwei
    })
  } as any;

  it('should use new priority fee bounds', async () => {
    const estimate = await estimateGasFees({
      provider: mockProvider,
      priorityFeeMinGwei: 1,
      priorityFeeMaxGwei: 3,
      defaultPriorityFeeGwei: 2
    });

    expect(estimate.maxPriorityFeePerGas).to.equal(2_000_000_000n); // 2 gwei
  });

  it('should clamp priority fee to minimum bound', async () => {
    const estimate = await estimateGasFees({
      provider: mockProvider,
      priorityFeeMinGwei: 2,
      priorityFeeMaxGwei: 5,
      defaultPriorityFeeGwei: 1 // Below minimum
    });

    expect(estimate.maxPriorityFeePerGas).to.equal(2_000_000_000n); // Clamped to min
  });

  it('should clamp priority fee to maximum bound', async () => {
    const estimate = await estimateGasFees({
      provider: mockProvider,
      priorityFeeMinGwei: 1,
      priorityFeeMaxGwei: 3,
      defaultPriorityFeeGwei: 5 // Above maximum
    });

    expect(estimate.maxPriorityFeePerGas).to.equal(3_000_000_000n); // Clamped to max
  });

  it('should apply base fee multiplier correctly', async () => {
    const estimate = await estimateGasFees({
      provider: mockProvider,
      maxBaseFeeMultiplier: 2.5,
      priorityFeeMinGwei: 1,
      priorityFeeMaxGwei: 1,
      defaultPriorityFeeGwei: 1
    });

    // Expected: (20 gwei * 2.5) + 1 gwei = 51 gwei
    const expectedMaxFee = BigInt(Math.floor(20 * 2.5 * 1e9)) + 1_000_000_000n;
    expect(estimate.maxFeePerGas).to.equal(expectedMaxFee);
  });

  it('should maintain backward compatibility with priorityFeeCapGwei', async () => {
    const estimate = await estimateGasFees({
      provider: mockProvider,
      priorityFeeCapGwei: 0.8,
      defaultPriorityFeeGwei: 2
    });

    expect(estimate.maxPriorityFeePerGas).to.equal(800_000_000n); // Capped at 0.8 gwei
  });

  it('should prefer new bounds over legacy cap when both provided', async () => {
    const estimate = await estimateGasFees({
      provider: mockProvider,
      priorityFeeCapGwei: 5, // Legacy - should be ignored
      priorityFeeMinGwei: 1,
      priorityFeeMaxGwei: 2, // New bounds - should be used
      defaultPriorityFeeGwei: 3
    });

    expect(estimate.maxPriorityFeePerGas).to.equal(2_000_000_000n); // New max bound
  });

  it('should use reasonable defaults', async () => {
    const estimate = await estimateGasFees({
      provider: mockProvider
      // No explicit bounds provided
    });

    expect(estimate.maxPriorityFeePerGas).to.equal(1_000_000_000n); // 1 gwei default min
    
    // Base fee multiplier should default to 2.0
    const expectedMaxFee = BigInt(Math.floor(20 * 2.0 * 1e9)) + 1_000_000_000n;
    expect(estimate.maxFeePerGas).to.equal(expectedMaxFee);
  });
});