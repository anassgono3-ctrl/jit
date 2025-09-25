import { expect } from 'chai';
import {
  liquidityFromToken0,
  liquidityFromToken1,
  liquidityForAmounts,
  getAmount0FromLiquidity,
  getAmount1FromLiquidity,
  getAmountsFromLiquidity,
  addLiquidity,
  subtractLiquidity,
} from '../../src/math/liquidity_math';
import { getSqrtRatioAtTick } from '../../src/math/tick_math';

describe('LiquidityMath', () => {
  // Common test values - using realistic Uniswap V3 scale
  const sqrtRatioAtTick_100 = getSqrtRatioAtTick(-100).toString(); // Below current
  const sqrtRatioAtTick0 = getSqrtRatioAtTick(0).toString();       // Current price
  const sqrtRatioAtTick100 = getSqrtRatioAtTick(100).toString();   // Above current

  describe('liquidityFromToken0', () => {
    it('should calculate liquidity correctly when current price < upper price', () => {
      const amount0 = '1000000000000000000'; // 1 ETH (18 decimals)
      const sqrtP = sqrtRatioAtTick0;
      const sqrtUpper = sqrtRatioAtTick100;

      const liquidity = liquidityFromToken0(amount0, sqrtP, sqrtUpper);
      expect(liquidity).to.be.a('string');
      expect(Number(liquidity)).to.be.greaterThan(0);
    });

    it('should throw when current price >= upper price', () => {
      const amount0 = '1000000000000000000';
      const sqrtP = sqrtRatioAtTick100;
      const sqrtUpper = sqrtRatioAtTick0; // Upper < current

      expect(() => liquidityFromToken0(amount0, sqrtP, sqrtUpper)).to.throw();
    });

    it('should handle zero amount', () => {
      const amount0 = '0';
      const sqrtP = sqrtRatioAtTick0;
      const sqrtUpper = sqrtRatioAtTick100;

      const liquidity = liquidityFromToken0(amount0, sqrtP, sqrtUpper);
      expect(liquidity).to.equal('0');
    });

    it('should be proportional to amount0', () => {
      const amount0_1 = '1000000000000000000';
      const amount0_2 = '2000000000000000000';
      const sqrtP = sqrtRatioAtTick0;
      const sqrtUpper = sqrtRatioAtTick100;

      const liquidity1 = liquidityFromToken0(amount0_1, sqrtP, sqrtUpper);
      const liquidity2 = liquidityFromToken0(amount0_2, sqrtP, sqrtUpper);

      const ratio = Number(liquidity2) / Number(liquidity1);
      expect(ratio).to.be.approximately(2, 0.001);
    });
  });

  describe('liquidityFromToken1', () => {
    it('should calculate liquidity correctly when current price > lower price', () => {
      const amount1 = '1000000000'; // 1000 USDC (6 decimals)
      const sqrtP = sqrtRatioAtTick0;
      const sqrtLower = sqrtRatioAtTick_100;

      const liquidity = liquidityFromToken1(amount1, sqrtP, sqrtLower);
      expect(liquidity).to.be.a('string');
      expect(Number(liquidity)).to.be.greaterThan(0);
    });

    it('should throw when current price <= lower price', () => {
      const amount1 = '1000000000';
      const sqrtP = sqrtRatioAtTick_100;
      const sqrtLower = sqrtRatioAtTick0; // Lower > current

      expect(() => liquidityFromToken1(amount1, sqrtP, sqrtLower)).to.throw();
    });

    it('should handle zero amount', () => {
      const amount1 = '0';
      const sqrtP = sqrtRatioAtTick0;
      const sqrtLower = sqrtRatioAtTick_100;

      const liquidity = liquidityFromToken1(amount1, sqrtP, sqrtLower);
      expect(liquidity).to.equal('0');
    });

    it('should be proportional to amount1', () => {
      const amount1_1 = '1000000000';
      const amount1_2 = '3000000000';
      const sqrtP = sqrtRatioAtTick0;
      const sqrtLower = sqrtRatioAtTick_100;

      const liquidity1 = liquidityFromToken1(amount1_1, sqrtP, sqrtLower);
      const liquidity2 = liquidityFromToken1(amount1_2, sqrtP, sqrtLower);

      const ratio = Number(liquidity2) / Number(liquidity1);
      expect(ratio).to.be.approximately(3, 0.001);
    });
  });

  describe('liquidityForAmounts', () => {
    it('should calculate liquidity when price is in range', () => {
      const amount0 = '1000000000000000000'; // 1 ETH
      const amount1 = '2000000000';          // 2000 USDC
      const sqrtLower = sqrtRatioAtTick_100;
      const sqrtP = sqrtRatioAtTick0;
      const sqrtUpper = sqrtRatioAtTick100;

      const liquidity = liquidityForAmounts(amount0, amount1, sqrtLower, sqrtP, sqrtUpper);
      expect(liquidity).to.be.a('string');
      expect(Number(liquidity)).to.be.greaterThan(0);
    });

    it('should use only token0 when price is below range', () => {
      const amount0 = '1000000000000000000';
      const amount1 = '2000000000';
      const sqrtLower = sqrtRatioAtTick0;     // Price below range
      const sqrtP = sqrtRatioAtTick_100;
      const sqrtUpper = sqrtRatioAtTick100;

      const liquidity = liquidityForAmounts(amount0, amount1, sqrtLower, sqrtP, sqrtUpper);
      const liquidityToken0Only = liquidityFromToken0(amount0, sqrtLower, sqrtUpper);
      
      expect(liquidity).to.equal(liquidityToken0Only);
    });

    it('should use only token1 when price is above range', () => {
      const amount0 = '1000000000000000000';
      const amount1 = '2000000000';
      const sqrtLower = sqrtRatioAtTick_100;
      const sqrtP = sqrtRatioAtTick100;      // Price above range
      const sqrtUpper = sqrtRatioAtTick0;

      const liquidity = liquidityForAmounts(amount0, amount1, sqrtLower, sqrtP, sqrtUpper);
      const liquidityToken1Only = liquidityFromToken1(amount1, sqrtUpper, sqrtLower);
      
      expect(liquidity).to.equal(liquidityToken1Only);
    });

    it('should throw when lower >= upper', () => {
      const amount0 = '1000000000000000000';
      const amount1 = '2000000000';
      const sqrtLower = sqrtRatioAtTick100;
      const sqrtP = sqrtRatioAtTick0;
      const sqrtUpper = sqrtRatioAtTick_100; // Upper < lower

      expect(() => liquidityForAmounts(amount0, amount1, sqrtLower, sqrtP, sqrtUpper)).to.throw();
    });
  });

  describe('getAmount0FromLiquidity', () => {
    it('should calculate token0 amount correctly', () => {
      const liquidity = '1000000000000000000000';
      const sqrtP = sqrtRatioAtTick0;
      const sqrtUpper = sqrtRatioAtTick100;

      const amount0 = getAmount0FromLiquidity(liquidity, sqrtP, sqrtUpper);
      expect(amount0).to.be.a('string');
      expect(Number(amount0)).to.be.greaterThan(0);
    });

    it('should return 0 when current price >= upper price', () => {
      const liquidity = '1000000000000000000000';
      const sqrtP = sqrtRatioAtTick100;
      const sqrtUpper = sqrtRatioAtTick0; // Upper <= current

      const amount0 = getAmount0FromLiquidity(liquidity, sqrtP, sqrtUpper);
      expect(amount0).to.equal('0');
    });

    it('should be proportional to liquidity', () => {
      const liquidity1 = '1000000000000000000000';
      const liquidity2 = '2500000000000000000000';
      const sqrtP = sqrtRatioAtTick0;
      const sqrtUpper = sqrtRatioAtTick100;

      const amount0_1 = getAmount0FromLiquidity(liquidity1, sqrtP, sqrtUpper);
      const amount0_2 = getAmount0FromLiquidity(liquidity2, sqrtP, sqrtUpper);

      const ratio = Number(amount0_2) / Number(amount0_1);
      expect(ratio).to.be.approximately(2.5, 0.001);
    });
  });

  describe('getAmount1FromLiquidity', () => {
    it('should calculate token1 amount correctly', () => {
      const liquidity = '1000000000000000000000';
      const sqrtP = sqrtRatioAtTick0;
      const sqrtLower = sqrtRatioAtTick_100;

      const amount1 = getAmount1FromLiquidity(liquidity, sqrtP, sqrtLower);
      expect(amount1).to.be.a('string');
      expect(Number(amount1)).to.be.greaterThan(0);
    });

    it('should return 0 when current price <= lower price', () => {
      const liquidity = '1000000000000000000000';
      const sqrtP = sqrtRatioAtTick_100;
      const sqrtLower = sqrtRatioAtTick0; // Lower >= current

      const amount1 = getAmount1FromLiquidity(liquidity, sqrtP, sqrtLower);
      expect(amount1).to.equal('0');
    });

    it('should be proportional to liquidity', () => {
      const liquidity1 = '1000000000000000000000';
      const liquidity2 = '1500000000000000000000';
      const sqrtP = sqrtRatioAtTick0;
      const sqrtLower = sqrtRatioAtTick_100;

      const amount1_1 = getAmount1FromLiquidity(liquidity1, sqrtP, sqrtLower);
      const amount1_2 = getAmount1FromLiquidity(liquidity2, sqrtP, sqrtLower);

      const ratio = Number(amount1_2) / Number(amount1_1);
      expect(ratio).to.be.approximately(1.5, 0.001);
    });
  });

  describe('getAmountsFromLiquidity', () => {
    it('should return both amounts correctly', () => {
      const liquidity = '1000000000000000000000';
      const sqrtLower = sqrtRatioAtTick_100;
      const sqrtP = sqrtRatioAtTick0;
      const sqrtUpper = sqrtRatioAtTick100;

      const { amount0, amount1 } = getAmountsFromLiquidity(liquidity, sqrtLower, sqrtP, sqrtUpper);
      
      expect(amount0).to.be.a('string');
      expect(amount1).to.be.a('string');
      expect(Number(amount0)).to.be.greaterThan(0);
      expect(Number(amount1)).to.be.greaterThan(0);

      // Verify consistency with individual functions
      const expectedAmount0 = getAmount0FromLiquidity(liquidity, sqrtP, sqrtUpper);
      const expectedAmount1 = getAmount1FromLiquidity(liquidity, sqrtP, sqrtLower);
      
      expect(amount0).to.equal(expectedAmount0);
      expect(amount1).to.equal(expectedAmount1);
    });
  });

  describe('Round trip consistency', () => {
    it('should maintain consistency: amount -> liquidity -> amount', () => {
      const originalAmount0 = '1000000000000000000';
      const originalAmount1 = '2000000000';
      const sqrtLower = sqrtRatioAtTick_100;
      const sqrtP = sqrtRatioAtTick0;
      const sqrtUpper = sqrtRatioAtTick100;

      // Convert amounts to liquidity
      const liquidity = liquidityForAmounts(originalAmount0, originalAmount1, sqrtLower, sqrtP, sqrtUpper);
      
      // Convert liquidity back to amounts
      const { amount0, amount1 } = getAmountsFromLiquidity(liquidity, sqrtLower, sqrtP, sqrtUpper);

      // Check that we get amounts that don't exceed original amounts
      // (Due to the min() operation in liquidityForAmounts, we might not use all of both tokens)
      expect(Number(amount0)).to.be.lte(Number(originalAmount0));
      expect(Number(amount1)).to.be.lte(Number(originalAmount1));
      
      // At least one amount should be close to the original (the limiting one)
      const amount0Ratio = Number(amount0) / Number(originalAmount0);
      const amount1Ratio = Number(amount1) / Number(originalAmount1);
      
      expect(Math.max(amount0Ratio, amount1Ratio)).to.be.greaterThan(0.99);
    });
  });

  describe('addLiquidity and subtractLiquidity', () => {
    it('should add liquidity correctly', () => {
      const liquidity1 = '1000000000000000000000';
      const liquidity2 = '500000000000000000000';
      
      const sum = addLiquidity(liquidity1, liquidity2);
      expect(sum).to.equal('1500000000000000000000');
    });

    it('should subtract liquidity correctly', () => {
      const liquidity1 = '1000000000000000000000';
      const liquidity2 = '300000000000000000000';
      
      const difference = subtractLiquidity(liquidity1, liquidity2);
      expect(difference).to.equal('700000000000000000000');
    });

    it('should return 0 when subtracting larger amount', () => {
      const liquidity1 = '500000000000000000000';
      const liquidity2 = '800000000000000000000';
      
      const difference = subtractLiquidity(liquidity1, liquidity2);
      expect(difference).to.equal('0');
    });

    it('should handle zero values', () => {
      const liquidity1 = '1000000000000000000000';
      const zero = '0';
      
      expect(addLiquidity(liquidity1, zero)).to.equal(liquidity1);
      expect(addLiquidity(zero, liquidity1)).to.equal(liquidity1);
      expect(subtractLiquidity(liquidity1, zero)).to.equal(liquidity1);
      expect(subtractLiquidity(zero, liquidity1)).to.equal('0');
    });
  });
});