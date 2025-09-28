import { expect } from 'chai';
import { loadConfig, resetConfig } from '../../src/config';

describe('Environment loading', () => {
  beforeEach(() => {
    // Reset config cache to avoid cross-test pollution
    resetConfig();
    // Clear all relevant env vars
    delete process.env.DRY_RUN;
    delete process.env.PRIVATE_KEY;
    delete process.env.PRIMARY_RPC_HTTP;
    delete process.env.RPC_PROVIDERS;
    delete process.env.RPC_HTTP_LIST;
  });

  afterEach(() => {
    // Clean up after this test
    delete process.env.DRY_RUN;
    delete process.env.PRIVATE_KEY;
    delete process.env.PRIMARY_RPC_HTTP;
    resetConfig();
  });

  it('loads DRY_RUN from .env (integration)', () => {
    // Override for integration check; provide a valid PRIVATE_KEY to avoid live-mode exit
    process.env.DRY_RUN = 'false';
    process.env.PRIVATE_KEY = '0x' + 'a'.repeat(64);
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';

    const cfg = loadConfig();
    expect(cfg.DRY_RUN).to.equal(false);
  });
});