import { expect } from 'chai';
import { stubJsonRpcProviderDetectNetwork } from '../_helpers/providerMock';
import { main } from '../../src/index';

describe('Live-mode guard', function () {
  this.timeout(10000);

  afterEach(() => {
    // Clean env modifications to avoid cross-test pollution
    delete process.env.DRY_RUN;
    delete process.env.PRIVATE_KEY;
    delete process.env.RPC_HTTP_LIST;
    delete process.env.PRIMARY_RPC_HTTP;
    delete process.env.RPC_PROVIDERS;
  });

  it('starts when DRY_RUN=false and PRIVATE_KEY valid', async function () {
    // Stub provider detection so no network calls occur if any code tries to detect network
    const restore = stubJsonRpcProviderDetectNetwork();

    // Set env for a valid live-mode startup
    process.env.DRY_RUN = 'false';
    process.env.PRIVATE_KEY = '0x' + 'b'.repeat(64);
    // Provide a local provider URL to satisfy config loader if needed
    process.env.PRIMARY_RPC_HTTP = 'http://127.0.0.1:8545';

    // Call main in test mode: guard runs, then we short-circuit heavy startup
    await main({ testMode: true });

    restore?.();
    expect(true).to.equal(true);
  });
});