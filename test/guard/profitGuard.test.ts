import { expect } from 'chai';
import { ProfitGuard, ProfitSignal } from '../../src/strategy/profitGuard';

describe('ProfitGuard', () => {
  it('passes when profit > min and gas < cap', async () => {
    const guard = new ProfitGuard({ minUsd: 10, maxGasUsd: 20 });
    const estimator = async (): Promise<ProfitSignal> => ({ estProfitUsd: 42.13, estGasUsd: 9.5 });
    const ok = await guard.evaluateAndLog(estimator);
    expect(ok).to.equal(true);
  });

  it('blocks when profit below min', async () => {
    const guard = new ProfitGuard({ minUsd: 10 });
    const estimator = async (): Promise<ProfitSignal> => ({ estProfitUsd: 2.1, estGasUsd: 8.9 });
    const ok = await guard.evaluateAndLog(estimator);
    expect(ok).to.equal(false);
  });

  it('blocks when gas above cap', async () => {
    const guard = new ProfitGuard({ minUsd: 1, maxGasUsd: 5 });
    const estimator = async (): Promise<ProfitSignal> => ({ estProfitUsd: 100, estGasUsd: 9.99 });
    const ok = await guard.evaluateAndLog(estimator);
    expect(ok).to.equal(false);
  });

  it('blocks when estimator throws (RPC error path)', async () => {
    const guard = new ProfitGuard({ minUsd: 1, maxGasUsd: 100 });
    const estimator = async (): Promise<ProfitSignal> => {
      throw new Error('rpc down');
    };
    const ok = await guard.evaluateAndLog(estimator);
    expect(ok).to.equal(false);
  });

  it('allow() returns true with partial signals that meet thresholds', () => {
    const guard = new ProfitGuard({ minUsd: 10 });
    expect(guard.allow({ estProfitUsd: 12 })).to.equal(true);
  });

  it('allow() returns false with partial signals that miss thresholds', () => {
    const guard = new ProfitGuard({ minUsd: 10 });
    expect(guard.allow({ estProfitUsd: 5 })).to.equal(false);
  });
});
