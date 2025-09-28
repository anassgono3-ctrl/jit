import { expect } from 'chai';
import { MempoolOrchestrator } from '../../src/runtime/mempool/orchestrator';

describe('Erigon mempool adapter (fixture)', () => {
  it('emits pendingSwap on feedFixture', async () => {
    // Set required config for test
    process.env.PRIMARY_RPC_HTTP = 'http://127.0.0.1:8545';
    process.env.ERIGON_RPC_HTTP = 'http://127.0.0.1:8545'; // not used live; adapter is test-driven
    
    const orch = new MempoolOrchestrator();
    await orch.start();

    let seen: any = null;
    orch.on('pendingSwap', (evt) => { 
      seen = evt; 
    });

    // Give some time for the event listener to be set up
    await new Promise(resolve => setTimeout(resolve, 10));

    orch.feedFixture({
      hash: '0xabc',
      from: '0xsender',
      to: '0xrouter',
      input: '0x1234abcd',
      gas: '21000',
      nonce: 1
    });

    // Give some time for the event to be processed
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(seen).to.not.equal(null);
    expect(seen.txHash).to.equal('0xabc');

    await orch.stop();
    
    // Clean up
    delete process.env.PRIMARY_RPC_HTTP;
    delete process.env.ERIGON_RPC_HTTP;
  });
});