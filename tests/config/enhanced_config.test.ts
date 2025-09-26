import { expect } from 'chai';
import { loadConfig, resetConfig, getConfigSummary } from '../../src/config';

describe('Enhanced Configuration', () => {
  beforeEach(() => {
    // Clear environment variables
    delete process.env.RPC_HTTP_LIST;
    delete process.env.GAS_BASEFEE_BUMP;
    delete process.env.PRIORITY_FEE_GWEI_MIN;
    delete process.env.PRIORITY_FEE_GWEI_MAX;
    delete process.env.FLASHBOTS_RPC_URL;
    delete process.env.SIM_TIMEOUT_MS;
    delete process.env.METRICS_PORT;
    delete process.env.PRIMARY_RPC_HTTP;
    delete process.env.RPC_PROVIDERS;
    delete process.env.FALLBACK_RPC_HTTP;
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
  });

  it('should parse RPC_HTTP_LIST as comma-separated URLs', () => {
    process.env.DRY_RUN = 'true';
    process.env.RPC_HTTP_LIST = 'https://rpc1.example.com,https://rpc2.example.com';
    
    const config = loadConfig();
    expect(config.RPC_HTTP_LIST).to.deep.equal([
      { url: 'https://rpc1.example.com', weight: 1 },
      { url: 'https://rpc2.example.com', weight: 1 }
    ]);
  });

  it('should parse RPC_HTTP_LIST as JSON with weights', () => {
    process.env.DRY_RUN = 'true';
    process.env.RPC_HTTP_LIST = '[{"url":"https://rpc1.example.com","weight":2},{"url":"https://rpc2.example.com","weight":1}]';
    
    const config = loadConfig();
    expect(config.RPC_HTTP_LIST).to.deep.equal([
      { url: 'https://rpc1.example.com', weight: 2 },
      { url: 'https://rpc2.example.com', weight: 1 }
    ]);
  });

  it('should use gas strategy defaults', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'https://rpc.example.com';
    
    const config = loadConfig();
    expect(config.GAS_BASEFEE_BUMP).to.equal(2.0);
    expect(config.PRIORITY_FEE_GWEI_MIN).to.equal(1);
    expect(config.PRIORITY_FEE_GWEI_MAX).to.equal(3);
  });

  it('should parse custom gas strategy values', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'https://rpc.example.com';
    process.env.GAS_BASEFEE_BUMP = '2.5';
    process.env.PRIORITY_FEE_GWEI_MIN = '0.5';
    process.env.PRIORITY_FEE_GWEI_MAX = '5.0';
    
    const config = loadConfig();
    expect(config.GAS_BASEFEE_BUMP).to.equal(2.5);
    expect(config.PRIORITY_FEE_GWEI_MIN).to.equal(0.5);
    expect(config.PRIORITY_FEE_GWEI_MAX).to.equal(5.0);
  });

  it('should parse Flashbots configuration', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'https://rpc.example.com';
    process.env.FLASHBOTS_RPC_URL = 'https://relay.flashbots.net';
    process.env.SIM_TIMEOUT_MS = '5000';
    
    const config = loadConfig();
    expect(config.FLASHBOTS_RPC_URL).to.equal('https://relay.flashbots.net');
    expect(config.SIM_TIMEOUT_MS).to.equal(5000);
  });

  it('should use simulation timeout default', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'https://rpc.example.com';
    
    const config = loadConfig();
    expect(config.SIM_TIMEOUT_MS).to.equal(3000);
  });

  it('should parse metrics port', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'https://rpc.example.com';
    process.env.METRICS_PORT = '8080';
    
    const config = loadConfig();
    expect(config.METRICS_PORT).to.equal(8080);
  });

  it('should validate RPC configuration with RPC_HTTP_LIST', () => {
    process.env.DRY_RUN = 'true';
    process.env.RPC_HTTP_LIST = 'https://rpc1.example.com,https://rpc2.example.com';
    
    expect(() => loadConfig()).to.not.throw();
  });

  it('should require at least one RPC provider', () => {
    process.env.DRY_RUN = 'true';
    // No RPC configuration provided
    
    expect(() => loadConfig()).to.throw(/PRIMARY_RPC_HTTP, RPC_PROVIDERS, or RPC_HTTP_LIST/);
  });

  it('should include new fields in config summary', () => {
    process.env.DRY_RUN = 'true';
    process.env.RPC_HTTP_LIST = 'https://rpc1.example.com,https://rpc2.example.com';
    process.env.GAS_BASEFEE_BUMP = '2.5';
    process.env.PRIORITY_FEE_GWEI_MIN = '0.5';
    process.env.PRIORITY_FEE_GWEI_MAX = '5.0';
    process.env.FLASHBOTS_RPC_URL = 'https://relay.flashbots.net';
    process.env.SIM_TIMEOUT_MS = '5000';
    process.env.METRICS_PORT = '8080';
    
    const summary = getConfigSummary();
    expect(summary).to.include({
      rpcHttpList: 2,
      gasBaseFeeMultiplier: 2.5,
      priorityFeeMinGwei: 0.5,
      priorityFeeMaxGwei: 5.0,
      hasFlashbotsRpc: true,
      simTimeoutMs: 5000,
      metricsPort: 8080
    });
  });

  it('should validate gas strategy bounds', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'https://rpc.example.com';
    process.env.GAS_BASEFEE_BUMP = '0.5'; // Below minimum of 1
    
    expect(() => loadConfig()).to.throw();
  });

  it('should validate priority fee bounds', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'https://rpc.example.com';
    process.env.PRIORITY_FEE_GWEI_MIN = '-1'; // Negative value
    
    expect(() => loadConfig()).to.throw();
  });

  it('should validate simulation timeout bounds', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'https://rpc.example.com';
    process.env.SIM_TIMEOUT_MS = '50'; // Below minimum of 100
    
    expect(() => loadConfig()).to.throw();
  });

  it('should handle mixed RPC configuration', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'https://primary.example.com';
    process.env.RPC_HTTP_LIST = 'https://rpc1.example.com,https://rpc2.example.com';
    
    const config = loadConfig();
    // Should have both PRIMARY_RPC_HTTP and RPC_HTTP_LIST
    expect(config.PRIMARY_RPC_HTTP).to.equal('https://primary.example.com');
    expect(config.RPC_HTTP_LIST).to.have.length(2);
  });
});