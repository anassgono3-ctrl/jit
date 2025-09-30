# Contract scaffold — JIT flashloan receiver (skeleton)

This folder contains a minimal Hardhat + TypeScript contract scaffold that demonstrates how to receive and repay a Balancer-style flashloan, with a production-ready JIT strategy skeleton.

## Scope and intent
- This code does not perform MEV/trading — it provides a clean skeleton and event surface to integrate your own JIT logic.
- Use the `_executeJitStrategy(...)` hook to implement Uniswap V3 mint/burn and any on-chain steps you require.
- Keep development local and fully tested before any mainnet usage.

## Important warnings
- Do not deploy to mainnet without extensive testing, code review/audit, and operational controls.
- Flashloan-based strategies can cause financial loss if mishandled.
- Adapt repay semantics to your target Vault (MockVault uses simple transfer-back; real Vaults may require approvals).

## Quickstart
1. `npm ci`
2. `npm run test:hardhat` (or `npx hardhat test`)

## Fork tests (mainnet-fork with real Balancer Vault)

We pin the fork to a "known-good" mainnet block for stability:

- Default pinned block: `19350000` (overridable via `FORK_BLOCK_NUMBER` in `.env`).
- If the Balancer Vault has flashloans disabled at the pinned block (BAL#102), the test will either skip (default) or fail in strict mode.

Env options:
```
FORK_RPC_URL=...
FORK_BLOCK_NUMBER=19350000      # override if needed
FORK_TEST_MIN_WETH=0.005        # default probe floor for WETH
FORK_TEST_MIN_USDC=500000       # 0.5 USDC (6 decimals)
FORK_STRICT=false               # true to fail instead of skip when unsafe
```

Run:
```
npm run test:fork         # skip when unsafe
npm run test:fork:strict  # fail when unsafe
```

Rationale:
- Pinning makes CI/dev runs reproducible.
- Looser floors and size-probing reduce flakiness from Vault checks while staying conservative.

## Files
- `contracts/BalancerFlashJitReceiver.sol` — JIT receiver skeleton with lifecycle events.
- `contracts/MockVault.sol` — local mock to test flashloan flow end-to-end.
- `contracts/interfaces/` — shared interface definitions (IERC20, IVault) to avoid duplicate artifacts.
- `test/flashloan/flashloan.test.ts` — unit tests asserting repayment and event emission.
- `test/flashloan/balancer_fork.test.ts` — mainnet fork integration test with real Balancer Vault.

## How to implement the JIT logic
1. Implement `_executeJitStrategy(...)`:
   - Compute expected gas/profit off-chain or via constants.
   - Mint transient Uniswap V3 liquidity positions.
   - Perform any matching/swap actions off-chain or through a safe, atomic path.
   - Remove liquidity and collect fees; ensure repay amounts+fees are present.
2. Test locally with `MockVault`, deterministic fixtures, and revert-on-error semantics.
3. Use mainnet fork and static analysis before any real deployment.
4. Consider Flashbots bundles for atomic inclusion; never "experiment" via raw public-mempool transactions.

## Next steps
- Add canonical Uniswap V3 interfaces and tick/liquidity helpers.
- Add profit/gas guards and safety caps.
- Integrate Flashbots off-chain bundling once the strategy is deterministic.