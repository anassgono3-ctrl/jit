/**
 * Verifies that .env values are actually loaded (requires a test-specific .env).
 *
 * Strategy:
 *  - Spawn a child process with a temporary .env file that sets DRY_RUN=false
 *  - Ensure the process logs the live mode message (or fails key guard if PRIVATE_KEY missing)
 */

import { spawnSync } from 'child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { expect } from 'chai';

describe('Environment loading', () => {
  it('loads DRY_RUN from .env (integration)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'envtest-'));
    const envFile = join(tmp, '.env');
    writeFileSync(envFile, 'DRY_RUN=false\n');

    // Run node with DOTENV_CONFIG_PATH to force using this .env
    const result = spawnSync(
      'node',
      [
        '-r',
        'dotenv/config',
        '-r',
        'ts-node/register',
        'src/index.ts'
      ],
      {
        env: {
          ...process.env,
          DOTENV_CONFIG_PATH: envFile
        },
        encoding: 'utf8'
      }
    );

    // Clean up
    rmSync(tmp, { recursive: true, force: true });

    // Expect either:
    //  - Live mode warning / failure due to missing PRIVATE_KEY
    //  OR
    //  - Mode log showing DRY_RUN=false
    const stdout = result.stdout + result.stderr;

    expect(stdout).to.match(/DRY_RUN=false \(live\)|Live-mode safety check failed/i);
  });
});