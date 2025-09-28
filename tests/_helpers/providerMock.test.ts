import { expect } from 'chai';
import { JsonRpcProvider } from 'ethers';
import { stubJsonRpcProviderDetectNetwork, restoreJsonRpcProviderDetectNetwork } from './providerMock';
import { DEFAULT_MOCK_PROFIT_USD, simulateBundle } from '../../src/execution/sim/flashbots_simulator';

describe('Test Helpers', () => {
  describe('Provider Mock', () => {
    it('should stub JsonRpcProvider._detectNetwork() to avoid network calls', async () => {
      const restore = stubJsonRpcProviderDetectNetwork();
      
      try {
        // Create a provider instance (this would normally try to connect to the network)
        const provider = new JsonRpcProvider('http://localhost:8545');
        
        // This should return the mocked network info instead of making a real network call
        const network = await (provider as any)._detectNetwork();
        
        expect(network.chainId).to.equal(1);
        expect(network.name).to.equal('homestead');
      } finally {
        restore();
      }
    });

    it('should restore _detectNetwork functionality after cleanup', async () => {
      const restore = stubJsonRpcProviderDetectNetwork();
      restore();
      
      // After restore, the method should behave normally (though we won't test real network calls here)
      const provider = new JsonRpcProvider('http://localhost:8545');
      expect((provider as any)._detectNetwork).to.be.a('function');
    });
  });

  describe('Flashbots Simulator Constants', () => {
    it('should export DEFAULT_MOCK_PROFIT_USD constant', () => {
      expect(DEFAULT_MOCK_PROFIT_USD).to.be.a('number');
      expect(DEFAULT_MOCK_PROFIT_USD).to.equal(50);
    });

    it('should use the constant in simulation results', async () => {
      const result = await simulateBundle(['0x1234']);
      
      expect(result.success).to.be.true;
      expect(result.profitUsd).to.equal(DEFAULT_MOCK_PROFIT_USD);
    });
  });
});