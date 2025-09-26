# Contributing to JIT Liquidity Bot

## Development Setup

1. **Prerequisites**
   - Node.js 18+ (recommended: 20.x)
   - npm 9+
   - Git

2. **Installation**
   ```bash
   git clone https://github.com/anassgono3-ctrl/jit
   cd jit
   npm ci
   ```

3. **Development workflow**
   ```bash
   # Run tests
   npm test
   
   # Run linter
   npm run lint
   
   # Run backtest
   npm run backtest
   
   # Verify numeric safety
   npm run verify:numeric
   
   # Build project  
   npm run build
   ```

## Code Quality Standards

### TypeScript Version Policy

**Current Policy: TypeScript ~5.3.3 (locked)**

- TypeScript is **pinned to ~5.3.3** for parser compatibility
- `@typescript-eslint/*` packages are **version-aligned** with TypeScript
- **DO NOT** upgrade TypeScript major/minor versions without team approval

**Rationale:**
- New TypeScript versions can break ESLint parser compatibility
- Parser ecosystem needs time to catch up with new TS releases  
- Stable builds are prioritized over bleeding-edge features

**Upgrade Process:**
1. Check `@typescript-eslint/parser` compatibility with new TS version
2. Verify all devDependencies support the new version
3. Test full build pipeline including CI
4. Update this policy document with new locked version
5. Get approval from team lead before merging

### Numeric Safety Requirements

- **NEVER** use `Number()` constructor in `src/math/` or `src/sim/` modules
- Use `BigInt`, `JSBI`, or `Decimal.js` for all numeric operations
- CI will fail if unsafe `Number(` usage is detected
- Run `npm run verify:numeric` before committing

### Testing Requirements

- **Coverage**: Maintain ≥70% test coverage for new modules
- **Unit Tests**: Every new module requires ≥1 unit test file
- **Boundary Tests**: Add edge case tests for math operations
- **Integration Tests**: Test module interactions for critical paths
- **Config Validation**: Test all config validation scenarios
- **Error Handling**: Test failure modes and recovery paths

```bash
# Run tests with coverage
npm run test:coverage

# Coverage must meet thresholds
npm run test:coverage -- --check-coverage
```

### New Module Requirements

When adding new modules, ensure:

1. **Config Integration**: Use `loadConfig()` for environment variables
2. **Logging**: Use structured logging with appropriate context
3. **Metrics**: Add relevant metrics using the metrics interface
4. **Error Handling**: Implement graceful degradation
5. **Testing**: Comprehensive unit tests with ≥70% coverage
6. **Documentation**: Update README if user-facing

### Code Style

- Use ESLint configuration (extends project rules)
- Format with Prettier: `npm run format`
- Follow existing patterns for:
  - Error handling
  - Logging with structured fields
  - Async/await usage
  - Type definitions

## Architecture Guidelines

### Module Structure

```
src/
├── config/         # Environment validation and configuration management
├── execution/      # Profit guards, gas estimation, simulation hooks
├── health/         # HTTP health endpoint and status reporting
├── metrics/        # Observability hooks and metrics interface
├── runtime/        # Connection management, retry logic, mempool orchestration
├── math/           # Core mathematical operations (numeric safety critical)
├── sim/            # Simulation engine (numeric safety critical)  
├── strategy/       # JIT planning logic
├── modules/        # Shared utilities (logger, metrics, db)
├── backtest/       # Backtesting framework
└── specs/          # Future component specifications
```

### Logging Standards

Use structured logging with appropriate context:

```typescript
import { log } from '../modules/logger';

// Good: Structured with context
log.info('JIT plan executed', { 
  poolAddress: '0x123...', 
  profitUsd: 45.67,
  gasUsed: 180000 
});

// Good: Error with details
log.error('Transaction failed', { 
  txHash: '0xabc...', 
  error: error.message,
  gasPrice: gasPrice.toString()
});
```

Module-specific logging patterns:
- `[PLAN]` - JIT planning decisions → use `log.info()` or `log.logStrategyDecision()`
- `[EXEC]` - Execution/simulation results → use `log.info()` or `log.logJitAttempt()`
- `[CONFIG]` - Configuration validation → use structured fields
- `[HEALTH]` - Health and monitoring → include metrics context
- Mempool monitoring → use existing patterns in ErigonTxpoolMonitor and PendingTransactionMonitor

### Error Handling

- Use proper TypeScript error types
- Log errors with context using structured fields
- Graceful degradation for non-critical failures
- Clear error messages for operational debugging

## Pull Request Process

1. **Branch naming**: `feature/description` or `fix/description`
2. **Commits**: Use conventional commits format
3. **Testing**: Ensure all checks pass:
   ```bash
   npm run lint
   npm run verify:numeric  
   npm test
   npm run backtest
   npm run build
   ```
4. **Documentation**: Update relevant docs if needed
5. **Review**: At least one approving review required

## Release Process

1. Version bump using semantic versioning
2. Generate changelog from conventional commits  
3. Tag release with `v{version}`
4. Deploy to production environment
5. Monitor metrics and logs post-deployment

## Questions?

- Check existing issues and discussions
- Review architecture documentation in `docs/`
- Ask in team chat for quick questions
- Open an issue for feature requests or bugs