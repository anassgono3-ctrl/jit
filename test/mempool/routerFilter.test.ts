import { expect } from 'chai';
import { startPendingSwapWatcher, parseRouterList } from '../../src/runtime/mempool/strategy/pendingSwapWatcher';
import { setMempoolStatus, lastMempoolStatus } from '../../src/metrics';
import { ethers } from 'ethers';

describe('router filtering', () => {
  it('parses ROUTER_ADDRS list', () => {
    process.env.ROUTER_ADDRS = '0xabc, 0xdef';
    const list = parseRouterList();
    expect(list).to.include('0xabc');
    expect(list).to.include('0xdef');
  });

  it('enables ws mode (no actual tx decode in unit test)', async () => {
    // Mock WebSocketProvider minimal shape
    class MockWs extends ethers.JsonRpcProvider {
      async getNetwork() { return { chainId: 1n, name: 'homestead' } as any; }
      async getTransaction(): Promise<any> { return null; }
    }
    // Override constructor name to fake WebSocketProvider
    Object.defineProperty(MockWs, 'name', { value: 'WebSocketProvider' });
    const provider = new MockWs();
    const signer = ethers.Wallet.createRandom();
    startPendingSwapWatcher({ provider, signer });
    expect(lastMempoolStatus.enabled).to.equal(true);
    expect(lastMempoolStatus.mode).to.equal(1);
  });
});
