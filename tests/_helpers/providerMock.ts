// tests/_helpers/providerMock.ts
// Stubs ethers' JsonRpcProvider.detectNetwork() to avoid real-network checks during tests.

import sinon from 'sinon';
import { JsonRpcProvider } from 'ethers';

let restoreFn: (() => void) | undefined;

export function stubJsonRpcProviderDetectNetwork() {
  const proto = (JsonRpcProvider as any).prototype;
  if (!proto || typeof proto.detectNetwork !== 'function') {
    // Nothing to stub; return a no-op restore.
    return () => {};
  }
  const stub = sinon.stub(proto, 'detectNetwork').callsFake(async function () {
    // Return a harmless "mainnet" shape; consumers usually just check existence.
    return { chainId: 1, name: 'homestead' };
  });
  restoreFn = () => {
    stub.restore();
    restoreFn = undefined;
  };
  return restoreFn;
}

export function restoreJsonRpcProviderDetectNetwork() {
  if (restoreFn) {
    restoreFn();
  }
}