# Contract scaffold — JIT flashloan receiver (with slippage + quoting)

The BalancerFlashJitReceiver now supports:
- Uniswap V3 swap in the flashloan callback (optional; set router first).
- Slippage guard using a Uniswap V3 Quoter (quoteExactInputSingle) to compute amountOutMinimum.
- Fallback to amountOutMinimum = 0 when the quoter is unavailable (with an event log) to keep tests/forks resilient.

Configure on-chain once after deploying your receiver:
- setSwapRouter(UNISWAP_V3_ROUTER)
- setQuoter(UNISWAP_V3_QUOTER)
- setDefaultPoolFee(3000) // or 500, 10000, etc.
- setMaxSlippageBps(200)
- setSlippageBps(50)

Notes:
- In DRY_RUN and/or without a router/quoter configured, the swap path is a no-op or uses minOut=0 fallback.
- For production, set sane slippage (e.g., 50 bps) and avoid 0 minOut unless you have other safeguards (off-chain quotes, circuit breakers).
