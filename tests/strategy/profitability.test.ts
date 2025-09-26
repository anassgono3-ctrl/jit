import { expect } from 'chai';
import { evaluatePlan } from '../../src/strategy/profitability';
import { SimulationResult, ProfitabilityConfig } from '../../src/strategy/types';

describe('Profitability Strategy', () => {
  const defaultConfig: ProfitabilityConfig = {
    minProfitUsd: 25,
    captureFraction: 0.7,
    inclusionProbability: 0.35
  };

  it('accepts profitable plan above threshold', () => {
    // Use a plan that will be above the 25 USD threshold
    const sim: SimulationResult = {
      feesToken0Usd: 100,
      feesToken1Usd: 100,
      flashloanFeesUsd: 10,
      gasUsd: 15
    };

    const decision = evaluatePlan(sim, defaultConfig);
    
    expect(decision.accept).to.be.true;
    expect(decision.reason).to.be.undefined;
    // Expected: (200 - 10) * 0.7 * 0.35 - 15 = 190 * 0.245 - 15 = 46.55 - 15 = 31.55 (above 25)
    expect(decision.expectedNetUsd).to.be.greaterThan(25);
  });

  it('rejects plan with negative gross profit', () => {
    const sim: SimulationResult = {
      feesToken0Usd: 10,
      feesToken1Usd: 10,
      flashloanFeesUsd: 30, // Higher than fees
      gasUsd: 5
    };

    const decision = evaluatePlan(sim, defaultConfig);
    
    expect(decision.accept).to.be.false;
    expect(decision.reason).to.equal('negativeGrossProfit');
    expect(decision.expectedNetUsd).to.be.lessThan(0);
  });

  it('rejects plan below profit threshold', () => {
    const sim: SimulationResult = {
      feesToken0Usd: 30,
      feesToken1Usd: 20,
      flashloanFeesUsd: 5,
      gasUsd: 20
    };

    const decision = evaluatePlan(sim, defaultConfig);
    
    expect(decision.accept).to.be.false;
    expect(decision.reason).to.equal('expectedNetUsdBelowThreshold');
    // Expected: (50 - 5) * 0.7 * 0.35 - 20 = 45 * 0.245 - 20 = 11.025 - 20 = -8.975 (below 25)
    expect(decision.expectedNetUsd).to.be.lessThan(25);
  });

  it('calculates score correctly', () => {
    const sim: SimulationResult = {
      feesToken0Usd: 100,
      feesToken1Usd: 100,
      flashloanFeesUsd: 10,
      gasUsd: 20
    };

    const decision = evaluatePlan(sim, defaultConfig);
    
    // Score should be expectedNetUsd / gasUsd
    const expectedScore = decision.expectedNetUsd / 20;
    expect(decision.score).to.be.closeTo(expectedScore, 0.001);
  });

  it('handles missing gas values by estimating from gas units', () => {
    const sim: SimulationResult = {
      feesToken0Usd: 100,
      feesToken1Usd: 100,
      flashloanFeesUsd: 10,
      estimatedGas: 200000,
      gasPriceGwei: 50,
      ethUsdPrice: 2000
    };

    const decision = evaluatePlan(sim, defaultConfig);
    
    // Gas cost should be: 200000 * 50 / 1e9 * 2000 = 20 USD
    expect(decision.accept).to.be.true;
    expect(decision.expectedNetUsd).to.be.greaterThan(25);
  });

  it('uses gasUsd when provided over calculation', () => {
    const sim: SimulationResult = {
      feesToken0Usd: 100,
      feesToken1Usd: 100,
      flashloanFeesUsd: 10,
      gasUsd: 15, // Explicit gas cost
      estimatedGas: 200000, // Should be ignored
      gasPriceGwei: 50,
      ethUsdPrice: 2000
    };

    const decision = evaluatePlan(sim, defaultConfig);
    
    // Should use gasUsd = 15, not calculated value
    const expectedNet = (200 - 10) * 0.7 * 0.35 - 15;
    expect(decision.expectedNetUsd).to.be.closeTo(expectedNet, 0.001);
  });

  it('handles edge case with zero gas cost', () => {
    const sim: SimulationResult = {
      feesToken0Usd: 100,
      feesToken1Usd: 100,
      flashloanFeesUsd: 10,
      gasUsd: 0
    };

    const decision = evaluatePlan(sim, defaultConfig);
    
    // Score denominator should default to 1 when gas is 0
    expect(decision.score).to.equal(decision.expectedNetUsd);
  });

  it('respects custom config values', () => {
    const customConfig: ProfitabilityConfig = {
      minProfitUsd: 50,
      captureFraction: 0.8,
      inclusionProbability: 0.5
    };

    const sim: SimulationResult = {
      feesToken0Usd: 100,
      feesToken1Usd: 100,
      flashloanFeesUsd: 10,
      gasUsd: 20
    };

    const decision = evaluatePlan(sim, customConfig);
    
    // Expected: (200 - 10) * 0.8 * 0.5 - 20 = 190 * 0.4 - 20 = 76 - 20 = 56 (above 50)
    expect(decision.accept).to.be.true;
    expect(decision.expectedNetUsd).to.be.closeTo(56, 0.001);
  });
});