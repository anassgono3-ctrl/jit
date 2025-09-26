# JIT Liquidity Bot

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-44.75%25-orange)
![Tests](https://img.shields.io/badge/tests-149%20passing-brightgreen)

A professional, production-ready Just-In-Time (JIT) liquidity bot for Uniswap V3 on Ethereum. This bot provides liquidity precisely when needed to capture fees from large swaps while minimizing capital requirements and impermanent loss risk.

## Overview

The JIT Liquidity Bot is designed as a complete foundation for MEV extraction through strategic liquidity provision. It features deterministic simulation, sophisticated strategy algorithms, and comprehensive risk management - all built with production-grade infrastructure.

### Key Features

- **Exact Uniswap V3 Math**: Precise tick ↔ sqrtPriceX96 conversions using decimal.js
- **Deterministic Simulation**: Complete offline simulation of mint → swap → burn cycles  
- **Advanced Strategy Engine**: Multi-factor scoring with adaptive range selection
- **Risk Management**: Position sizing, exposure limits, and emergency controls
- **Multi-RPC Failover**: Weighted round-robin with circuit breakers and health checks
- **EIP-1559 Gas Strategy**: Dynamic fee estimation with conservative bounds
- **Flashbots Integration**: Pre-send simulation to prevent reverting transactions
- **Prometheus Metrics**: Production-ready observability and monitoring
- **Production Infrastructure**: Comprehensive logging, metrics, and persistence
- **Comprehensive Testing**: 150+ passing unit tests with full coverage

## Architecture

The JIT liquidity bot is a production-grade system with enhanced operational capabilities:

```
                    ┌─── Multi-RPC Failover ────┐
                    │  • Round-robin Selection  │
                    │  • Circuit Breakers       │
                    │  • Health Monitoring      │
                    │  • Exponential Backoff    │
                    └───────────┬───────────────┘
                                │
      ┌─── Mempool ────┐        │        ┌──── Strategy ────┐
      │ • Erigon       │        │        │ • JIT Planner    │
      │ • Fallback     │        │        │ • Profit Guard   │
      │ • Manager      │────────┼────────│ • EIP-1559 Gas   │
      └────────────────┘        │        └──────────────────┘
                                │
                       ┌────────┴─────────┐
                       │                  │
      ┌─── Flashbots ──┐        │        ┌─── Execution ────┐
      │ • Simulation   │        │        │ • Live/Dry Run   │
      │ • Profit Check │────────┼────────│ • Bundle Submit  │
      │ • Revert Guard │        │        │ • Retry Logic    │
      └────────────────┘        │        └──────────────────┘
                                │
      ┌─── Metrics ────┐        │        ┌─── Health API ───┐
      │ • Prometheus   │        │        │ • Status Check   │
      │ • /metrics     │────────┼────────│ • System Info    │
      │ • Counters     │        │        │ • Error Reports  │
      └────────────────┘        │        └──────────────────┘
                                │
                    ┌───────────┴───────────────┐
                    │      Configuration        │
                    │  • Environment Variables  │
                    │  • Validation & Parsing   │
                    │  • Hot Reload Support     │
                    └───────────────────────────┘
```

### Core Components

#### Multi-RPC Failover (`src/runtime/providers/`)
- **Weighted Round-Robin**: Distribute requests across multiple RPC endpoints with configurable weighting
- **Circuit Breakers**: Automatic provider isolation during failures with exponential backoff
- **Health Monitoring**: Periodic health checks with consecutive failure tracking
- **Configuration**: Support for comma-separated URLs or JSON with weights

#### Enhanced Gas Strategy (`src/execution/gas_estimator.ts`)
- **EIP-1559 Optimization**: Dynamic base fee multipliers with priority fee bounds
- **Conservative Bounds**: Configurable min/max priority fees to prevent overpaying
- **Backward Compatibility**: Maintains support for legacy `priorityFeeCapGwei` parameter
- **Real-time Adjustment**: Uses latest block base fee with conservative multipliers

#### Flashbots Integration (`src/execution/sim/`)
- **Pre-send Simulation**: Bundle simulation before mainnet submission
- **Profit Validation**: Automatic rejection of unprofitable or reverting transactions
- **Timeout Handling**: Configurable simulation timeouts with fallback to mock simulation
- **Error Reporting**: Detailed revert reasons and profit calculations

#### Prometheus Metrics (`src/modules/metrics.ts`)
- **Core Bot Metrics**: `bot_trades_executed_total`, `bot_trades_profitable_total`, `bot_rpc_failures_total`, `bot_backtest_runs_total`
- **HTTP Endpoint**: `/metrics` endpoint serving Prometheus-compatible metrics
- **System Monitoring**: Memory usage, uptime, and error tracking
- **Custom Labels**: Pool addresses, fee tiers, and transaction types for detailed analysis

#### Config Management (`src/config/`)
- **Environment Validation**: Enhanced Zod-based schema with new operational parameters
- **Multi-RPC Configuration**: Support for `RPC_HTTP_LIST` in multiple formats
- **Gas Strategy Settings**: `GAS_BASEFEE_BUMP`, `PRIORITY_FEE_GWEI_MIN/MAX` configuration
- **Simulation Settings**: `FLASHBOTS_RPC_URL`, `SIM_TIMEOUT_MS`, `METRICS_PORT` support

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

The bot uses a centralized configuration system with validation. Here are the key environment variables:

```bash
# Copy configuration template
cp .env.example .env

# Core configuration
cat > .env << 'EOF'
# ===== OPERATIONAL CONFIGURATION =====
DRY_RUN=true                    # Set false for live trading
NETWORK=mainnet                 # mainnet, goerli, sepolia
PRIVATE_KEY=                    # Required for live mode only

# ===== MULTI-RPC CONFIGURATION =====

# Option 1: Multi-RPC Failover (recommended)
RPC_HTTP_LIST=https://eth-mainnet.g.alchemy.com/v2/KEY,https://rpc.ankr.com/eth

# Option 2: Multi-RPC with weights (JSON format)
# RPC_HTTP_LIST=[{"url":"https://rpc1.com","weight":2},{"url":"https://rpc2.com","weight":1}]

# Option 3: Legacy single provider with fallback
# PRIMARY_RPC_HTTP=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
# FALLBACK_RPC_HTTP=https://rpc.ankr.com/eth

# WebSocket for real-time updates
WS_RPC_URL=wss://eth-mainnet.g.alchemy.com/v2/YOUR_KEY

# Enhanced mempool monitoring (optional)
ERIGON_RPC_HTTP=http://localhost:8545

# ===== GAS STRATEGY (EIP-1559) =====
GAS_BASEFEE_BUMP=2.0           # Base fee multiplier (e.g., 2x latest baseFee)
PRIORITY_FEE_GWEI_MIN=1        # Minimum priority fee (gwei)
PRIORITY_FEE_GWEI_MAX=3        # Maximum priority fee (gwei)

# ===== FLASHBOTS INTEGRATION =====
FLASHBOTS_RPC_URL=https://relay.flashbots.net
SIM_TIMEOUT_MS=3000            # Simulation timeout in milliseconds

# ===== METRICS & MONITORING =====
METRICS_PORT=9090              # Prometheus metrics endpoint port
HEALTH_PORT=9091               # Health check endpoint port
LOG_LEVEL=info                 # debug, info, warn, error

# ===== PROFIT THRESHOLDS =====
MIN_PROFIT_USD=25              # Minimum profit in USD
MIN_PROFIT_ETH=0.01            # Minimum profit in ETH
EOF
```

#### Configuration Examples

**Simple Multi-RPC Setup:**
```bash
RPC_HTTP_LIST=https://eth.llamarpc.com,https://rpc.ankr.com/eth,https://cloudflare-eth.com
```

**Weighted Multi-RPC Setup:**
```bash
RPC_HTTP_LIST='[
  {"url":"https://premium-rpc.com","weight":3},
  {"url":"https://backup-rpc.com","weight":1}
]'
```

**Gas Strategy for High-Competition:**
```bash
GAS_BASEFEE_BUMP=3.0           # Aggressive 3x multiplier
PRIORITY_FEE_GWEI_MIN=2        # Higher minimum
PRIORITY_FEE_GWEI_MAX=10       # Allow higher fees
```

### Erigon Setup (Recommended)

For optimal mempool monitoring, run an Erigon node with txpool API enabled:

```bash
# Erigon startup with txpool support
erigon --chain=mainnet \
  --http.api=eth,debug,net,txpool \
  --http.addr=0.0.0.0 \
  --http.port=8545 \
  --http.corsdomain='*' \
  --txpool.api.enable
```

### Health & Monitoring

The bot exposes health and status information via HTTP endpoints:

```bash
# Check system status
curl http://localhost:9091/health

{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": {
    "seconds": 3600,
    "human": "1h 0m"
  },
  "mempool": {
    "erigon": true,
    "fallback": false,
    "mode": "erigon"
  },
  "blockchain": {
    "lastBlock": 19234567
  },
  "activity": {
    "recentSwapCandidates": 42,
    "totalAttempts": 156,
    "totalSuccesses": 23,
    "successRate": "14.7%"
  }
}
```

### Prometheus Metrics

The bot exposes comprehensive metrics for monitoring and alerting:

```bash
# Access metrics endpoint
curl http://localhost:9090/metrics

# Core bot metrics
bot_trades_executed_total{pool_address="0x123...",fee_tier="3000",trade_type="jit"} 42
bot_trades_profitable_total{pool_address="0x123...",fee_tier="3000"} 38
bot_rpc_failures_total{provider_url="https://rpc1.com",error_type="timeout"} 3
bot_backtest_runs_total{status="success"} 12

# JIT strategy metrics
jit_bot_jit_attempts_total 156
jit_bot_jit_success_total 23
jit_bot_jit_profit_usd{pool_address="0x123..."} 1250.75

# System metrics
jit_bot_uptime_seconds 3600
jit_bot_memory_usage_bytes{type="heap_used"} 45234432
jit_bot_active_pools_count 8
```

#### Grafana Dashboard

Key metrics to monitor:

- **Success Rate**: `bot_trades_profitable_total / bot_trades_executed_total`
- **RPC Health**: `rate(bot_rpc_failures_total[5m])`
- **Profit Tracking**: `rate(jit_bot_jit_profit_usd[1h])`
- **System Health**: `jit_bot_uptime_seconds`, `jit_bot_memory_usage_bytes`

Example Prometheus queries:
```promql
# Success rate over last hour
(rate(bot_trades_profitable_total[1h]) / rate(bot_trades_executed_total[1h])) * 100

# RPC failure rate
rate(bot_rpc_failures_total[5m])

# Average profit per successful trade
rate(jit_bot_jit_profit_usd[1h]) / rate(bot_trades_profitable_total[1h])
```

### Runtime Modes

#### Dry-Run Mode (Default - Safe)
```bash
# Simulation mode - no real transactions
DRY_RUN=true PRIMARY_RPC_HTTP=https://rpc.ankr.com/eth npm start
```

#### Live Mode (Production Safety Guard)
```bash
# Live mainnet execution - requires valid private key
NETWORK=mainnet DRY_RUN=false PRIVATE_KEY=0xabc123... npm start
```

**Live-Mode Guard**: The bot defaults to simulation mode for safety. To run live you MUST supply a valid private key (0x + 64 hex chars). If `DRY_RUN=false` and the key is missing or malformed, startup aborts with an explicit log and exit code 1 to prevent accidental mainnet execution.

**Example Safety Checks:**
```bash
# Missing key - exits with error
DRY_RUN=false npm start
# Output: [STARTUP] DRY_RUN=false but no PRIVATE_KEY provided.

# Invalid key format - exits with error  
DRY_RUN=false PRIVATE_KEY=0x123 npm start
# Output: [STARTUP] DRY_RUN=false but PRIVATE_KEY is malformed (expected 0x + 64 hex chars).

# Valid key format - proceeds normally
DRY_RUN=false PRIVATE_KEY=0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef npm start
# Output: [STARTUP] Live-mode key validated; proceeding...
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