// Use the exported constant and compare profitability against config thresholds.
// Replace only the brittle expectations; keep other tests as-is.

import { expect } from 'chai';
import { simulateBundle, DEFAULT_MOCK_PROFIT_USD, wouldBeProfitable } from '../../src/execution/sim/flashbots_simulator';
import { loadConfig, resetConfig } from '../../src/config';

describe('Flashbots Simulator', () => {
  beforeEach(() => {
    resetConfig();
    // Clear env vars
    delete process.env.DRY_RUN;
    delete process.env.PRIVATE_KEY;
    delete process.env.PRIMARY_RPC_HTTP;
    delete process.env.RPC_PROVIDERS;
    delete process.env.MIN_PROFIT_USD;
    delete process.env.FLASHBOTS_RPC_URL;
  });

  it('should return mock simulation when no Flashbots URL provided', async () => {
    delete process.env.FLASHBOTS_RPC_URL;
    const res = await simulateBundle(['0x01'], { validateProfit: false });
    expect(res).to.have.property('profitUsd', DEFAULT_MOCK_PROFIT_USD);
  });

  it('should check profitability correctly', async () => {
    delete process.env.FLASHBOTS_RPC_URL;
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    const cfg = loadConfig();
    const res = await simulateBundle(['0x01'], { validateProfit: true });
    const check = await wouldBeProfitable(['0x01'], cfg.MIN_PROFIT_USD);
    expect(check.profitable).to.equal((res.profitUsd ?? 0) >= cfg.MIN_PROFIT_USD);
  });
});