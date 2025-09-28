# Deployment Guide

This bot is safe-by-default. Read this carefully before flipping any live switches.

## Quick checklist
- DRY_RUN=true by default. Only set DRY_RUN=false when you have a valid PRIVATE_KEY and understand the risks.
- ENABLE_MEMPOOL=false by default. Enable only when you have a stable Erigon node and want to process pending swaps live.
- Set at least one RPC endpoint via RPC_HTTP_LIST (CSV or JSON).
- Consider safety caps like MAX_DAILY_GAS_USD or TRADE_CAP to prevent runaway spend.

## Recommended environment (.env)
```
DRY_RUN=true
NETWORK=mainnet
RPC_HTTP_LIST=https://<your-rpc>
ENABLE_MEMPOOL=false
# Optional:
ERIGON_RPC_HTTP=http://127.0.0.1:8545
FLASHBOTS_RPC_URL=
MAX_DAILY_GAS_USD=0
TRADE_CAP=0
```

## Going live
- Set DRY_RUN=false and provide a valid PRIVATE_KEY (0x + 64 hex).
- Flip ENABLE_MEMPOOL=true only when your Erigon node is healthy and local latency is low.
- Monitor logs and metrics; review Caps and exit conditions.

See ERIGON_SETUP.md for node setup guidance.