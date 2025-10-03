import { expect } from 'chai';
import { startPendingSwapWatcher } from '../../src/runtime/mempool/strategy/pendingSwapWatcher';
import { setMempoolStatus, lastMempoolStatus } from '../../src/metrics';
import { ethers } from 'ethers';

class MockHttpProvider extends ethers.JsonRpcProvider {
  private failFilter: boolean;
  private lostAfter: number;
  private calls = 0;
  constructor(failFilter: boolean, lostAfter = -1) {
    super();
    this.failFilter = failFilter;
    this.lostAfter = lostAfter;
  }
  async send(method: string, params: any[]): Promise<any> {
    if (method === 'eth_newPendingTransactionFilter') {
      if (this.failFilter) {
        throw new Error('method not supported');
      }
      return '0xdeadbeef';
    }
    if (method === 'eth_getFilterChanges') {
      this.calls++;
      if (this.lostAfter > -1 && this.calls > this.lostAfter) {
        throw new Error('filter not found');
      }
      return [];
    }
    if (method === 'eth_uninstallFilter') {
      return true;
    }
    return super.send(method, params);
  }
}

describe('mempool external RPC fallback', () => {
  it('disables when filter not supported', async () => {
    const provider = new MockHttpProvider(true);
    const signer = ethers.Wallet.createRandom();
    startPendingSwapWatcher({
      provider,
      signer,
      pollMs: 50,
      maxFilterResets: 1
    });
    // allow async setup
    await new Promise(r => setTimeout(r, 150));
    expect(lastMempoolStatus.enabled).to.equal(false);
  });

  it('attempts resets then disables after repeated loss', async () => {
    const provider = new MockHttpProvider(false, 0); // lose immediately on first call
    const signer = ethers.Wallet.createRandom();
    const stop = startPendingSwapWatcher({
      provider,
      signer,
      pollMs: 100,
      maxFilterResets: 1
    });
    // Wait for: startPollingMode promise + first poll (100ms) + loss + reset + second poll (100ms) + second loss + disable
    // Total needed: ~400ms minimum, we wait 2000ms to be safe
    await new Promise(r => setTimeout(r, 2000));
    expect(lastMempoolStatus.enabled).to.equal(false);
    stop(); // cleanup
  });
});
