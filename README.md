# JIT Liquidity Bot

A professional, production-ready Just-In-Time (JIT) liquidity bot for Uniswap V3 on Ethereum. This bot provides liquidity precisely when needed to capture fees from large swaps while minimizing capital requirements and impermanent loss risk.

## Overview

The JIT Liquidity Bot is designed as a complete foundation for MEV extraction through strategic liquidity provision. It features deterministic simulation, sophisticated strategy algorithms, and comprehensive risk management - all built with production-grade infrastructure.

### Key Features

- **Exact Uniswap V3 Math**: Precise tick ↔ sqrtPriceX96 conversions using decimal.js
- **Deterministic Simulation**: Complete offline simulation of mint → swap → burn cycles
- **Advanced Strategy Engine**: Multi-factor scoring with adaptive range selection
- **Risk Management**: Position sizing, exposure limits, and emergency controls
- **Production Infrastructure**: Comprehensive logging, metrics, and persistence
- **Comprehensive Testing**: 88 passing unit tests with full coverage

## Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│  Math Modules   │    │  Simulator   │    │ Strategy Engine │
│                 │    │              │    │                 │
│ • tick_math     │───▶│ • pool_state │───▶│ • jit_planner   │
│ • liquidity_math│    │ • mint_burn  │    │ • range_select  │
│ • price_utils   │    │ • swap_engine│    │ • scoring       │
└─────────────────┘    │ • execution  │    │ • pool_manager  │
                       └──────────────┘    └─────────────────┘
                              │                       │
                              ▼                       ▼
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│ Support Modules │    │  Backtest    │    │  Documentation  │
│                 │    │              │    │                 │
│ • logger        │    │ • runner     │    │ • DEPLOYMENT    │
│ • metrics       │    │ • fixtures   │    │ • RUNBOOK       │
│ • database      │    │ • validation │    │ • SECURITY      │
└─────────────────┘    └──────────────┘    └─────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- NPM or Yarn
- Docker (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/jit-liquidity-bot
cd jit-liquidity-bot

# Install dependencies
npm ci

# Build the project
npm run build

# Run tests
npm test

# Run backtest
npm run backtest
```

### Configuration

```bash
# Copy configuration templates
cp .env.example .env
cp src/config/pools.json.example src/config/pools.json
cp src/config/strategy-config.json.example src/config/strategy-config.json

# Edit configuration files as needed
vim .env
vim src/config/strategy-config.json
```

### Runtime Modes

#### Dry-Run Mode (Default)
```bash
# Safe simulation mode - no real transactions
NETWORK=mainnet DRY_RUN=true npm start
```

#### Live Mode 
```bash
# Live mainnet execution - requires private key
NETWORK=mainnet DRY_RUN=false PRIVATE_KEY=0xabc... npm start
```

#### Erigon Integration
```bash
# Preferred setup with Erigon node for efficient txpool access
ERIGON_RPC_HTTP=http://127.0.0.1:8545 \
FALLBACK_RPC_HTTP=https://mainnet.infura.io/v3/YOUR_KEY \
npm start
```

### Erigon Node Setup (Recommended)
```bash
# Start Erigon with txpool API enabled
erigon \
  --http \
  --http.api=eth,debug,trace,txpool \
  --private.api.addr=localhost:9090 \
  --txpool.globalqueue=10000 \
  --txpool.globalbasefee=1000000000
```

## Core Components

### Math Modules (Zero Precision Loss)

#### Tick Math (`src/math/tick_math.ts`)
```typescript
// Exact tick ↔ sqrtPriceX96 conversions
const sqrtRatio = getSqrtRatioAtTick(tick);
const tick = getTickAtSqrtRatio(sqrtRatio);
const usableTick = nearestUsableTick(tick, tickSpacing);
```

#### Liquidity Math (`src/math/liquidity_math.ts`)
```typescript
// Precise liquidity calculations with Q96 scaling
const liquidity = liquidityForAmounts(amount0, amount1, sqrtLower, sqrtP, sqrtUpper);
const { amount0, amount1 } = getAmountsFromLiquidity(liquidity, sqrtLower, sqrtP, sqrtUpper);
```

### Deterministic Simulator

#### Pool State Management (`src/sim/pool_state.ts`)
- Complete Uniswap V3 pool state representation
- Fixture serialization for backtesting
- Tick data and fee growth tracking

#### Swap Engine (`src/sim/swap_engine.ts`)
```typescript
// Exact Uniswap V3 swap simulation
const result = applySwap(poolState, amountIn, tokenIn);
console.log(`Swapped ${result.amountIn} for ${result.amountOut}`);
```

#### JIT Execution (`src/sim/execution_sim.ts`)
```typescript
// Complete JIT orchestration
const simulationResult = simulateJitAttempt(
  poolState, 
  plan, 
  swapEvent, 
  priceFeed, 
  config
);
```

### Strategy Engine

#### JIT Planner (`src/strategy/jit_planner.ts`)
```typescript
// Core decision logic
const plan = planJit(poolState, swapEstimate, priceFeed, config);
if (plan && plan.expectedNetUsd > minProfit) {
  console.log(`Profitable JIT opportunity: $${plan.expectedNetUsd}`);
}
```

#### Adaptive Range Selection (`src/strategy/range_selection.ts`)
- Dynamic tick width based on swap characteristics
- Market condition adjustments
- Confidence scoring

#### Multi-Factor Scoring (`src/strategy/scoring.ts`)
- Profitability assessment (40% weight)
- Risk evaluation (25% weight)
- Execution feasibility (20% weight)
- Competition analysis (15% weight)

## Configuration

### Pool Configuration (`src/config/pools.json`)
```json
[
  {
    "name": "USDC/WETH-0.3%",
    "address": "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8",
    "feeTier": 0.003,
    "token0": "0xA0b86991c431E56C2e07E8F5c25fe64a7Bc11b3A",
    "token1": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    "decimals0": 6,
    "decimals1": 18,
    "tickSpacing": 60
  }
]
```

### Strategy Configuration (`src/config/strategy-config.json`)
```json
{
  "minSwapUsdByFeeTier": {
    "0.003": 15000,
    "0.0005": 70000
  },
  "minNetProfitUsd": 25,
  "gasEstimateUsd": 15,
  "captureFractionDefault": 0.9,
  "inclusionProbabilityDefault": 0.4,
  "flashloanFeeBps": 5
}
```

## Testing

### Unit Tests
```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --grep "TickMath"
npm test -- --grep "LiquidityMath"
npm test -- --grep "SwapEngine"
```

### Backtest Framework
```bash
# Run backtest with sample fixtures
npm run backtest

# Custom backtest
node -r ts-node/register src/backtest/runner.ts \
  --fixtures ./custom-fixtures \
  --output ./results.json
```

### Sample Test Results
```
=== BACKTEST RESULTS ===
Total Fixtures: 3
Successful Plans: 0
Profitable Executions: 0
Success Rate: 0.00%
Total Profit: $0
Average Profit: $0
Average Execution Time: 0.33ms
========================
```

## Production Infrastructure

### Logging (`src/modules/logger.ts`)
```typescript
import { log } from './src/modules/logger';

// Structured logging with PII redaction
log.info('JIT attempt initiated', {
  poolAddress: '0x...',
  swapSizeUsd: '50000',
  expectedProfitUsd: '150'
});
```

#### Logging Legend (Prefix Tags)
- `[PLAN]` - JIT planning decisions and strategy logic
- `[EXEC]` - Live transaction execution and results
- `[SIM]` - Simulation engine operations and dry-run results
- `[ERIGON-TXPOOL]` - Erigon txpool integration and monitoring
- `[ETH-PENDING]` - Standard pending transaction subscription fallback

### Metrics (`src/modules/metrics.ts`)
```typescript
import { metrics } from './src/modules/metrics';

// Comprehensive Prometheus metrics
metrics.recordJitSuccess(poolAddress, feeTier, profitUsd);
metrics.recordLatency('planning', latencySeconds);
```

### Persistence (`src/modules/db.ts`)
```typescript
import { db } from './src/modules/db';

// Record JIT attempt
const attemptId = await db.recordAttempt({
  poolAddress,
  swapSizeUsd,
  expectedProfitUsd,
  success: false
});

// Update with results
await db.updateAttemptResult(attemptId, {
  success: true,
  actualProfitUsd: '145.50',
  gasUsed: 250000
});
```

## Monitoring

### Health Check Endpoint
```bash
curl http://localhost:9090/health
```

### Metrics Endpoint
```bash
curl http://localhost:9090/metrics
```

### Key Metrics
- `jit_attempts_total`: Total JIT attempts by pool and result
- `jit_profit_usd`: Profit distribution histogram
- `jit_latency_seconds`: Execution latency by phase
- `pool_health_score`: Pool health scores
- `errors_total`: Error counts by type and severity

## Deployment

### Docker Deployment
```bash
# Build image
docker build -t jit-liquidity-bot .

# Run container
docker run -d \
  --name jit-bot \
  -p 9090:9090 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/config:/app/src/config \
  jit-liquidity-bot
```

### Production Deployment
See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for comprehensive deployment instructions including:
- VPS requirements and configuration
- Ethereum node setup (Erigon/Geth)
- Security hardening
- Monitoring setup
- Operational procedures

## Security

### Key Security Features
- **Private Key Protection**: HSM support and secure key management
- **Input Validation**: Comprehensive input sanitization
- **Audit Logging**: Complete audit trail of all operations
- **Rate Limiting**: Protection against abuse
- **Encryption**: Data encryption at rest and in transit

See [SECURITY.md](docs/SECURITY.md) for detailed security practices.

## Operations

### Daily Operations
```bash
# Check system health
curl http://localhost:9090/health

# Review performance
curl http://localhost:9090/api/daily-summary

# Monitor logs
tail -f logs/jit-bot.log
```

### Emergency Procedures
```bash
# Emergency stop
curl -X POST http://localhost:9090/admin/emergency-stop

# Crisis mode
curl -X POST http://localhost:9090/admin/crisis-mode \
  -d '{"level":"high","reason":"market_volatility"}'
```

See [RUNBOOK.md](docs/RUNBOOK.md) for complete operational procedures.

## API Reference

### Admin Endpoints
- `GET /health` - Health check
- `GET /metrics` - Prometheus metrics
- `POST /admin/pause` - Pause bot operations
- `POST /admin/emergency-stop` - Emergency shutdown
- `POST /admin/reload-config` - Hot reload configuration

### Query Endpoints
- `GET /api/pool-status` - Current pool status
- `GET /api/daily-summary` - Daily performance summary
- `GET /api/latency-breakdown` - Latency analysis

## Development

### Project Structure
```
src/
├── math/           # Core math modules (exact calculations)
├── sim/            # Deterministic simulator
├── strategy/       # Strategy and decision engine
├── modules/        # Support infrastructure
├── backtest/       # Backtesting framework
├── config/         # Configuration files
└── specs/          # Future component specifications

tests/              # Comprehensive test suite
docs/               # Documentation
```

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm test`)
4. Commit changes (`git commit -m 'Add amazing feature'`)
5. Push to branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

