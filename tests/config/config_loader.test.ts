import { expect } from 'chai';
import { loadConfig, resetConfig, getConfigSummary } from '../../src/config';

describe('Config Loader', () => {
  beforeEach(() => {
    resetConfig();
    // Clear env vars
    delete process.env.DRY_RUN;
    delete process.env.PRIVATE_KEY;
    delete process.env.PRIMARY_RPC_HTTP;
    delete process.env.RPC_PROVIDERS;
    delete process.env.MIN_PROFIT_USD;
  });

  it('loads defaults in dry run', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    const cfg = loadConfig();
    expect(cfg.DRY_RUN).to.be.true;
    expect(cfg.NETWORK).to.equal('mainnet');
    expect(cfg.MIN_PROFIT_USD).to.equal(0);
    expect(cfg.LOG_LEVEL).to.equal('info');
  });

  it('requires PRIVATE_KEY in live mode', () => {
    process.env.DRY_RUN = 'false';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    expect(() => loadConfig()).to.throw(/PRIVATE_KEY required/);
  });

  it('rejects malformed PRIVATE_KEY', () => {
    process.env.DRY_RUN = 'false';
    process.env.PRIVATE_KEY = '0x1234';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    expect(() => loadConfig()).to.throw(/malformed/);
  });

  it('accepts valid PRIVATE_KEY', () => {
    process.env.DRY_RUN = 'false';
    process.env.PRIVATE_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    const cfg = loadConfig();
    expect(cfg.DRY_RUN).to.be.false;
    expect(cfg.PRIVATE_KEY).to.equal(process.env.PRIVATE_KEY);
  });

  it('requires at least one RPC provider', () => {
    process.env.DRY_RUN = 'true';
    expect(() => loadConfig()).to.throw(/At least one RPC provider required/);
  });

  it('parses RPC_PROVIDERS JSON', () => {
    process.env.DRY_RUN = 'true';
    process.env.RPC_PROVIDERS = '[{"url":"http://localhost:8545","weight":2}]';
    const cfg = loadConfig();
    expect(cfg.RPC_PROVIDERS).to.deep.equal([{ url: 'http://localhost:8545', weight: 2 }]);
  });

  it('rejects invalid RPC_PROVIDERS JSON', () => {
    process.env.DRY_RUN = 'true';
    process.env.RPC_PROVIDERS = 'invalid json';
    expect(() => loadConfig()).to.throw(/Invalid RPC_PROVIDERS JSON/);
  });

  it('provides config summary', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    process.env.MIN_PROFIT_USD = '50';
    const summary = getConfigSummary();
    expect(summary).to.include({
      dryRun: true,
      network: 'mainnet',
      hasPrivateKey: false,
      hasPrimaryRpc: true,
      minProfitUsd: 50
    });
  });

  it('caches config after first load', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    const cfg1 = loadConfig();
    const cfg2 = loadConfig();
    expect(cfg1).to.equal(cfg2); // Same object reference
  });
});
