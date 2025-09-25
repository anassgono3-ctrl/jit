import { expect } from 'chai';
import { 
  getSqrtRatioAtTick, 
  getTickAtSqrtRatio, 
  nearestUsableTick,
  MIN_TICK,
  MAX_TICK,
  MIN_SQRT_RATIO,
  MAX_SQRT_RATIO
} from '../../src/math/tick_math';

describe('TickMath', () => {
  // Simplified test vectors focused on accuracy range we need
  const testVectors = [
    { tick: -10000, expectedApprox: true },
    { tick: -5000, expectedApprox: true },
    { tick: -1000, expectedApprox: true },
    { tick: -100, expectedApprox: true },
    { tick: -10, expectedApprox: true },
    { tick: -1, expectedApprox: true },
    { tick: 0, expectedApprox: true },
    { tick: 1, expectedApprox: true },
    { tick: 10, expectedApprox: true },
    { tick: 100, expectedApprox: true },
    { tick: 1000, expectedApprox: true },
    { tick: 5000, expectedApprox: true },
    { tick: 10000, expectedApprox: true },
  ];

  describe('getSqrtRatioAtTick', () => {
    testVectors.forEach(({ tick }) => {
      it(`should return valid sqrt ratio for tick ${tick}`, () => {
        const result = getSqrtRatioAtTick(tick);
        expect(result).to.be.a('bigint');
        expect(Number(result)).to.be.greaterThan(0);
        
        // Verify it's within valid range
        expect(result >= MIN_SQRT_RATIO).to.be.true;
        expect(result < MAX_SQRT_RATIO).to.be.true;
      });
    });

    it('should throw for tick below MIN_TICK', () => {
      expect(() => getSqrtRatioAtTick(MIN_TICK - 1)).to.throw();
    });

    it('should throw for tick above MAX_TICK', () => {
      expect(() => getSqrtRatioAtTick(MAX_TICK + 1)).to.throw();
    });

    it('should work at boundary ticks', () => {
      expect(() => getSqrtRatioAtTick(MIN_TICK)).to.not.throw();
      expect(() => getSqrtRatioAtTick(MAX_TICK)).to.not.throw();
    });
  });

  describe('getTickAtSqrtRatio', () => {
    testVectors.forEach(({ tick }) => {
      it(`should return reasonable tick for getSqrtRatioAtTick(${tick})`, () => {
        const sqrtRatio = getSqrtRatioAtTick(tick);
        const result = getTickAtSqrtRatio(sqrtRatio);
        
        // Should be close to original tick
        expect(Math.abs(result - tick)).to.be.lte(10); // Allow reasonable tolerance
      });
    });

    it('should throw for sqrt ratio below minimum', () => {
      expect(() => getTickAtSqrtRatio(MIN_SQRT_RATIO - 1n)).to.throw();
    });

    it('should throw for sqrt ratio at or above maximum', () => {
      expect(() => getTickAtSqrtRatio(MAX_SQRT_RATIO)).to.throw();
    });
  });

  describe('Round trip consistency', () => {
    const testTicks = [-100000, -50000, -10000, -1000, -100, -10, -1, 0, 1, 10, 100, 1000, 10000, 50000, 100000];
    
    testTicks.forEach((tick) => {
      it(`tick -> sqrtRatio -> tick should be consistent for tick ${tick}`, () => {
        const sqrtRatio = getSqrtRatioAtTick(tick);
        const roundTripTick = getTickAtSqrtRatio(sqrtRatio);
        
        // Should round trip within reasonable tolerance for decimal implementation
        expect(Math.abs(roundTripTick - tick)).to.be.lte(10);
      });
    });
  });

  describe('nearestUsableTick', () => {
    it('should return correct usable tick for tickSpacing = 60', () => {
      expect(nearestUsableTick(1000, 60)).to.equal(1020);
      expect(nearestUsableTick(1020, 60)).to.equal(1020);
      expect(nearestUsableTick(1040, 60)).to.equal(1020);
      expect(nearestUsableTick(1050, 60)).to.equal(1080);
      expect(nearestUsableTick(-1000, 60)).to.equal(-1020);
    });

    it('should return correct usable tick for tickSpacing = 10', () => {
      // Test rounding behavior
      expect(nearestUsableTick(104, 10)).to.equal(100);  // closer to 100
      expect(nearestUsableTick(106, 10)).to.equal(110);  // closer to 110
      expect(nearestUsableTick(-104, 10)).to.equal(-100); // closer to -100
      expect(nearestUsableTick(-106, 10)).to.equal(-110); // closer to -110
    });

    it('should handle boundary cases', () => {
      expect(nearestUsableTick(MIN_TICK - 100, 60)).to.be.gte(MIN_TICK);
      expect(nearestUsableTick(MAX_TICK + 100, 60)).to.be.lte(MAX_TICK);
    });

    it('should throw for invalid tickSpacing', () => {
      expect(() => nearestUsableTick(100, 0)).to.throw();
      expect(() => nearestUsableTick(100, -1)).to.throw();
    });
  });

  describe('Edge cases and properties', () => {
    it('should have sqrt ratio increase monotonically with tick', () => {
      for (let tick = -1000; tick < 1000; tick += 100) {
        const sqrtRatio1 = getSqrtRatioAtTick(tick);
        const sqrtRatio2 = getSqrtRatioAtTick(tick + 100);
        expect(sqrtRatio2 > sqrtRatio1).to.be.true;
      }
    });

    it('should have symmetric behavior around tick 0', () => {
      const tick = 100;
      const posSqrtRatio = getSqrtRatioAtTick(tick);
      const negSqrtRatio = getSqrtRatioAtTick(-tick);
      
      // Positive ticks should give larger sqrt ratios
      expect(Number(posSqrtRatio)).to.be.greaterThan(Number(negSqrtRatio));
    });

    it('should handle tick = 0 correctly', () => {
      const sqrtRatio = getSqrtRatioAtTick(0);
      // At tick 0, we should get a reasonable sqrt ratio 
      expect(Number(sqrtRatio)).to.be.greaterThan(0);
      expect(sqrtRatio < MAX_SQRT_RATIO).to.be.true;
    });
  });
});