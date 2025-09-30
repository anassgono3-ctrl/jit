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

## Fork testing
To run mainnet fork tests against the real Balancer Vault:

1. Set `.env`:
   ```
   FORK_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
   # optional tweaks
   # FORK_BLOCK_NUMBER=19123456
   # FORK_TEST_MIN_WETH=0.01
   # FORK_TEST_MIN_USDC=1000000
   # FORK_STRICT=true
   ```
2. Run local unit tests:
   ```
   npm run test:hardhat
   ```
3. Run Balancer fork test:
   ```
   npm run test:fork
   ```

The fork test uses `staticCall` probing to find safe flashloan amounts and auto-downsizes to avoid BAL#102 errors. Set `FORK_STRICT=true` to fail rather than skip when conditions are not met.

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