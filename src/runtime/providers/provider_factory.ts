import { ethers } from 'ethers';
import { loadConfig } from '../../config';
import { FailoverProvider, createFailoverProvider, RpcEndpoint } from './failover_provider';
import { log } from '../../modules/logger';

/**
 * Create an ethers provider based on configuration
 * Supports failover, single provider, or legacy fallback patterns
 */
export function createProvider(): ethers.JsonRpcProvider {
  const config = loadConfig();

  // Option 1: Use RPC_HTTP_LIST with failover
  if (config.RPC_HTTP_LIST && config.RPC_HTTP_LIST.length > 0) {
    log.info('Creating failover provider with RPC_HTTP_LIST', {
      endpointCount: config.RPC_HTTP_LIST.length,
      endpoints: config.RPC_HTTP_LIST.map(ep => ({ url: ep.url, weight: ep.weight }))
    });
    return createFailoverProvider(config.RPC_HTTP_LIST);
  }

  // Option 2: Use RPC_PROVIDERS with failover (legacy)
  if (config.RPC_PROVIDERS && config.RPC_PROVIDERS.length > 0) {
    log.info('Creating failover provider with RPC_PROVIDERS', {
      endpointCount: config.RPC_PROVIDERS.length
    });
    return createFailoverProvider(config.RPC_PROVIDERS);
  }

  // Option 3: Use PRIMARY_RPC_HTTP with manual fallback
  if (config.PRIMARY_RPC_HTTP) {
    const endpoints: RpcEndpoint[] = [{ url: config.PRIMARY_RPC_HTTP, weight: 2 }];
    
    if (config.FALLBACK_RPC_HTTP) {
      endpoints.push({ url: config.FALLBACK_RPC_HTTP, weight: 1 });
    }

    if (endpoints.length > 1) {
      log.info('Creating failover provider with PRIMARY/FALLBACK', {
        primary: config.PRIMARY_RPC_HTTP,
        fallback: config.FALLBACK_RPC_HTTP
      });
      return createFailoverProvider(endpoints);
    } else {
      log.info('Creating single provider', { url: config.PRIMARY_RPC_HTTP });
      return new ethers.JsonRpcProvider(config.PRIMARY_RPC_HTTP);
    }
  }

  throw new Error('No RPC configuration found');
}

/**
 * Create a WebSocket provider based on configuration
 */
export function createWebSocketProvider(): ethers.WebSocketProvider | null {
  const config = loadConfig();
  
  if (config.WS_RPC_URL) {
    log.info('Creating WebSocket provider', { url: config.WS_RPC_URL });
    return new ethers.WebSocketProvider(config.WS_RPC_URL);
  }

  return null;
}

/**
 * Create an Erigon provider if configured
 */
export function createErigonProvider(): ethers.JsonRpcProvider | null {
  const config = loadConfig();
  
  if (config.ERIGON_RPC_HTTP) {
    log.info('Creating Erigon provider', { url: config.ERIGON_RPC_HTTP });
    return new ethers.JsonRpcProvider(config.ERIGON_RPC_HTTP);
  }

  return null;
}

/**
 * Get provider health information if it's a FailoverProvider
 */
export function getProviderHealth(provider: ethers.JsonRpcProvider): Record<string, unknown> | null {
  if (provider instanceof FailoverProvider) {
    return {
      type: 'failover',
      ...provider.getConfigSummary(),
      health: provider.getProviderHealthStatus()
    };
  }

  return {
    type: 'single',
    // Note: ethers JsonRpcProvider doesn't expose url property directly
    connected: true
  };
}