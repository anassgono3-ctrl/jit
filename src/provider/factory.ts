import { ethers } from 'ethers';
import logger from '../modules/logger';

export interface ProviderInfo {
  provider: ethers.Provider;
  mode: 'external' | 'fullnode';
  transport: 'ws' | 'http';
}

function isLocalHost(url: string): boolean {
  return /^(ws|http)s?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url);
}

/**
 * Decide provider based on PRIMARY_RPC_WS (preferred) else PRIMARY_RPC_HTTP / RPC_PROVIDERS[0].
 * Returns null if no RPC configured.
 * Awaits network detection to fail early if endpoint invalid.
 */
export async function buildProvider(): Promise<ProviderInfo | null> {
  const ws = process.env.PRIMARY_RPC_WS;
  const http = process.env.PRIMARY_RPC_HTTP || process.env.RPC_PROVIDERS?.split(',')?.[0];

  if (!ws && !http) return null;

  if (ws) {
    const p = new ethers.WebSocketProvider(ws);
    await p.getNetwork();
    const mode: ProviderInfo['mode'] = isLocalHost(ws) ? 'fullnode' : 'external';
    logger.info({ ws, mode }, '[provider] WebSocket provider ready');
    return { provider: p, mode, transport: 'ws' };
  }

  const p = new ethers.JsonRpcProvider(http!);
  await p.getNetwork();
  const mode: ProviderInfo['mode'] = isLocalHost(http!) ? 'fullnode' : 'external';
  logger.info({ http, mode }, '[provider] HTTP provider ready');
  return { provider: p, mode, transport: 'http' };
}
