import { expect } from 'chai';
import { createPoolState, PoolConfig } from '../../src/sim/pool_state';
import { applySwap, estimateSwapOutput } from '../../src/sim/swap_engine';
import { getSqrtRatioAtTick } from '../../src/math/tick_math';

describe('SwapEngine', () => {
  let poolConfig: PoolConfig;
  
  before(() => {
    poolConfig = {
      address: '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8',
      token0: '0xA0b86991c431E56C2e07E8F5c25fe64a7Bc11b3A', // USDC
      token1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      fee: 3000, // 0.3%
      tickSpacing: 60,
      decimals0: 6,
      decimals1: 18,
    };
  });

  describe('applySwap', () => {
    it('should execute a simple swap successfully', () => {
      const initialSqrtPrice = getSqrtRatioAtTick(0).toString();
      const poolState = createPoolState(
        poolConfig,
        initialSqrtPrice,
        0,
        '1000000000000000000000' // 1000e18 liquidity
      );

      const swapResult = applySwap(
        poolState,
        '1000000', // 1 USDC
        'token0'
      );

      expect(swapResult).to.not.be.null;
      expect(swapResult.amountIn).to.be.a('string');
      expect(swapResult.amountOut).to.be.a('string');
      expect(Number(swapResult.amountIn)).to.be.greaterThan(0);
      expect(Number(swapResult.amountOut)).to.be.greaterThan(0);
    });

    it('should update pool state after swap', () => {
      const initialSqrtPrice = getSqrtRatioAtTick(0).toString();
      const poolState = createPoolState(
        poolConfig,
        initialSqrtPrice,
        0,
        '1000000000000000000000'
      );

      const initialTick = poolState.slot0.tick;
      const initialPrice = poolState.slot0.sqrtPriceX96;

      applySwap(poolState, '1000000', 'token0');

      // Price should have changed
      expect(poolState.slot0.sqrtPriceX96).to.not.equal(initialPrice);
      
      // Tick may have changed depending on price movement
      expect(poolState.slot0.tick).to.be.a('number');
    });

    it('should handle zero amount input', () => {
      const initialSqrtPrice = getSqrtRatioAtTick(0).toString();
      const poolState = createPoolState(
        poolConfig,
        initialSqrtPrice,
        0,
        '1000000000000000000000'
      );

      expect(() => applySwap(poolState, '0', 'token0')).to.throw();
    });

    it('should handle no liquidity scenario', () => {
      const initialSqrtPrice = getSqrtRatioAtTick(0).toString();
      const poolState = createPoolState(
        poolConfig,
        initialSqrtPrice,
        0,
        '0' // No liquidity
      );

      expect(() => applySwap(poolState, '1000000', 'token0')).to.throw();
    });
  });

  describe('estimateSwapOutput', () => {
    it('should estimate swap output without modifying state', () => {
      const initialSqrtPrice = getSqrtRatioAtTick(0).toString();
      const poolState = createPoolState(
        poolConfig,
        initialSqrtPrice,
        0,
        '1000000000000000000000'
      );

      const originalState = JSON.parse(JSON.stringify(poolState));
      
      const estimatedOutput = estimateSwapOutput(
        poolState,
        '1000000',
        'token0'
      );

      expect(estimatedOutput).to.be.a('string');
      expect(Number(estimatedOutput)).to.be.greaterThan(0);
      
      // State should be unchanged
      expect(poolState.slot0.sqrtPriceX96).to.equal(originalState.slot0.sqrtPriceX96);
      expect(poolState.slot0.tick).to.equal(originalState.slot0.tick);
    });

    it('should return zero for invalid swaps', () => {
      const initialSqrtPrice = getSqrtRatioAtTick(0).toString();
      const poolState = createPoolState(
        poolConfig,
        initialSqrtPrice,
        0,
        '0' // No liquidity
      );

      const estimatedOutput = estimateSwapOutput(
        poolState,
        '1000000',
        'token0'
      );

      expect(estimatedOutput).to.equal('0');
    });
  });

  describe('Integration with different scenarios', () => {
    it('should handle swaps in both directions', () => {
      const initialSqrtPrice = getSqrtRatioAtTick(0).toString();
      const poolState1 = createPoolState(
        poolConfig,
        initialSqrtPrice,
        0,
        '1000000000000000000000'
      );
      
      const poolState2 = createPoolState(
        poolConfig,
        initialSqrtPrice,
        0,
        '1000000000000000000000'
      );

      // Swap token0 for token1
      const result1 = applySwap(poolState1, '1000000', 'token0');
      
      // Swap token1 for token0
      const result2 = applySwap(poolState2, '1000000000000000000', 'token1');

      expect(Number(result1.amountOut)).to.be.greaterThan(0);
      expect(Number(result2.amountOut)).to.be.greaterThan(0);
      
      // Prices should move in opposite directions
      expect(poolState1.slot0.sqrtPriceX96).to.not.equal(poolState2.slot0.sqrtPriceX96);
    });

    it('should accumulate fees properly', () => {
      const initialSqrtPrice = getSqrtRatioAtTick(0).toString();
      const poolState = createPoolState(
        poolConfig,
        initialSqrtPrice,
        0,
        '1000000000000000000000'
      );

      const initialFeeGrowth0 = poolState.feeGrowthGlobal0X128;
      const initialFeeGrowth1 = poolState.feeGrowthGlobal1X128;

      const result = applySwap(poolState, '1000000', 'token0');

      expect(Number(result.feeAmount)).to.be.greaterThan(0);
      
      // Fee growth should increase for the input token
      expect(poolState.feeGrowthGlobal0X128).to.not.equal(initialFeeGrowth0);
    });
  });
});