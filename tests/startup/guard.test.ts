import { expect } from 'chai';
import { loadConfig, resetConfig } from '../../src/config';

describe('Startup Guard', () => {
  beforeEach(() => {
    resetConfig();
    // Clear env vars
    delete process.env.DRY_RUN;
    delete process.env.PRIVATE_KEY;
    delete process.env.PRIMARY_RPC_HTTP;
  });

  it('allows dry run mode without PRIVATE_KEY', () => {
    process.env.DRY_RUN = 'true';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    
    // Should not throw
    expect(() => loadConfig()).to.not.throw();
    
    const config = loadConfig();
    expect(config.DRY_RUN).to.be.true;
    expect(config.PRIVATE_KEY).to.be.undefined;
  });

  it('allows dry run mode by default (undefined DRY_RUN)', () => {
    // DRY_RUN not set - should default to true
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    
    expect(() => loadConfig()).to.not.throw();
    
    const config = loadConfig();
    expect(config.DRY_RUN).to.be.true;
  });

  it('throws when DRY_RUN=false and PRIVATE_KEY missing', () => {
    process.env.DRY_RUN = 'false';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    
    expect(() => loadConfig()).to.throw(/PRIVATE_KEY required in live mode/);
  });

  it('throws when DRY_RUN=false and PRIVATE_KEY invalid format', () => {
    process.env.DRY_RUN = 'false';
    process.env.PRIVATE_KEY = '0x123'; // Too short
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    
    expect(() => loadConfig()).to.throw(/PRIVATE_KEY malformed/);
  });

  it('throws when DRY_RUN=false and PRIVATE_KEY wrong prefix', () => {
    process.env.DRY_RUN = 'false';
    process.env.PRIVATE_KEY = '123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01'; // No 0x
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    
    expect(() => loadConfig()).to.throw(/PRIVATE_KEY malformed/);
  });

  it('throws when DRY_RUN=false and PRIVATE_KEY has invalid characters', () => {
    process.env.DRY_RUN = 'false';
    process.env.PRIVATE_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcxyz'; // Invalid chars
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    
    expect(() => loadConfig()).to.throw(/PRIVATE_KEY malformed/);
  });

  it('accepts valid PRIVATE_KEY in live mode', () => {
    process.env.DRY_RUN = 'false';
    process.env.PRIVATE_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    
    expect(() => loadConfig()).to.not.throw();
    
    const config = loadConfig();
    expect(config.DRY_RUN).to.be.false;
    expect(config.PRIVATE_KEY).to.equal('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  });

  it('accepts valid PRIVATE_KEY with uppercase hex', () => {
    process.env.DRY_RUN = 'false';
    process.env.PRIVATE_KEY = '0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    
    expect(() => loadConfig()).to.not.throw();
    
    const config = loadConfig();
    expect(config.DRY_RUN).to.be.false;
    expect(config.PRIVATE_KEY).to.equal('0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF');
  });

  it('accepts valid PRIVATE_KEY with mixed case hex', () => {
    process.env.DRY_RUN = 'false';
    process.env.PRIVATE_KEY = '0x0123456789aBcDeF0123456789aBcDeF0123456789aBcDeF0123456789aBcDeF';
    process.env.PRIMARY_RPC_HTTP = 'http://localhost:8545';
    
    expect(() => loadConfig()).to.not.throw();
    
    const config = loadConfig();
    expect(config.DRY_RUN).to.be.false;
    expect(config.PRIVATE_KEY).to.equal('0x0123456789aBcDeF0123456789aBcDeF0123456789aBcDeF0123456789aBcDeF');
  });
});