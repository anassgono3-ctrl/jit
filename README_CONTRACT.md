# Contract scaffold (educational)

This folder adds a minimal Hardhat + TypeScript contract scaffold that demonstrates
how to receive and repay a Balancer-style flashloan in a safe, testable manner.

## Important warnings
- This code is educational only. It **does not** perform any MEV extraction.
- Do not deploy on mainnet without extensive testing, audits, legal review, and operational controls.
- Flashloan use can cause financial harm; be responsible.

## Quickstart
1. `npm ci`
2. `npx hardhat test` or `npm run test:hardhat`

## Files
- `contracts/BalancerFlashJitReceiver.sol` — receiver scaffold
- `contracts/MockVault.sol` — local mock to test flashloan flow
- `test/flashloan/flashloan.test.ts` — unit tests

## Next steps (if you decide to proceed)
- Implement your strategy *locally* and test extensively with MockVault and deterministic fixtures
- Add comprehensive unit/integration tests that model price impact, slippage, and gas
- Do not enable any live mempool or automated live execution until you understand and accept the risks