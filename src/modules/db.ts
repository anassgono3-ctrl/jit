import { promises as fs } from 'fs';
import { join } from 'path';
import Decimal from 'decimal.js';

// Configure decimal.js for high precision
Decimal.config({
  precision: 50,
  rounding: Decimal.ROUND_DOWN,
});

/**
 * Database configuration
 */
export interface DatabaseConfig {
  /** Database file path */
  dbPath: string;
  /** Enable JSONL logging */
  enableJsonl: boolean;
  /** JSONL file path */
  jsonlPath: string;
  /** Maximum entries to keep in memory */
  maxMemoryEntries: number;
  /** Auto-save interval in ms */
  autoSaveInterval: number;
}

/**
 * JIT attempt record
 */
export interface JitAttemptRecord {
  /** Unique attempt ID */
  id: string;
  /** Timestamp */
  timestamp: number;
  /** Pool address */
  poolAddress: string;
  /** Pool name */
  poolName: string;
  /** Fee tier */
  feeTier: number;
  /** Swap size in USD */
  swapSizeUsd: string;
  /** Expected profit in USD */
  expectedProfitUsd: string;
  /** Actual profit in USD (null if failed) */
  actualProfitUsd: string | null;
  /** Success status */
  success: boolean;
  /** Failure reason (if failed) */
  failureReason: string | null;
  /** Gas price in gwei */
  gasPriceGwei: number;
  /** Gas used */
  gasUsed: number | null;
  /** Transaction hash (if successful) */
  txHash: string | null;
  /** Block number */
  blockNumber: number | null;
  /** Strategy score */
  strategyScore: number;
  /** Inclusion probability */
  inclusionProbability: number;
  /** Execution latency in ms */
  executionLatencyMs: number;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Pool health record
 */
export interface PoolHealthRecord {
  /** Pool address */
  poolAddress: string;
  /** Timestamp */
  timestamp: number;
  /** Health score */
  healthScore: number;
  /** Liquidity in USD */
  liquidityUsd: string;
  /** 24h volume in USD */
  volume24hUsd: string;
  /** Volatility measure */
  volatility: number;
  /** Issues */
  issues: string[];
}

/**
 * Performance metrics record
 */
export interface PerformanceRecord {
  /** Timestamp */
  timestamp: number;
  /** Metric type */
  metricType: string;
  /** Metric value */
  value: number;
  /** Labels */
  labels: Record<string, string>;
}

/**
 * Database query options
 */
export interface QueryOptions {
  /** Limit number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Start timestamp */
  startTime?: number;
  /** End timestamp */
  endTime?: number;
  /** Pool address filter */
  poolAddress?: string;
  /** Success filter */
  success?: boolean;
}

/**
 * Lightweight database implementation using JSON files and JSONL
 */
export class Database {
  private config: DatabaseConfig;
  private jitAttempts: Map<string, JitAttemptRecord> = new Map();
  private poolHealth: Map<string, PoolHealthRecord[]> = new Map();
  private performance: PerformanceRecord[] = [];
  private autoSaveTimer?: NodeJS.Timeout;
  private isInitialized = false;

  constructor(config: Partial<DatabaseConfig> = {}) {
    this.config = {
      dbPath: config.dbPath || './data/jit_bot.json',
      enableJsonl: config.enableJsonl ?? true,
      jsonlPath: config.jsonlPath || './data/jit_bot.jsonl',
      maxMemoryEntries: config.maxMemoryEntries || 10000,
      autoSaveInterval: config.autoSaveInterval || 60000, // 1 minute
      ...config,
    };
  }

  /**
   * Initialize the database
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Ensure data directory exists
      const dataDir = this.config.dbPath.split('/').slice(0, -1).join('/');
      await fs.mkdir(dataDir, { recursive: true });

      // Load existing data
      await this.loadData();

      // Start auto-save timer
      if (this.config.autoSaveInterval > 0) {
        this.autoSaveTimer = setInterval(() => {
          this.saveData().catch(console.error);
        }, this.config.autoSaveInterval);
      }

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize database: ${error}`);
    }
  }

  /**
   * Record a JIT attempt
   */
  async recordAttempt(record: Omit<JitAttemptRecord, 'id' | 'timestamp'>): Promise<string> {
    const id = this.generateId();
    const fullRecord: JitAttemptRecord = {
      id,
      timestamp: Date.now(),
      ...record,
    };

    this.jitAttempts.set(id, fullRecord);

    // Write to JSONL if enabled
    if (this.config.enableJsonl) {
      await this.appendToJsonl(fullRecord);
    }

    // Clean up old entries if memory limit exceeded
    await this.cleanupMemory();

    return id;
  }

  /**
   * Update a JIT attempt result
   */
  async updateAttemptResult(
    id: string,
    result: {
      success: boolean;
      actualProfitUsd?: string;
      failureReason?: string;
      gasUsed?: number;
      txHash?: string;
      blockNumber?: number;
      executionLatencyMs?: number;
    }
  ): Promise<void> {
    const record = this.jitAttempts.get(id);
    if (!record) {
      throw new Error(`JIT attempt record not found: ${id}`);
    }

    // Update record
    Object.assign(record, result);
    this.jitAttempts.set(id, record);

    // Write update to JSONL
    if (this.config.enableJsonl) {
      await this.appendToJsonl({ type: 'update', id, ...result });
    }
  }

  /**
   * Record pool health
   */
  async recordPoolHealth(record: PoolHealthRecord): Promise<void> {
    const poolRecords = this.poolHealth.get(record.poolAddress) || [];
    poolRecords.push(record);

    // Keep only recent records (last 24 hours)
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;
    const filteredRecords = poolRecords.filter(r => r.timestamp >= cutoffTime);
    
    this.poolHealth.set(record.poolAddress, filteredRecords);

    // Write to JSONL
    if (this.config.enableJsonl) {
      await this.appendToJsonl({ type: 'pool_health', ...record });
    }
  }

