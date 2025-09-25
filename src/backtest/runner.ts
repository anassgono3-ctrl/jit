import Decimal from 'decimal.js';
import { PoolState, fromFixture } from '../sim/pool_state';
import { simulateJitAttempt, JitPlan, SwapEvent, PriceFeed, StrategyConfig } from '../sim/execution_sim';
import { planJit, loadStrategyConfig, StrategyConfig as PlannerConfig } from '../strategy/jit_planner';
import { log } from '../modules/logger';
import { metrics } from '../modules/metrics';
import { promises as fs } from 'fs';
import { join } from 'path';

// Configure decimal.js for high precision
Decimal.config({
  precision: 50,
  rounding: Decimal.ROUND_DOWN,
});

/**
 * Backtest fixture
 */
export interface BacktestFixture {
  /** Fixture name */
  name: string;
  /** Pool state snapshot */
  pool: Record<string, unknown>;
  /** Swap to simulate */
  swap: SwapEvent;
  /** Price feed data */
  priceFeed: PriceFeed;
  /** Expected outcome (for validation) */
  expected?: {
    shouldExecute: boolean;
    minProfitUsd?: string;
    maxProfitUsd?: string;
  };
}

/**
 * Backtest result for a single fixture
 */
export interface BacktestResult {
  /** Fixture name */
  fixtureName: string;
  /** Whether JIT was planned */
  planned: boolean;
  /** JIT plan (if planned) */
  plan: JitPlan | null;
  /** Whether simulation was executed */
  simulated: boolean;
  /** Simulation result (if executed) */
  simulationResult: any;
  /** Actual profit USD */
  actualProfitUsd: string;
  /** Expected vs actual comparison */
  validation: {
    passed: boolean;
    errors: string[];
  };
  /** Execution time in ms */
  executionTimeMs: number;
}

/**
 * Complete backtest results
 */
export interface BacktestResults {
  /** Individual fixture results */
  results: BacktestResult[];
  /** Summary statistics */
  summary: {
    totalFixtures: number;
    successfulPlans: number;
    profitableExecutions: number;
    totalProfitUsd: string;
    averageProfitUsd: string;
    successRate: number;
    averageExecutionTimeMs: number;
  };
  /** Performance distribution */
  distribution: {
    profitBuckets: Record<string, number>;
    executionTimeBuckets: Record<string, number>;
  };
  /** Timestamp */
  timestamp: number;
}

/**
 * Backtest runner configuration
 */
export interface BacktestConfig {
  /** Fixtures directory */
  fixturesDir: string;
  /** Strategy configuration */
  strategyConfig: PlannerConfig;
  /** Output file path */
  outputFile: string;
  /** Enable detailed logging */
  verbose: boolean;
  /** Parallel execution */
  parallel: boolean;
}

/**
 * Main backtest runner
 */
export class BacktestRunner {
  private config: BacktestConfig;

  constructor(config: BacktestConfig) {
    this.config = config;
  }

  /**
   * Run backtest on all fixtures
   */
  async run(): Promise<BacktestResults> {
    log.info('Starting backtest run', {
      fixturesDir: this.config.fixturesDir,
      outputFile: this.config.outputFile,
    });

    // Load fixtures
    const fixtures = await this.loadFixtures();
    log.info(`Loaded ${fixtures.length} fixtures`);

    // Run tests
    const results: BacktestResult[] = [];
    
    for (const fixture of fixtures) {
      const startTime = Date.now();
      
      try {
        const result = await this.runSingleFixture(fixture);
        result.executionTimeMs = Date.now() - startTime;
        results.push(result);

        if (this.config.verbose) {
          log.info('Fixture completed', {
            name: fixture.name,
            planned: result.planned,
            profitable: Number(result.actualProfitUsd) > 0,
            executionTime: result.executionTimeMs,
          });
        }
      } catch (error) {
        log.error('Fixture failed', { name: fixture.name, error });
        results.push({
          fixtureName: fixture.name,
          planned: false,
          plan: null,
          simulated: false,
          simulationResult: null,
          actualProfitUsd: '0',
          validation: {
            passed: false,
            errors: [error instanceof Error ? error.message : 'Unknown error'],
          },
          executionTimeMs: Date.now() - startTime,
        });
      }
    }

    // Calculate summary
    const summary = this.calculateSummary(results);
    const distribution = this.calculateDistribution(results);

    const backtestResults: BacktestResults = {
      results,
      summary,
      distribution,
      timestamp: Date.now(),
    };

    // Save results
    await this.saveResults(backtestResults);

    log.info('Backtest completed', {
      totalFixtures: summary.totalFixtures,
      successRate: summary.successRate,
      totalProfit: summary.totalProfitUsd,
    });

    return backtestResults;
  }

