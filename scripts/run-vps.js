#!/usr/bin/env node
/* Cross-platform VPS launcher for the JIT bot.
 * - Loads .env
 * - Ensures Node 20+
 * - Starts dist/index.js with production defaults
 */
const fs = require('fs');
const path = require('path');

require('dotenv/config');

const cwd = path.join(__dirname, '..');
process.chdir(cwd);

const major = parseInt(process.versions.node.split('.')[0], 10);
if (Number.isNaN(major) || major < 20) {
  console.error(`[run-vps.js] Node.js >= 20 required, found ${process.version}`);
  process.exit(1);
}

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.LOG_PRETTY = process.env.LOG_PRETTY || 'false';
process.env.HEALTHCHECK_PORT = process.env.HEALTHCHECK_PORT || '9090';

const distMain = path.join(cwd, 'dist', 'index.js');
if (!fs.existsSync(distMain)) {
  console.log('[run-vps.js] dist/index.js not found; building...');
  const { spawnSync } = require('node:child_process');
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('[run-vps.js] build failed');
    process.exit(r.status || 1);
  }
}

console.log(`[run-vps.js] starting JIT bot (NODE_ENV=${process.env.NODE_ENV}, HEALTHCHECK_PORT=${process.env.HEALTHCHECK_PORT}, LOG_PRETTY=${process.env.LOG_PRETTY})`);
require(distMain);
