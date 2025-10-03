import { describe, it } from 'mocha';
import { expect } from 'chai';
import { startHealthServer } from '../../src/health';
import { setMempoolStatus } from '../../src/metrics';
import http from 'http';

describe('Health Endpoint - Mempool Status', () => {
  let server: http.Server;
  const port = 9091;

  beforeEach(() => {
    // Set required env vars for health endpoint
    process.env.PRIMARY_RPC_HTTP = 'http://127.0.0.1:8545';
    process.env.DRY_RUN = 'true';
    server = startHealthServer(port);
  });

  afterEach((done) => {
    server.close(done);
    // Clean up env vars
    delete process.env.PRIMARY_RPC_HTTP;
    delete process.env.DRY_RUN;
  });

  it('should return mempool status in health endpoint', (done) => {
    setMempoolStatus(true, 1);

    http.get(`http://localhost:${port}/healthz`, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const health = JSON.parse(data);
        expect(health.mempool).to.exist;
        expect(health.mempool.enabled).to.equal(true);
        expect(health.mempool.mode).to.equal(1);
        done();
      });
    }).on('error', done);
  });

  it('should reflect disabled mempool in health endpoint', (done) => {
    setMempoolStatus(false, 0);

    http.get(`http://localhost:${port}/healthz`, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const health = JSON.parse(data);
        expect(health.mempool).to.exist;
        expect(health.mempool.enabled).to.equal(false);
        expect(health.mempool.mode).to.equal(0);
        done();
      });
    }).on('error', done);
  });

  it('should reflect polling mode in health endpoint', (done) => {
    setMempoolStatus(true, 2);

    http.get(`http://localhost:${port}/healthz`, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const health = JSON.parse(data);
        expect(health.mempool).to.exist;
        expect(health.mempool.enabled).to.equal(true);
        expect(health.mempool.mode).to.equal(2);
        done();
      });
    }).on('error', done);
  });
});
