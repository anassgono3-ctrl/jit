// src/modules/logger.ts
/**
 * Pino logger resilient to missing "pino-pretty" and test environments.
 * - Default: JSON logs to stdout.
 * - If LOG_PRETTY=true and "pino-pretty" is available, enable pretty printing.
 * - In tests, always use plain JSON logger (no transport) to avoid crashes and noise.
 */

import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const IS_TEST =
  process.env.NODE_ENV === 'test' ||
  process.env.MOCHA === 'true' ||
  process.env.JEST_WORKER_ID !== undefined;

function hasPretty(): boolean {
  try {
    // Only enable pretty if module is resolvable
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

function createLogger() {
  // Tests: plain JSON (no transports)
  if (IS_TEST) {
    return pino({ level: LOG_LEVEL });
  }

  const wantPretty = String(process.env.LOG_PRETTY || '').toLowerCase() === 'true';

  if (wantPretty && hasPretty()) {
    try {
      // @ts-ignore runtime transport API
      const transport = (pino as any).transport?.({
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      });
      if (transport) {
        return pino({ level: LOG_LEVEL }, transport);
      }
    } catch {
      // Silent fallback to JSON logs if transport initialization fails
    }
  }

  // Default: structured JSON
  return pino({ level: LOG_LEVEL });
}

const logger = createLogger();

export default logger;
export const log = logger;
