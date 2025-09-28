# Erigon Setup (for Mempool)

## Why Erigon
- txpool_content and optional txpool_watch provide low-latency pending txs.
- Tunable DB cache and snapshotting make it fast and resilient.

## Suggested VPS (Vultr or similar)
- 32 GB RAM, 8–16 vCPU (dedicated), 1–2 TB NVMe SSD
- Region: EU (Frankfurt / Amsterdam / London)
- OS: Ubuntu 24.04 LTS or Debian stable

## Basic steps
1. Install Erigon following upstream docs.
2. Enable txpool: add flags to your systemd unit (example):
```
--http --http.addr=0.0.0.0 --http.port=8545 --http.api=eth,debug,net,erigon,web3,txpool
--private.api.addr=127.0.0.1:9090
--db.size.limit=2048GB
```
3. Open firewall only to trusted origins, or keep RPC bound to localhost.
4. Keep frequent snapshots/backups for fast recovery.

## Bot configuration
- Set ERIGON_RPC_HTTP=http://127.0.0.1:8545
- Keep RPC_HTTP_LIST populated with at least one fallback RPC.
- Do not enable ENABLE_MEMPOOL until Erigon is synced and stable.