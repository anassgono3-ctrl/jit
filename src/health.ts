// src/health.ts
import http from 'http';
import { registry } from './metrics';
import logger from './modules/logger';
import { loadConfig } from './config';

export function startHealthServer(port: number): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url?.startsWith('/metrics')) {
        const metrics = await registry.metrics();
        res.writeHead(200, { 'Content-Type': registry.contentType });
        res.end(metrics);
        return;
      }

      if (req.url?.startsWith('/healthz')) {
        const cfg = loadConfig();
        // Minimal readiness check: PRIVATE_KEY present when DRY_RUN=false
        const ok = cfg.DRY_RUN || Boolean(cfg.PRIVATE_KEY);
        const body = JSON.stringify({ ok, dryRun: cfg.DRY_RUN === true });
        res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(body);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } catch (e) {
      logger.error({ err: e }, '[health] request failed');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false }));
    }
  });

  server.listen(port, () => {
    logger.info({ port }, '[health] server listening');
  });

  return server;
}
