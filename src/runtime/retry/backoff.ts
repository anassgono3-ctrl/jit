export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
  factor?: number;
  jitter?: boolean;
  maxAttempts?: number;
}

export class Backoff {
  private attempt = 0;
  private readonly opts: Required<BackoffOptions>;

  constructor(options: BackoffOptions = {}) {
    this.opts = {
      baseMs: options.baseMs ?? 500,
      maxMs: options.maxMs ?? 30_000,
      factor: options.factor ?? 2,
      jitter: options.jitter ?? true,
      maxAttempts: options.maxAttempts ?? Number.MAX_SAFE_INTEGER
    };
  }

  next(): number {
    if (this.attempt >= this.opts.maxAttempts) {
      throw new Error(`Maximum retry attempts (${this.opts.maxAttempts}) exceeded`);
    }

    const raw = Math.min(this.opts.maxMs, this.opts.baseMs * Math.pow(this.opts.factor, this.attempt++));
    
    if (this.opts.jitter) {
      const delta = Math.random() * raw * 0.3;
      return Math.floor(raw - (raw * 0.15) + delta);
    }
    
    return raw;
  }

  reset(): void { 
    this.attempt = 0; 
  }

  getAttempt(): number {
    return this.attempt;
  }

  hasMoreAttempts(): boolean {
    return this.attempt < this.opts.maxAttempts;
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: BackoffOptions = {}
): Promise<T> {
  const backoff = new Backoff(options);
  let lastError: Error;

  while (backoff.hasMoreAttempts()) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (!backoff.hasMoreAttempts()) {
        break;
      }

      const delay = backoff.next();
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
