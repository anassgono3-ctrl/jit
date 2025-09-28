// tests/_helpers/providerMock.ts
// Stubs ethers' JsonRpcProvider._detectNetwork() to avoid real-network checks during tests.

import { JsonRpcProvider } from 'ethers';

let originalDetectNetwork: Function | undefined;

export function stubJsonRpcProviderDetectNetwork() {
  const proto = (JsonRpcProvider as any).prototype;
  if (!proto || typeof proto._detectNetwork !== 'function') {
    // Nothing to stub; return a no-op restore.
    return () => {};
  }
  
  // Store original method
  originalDetectNetwork = proto._detectNetwork;
  
  // Replace with stub
  proto._detectNetwork = async function () {
    // Return a harmless "mainnet" shape; consumers usually just check existence.
    return { chainId: 1, name: 'homestead' };
  };
  
  return () => {
    if (originalDetectNetwork) {
      proto._detectNetwork = originalDetectNetwork;
      originalDetectNetwork = undefined;
    }
  };
}

export function restoreJsonRpcProviderDetectNetwork() {
  if (originalDetectNetwork) {
    const proto = (JsonRpcProvider as any).prototype;
    proto._detectNetwork = originalDetectNetwork;
    originalDetectNetwork = undefined;
  }
}