// src/modules/logger.ts
/**
 * Pino logger resilient to missing "pino-pretty" and test environments.
 * - Default: JSON logs to stdout.
 * - If LOG_PRETTY=true and "pino-pretty" is available, enable pretty printing.
 * - In tests, always use plain JSON logger (no transport) to avoid crashes.
 */

import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const IS_TEST = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

function createLogger() {
  if (IS_TEST) {
    return pino({ level: LOG_LEVEL });
  }
  const pretty = String(process.env.LOG_PRETTY || '').toLowerCase() === 'true';
  if (pretty) {
    try {
      // @ts-ignore runtime API; avoid hard dep in typings
      const transport = (pino as any).transport?.({
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      });
      if (transport) {
        return pino({ level: LOG_LEVEL }, transport);
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn('[logger] pino-pretty unavailable; falling back to JSON logs', err?.message || err);
    }
  }
  return pino({ level: LOG_LEVEL });
}

const logger = createLogger();

export default logger;
export const log = logger;

