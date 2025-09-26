import http from 'node:http';
import { log } from '../modules/logger';

export interface HealthState {
  erigon: boolean;
  fallback: boolean;
  startedAt: number;
  lastBlock?: number;
  recentSwapCandidates: number;
  totalAttempts?: number;
  totalSuccesses?: number;
  configSummary?: Record<string, unknown>;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: {
    seconds: number;
    human: string;
  };
  mempool: {
    erigon: boolean;
    fallback: boolean;
    mode: string;
  };
  blockchain: {
    lastBlock?: number;
    syncStatus?: string;
  };
  activity: {
    recentSwapCandidates: number;
    totalAttempts?: number;
    totalSuccesses?: number;
    successRate?: string;
  };
  config?: Record<string, unknown>;
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

function determineStatus(state: HealthState): 'ok' | 'degraded' | 'unhealthy' {
  // Unhealthy: No mempool connection
  if (!state.erigon && !state.fallback) {
    return 'unhealthy';
  }
  
  // Degraded: Only fallback working, or very old last block
  if (!state.erigon && state.fallback) {
    return 'degraded';
  }
  
  if (state.lastBlock && Date.now() - state.startedAt > 300000) { // 5 minutes
    // Check if last block is very old (more than 5 minutes behind)
    const estimatedCurrentBlock = state.lastBlock + Math.floor((Date.now() - state.startedAt) / 12000);
    if (estimatedCurrentBlock - (state.lastBlock || 0) > 25) { // More than 25 blocks behind
      return 'degraded';
    }
  }
  
  return 'ok';
}

export function createHealthHandler(getState: () => HealthState) {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (req.url !== '/health') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    try {
      const state = getState();
      const now = Date.now();
      const uptimeSeconds = Math.floor((now - state.startedAt) / 1000);
      
      const response: HealthResponse = {
        status: determineStatus(state),
        timestamp: new Date(now).toISOString(),
        uptime: {
          seconds: uptimeSeconds,
          human: formatUptime(uptimeSeconds)
        },
        mempool: {
          erigon: state.erigon,
          fallback: state.fallback,
          mode: state.erigon ? 'erigon' : state.fallback ? 'fallback' : 'none'
        },
        blockchain: {
          lastBlock: state.lastBlock
        },
        activity: {
          recentSwapCandidates: state.recentSwapCandidates,
          totalAttempts: state.totalAttempts,
          totalSuccesses: state.totalSuccesses,
          successRate: state.totalAttempts && state.totalSuccesses 
            ? `${((state.totalSuccesses / state.totalAttempts) * 100).toFixed(1)}%`
            : undefined
        },
        config: state.configSummary
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response, null, 2));
    } catch (error) {
      log.error('Health check error', { error });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'unhealthy', 
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      }));
    }
  };
}

export function startHealthServer(port: number, getState: () => HealthState): http.Server {
  const server = http.createServer(createHealthHandler(getState));
  
  server.listen(port, () => {
    log.info(`Health server listening on port ${port}`);
  });

  server.on('error', (error) => {
    log.error('Server error', { error, port });
  });

  return server;
}
