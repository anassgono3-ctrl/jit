// If this helper already exists, keep it. If not, add this version that safely stubs either
// _detectNetwork (repo's current usage) or detectNetwork (future-proof).

import { JsonRpcProvider } from 'ethers';

let restoreFn: (() => void) | undefined;

export function stubJsonRpcProviderDetectNetwork() {
  const proto: any = (JsonRpcProvider as any).prototype;
  const methodName = typeof proto._detectNetwork === 'function' ? '_detectNetwork'
                   : typeof proto.detectNetwork === 'function' ? 'detectNetwork'
                   : undefined;

  if (!methodName) return () => {};

  const original = proto[methodName];
  proto[methodName] = async function () {
    return { chainId: 1, name: 'homestead' };
  };

  restoreFn = () => {
    proto[methodName] = original;
    restoreFn = undefined;
  };
  return restoreFn;
}

export function restoreJsonRpcProviderDetectNetwork() {
  if (restoreFn) restoreFn();
}