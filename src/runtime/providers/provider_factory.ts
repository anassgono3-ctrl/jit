// src/runtime/providers/provider_factory.ts
/**
 * Provider factory that consumes normalized endpoints from config (RpcEndpoint[]).
 * Adapts to a failover provider (if available), or returns a single JsonRpcProvider.
 */

import { JsonRpcProvider } from 'ethers';
import config, { RpcEndpoint } from '../../config';
import logger from '../../modules/logger';
// If you have a real failover provider implementation, import it here:
// import { createFailoverProvider } from './failover_provider';

function toEndpoints(): RpcEndpoint[] {
  const list = config.RPC_HTTP_LIST || [];
  if (list.length > 0) {
    return list.map((ep) => ({
      url: ep.url,
      weight: typeof ep.weight === 'number' && ep.weight > 0 ? ep.weight : 1,
    }));
  }
  const fallback: RpcEndpoint[] = [];
  if (config.ERIGON_RPC_HTTP) fallback.push({ url: config.ERIGON_RPC_HTTP, weight: 2 });
  if (config.FALLBACK_RPC_HTTP) fallback.push({ url: config.FALLBACK_RPC_HTTP, weight: 1 });
  return fallback;
}

export function makeProviderFactory(): JsonRpcProvider {
  const endpoints = toEndpoints();

  if (endpoints.length === 0) {
    throw new Error('No RPC endpoints configured (RPC_HTTP_LIST empty and no ERIGON/FALLBACK RPC provided)');
  }

  // If you have a failover provider:
  // return createFailoverProvider(endpoints);

  // Simple default: use first endpoint
  const primary = endpoints[0].url;
  logger.info({ module: 'provider.factory', endpointCount: endpoints.length, primary }, 'Using primary RPC endpoint');
  return new JsonRpcProvider(primary);
}