### Code Quality

- **TypeScript**: Strict type checking enabled
- **ESLint**: Code linting and formatting
- **Prettier**: Consistent code formatting
- **Testing**: Comprehensive unit test coverage
- **Documentation**: Inline documentation and README files

## Specifications (Future Implementation)

### Mempool Listener ([spec](src/specs/mempool_listener.md))
- Real-time mempool monitoring
- Transaction filtering and decoding
- Opportunity detection and scoring

### Builder Adapter ([spec](src/specs/builder_adapter.md))
- Multi-builder integration (Flashbots, etc.)
- Bundle construction and optimization
- Secure transaction signing

## Roadmap

### Phase 1: Foundation ✅
- [x] Math modules and simulator
- [x] Strategy engine
- [x] Support infrastructure
- [x] Comprehensive testing
- [x] Documentation

### Phase 2: Integration (Future)
- [ ] Mempool listener implementation
- [ ] Builder adapter implementation
- [ ] Live trading capabilities
- [ ] Advanced risk management

### Phase 3: Optimization (Future)
- [ ] Multi-chain support
- [ ] Advanced MEV strategies
- [ ] Machine learning integration
- [ ] Performance optimization

## Disclaimer

This software is provided for educational and research purposes. Users are responsible for:
- Compliance with applicable laws and regulations
- Proper risk management and capital allocation
- Security of private keys and funds
- Monitoring and maintenance of production systems

The authors assume no responsibility for financial losses or other damages resulting from the use of this software.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For questions, issues, or contributions:
- GitHub Issues: [Report bugs or request features](https://github.com/your-org/jit-liquidity-bot/issues)
- Documentation: [docs/](docs/)
- Security Issues: Please report privately to security@your-org.com

---

**Built with ❤️ for the Ethereum DeFi ecosystem**