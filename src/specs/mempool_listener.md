# Mempool Listener Specification

## Overview

The mempool listener is responsible for monitoring pending transactions in the Ethereum mempool to identify profitable JIT liquidity opportunities. This component will **NOT** be implemented in this PR but serves as a specification for future implementation.

## Core Requirements

### 1. Mempool Access
- Subscribe to pending transactions via:
  - Erigon txpool API (preferred for low latency)
  - Public WebSocket endpoints (fallback)
  - Private mempool services (premium option)

### 2. Transaction Filtering
- Focus on Uniswap V3 router transactions
- Filter by target pools from our pool configuration
- Prioritize high-value swaps (> minimum thresholds)

### 3. Transaction Decoding
- Decode router `exactInputSingle` calls
- Decode router `exactInput` (multi-hop) calls  
- Decode direct pool `swap` calls
- Extract: token addresses, amounts, minimum output, deadline

### 4. Opportunity Assessment
- Convert amounts to USD using price feeds
- Check against minimum swap size thresholds
- Estimate gas price and priority fee
- Calculate time-to-inclusion estimate

## Architecture

```
Mempool Sources → Transaction Filter → Decoder → Opportunity Scorer → JIT Planner
     ↓                   ↓               ↓            ↓                ↓
  Erigon API         Router Calls    Token Amounts   USD Value      JIT Plan
  WebSocket          Pool Swaps      Gas Price       Profitability  
  Private Feed       Multi-hop       Deadline        Competition    
```

## Implementation Details

### Transaction Sources
```typescript
interface MempoolSource {
  subscribe(callback: (tx: PendingTransaction) => void): void;
  unsubscribe(): void;
  getLatency(): number; // ms
  isHealthy(): boolean;
}
```

### Transaction Filtering
- **Router Addresses**: Track all Uniswap V3 router versions
- **Function Selectors**: `exactInputSingle`, `exactInput`, `exactOutput`, etc.
- **Pool Addresses**: Only monitored pools from configuration
- **Value Thresholds**: Minimum USD values by pool fee tier

### Decoding Logic
```typescript
interface SwapDecoded {
  poolAddress: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minimumAmountOut: string;
  recipient: string;
  deadline: number;
  gasPrice: string;
  priorityFee: string;
}
```

### Opportunity Scoring
- **Size Score**: Larger swaps = higher score
- **Competition Score**: Lower gas price = higher score  
- **Time Score**: More time until deadline = higher score
- **Pool Health Score**: Better liquidity = higher score

## Privacy & Security

### Data Handling
- **No PII Storage**: Never store user addresses or transaction details
- **Minimal Logging**: Only aggregate statistics and errors
- **Secure Transmission**: Use TLS for all external connections

### MEV Ethics
- **No Front-running**: Only provide liquidity, never front-run users
- **Fair Pricing**: Use market prices, don't exploit slippage
- **User Benefits**: JIT liquidity reduces slippage for users

### Operational Security
- **Private Relays**: Use private mempools when possible
- **Rotate Endpoints**: Don't rely on single mempool source
- **Rate Limiting**: Respect API limits of external services

## Performance Requirements

### Latency Targets
- **Detection to Planning**: < 50ms
- **Planning to Execution**: < 100ms  
- **Total End-to-End**: < 150ms

### Throughput
- **Process Rate**: 1000+ transactions/second
- **Filter Efficiency**: > 99% rejection rate
- **Memory Usage**: < 100MB steady state

### Reliability
- **Uptime**: 99.9% availability
- **Error Recovery**: Automatic failover between sources
- **Health Monitoring**: Real-time status dashboard

## Monitoring & Observability

### Key Metrics
- Transactions processed per second
- Opportunity detection rate
- False positive rate (unprofitable opportunities)
- Latency distribution (p50, p95, p99)
- Error rates by source

### Alerting
- Mempool source disconnection
- Unusual transaction patterns
- Performance degradation
- Error rate spikes

## Configuration

### Pool Configuration
```json
{
  "monitoredPools": [
    {
      "address": "0x...",
      "minSwapUsd": 10000,
      "maxGasPrice": 200,
      "enabled": true
    }
  ]
}
```

### Source Configuration
```json
{
  "sources": [
    {
      "type": "erigon",
      "endpoint": "ws://localhost:8545",
      "priority": 1,
      "enabled": true
    },
    {
      "type": "websocket", 
      "endpoint": "wss://api.example.com/mempool",
      "priority": 2,
      "enabled": true
    }
  ]
}
```

## Integration Points

### Input Interfaces
- **Mempool Sources**: WebSocket/HTTP APIs
- **Price Feeds**: Real time token prices
- **Pool States**: Current liquidity and prices

### Output Interfaces
- **JIT Planner**: Opportunity notifications
- **Metrics**: Performance and business metrics
- **Logging**: Structured event logs

### Error Handling
- **Source Failures**: Automatic failover
- **Decode Errors**: Skip and log invalid transactions
- **Rate Limiting**: Backoff and retry logic

## Testing Strategy

### Unit Tests
- Transaction decoding accuracy
- Filtering logic correctness
- Opportunity scoring algorithms

### Integration Tests
- End-to-end mempool to JIT flow
- Failover between mempool sources
- Performance under load

### Simulation Tests
- Historical mempool replay
- Latency impact analysis
- Competition modeling

## Future Enhancements

### Advanced Features
- **MEV Auction Integration**: Participate in PBS auctions
- **Bundle Optimization**: Combine multiple opportunities
- **Dynamic Thresholds**: Adjust parameters based on network conditions

### Scalability
- **Multi-instance Deployment**: Horizontal scaling
- **Sharding**: Partition by pool or token type
- **Caching**: Redis for hot path data

This specification provides the foundation for implementing a production-ready mempool listener that can identify profitable JIT opportunities while maintaining ethical MEV practices and operational excellence.