  /**
   * Load all fixtures from directory
   */
  private async loadFixtures(): Promise<BacktestFixture[]> {
    const fixtures: BacktestFixture[] = [];
    
    try {
      const files = await fs.readdir(this.config.fixturesDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      for (const file of jsonFiles) {
        const filePath = join(this.config.fixturesDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const fixture = JSON.parse(content) as BacktestFixture;
        fixtures.push(fixture);
      }
    } catch (error) {
      log.error('Failed to load fixtures', { error });
      throw error;
    }

    return fixtures.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Run a single fixture test
   */
  private async runSingleFixture(fixture: BacktestFixture): Promise<BacktestResult> {
    const poolState = fromFixture(fixture.pool);
    
    // Plan JIT strategy
    const swapEstimate = {
      swapSizeUsd: fixture.swap.swapSizeUsd,
      amountIn: fixture.swap.amountIn,
      tokenIn: fixture.swap.tokenIn,
      gasPriceGwei: 50, // Default gas price
      priorityFeeGwei: 2, // Default priority fee
      blockDeadline: 3, // 3 blocks
    };

    const plan = planJit(
      poolState,
      swapEstimate,
      fixture.priceFeed,
      this.config.strategyConfig
    );

    const result: BacktestResult = {
      fixtureName: fixture.name,
      planned: plan !== null,
      plan,
      simulated: false,
      simulationResult: null,
      actualProfitUsd: '0',
      validation: { passed: true, errors: [] },
      executionTimeMs: 0,
    };

    // If plan exists, simulate execution
    if (plan) {
      const simConfig: StrategyConfig = {
        minNetProfitUsd: this.config.strategyConfig.minNetProfitUsd,
        gasEstimateUsd: this.config.strategyConfig.gasEstimateUsd,
        flashloanFeeBps: this.config.strategyConfig.flashloanFeeBps,
        maxSlippageBps: this.config.strategyConfig.maxSlippageBps,
      };

      const simulationResult = simulateJitAttempt(
        poolState,
        plan,
        fixture.swap,
        fixture.priceFeed,
        simConfig
      );

      result.simulated = true;
      result.simulationResult = simulationResult;
      result.actualProfitUsd = simulationResult.netProfitUsd;
    }

    // Validate against expected outcome
    if (fixture.expected) {
      result.validation = this.validateResult(result, fixture.expected);
    }

    return result;
  }

  /**
   * Validate result against expected outcome
   */
  private validateResult(
    result: BacktestResult,
    expected: NonNullable<BacktestFixture['expected']>
  ): { passed: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check if execution matches expectation
    if (result.planned !== expected.shouldExecute) {
      errors.push(
        `Expected shouldExecute=${expected.shouldExecute}, got planned=${result.planned}`
      );
    }

    // Check profit range if specified
    if (expected.minProfitUsd && result.actualProfitUsd) {
      const actualProfit = new Decimal(result.actualProfitUsd);
      const minProfit = new Decimal(expected.minProfitUsd);
      
      if (actualProfit.lt(minProfit)) {
        errors.push(
          `Profit ${result.actualProfitUsd} below minimum ${expected.minProfitUsd}`
        );
      }
    }

    if (expected.maxProfitUsd && result.actualProfitUsd) {
      const actualProfit = new Decimal(result.actualProfitUsd);
      const maxProfit = new Decimal(expected.maxProfitUsd);
      
      if (actualProfit.gt(maxProfit)) {
        errors.push(
          `Profit ${result.actualProfitUsd} above maximum ${expected.maxProfitUsd}`
        );
      }
    }

    return {
      passed: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(results: BacktestResult[]): BacktestResults['summary'] {
    const totalFixtures = results.length;
    const successfulPlans = results.filter(r => r.planned).length;
    const profitableExecutions = results.filter(r => Number(r.actualProfitUsd) > 0).length;
    
    const totalProfit = results.reduce(
      (sum, r) => sum.add(new Decimal(r.actualProfitUsd || '0')),
      new Decimal(0)
    );
    
    const averageProfit = totalFixtures > 0 ? totalProfit.div(totalFixtures) : new Decimal(0);
    const successRate = totalFixtures > 0 ? profitableExecutions / totalFixtures : 0;
    
    const averageExecutionTime = totalFixtures > 0
      ? results.reduce((sum, r) => sum + r.executionTimeMs, 0) / totalFixtures
      : 0;

    return {
      totalFixtures,
      successfulPlans,
      profitableExecutions,
      totalProfitUsd: totalProfit.toString(),
      averageProfitUsd: averageProfit.toString(),
      successRate,
      averageExecutionTimeMs: averageExecutionTime,
    };
  }

  /**
   * Calculate distribution statistics
   */
  private calculateDistribution(results: BacktestResult[]): BacktestResults['distribution'] {
    const profitBuckets: Record<string, number> = {
      '0-10': 0,
      '10-25': 0,
      '25-50': 0,
      '50-100': 0,
      '100-250': 0,
      '250+': 0,
    };

    const executionTimeBuckets: Record<string, number> = {
      '0-100ms': 0,
      '100-500ms': 0,
      '500-1000ms': 0,
      '1000-5000ms': 0,
      '5000ms+': 0,
    };

    for (const result of results) {
      // Profit distribution
      const profit = Number(result.actualProfitUsd);
      if (profit <= 10) profitBuckets['0-10']++;
      else if (profit <= 25) profitBuckets['10-25']++;
      else if (profit <= 50) profitBuckets['25-50']++;
      else if (profit <= 100) profitBuckets['50-100']++;
      else if (profit <= 250) profitBuckets['100-250']++;
      else profitBuckets['250+']++;

      // Execution time distribution
      const time = result.executionTimeMs;
      if (time <= 100) executionTimeBuckets['0-100ms']++;
      else if (time <= 500) executionTimeBuckets['100-500ms']++;
      else if (time <= 1000) executionTimeBuckets['500-1000ms']++;
      else if (time <= 5000) executionTimeBuckets['1000-5000ms']++;
      else executionTimeBuckets['5000ms+']++;
    }

    return {
      profitBuckets,
      executionTimeBuckets,
    };
  }

  /**
   * Save results to file
   */
  private async saveResults(results: BacktestResults): Promise<void> {
    await fs.writeFile(
      this.config.outputFile,
      JSON.stringify(results, null, 2)
    );
    
    log.info('Backtest results saved', { file: this.config.outputFile });
  }
}

/**
 * CLI entry point for backtest runner
 */
export async function runBacktest(
  fixturesDir: string = './src/backtest/fixtures',
  outputFile: string = './backtest_results.json'
): Promise<void> {
  try {
    // Load strategy configuration
    const strategyConfigData = await fs.readFile('./src/config/strategy-config.json', 'utf8');
    const strategyConfig = loadStrategyConfig(JSON.parse(strategyConfigData));

    const config: BacktestConfig = {
      fixturesDir,
      strategyConfig,
      outputFile,
      verbose: true,
      parallel: false,
    };

    const runner = new BacktestRunner(config);
    const results = await runner.run();

    console.log('\n=== BACKTEST RESULTS ===');
    console.log(`Total Fixtures: ${results.summary.totalFixtures}`);
    console.log(`Successful Plans: ${results.summary.successfulPlans}`);
    console.log(`Profitable Executions: ${results.summary.profitableExecutions}`);
    console.log(`Success Rate: ${(results.summary.successRate * 100).toFixed(2)}%`);
    console.log(`Total Profit: $${results.summary.totalProfitUsd}`);
    console.log(`Average Profit: $${results.summary.averageProfitUsd}`);
    console.log(`Average Execution Time: ${results.summary.averageExecutionTimeMs.toFixed(2)}ms`);
    console.log('========================\n');

  } catch (error) {
    log.error('Backtest failed', { error });
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runBacktest().catch(console.error);
}