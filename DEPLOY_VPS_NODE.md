# Running Your Own Node (Erigon or Geth) for Mempool + Bot

This guide shows how to run a full node with WS + HTTP enabled and wire the bot to it.

## Requirements
- Ubuntu 22.04 LTS
- 8–16 GB RAM (more is better), NVMe SSD
- Open firewall only to local network/localhost; do NOT expose public RPC to the internet

## Erigon (recommended for txpool performance)
Example flags (adjust paths and ports):
```bash
erigon \
  --chain mainnet \
  --datadir /data/erigon \
  --http --http.addr 127.0.0.1 --http.port 8545 \
  --http.api eth,net,web3,debug,txpool \
  --ws --ws.addr 127.0.0.1 --ws.port 8546 \
  --metrics --metrics.addr 127.0.0.1 --metrics.port 6060
```

Systemd service example:
```
[Unit]
Description=Erigon full node
After=network-online.target
Wants=network-online.target

[Service]
User=ubuntu
ExecStart=/usr/local/bin/erigon --chain mainnet --datadir /data/erigon --http --http.addr 127.0.0.1 --http.port 8545 --http.api eth,net,web3,debug,txpool --ws --ws.addr 127.0.0.1 --ws.port 8546
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Geth
Example flags:
```bash
geth \
  --mainnet \
  --http --http.addr 127.0.0.1 --http.port 8545 --http.api eth,net,web3,debug,txpool \
  --ws --ws.addr 127.0.0.1 --ws.port 8546 --ws.api eth,net,web3,debug,txpool
```

## Bot wiring
In `.env`:
```
PRIMARY_RPC_WS=ws://127.0.0.1:8546
PRIMARY_RPC_HTTP=http://127.0.0.1:8545
ENABLE_MEMPOOL=true
```

The bot will:
- Prefer WS for mempool subscriptions (provider.on('pending')).
- Fall back to HTTP polling (eth_newPendingTransactionFilter) if WS is not set or unavailable and your RPC supports filters.
- Disable mempool watcher gracefully if neither is available.

## Security
- Bind RPC to 127.0.0.1 or your private VLAN only.
- Use a separate, unprivileged user for node services.
- Monitor node disk usage and auto-rotate logs.

## Validate locally
- Start your node and the bot.
- Check /healthz → `{ "mempool": { "enabled": true, "mode": 1 } }` for WS, or `{ ..., "mode": 2 }` for polling.
- Scrape Prometheus `/metrics` for `mempool_enabled` and `mempool_mode`.
