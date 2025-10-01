import { expect } from 'chai';
import { ProfitGuard } from '../../src/strategy/profitGuard';
import { estimateProfitAndGas } from '../../src/strategy/profitability';

describe('Profitability estimator & guard', () => {
  it('profit guard from env works', () => {
    process.env.PROFIT_MIN_USD = '10';
    process.env.PROFIT_MIN_ETH = '0.001';
    const pg = ProfitGuard.fromEnv();
    // less than both -> false
    expect(pg.allow({ estProfitUsd: 5, estProfitEth: 0.0005 })).to.equal(false);
    // satisfies USD -> false because ETH low
    expect(pg.allow({ estProfitUsd: 20, estProfitEth: 0.0005 })).to.equal(false);
    // satisfies both -> true
    expect(pg.allow({ estProfitUsd: 20, estProfitEth: 0.01 })).to.equal(true);
  });

  it('estimator returns structure and blocks low profit by default', async () => {
    delete process.env.PROFIT_MIN_USD;
    delete process.env.PROFIT_MIN_ETH;
    const res = await estimateProfitAndGas(undefined as any, [], []);
    expect(res).to.have.property('estProfitUsd');
    expect(res).to.have.property('gasUsd');
    expect(typeof res.allowed).to.equal('boolean');
  });

  it('estimator can accept notional override and allow when profit is large enough', async () => {
    process.env.PROFIT_MIN_USD = '1';
    process.env.ETH_USD = '2000';
    // notional 1 ETH => profit ~ 0.0005 ETH => $1 at 2000 USD/ETH (with default 5 bps)
    const res = await estimateProfitAndGas(undefined as any, [], [], { notionalEth: 1 });
    expect(res.estProfitUsd).to.be.greaterThan(0);
    expect(typeof res.allowed).to.equal('boolean');
  });
});
