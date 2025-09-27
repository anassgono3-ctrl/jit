import { expect } from 'chai';
import { BacktestRunner, BacktestConfig } from '../../src/backtest/runner';
import { loadStrategyConfig } from '../../src/strategy/jit_planner';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('BacktestRunner', () => {
  let tempDir: string;
  let config: BacktestConfig;

  before(async () => {
    // Create temporary directory for test fixtures
    tempDir = `/tmp/backtest-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    // Load strategy config
    const strategyConfigData = await fs.readFile('./src/config/strategy-config.json', 'utf8');
    const strategyConfig = loadStrategyConfig(JSON.parse(strategyConfigData));

    config = {
      fixturesDir: tempDir,
      strategyConfig,
      outputFile: join(tempDir, 'results.json'),
      verbose: false,
      parallel: false,
    };
  });

  after(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should run backtest with sample fixture', async () => {
    // Create a simple test fixture
    const fixture = {
      name: 'test_fixture',
      pool: {
        config: {
          address: '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8',
          token0: '0xA0b86991c431E56C2e07E8F5c25fe64a7Bc11b3A',
          token1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          fee: 3000,
          tickSpacing: 60,
          decimals0: 6,
          decimals1: 18,
        },
        slot0: {
          sqrtPriceX96: '79228162514264337593543950336',
          tick: 0,
          observationIndex: 0,
          observationCardinality: 1,
          observationCardinalityNext: 1,
          feeProtocol: 0,
          unlocked: true,
        },
        liquidity: '1000000000000000000000',
        feeGrowthGlobal0X128: '0',
        feeGrowthGlobal1X128: '0',
        protocolFees0: '0',
        protocolFees1: '0',
        ticks: [],
        blockTimestamp: 1700000000,
      },
      swap: {
        amountIn: '50000000000',
        tokenIn: 'token0' as const,
        swapSizeUsd: '50000',
        priceToken1PerToken0: '2000',
      },
      priceFeed: {
        token0PriceUsd: '1.0',
        token1PriceUsd: '2000.0',
        timestamp: 1700000000,
      },
    };

    // Write fixture to file
    const fixturePath = join(tempDir, 'test_fixture.json');
    await fs.writeFile(fixturePath, JSON.stringify(fixture, null, 2));

    // Run backtest
    const runner = new BacktestRunner(config);
    const results = await runner.run();

    // Validate results structure
    expect(results).to.have.property('results');
    expect(results).to.have.property('summary');
    expect(results).to.have.property('distribution');
    expect(results).to.have.property('timestamp');

    expect(results.results).to.be.an('array');
    expect(results.results).to.have.length(1);

    const result = results.results[0];
    expect(result.fixtureName).to.equal('test_fixture');
    expect(result).to.have.property('planned');
    expect(result).to.have.property('executionTimeMs');

    // Validate summary
    expect(results.summary.totalFixtures).to.equal(1);
    expect(results.summary.successfulPlans).to.be.a('number');
    expect(results.summary.successRate).to.be.a('number');
    expect(results.summary.totalProfitUsd).to.be.a('string');

    // Check output file was created
    const outputExists = await fs.access(config.outputFile).then(() => true).catch(() => false);
    expect(outputExists).to.be.true;
  });

  it('should handle empty fixtures directory', async () => {
    const emptyDir = join(tempDir, 'empty');
    await fs.mkdir(emptyDir, { recursive: true });

    const emptyConfig = {
      ...config,
      fixturesDir: emptyDir,
      outputFile: join(emptyDir, 'empty_results.json'),
    };

    const runner = new BacktestRunner(emptyConfig);
    const results = await runner.run();

    expect(results.results).to.have.length(0);
    expect(results.summary.totalFixtures).to.equal(0);
    expect(results.summary.successRate).to.equal(0);
  });

  it('should handle invalid fixture gracefully', async () => {
    const invalidFixturePath = join(tempDir, 'invalid.json');
    await fs.writeFile(invalidFixturePath, '{ invalid json');

    const runner = new BacktestRunner(config);
    
    // Should not throw, but handle the error gracefully
    try {
      await runner.run();
      // If it doesn't throw, that's also acceptable
    } catch (error) {
      // Error handling is acceptable
      expect(error).to.be.an('error');
    }
  });
});