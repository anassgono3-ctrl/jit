import { describe, it } from 'mocha';
import { expect } from 'chai';
import * as metrics from '../../src/metrics';

describe('Mempool WebSocket/HTTP Features', () => {
  it('should have mempool metrics defined', () => {
    expect(metrics.mempoolEnabled).to.exist;
    expect(metrics.mempoolMode).to.exist;
    expect(metrics.setMempoolStatus).to.be.a('function');
  });

  it('should set mempool status for WS mode correctly', () => {
    metrics.setMempoolStatus(true, 1);
    expect(metrics.lastMempoolStatus.enabled).to.equal(true);
    expect(metrics.lastMempoolStatus.mode).to.equal(1);
  });

  it('should set mempool status for polling mode correctly', () => {
    metrics.setMempoolStatus(true, 2);
    expect(metrics.lastMempoolStatus.enabled).to.equal(true);
    expect(metrics.lastMempoolStatus.mode).to.equal(2);
  });

  it('should set mempool status for disabled mode correctly', () => {
    metrics.setMempoolStatus(false, 0);
    expect(metrics.lastMempoolStatus.enabled).to.equal(false);
    expect(metrics.lastMempoolStatus.mode).to.equal(0);
  });

  it('should export MempoolStatus type', () => {
    const status: metrics.MempoolStatus = { enabled: true, mode: 1 };
    expect(status.enabled).to.equal(true);
    expect(status.mode).to.equal(1);
  });
});
