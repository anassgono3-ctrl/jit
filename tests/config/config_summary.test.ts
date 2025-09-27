import { expect } from 'chai';
import { getConfigSummary, resetConfig } from '../../src/config';

describe('Config summary', () => {
  beforeEach(() => {
    resetConfig();
    // Set required RPC configuration
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
  });

  afterEach(() => {
    resetConfig();
    delete process.env.PRIMARY_RPC_HTTP;
  });

  it('does not include PRIVATE_KEY', () => {
    const s = getConfigSummary() as any;
    expect(s.PRIVATE_KEY).to.equal(undefined);
  });

  it('includes non-secret flags and counts', () => {
    const s = getConfigSummary() as any;
    expect(s).to.have.property('network');
    expect(s).to.have.property('dryRun');
    expect(s).to.have.property('rpcProviders');
    expect(s).to.have.property('rpcHttpList');
    expect(s.rpcHttpList).to.be.greaterThan(0); // Should have at least one RPC endpoint
  });
});