import { expect } from 'chai';
import { Backoff, withRetry } from '../../src/runtime/retry/backoff';

describe('Backoff', () => {
  it('generates increasing delays', () => {
    const backoff = new Backoff({ baseMs: 100, factor: 2, jitter: false });
    
    expect(backoff.next()).to.equal(100);
    expect(backoff.next()).to.equal(200);
    expect(backoff.next()).to.equal(400);
  });

  it('respects maximum delay', () => {
    const backoff = new Backoff({ baseMs: 100, factor: 2, maxMs: 250, jitter: false });
    
    backoff.next(); // 100
    backoff.next(); // 200
    const third = backoff.next(); // Should be capped at 250
    expect(third).to.equal(250);
  });

  it('adds jitter when enabled', () => {
    const backoff = new Backoff({ baseMs: 1000, jitter: true });
    const delays = [backoff.next(), backoff.next(), backoff.next()];
    
    // All should be different due to jitter
    const uniqueDelays = new Set(delays);
    expect(uniqueDelays.size).to.equal(delays.length);
    
    // All should be within reasonable bounds (first call should be around base)
    expect(delays[0]).to.be.greaterThan(850); // ~15% below base
    expect(delays[0]).to.be.lessThan(1150); // ~15% above base
    
    // Later calls will be higher due to exponential backoff
    delays.forEach(delay => {
      expect(delay).to.be.greaterThan(0);
      expect(delay).to.be.lessThan(10000); // Reasonable upper bound
    });
  });

  it('resets attempt counter', () => {
    const backoff = new Backoff({ baseMs: 100, jitter: false });
    
    expect(backoff.next()).to.equal(100);
    expect(backoff.next()).to.equal(200);
    
    backoff.reset();
    expect(backoff.next()).to.equal(100);
  });

  it('respects max attempts', () => {
    const backoff = new Backoff({ maxAttempts: 2 });
    
    backoff.next(); // Attempt 1
    backoff.next(); // Attempt 2
    
    expect(() => backoff.next()).to.throw(/Maximum retry attempts/);
  });

  it('tracks attempt count', () => {
    const backoff = new Backoff();
    
    expect(backoff.getAttempt()).to.equal(0);
    backoff.next();
    expect(backoff.getAttempt()).to.equal(1);
    backoff.next();
    expect(backoff.getAttempt()).to.equal(2);
  });
});

describe('withRetry', () => {
  it('succeeds on first attempt', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      return 'success';
    };
    
    const result = await withRetry(fn);
    expect(result).to.equal('success');
    expect(callCount).to.equal(1);
  });

  it('retries on failure', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error('fail');
      }
      return 'eventual success';
    };
    
    const result = await withRetry(fn, { baseMs: 1, maxAttempts: 5 });
    expect(result).to.equal('eventual success');
    expect(callCount).to.equal(3);
  });

  it('throws last error when max attempts exceeded', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      throw new Error(`fail ${callCount}`);
    };
    
    try {
      await withRetry(fn, { maxAttempts: 2, baseMs: 1 });
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).to.equal('fail 2');
    }
    expect(callCount).to.equal(2);
  });
});
