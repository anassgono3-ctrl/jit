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

- Maintain test coverage for critical paths
- Add boundary tests for math operations
- Backtest schema validation must pass
- All tests must pass: `npm test`

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
├── math/           # Core mathematical operations (numeric safety critical)
├── sim/            # Simulation engine (numeric safety critical)  
├── strategy/       # JIT planning logic
├── modules/        # Shared utilities (logger, metrics, db)
├── runtime/        # Execution environment (mempool, sender)
├── backtest/       # Backtesting framework
└── config/         # Configuration schemas
```

### Logging Standards

Use structured logging with appropriate tags:
- `[PLAN]` - JIT planning decisions
- `[EXEC]` - Execution/simulation results
- `[SIM]` - Simulation engine operations
- `[ERIGON-TXPOOL]` - Erigon txpool integration
- `[ETH-PENDING]` - Standard pending tx subscription

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