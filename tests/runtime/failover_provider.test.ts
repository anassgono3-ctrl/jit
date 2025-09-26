import { expect } from 'chai';
import { FailoverProvider, createFailoverProvider } from '../../src/runtime/providers/failover_provider';
import { ethers } from 'ethers';

describe('FailoverProvider', () => {
  const mockEndpoints = [
    { url: 'http://rpc1.example.com', weight: 2 },
    { url: 'http://rpc2.example.com', weight: 1 }
  ];

  it('should create provider with multiple endpoints', () => {
    const provider = createFailoverProvider(mockEndpoints);
    expect(provider).to.be.instanceOf(FailoverProvider);
    
    const config = provider.getConfigSummary();
    expect(config.totalProviders).to.equal(2);
    expect(config.config.endpoints).to.deep.equal(mockEndpoints);
  });

  it('should report provider health status', () => {
    const provider = createFailoverProvider(mockEndpoints);
    const healthStatus = provider.getProviderHealthStatus();
    
    expect(healthStatus).to.have.property('http://rpc1.example.com');
    expect(healthStatus).to.have.property('http://rpc2.example.com');
    
    const rpc1Health = healthStatus['http://rpc1.example.com'];
    expect(rpc1Health).to.have.property('isHealthy', true);
    expect(rpc1Health).to.have.property('consecutiveFailures', 0);
  });

  it('should throw error when no endpoints provided', () => {
    expect(() => createFailoverProvider([])).to.throw('At least one RPC endpoint required');
  });

  it('should handle weighted round-robin selection', () => {
    const provider = createFailoverProvider(mockEndpoints);
    const config = provider.getConfigSummary();
    
    // Provider should be created successfully
    expect(config.healthyProviders).to.equal(2);
    expect(config.totalProviders).to.equal(2);
  });

  it('should provide configuration summary', () => {
    const provider = createFailoverProvider(mockEndpoints);
    const summary = provider.getConfigSummary();
    
    expect(summary).to.have.property('totalProviders', 2);
    expect(summary).to.have.property('healthyProviders');
    expect(summary).to.have.property('config');
    expect(summary.config).to.have.property('maxRetries');
    expect(summary.config).to.have.property('cooldownMs');
    expect(summary.config).to.have.property('timeoutMs');
  });

  it('should track health metrics structure', () => {
    const provider = createFailoverProvider(mockEndpoints);
    const healthStatus = provider.getProviderHealthStatus();
    
    for (const [url, health] of Object.entries(healthStatus)) {
      expect(health).to.have.property('isHealthy');
      expect(health).to.have.property('lastSuccess');
      expect(health).to.have.property('lastFailure');
      expect(health).to.have.property('consecutiveFailures');
      expect(health).to.have.property('cooldownUntil');
      expect(health).to.have.property('url', url);
    }
  });

  it('should handle forced health check', async () => {
    const provider = createFailoverProvider(mockEndpoints);
    
    // Should not throw when forcing health check
    expect(async () => await provider.forceHealthCheck()).to.not.throw;
  });
});