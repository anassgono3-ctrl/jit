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
    delete process.env.CAPTURE_FRACTION;
    delete process.env.INCLUSION_PROBABILITY;
  });

  it('loads defaults in dry run', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    const cfg = loadConfig();
    expect(cfg.DRY_RUN).to.be.true;
    expect(cfg.NETWORK).to.equal('mainnet');
    expect(cfg.MIN_PROFIT_USD).to.equal(25); // Updated default
    expect(cfg.CAPTURE_FRACTION).to.equal(0.7);
    expect(cfg.INCLUSION_PROBABILITY).to.equal(0.35);
    expect(cfg.PRIORITY_FEE_GWEI_MAX).to.equal(50); // Updated gas strategy default
    expect(cfg.SIM_TIMEOUT_MS).to.equal(5000); // Updated simulation timeout default
    expect(cfg.LOG_LEVEL).to.equal('info');
  });

  it('parses DRY_RUN=false correctly', () => {
    process.env.DRY_RUN = 'false';
    process.env.PRIVATE_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    const cfg = loadConfig();
    expect(cfg.DRY_RUN).to.be.false;
  });

  it('parses DRY_RUN=true explicitly', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    const cfg = loadConfig();
    expect(cfg.DRY_RUN).to.be.true;
  });

  it('defaults DRY_RUN to true when undefined', () => {
    // DRY_RUN not set
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    const cfg = loadConfig();
    expect(cfg.DRY_RUN).to.be.true;
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

  it('parses numeric config correctly', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    process.env.MIN_PROFIT_USD = '50';
    process.env.CAPTURE_FRACTION = '0.8';
    process.env.INCLUSION_PROBABILITY = '0.4';
    const cfg = loadConfig();
    expect(cfg.MIN_PROFIT_USD).to.equal(50);
    expect(cfg.CAPTURE_FRACTION).to.equal(0.8);
    expect(cfg.INCLUSION_PROBABILITY).to.equal(0.4);
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

  it('provides config summary with new fields', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    process.env.MIN_PROFIT_USD = '50';
    process.env.CAPTURE_FRACTION = '0.8';
    process.env.INCLUSION_PROBABILITY = '0.4';
    const summary = getConfigSummary();
    expect(summary).to.include({
      dryRun: true,
      network: 'mainnet',
      hasPrivateKey: false,
      hasPrimaryRpc: true,
      minProfitUsd: 50,
      captureFraction: 0.8,
      inclusionProbability: 0.4
    });
    // Check that rpcHttpList is present and non-empty
    expect(summary.rpcHttpList).to.be.greaterThan(0);
  });

  it('caches config after first load', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    const cfg1 = loadConfig();
    const cfg2 = loadConfig();
    expect(cfg1).to.equal(cfg2); // Same object reference
  });
});
