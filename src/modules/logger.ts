import pino from 'pino';

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Log level */
  level: string;
  /** Pretty print for development */
  prettyPrint: boolean;
  /** Log file path (optional) */
  logFile?: string;
  /** Redact sensitive fields */
  redactFields: string[];
  /** Include timestamp */
  timestamp: boolean;
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: process.env.LOG_LEVEL || 'info',
  prettyPrint: process.env.NODE_ENV === 'development',
  redactFields: [
    'privateKey',
    'mnemonic',
    'password',
    'secret',
    'token',
    'apiKey',
    'authorization',
  ],
  timestamp: true,
};

/**
 * Structured logger using pino
 */
class Logger {
  private logger: pino.Logger;

  constructor(config: Partial<LoggerConfig> = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    
    const pinoConfig: pino.LoggerOptions = {
      level: finalConfig.level,
      timestamp: finalConfig.timestamp,
      redact: {
        paths: finalConfig.redactFields,
        censor: '[REDACTED]',
      },
    };

    // Pretty print for development
    if (finalConfig.prettyPrint) {
      pinoConfig.transport = {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
        },
      };
    }

    // File logging if specified
    if (finalConfig.logFile) {
      pinoConfig.transport = {
        targets: [
          ...(finalConfig.prettyPrint ? [{
            target: 'pino-pretty',
            level: finalConfig.level,
            options: {
              colorize: true,
              translateTime: 'yyyy-mm-dd HH:MM:ss',
              ignore: 'pid,hostname',
            },
          }] : []),
          {
            target: 'pino/file',
            level: finalConfig.level,
            options: {
              destination: finalConfig.logFile,
            },
          },
        ],
      };
    }

    this.logger = pino(pinoConfig);
  }

  /**
   * Log info message
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(data, message);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn(data, message);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | Record<string, unknown>): void {
    if (error instanceof Error) {
      this.logger.error({ err: error }, message);
    } else {
      this.logger.error(error, message);
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.logger.debug(data, message);
  }

  /**
   * Log trace message
   */
  trace(message: string, data?: Record<string, unknown>): void {
    this.logger.trace(data, message);
  }

  /**
   * Log fatal message
   */
  fatal(message: string, error?: Error | Record<string, unknown>): void {
    if (error instanceof Error) {
      this.logger.fatal({ err: error }, message);
    } else {
      this.logger.fatal(error, message);
    }
  }

  /**
   * Create child logger with additional context
   */
  child(bindings: Record<string, unknown>): Logger {
    const childLogger = new Logger();
    childLogger.logger = this.logger.child(bindings);
    return childLogger;
  }

  /**
   * Log JIT attempt
   */
  logJitAttempt(data: {
    poolAddress: string;
    swapSizeUsd: string;
    expectedProfitUsd: string;
    gasPrice: number;
    blockNumber?: number;
  }): void {
    this.info('JIT attempt initiated', {
      type: 'jit_attempt',
      ...data,
    });
  }

  /**
   * Log JIT result
   */
  logJitResult(data: {
    poolAddress: string;
    success: boolean;
    actualProfitUsd: string;
    feesCaptured: string;
    gasUsed?: number;
    txHash?: string;
  }): void {
    const level = data.success ? 'info' : 'warn';
    this.logger[level]({
      type: 'jit_result',
      ...data,
    }, `JIT ${data.success ? 'succeeded' : 'failed'}`);
  }

  /**
   * Log pool health update
   */
  logPoolHealth(data: {
    poolAddress: string;
    healthScore: number;
    liquidity: string;
    issues: string[];
  }): void {
    const level = data.healthScore < 50 ? 'warn' : 'debug';
    this.logger[level]({
      type: 'pool_health',
      ...data,
    }, 'Pool health updated');
  }

  /**
   * Log error with context
   */
  logError(error: Error, context: Record<string, unknown> = {}): void {
    this.error('Error occurred', {
      type: 'error',
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      ...context,
    });
  }

  /**
   * Log transaction details
   */
  logTransaction(data: {
    type: 'mint' | 'burn' | 'swap';
    poolAddress: string;
    amount0?: string;
    amount1?: string;
    gasEstimate: number;
    txHash?: string;
    status?: 'pending' | 'confirmed' | 'failed';
  }): void {
    this.info(`Transaction ${data.type}`, {
      transaction_type: data.type,
      pool_address: data.poolAddress,
      amount0: data.amount0,
      amount1: data.amount1,
      gas_estimate: data.gasEstimate,
      tx_hash: data.txHash,
      status: data.status,
    });
  }

  /**
   * Log performance metrics
   */
  logPerformance(data: {
    operation: string;
    duration: number;
    success: boolean;
    metadata?: Record<string, unknown>;
  }): void {
    this.debug('Performance metric', {
      type: 'performance',
      ...data,
    });
  }

  /**
   * Log strategy decision
   */
  logStrategyDecision(data: {
    poolAddress: string;
    decision: 'execute' | 'skip' | 'defer';
    reason: string;
    score?: number;
    profitEstimate?: string;
  }): void {
    this.info('Strategy decision', {
      type: 'strategy_decision',
      ...data,
    });
  }

  /**
   * Get the underlying pino logger
   */
  getPinoLogger(): pino.Logger {
    return this.logger;
  }
}

/**
 * Default logger instance
 */
export const log = new Logger();

/**
 * Create a new logger instance with custom configuration
 */
export function createLogger(config: Partial<LoggerConfig> = {}): Logger {
  return new Logger(config);
}

/**
 * Middleware function for request logging
 */
export function createRequestLogger() {
  return (req: unknown, res: unknown, next: () => void): void => {
    const start = Date.now();
    
    // Log request
    log.debug('Request started', {
      type: 'request',
      // Add request details as needed
    });

    // Mock response end handler
    const originalNext = next;
    next = () => {
      const duration = Date.now() - start;
      log.debug('Request completed', {
        type: 'request_complete',
        duration,
      });
      originalNext();
    };

    next();
  };
}

/**
 * Log system startup
 */
export function logStartup(config: {
  version: string;
  environment: string;
  nodeEnv: string;
  logLevel: string;
}): void {
  log.info('JIT Bot starting up', {
    type: 'startup',
    ...config,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log system shutdown
 */
export function logShutdown(reason: string): void {
  log.info('JIT Bot shutting down', {
    type: 'shutdown',
    reason,
    timestamp: new Date().toISOString(),
  });
}

