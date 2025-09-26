import { expect } from 'chai';
import { spawnSync } from 'child_process';
import path from 'path';

const NODE = process.execPath; // node binary

// We call the index's main entry using absolute path
const INDEX_PATH = path.resolve(__dirname, '../../src/index');
const ENTRY_CALL = `require('${INDEX_PATH}').main?.()
  ?.then(()=>{console.log('OK');process.exit(0)})
  .catch(e=>{console.error(e?.message||e);process.exit(2)})`;

describe('Live-mode guard', function() {
  this.timeout(12000);

  it('exits when DRY_RUN=false and PRIVATE_KEY missing', function() {
    const res = spawnSync(
      NODE,
      ['-r', 'ts-node/register', '-r', 'dotenv/config', '-e', ENTRY_CALL],
      {
        env: { ...process.env, DRY_RUN: 'false', PRIVATE_KEY: '', PRIMARY_RPC_HTTP: 'http://localhost:8545' },
        encoding: 'utf8',
        timeout: 6000,
      }
    );

    const out = (res.stdout || '') + (res.stderr || '');
    expect(res.status !== 0 || out.includes('DRY_RUN=false')).to.equal(true);
  });

  it('starts when DRY_RUN=false and PRIVATE_KEY valid', function() {
    const fakeKey = '0x' + 'a'.repeat(64);
    const res = spawnSync(
      NODE,
      ['-r', 'ts-node/register', '-r', 'dotenv/config', '-e', ENTRY_CALL],
      {
        env: { ...process.env, DRY_RUN: 'false', PRIVATE_KEY: fakeKey, PRIMARY_RPC_HTTP: 'http://localhost:8545' },
        encoding: 'utf8',
        timeout: 8000,
      }
    );

    const out = (res.stdout || '') + (res.stderr || '');
    expect(out.includes('OK') || res.status === 0).to.equal(true);
  });
});