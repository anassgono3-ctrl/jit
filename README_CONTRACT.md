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

## Files
- `contracts/BalancerFlashJitReceiver.sol` — JIT receiver skeleton with lifecycle events.
- `contracts/MockVault.sol` — local mock to test flashloan flow end-to-end.
- `test/flashloan/flashloan.test.ts` — unit tests asserting repayment and event emission.

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