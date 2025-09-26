import { expect } from 'chai';
import { simulateBundle, wouldBeProfitable } from '../../src/execution/sim/flashbots_simulator';

describe('Flashbots Simulator', () => {
  const mockTxs = [
    '0x02f8b1010a84773594008477359400830186a094d8b1a3c89e5fb5a2f9b7e8b8e5d6b6e6b6e6b6b680b844095ea7b3000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001c001a0a8a4e7e8a6b6e6b6e6b6e6b6e6b6e6b6e6b6e6b6e6b6e6b6e6b6e6b6e6b6a0a8a4e7e8a6b6e6b6e6b6e6b6e6b6e6b6e6b6e6b6e6b6e6b6e6b6e6b6e6b6'
  ];

  it('should validate transaction inputs', async () => {
    const result = await simulateBundle([]);
    expect(result.success).to.be.false;
    expect(result.error).to.equal('No transactions provided');
  });

  it('should return mock simulation when no Flashbots URL provided', async () => {
    const result = await simulateBundle(mockTxs);
    expect(result.success).to.be.true;
    expect(result.gasUsed).to.equal(200000);
    expect(result.profitUsd).to.equal(50);
    expect(result.profitEth).to.equal(0.025);
  });

  it('should check profitability correctly', async () => {
    const profitableResult = await wouldBeProfitable(mockTxs, 25); // Below mock profit
    expect(profitableResult.profitable).to.be.true;
    expect(profitableResult.reason).to.be.undefined;

    const unprofitableResult = await wouldBeProfitable(mockTxs, 100); // Above mock profit
    expect(unprofitableResult.profitable).to.be.false;
    expect(unprofitableResult.reason).to.include('Simulated profit $50 < min $100');
  });

  it('should handle simulation errors gracefully', async () => {
    // Test with invalid transaction data
    const invalidTxs = ['invalid-tx-data'];
    const result = await wouldBeProfitable(invalidTxs, 25);
    
    // Should still return a result (mock simulation)
    expect(result).to.have.property('profitable');
    expect(result).to.have.property('result');
  });

  it('should include profit and gas usage in results', async () => {
    const result = await simulateBundle(mockTxs);
    
    expect(result).to.have.property('profitUsd');
    expect(result).to.have.property('profitEth');
    expect(result).to.have.property('gasUsed');
    expect(result.gasUsed).to.be.a('number');
    expect(result.profitUsd).to.be.a('number');
    expect(result.profitEth).to.be.a('number');
  });

  it('should handle timeout option', async () => {
    const result = await simulateBundle(mockTxs, { 
      timeoutMs: 1000,
      flashbotsUrl: 'http://localhost:12345' // Non-existent URL to test timeout/fallback
    });
    
    // Should fall back to mock simulation on timeout/error
    expect(result.success).to.be.true;
    expect(result.gasUsed).to.equal(200000);
  });

  it('should pass through simulation options', async () => {
    const options = {
      blockNumber: 18000000,
      timestamp: 1690000000,
      validateProfit: true
    };

    const result = await simulateBundle(mockTxs, options);
    expect(result.success).to.be.true;
  });

  it('should format profitability check results correctly', async () => {
    const result = await wouldBeProfitable(mockTxs, 25);
    
    expect(result).to.have.property('profitable');
    expect(result).to.have.property('result');
    expect(result.result).to.have.property('success');
    expect(result.result).to.have.property('profitUsd');
    expect(result.result).to.have.property('gasUsed');
  });
});