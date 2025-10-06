# Ubuntu VPS + Full Node Deployment Guide

This guide explains how to run the JIT Liquidity Bot on Ubuntu 22.04 with your own Ethereum full node (Erigon or Geth) for low‑latency mempool access.

---

## 1. Hardware & OS Baseline

| Component | Recommendation (Mainnet 2025) |
|-----------|-------------------------------|
| CPU       | 8 physical cores (modern x86_64) |
| RAM       | 32 GB (absolute minimum 16 GB) |
| Disk      | 2 TB NVMe SSD (reserve 20% free) |
| Network   | Symmetric ≥ 1 Gbps preferred |
| OS        | Ubuntu 22.04 LTS (64-bit) |

> Erigon with `--prune=htc` typically 1.6–2.0 TB by late 2025. Plan headroom for growth + logs.

---

## 2. System Preparation

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential jq curl wget git ufw
sudo ufw allow OpenSSH
sudo ufw enable
# (Optionally) allow Prometheus scrape port if remote:
# sudo ufw allow 9090/tcp
```

File descriptor & journald tuning:

```bash
echo "fs.file-max=1000000" | sudo tee /etc/sysctl.d/90-fd.conf
sudo sysctl -p /etc/sysctl.d/90-fd.conf
```

Add to `/etc/security/limits.conf`:
```
* soft nofile 65535
* hard nofile 65535
```

---

## 3. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

---

## 4. (Option A) Run Erigon (Recommended)

### Docker Quick Start

```bash
docker pull erigontech/erigon:latest
mkdir -p $HOME/erigon-data

docker run -d --name erigon \
  -v $HOME/erigon-data:/root/.local/share/erigon \
  -p 8545:8545 -p 8546:8546 \
  --restart=always \
  erigontech/erigon:latest \
  --chain=mainnet \
  --prune=htc \
  --http --http.addr=0.0.0.0 --http.port=8545 \
  --http.api=eth,net,web3,debug,txpool \
  --ws --ws.addr=0.0.0.0 --ws.port=8546 \
  --metrics --metrics.addr=0.0.0.0 --metrics.port=6060
```

> For security, bind to `127.0.0.1` if the bot is on the same host and you do NOT need remote access:
```
--http.addr=127.0.0.1 --ws.addr=127.0.0.1
```

### Systemd (Binary Install Example)

```
[Unit]
Description=Erigon Ethereum Node
After=network-online.target
Wants=network-online.target

[Service]
User=erigon
Group=erigon
Type=simple
ExecStart=/usr/local/bin/erigon \
  --chain=mainnet \
  --prune=htc \
  --http --http.addr=127.0.0.1 --http.port=8545 --http.api=eth,net,web3,debug,txpool \
  --ws --ws.addr=127.0.0.1 --ws.port=8546 \
  --metrics --metrics.addr=127.0.0.1 --metrics.port=6060
Restart=on-failure
RestartSec=5
LimitNOFILE=65535
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
```

---

## 5. (Option B) Run Geth (If You Prefer)

```bash
geth \
  --mainnet \
  --http --http.addr 127.0.0.1 --http.port 8545 \
  --http.api eth,net,web3,debug,txpool \
  --ws --ws.addr 127.0.0.1 --ws.port 8546 \
  --ws.api eth,net,web3,debug,txpool
```

> Geth sync may be slower; for intense mempool strategies Erigon often yields richer txpool APIs.

---

## 6. Clone & Build the Bot

```bash
git clone https://github.com/<your-org-or-user>/jit.git
cd jit
npm ci
npm run build
```

---

## 7. Configure Environment

Create `.env` (minimal dry-run, mempool enabled):

```
DRY_RUN=true
PRIMARY_RPC_WS=ws://127.0.0.1:8546
PRIMARY_RPC_HTTP=http://127.0.0.1:8545
ENABLE_MEMPOOL=true
LOG_LEVEL=info
HEALTHCHECK_PORT=9090
```

Add execution parameters later when deploying live (set `DRY_RUN=false` and supply `PRIVATE_KEY`).

**Important**:  
`PRIVATE_KEY` should be low-value initially. Use dedicated funding, not a personal wallet.  
For Flashbots, generate a separate auth key (unfunded) for `FLASHBOTS_SIGNER_KEY`.

---

## 8. Validate Environment (Optional)

```bash
npx ts-node scripts/validate-env.ts
```

Resolves issues early (e.g., mempool enabled but no RPC).

---

## 9. Run the Bot (Systemd)

Systemd unit file (`/etc/systemd/system/jit-bot.service`):

```
[Unit]
Description=JIT Liquidity Bot
After=network-online.target
Wants=network-online.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/jit
Environment=NODE_ENV=production
ExecStart=/home/ubuntu/jit/scripts/run-vps.sh
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable jit-bot
sudo systemctl start jit-bot
sudo systemctl status jit-bot --no-pager
```

---

## 10. Health & Metrics

```bash
curl http://127.0.0.1:9090/healthz
```

Sample:
```json
{
  "ok": true,
  "dryRun": true,
  "mempool": { "enabled": true, "mode": 1 }
}
```
- `mode=1` => WebSocket
- `mode=2` => HTTP polling
- `mode=0` => disabled

Prometheus scrape:
```
curl http://127.0.0.1:9090/metrics | grep mempool_
```

---

## 11. Going Live (DRY_RUN=false)

Before switching:
1. Deploy your Receiver contract; set `RECEIVER_ADDRESS`.
2. Double-check `EXEC_TOKENS`, `EXEC_AMOUNTS` are sane (small first).
3. Set profit thresholds (`PROFIT_MIN_USD`, `PROFIT_MIN_ETH`).
4. Consider adding Flashbots bundling to reduce frontrun/backrun races.

---

## 12. Security Hardening

- Keep `.env` permissions: `chmod 600 .env`
- Use a distinct Linux user for the bot if higher isolation needed.
- Monitor:
  - Disk: `df -h`
  - Node logs (Erigon/Geth) for peers and chain reorg anomalies.
  - Bot logs for `[profit-guard]` and mempool mode transitions.

---

## 13. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `ECONNREFUSED 127.0.0.1:8546` | Node not fully started | Wait for sync, verify ports listening |
| Health shows `mempool.enabled=false` | Missing RPC or filter unsupported | Provide WS endpoint or run Erigon/Geth locally |
| No swap logs | Router calls not decoded or low activity | Lower thresholds; verify ABI matches mainnet router |
| Execution never triggers | DRY_RUN=true or ProfitGuard blocking | Check `[profit-guard]` logs; set thresholds appropriately |

---

## 14. Next Steps

- Introduce concurrency controls (`EXECUTION_MAX_INFLIGHT`).
- Add gas caps (MAX_BASE_FEE_GWEI / MAX_PRIORITY_FEE_GWEI).
- Integrate real route pricing (Uniswap Quoter / on-chain TWAP).
- Observability dashboards (Grafana panels for mempool throughput, exec success ratio).

---

**You are now production-ready to operate the bot atop your own node.**  
Start small, observe, then iterate on strategy logic safely.