  /**
   * Record performance metric
   */
  async recordPerformance(record: PerformanceRecord): Promise<void> {
    this.performance.push(record);

    // Keep only recent performance records
    const cutoffTime = Date.now() - 60 * 60 * 1000; // 1 hour
    this.performance = this.performance.filter(r => r.timestamp >= cutoffTime);

    // Write to JSONL
    if (this.config.enableJsonl) {
      await this.appendToJsonl({ type: 'performance', ...record });
    }
  }

  /**
   * Query JIT attempts
   */
  queryAttempts(options: QueryOptions = {}): JitAttemptRecord[] {
    let results = Array.from(this.jitAttempts.values());

    // Apply filters
    if (options.startTime) {
      results = results.filter(r => r.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      results = results.filter(r => r.timestamp <= options.endTime!);
    }
    if (options.poolAddress) {
      results = results.filter(r => r.poolAddress === options.poolAddress);
    }
    if (options.success !== undefined) {
      results = results.filter(r => r.success === options.success);
    }

    // Sort by timestamp (newest first)
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    if (options.offset) {
      results = results.slice(options.offset);
    }
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Get JIT attempt by ID
   */
  getAttempt(id: string): JitAttemptRecord | null {
    return this.jitAttempts.get(id) || null;
  }

  /**
   * Get pool health history
   */
  getPoolHealth(poolAddress: string, hours = 24): PoolHealthRecord[] {
    const records = this.poolHealth.get(poolAddress) || [];
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
    
    return records
      .filter(r => r.timestamp >= cutoffTime)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(metricType?: string, hours = 1): PerformanceRecord[] {
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
    
    let results = this.performance.filter(r => r.timestamp >= cutoffTime);
    
    if (metricType) {
      results = results.filter(r => r.metricType === metricType);
    }
    
    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get summary statistics
   */
  getSummaryStats(hours = 24): {
    totalAttempts: number;
    successfulAttempts: number;
    successRate: number;
    totalProfitUsd: string;
    averageProfitUsd: string;
    averageGasUsed: number;
  } {
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
    const recentAttempts = Array.from(this.jitAttempts.values())
      .filter(r => r.timestamp >= cutoffTime);

    const totalAttempts = recentAttempts.length;
    const successfulAttempts = recentAttempts.filter(r => r.success).length;
    const successRate = totalAttempts > 0 ? successfulAttempts / totalAttempts : 0;

    const totalProfit = recentAttempts
      .filter(r => r.success && r.actualProfitUsd)
      .reduce((sum, r) => sum.add(new Decimal(r.actualProfitUsd!)), new Decimal(0));

    const averageProfit = successfulAttempts > 0 
      ? totalProfit.div(successfulAttempts) 
      : new Decimal(0);

    const totalGasUsed = recentAttempts
      .filter(r => r.gasUsed)
      .reduce((sum, r) => sum + r.gasUsed!, 0);
    
    const averageGasUsed = recentAttempts.filter(r => r.gasUsed).length > 0
      ? totalGasUsed / recentAttempts.filter(r => r.gasUsed).length
      : 0;

    return {
      totalAttempts,
      successfulAttempts,
      successRate,
      totalProfitUsd: totalProfit.toString(),
      averageProfitUsd: averageProfit.toString(),
      averageGasUsed,
    };
  }

  /**
   * Save data to disk
   */
  async saveData(): Promise<void> {
    const data = {
      jitAttempts: Array.from(this.jitAttempts.entries()),
      poolHealth: Array.from(this.poolHealth.entries()),
      performance: this.performance,
      lastSaved: Date.now(),
    };

    await fs.writeFile(this.config.dbPath, JSON.stringify(data, null, 2));
  }

  /**
   * Load data from disk
   */
  private async loadData(): Promise<void> {
    try {
      const data = await fs.readFile(this.config.dbPath, 'utf8');
      const parsed = JSON.parse(data);

      // Restore maps
      this.jitAttempts = new Map(parsed.jitAttempts || []);
      this.poolHealth = new Map(parsed.poolHealth || []);
      this.performance = parsed.performance || [];
    } catch (error) {
      // File doesn't exist or is corrupted, start fresh
      console.warn('Could not load existing database, starting fresh');
    }
  }

  /**
   * Append record to JSONL file
   */
  private async appendToJsonl(record: unknown): Promise<void> {
    const line = JSON.stringify(record) + '\n';
    await fs.appendFile(this.config.jsonlPath, line);
  }

  /**
   * Clean up old entries from memory
   */
  private async cleanupMemory(): Promise<void> {
    if (this.jitAttempts.size <= this.config.maxMemoryEntries) return;

    // Remove oldest entries
    const entries = Array.from(this.jitAttempts.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = entries.slice(0, entries.length - this.config.maxMemoryEntries);
    
    for (const [id] of toRemove) {
      this.jitAttempts.delete(id);
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Close the database
   */
  async close(): Promise<void> {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }

    await this.saveData();
    this.isInitialized = false;
  }
}

/**
 * Default database instance
 */
export const db = new Database();

/**
 * Create a new database instance with custom configuration
 */
export function createDatabase(config: Partial<DatabaseConfig> = {}): Database {
  return new Database(config);
}

/**
 * Database factory for testing
 */
export function createTestDatabase(): Database {
  return new Database({
    dbPath: ':memory:', // In-memory only
    enableJsonl: false,
    autoSaveInterval: 0, // No auto-save for tests
  });
}

