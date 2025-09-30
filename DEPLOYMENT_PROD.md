# Production Deployment Guide (VPS)

This guide helps you run the JIT Liquidity Bot on a VPS (e.g., Vultr/Hetzner/OVH).

## 1. Server prerequisites
- Ubuntu 22.04 LTS
- 4 vCPU, 8–16 GB RAM, 80+ GB NVMe
- Node.js 20+ (recommended via NodeSource or nvm)
- Optional: Docker (for exporter stacks), Grafana/Prometheus elsewhere

## 2. Clone and install
```bash
git clone https://github.com/<owner>/<repo>.git
cd <repo>
npm ci
```

## 3. Configure environment
Copy .env.example to .env and set:
- PRIVATE_KEY, RPC URLs (e.g., PRIMARY_RPC_HTTP, FORK_RPC_URL if needed)
- DRY_RUN=false for live mode, or keep true to simulate
- LOG_PRETTY=false in production for structured JSON logs
- HEALTHCHECK_PORT=9090 (default)

Example:
```
PRIVATE_KEY=0xabc... # 64 hex chars with 0x
DRY_RUN=false
PRIMARY_RPC_HTTP=https://eth-mainnet.g.alchemy.com/v2/KEY
HEALTHCHECK_PORT=9090
LOG_LEVEL=info
LOG_PRETTY=false
```

## 4. Build and run
```bash
npm run build
./scripts/run-vps.sh
```

Verify:
- Health: curl http://localhost:9090/healthz → 200 OK {"ok":true}
- Metrics: curl http://localhost:9090/metrics

## 5. Optional: systemd unit
Create /etc/systemd/system/jit-bot.service:
```
[Unit]
Description=JIT Liquidity Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/<repo>
Environment=NODE_ENV=production
ExecStart=/home/ubuntu/<repo>/scripts/run-vps.sh
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable jit-bot
sudo systemctl start jit-bot
sudo systemctl status jit-bot --no-pager
```

## 6. Safety and ops
- Pre-send simulation is available via runtime helpers (see src/runtime/safety.ts).
- Runtime caps: use MIN_PROFIT_USD, MAX_DAILY_GAS_USD, TRADE_CAP.
- Graceful shutdown via SIGINT/SIGTERM is built in.

## 7. Observability
- Logs: JSON by default (ingest into ELK/Loki). Set LOG_PRETTY=true for local readability.
- Metrics: Prometheus at /metrics (port HEALTHCHECK_PORT).
- Health: /healthz 200 OK when started and config is sane.

## 8. CI and tests
- Unit tests run by default.
- Balancer fork integration test is optional (depends on mainnet state). It does not block CI by default; run manually with:
  - npm run test:fork
  - npm run test:fork:strict (optional strict mode)

Stay safe:
- Start with DRY_RUN=true and observe behavior.
- Rotate keys and protect .env files.
- Alerts on gas spend and error spikes.
