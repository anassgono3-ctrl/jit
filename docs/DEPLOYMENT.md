# JIT Liquidity Bot Deployment Guide

## Infrastructure Requirements

### Server Specifications

#### Recommended VPS Configuration
- **CPU**: 8 vCPU @ 3.5GHz+ (Intel Xeon or AMD EPYC)
- **RAM**: 64 GB DDR4
- **Storage**: 2-4 TB NVMe SSD (high IOPS)
- **Network**: 1 Gbps dedicated connection
- **OS**: Ubuntu 22.04 LTS

#### Performance Considerations
- **Low Latency**: < 5ms to major Ethereum nodes
- **High IOPS**: > 50,000 IOPS for database operations
- **Network Stability**: 99.9% uptime guarantee
- **Clock Synchronization**: NTP configured for accurate timing

### Geographic Placement

#### Primary Locations (Ranked by MEV Performance)
1. **New York/New Jersey** - Optimal for Flashbots and major builders
2. **Frankfurt, Germany** - European MEV activity center
3. **Singapore** - Asian markets (limited MEV activity)

#### Network Latency Requirements
- **To Flashbots**: < 10ms RTT
- **To Major Builders**: < 15ms RTT
- **To Ethereum Archive Nodes**: < 5ms RTT

## Ethereum Node Setup

### Erigon Configuration (Recommended)

#### Installation
```bash
# Install Erigon
wget https://github.com/ledgerwatch/erigon/releases/latest/download/erigon_linux_amd64.tar.gz
tar -xzf erigon_linux_amd64.tar.gz
sudo mv erigon /usr/local/bin/
```

#### Configuration File (`erigon.toml`)
```toml
# Network
chain = "mainnet"
port = 30303
nat = "any"

# RPC
http = true
http.addr = "0.0.0.0"
http.port = 8545
http.corsdomain = "*"
http.vhosts = "*"
http.api = ["eth", "erigon", "engine", "web3", "net", "debug", "trace", "txpool"]

# WebSocket
ws = true
ws.port = 8546

# Database
datadir = "/data/erigon"
snapshots = true
prune = "hrtc"

# Performance
maxpeers = 100
cache = 32GB
db.pagesize = "16KB"

# Archive mode for historical data
prune.history.older = 0
prune.receipts.older = 0
```

#### Startup Script
```bash
#!/bin/bash
erigon \
  --config=/etc/erigon/erigon.toml \
  --log.console.verbosity=3 \
  --metrics \
  --metrics.addr=0.0.0.0 \
  --metrics.port=6060 \
  --txpool.globalqueue=10000 \
  --txpool.globalbasefee=1000000000
```

### Alternative: Geth + Lighthouse

#### Geth Configuration
```bash
geth \
  --http \
  --http.api="eth,net,web3,txpool" \
  --ws \
  --ws.api="eth,net,web3,txpool" \
  --syncmode=full \
  --gcmode=archive \
  --cache=32768 \
  --maxpeers=50 \
  --txpool.globalslots=10000 \
  --txpool.globalqueue=10000
```

## Application Deployment

### Environment Setup

#### System Dependencies
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker $USER

# Install monitoring tools
sudo apt install -y htop iotop nethogs
```

#### Application Installation
```bash
# Clone repository
git clone https://github.com/your-org/jit-liquidity-bot.git
cd jit-liquidity-bot

# Install dependencies
npm ci --production

# Build application
npm run build

# Copy configuration templates
cp .env.example .env
cp src/config/pools.json.example src/config/pools.json
cp src/config/strategy-config.json.example src/config/strategy-config.json
```

### Configuration

#### Environment Variables (`.env`)
```bash
# Node Environment
NODE_ENV=production
LOG_LEVEL=info

# Ethereum Node
ETH_RPC_URL=http://localhost:8545
ETH_WS_URL=ws://localhost:8546

# Database
DB_PATH=./data/jit_bot.json
JSONL_PATH=./data/jit_bot.jsonl

# Monitoring
METRICS_PORT=9090
LOG_FILE=./logs/jit-bot.log

# Security
PRIVATE_KEY_PATH=/secure/keys/jit-bot.key
HSM_ENABLED=false

# Performance
MAX_CONCURRENT_PLANS=10
BACKTEST_ENABLED=true
```

#### Pool Configuration (`src/config/pools.json`)
```json
[
  {
    "name": "USDC/WETH-0.3%",
    "address": "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8",
    "feeTier": 0.003,
    "token0": "0xA0b86991c431E56C2e07E8F5c25fe64a7Bc11b3A",
    "token1": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    "decimals0": 6,
    "decimals1": 18,
    "tickSpacing": 60,
    "enabled": true
  }
]
```

### Docker Deployment

#### Dockerfile Production Build
```dockerfile
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY dist/ ./dist/
COPY src/config/ ./src/config/
COPY docs/ ./docs/

# Create data directory
RUN mkdir -p /app/data /app/logs

# Set permissions
RUN addgroup -g 1001 -S nodejs
RUN adduser -S jitbot -u 1001
RUN chown -R jitbot:nodejs /app
USER jitbot

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:9090/health || exit 1

EXPOSE 9090
CMD ["node", "dist/index.js"]
```

#### Docker Compose Setup
```yaml
version: '3.8'

services:
  jit-bot:
    build: .
    container_name: jit-liquidity-bot
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
      - ./config:/app/src/config
      - /secure/keys:/secure/keys:ro
    environment:
      - NODE_ENV=production
      - ETH_RPC_URL=http://host.docker.internal:8545
    depends_on:
      - prometheus
      - grafana
    networks:
      - jit-network

  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "9091:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
    networks:
      - jit-network

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3000:3000"
    volumes:
      - grafana-storage:/var/lib/grafana
      - ./monitoring/grafana:/etc/grafana/provisioning
    networks:
      - jit-network

volumes:
  grafana-storage:

networks:
  jit-network:
    driver: bridge
```

## Security Configuration

### Private Key Management

#### Hardware Security Module (HSM)
```bash
# Install HSM drivers (example for AWS CloudHSM)
wget https://s3.amazonaws.com/cloudhsmv2-software/CloudHsmClient/EL7/cloudhsm-client-latest.el7.x86_64.rpm
sudo yum install -y ./cloudhsm-client-latest.el7.x86_64.rpm

# Configure HSM
sudo vim /opt/cloudhsm/etc/cloudhsm_client.cfg
```

#### Local Key Storage (Development Only)
```bash
# Create secure key directory
sudo mkdir -p /secure/keys
sudo chmod 700 /secure/keys

# Generate new private key (for testing only)
openssl rand -hex 32 > /secure/keys/jit-bot.key
sudo chmod 600 /secure/keys/jit-bot.key
sudo chown jitbot:jitbot /secure/keys/jit-bot.key
```

### Firewall Configuration

#### UFW Setup
```bash
# Enable firewall
sudo ufw enable

# Allow SSH
sudo ufw allow 22/tcp

# Allow Ethereum node
sudo ufw allow 8545/tcp
sudo ufw allow 8546/tcp
sudo ufw allow 30303/tcp

# Allow monitoring
sudo ufw allow 9090/tcp

# Block everything else
sudo ufw default deny incoming
sudo ufw default allow outgoing
```

### SSL/TLS Configuration

#### Let's Encrypt Setup
```bash
# Install certbot
sudo apt install certbot

# Generate certificates
sudo certbot certonly --standalone -d your-domain.com

# Configure auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Monitoring Setup

### Prometheus Configuration (`monitoring/prometheus.yml`)
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'jit-bot'
    static_configs:
      - targets: ['jit-bot:9090']
  
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
  
  - job_name: 'erigon'
    static_configs:
      - targets: ['localhost:6060']
```

### Grafana Dashboards
- **JIT Performance**: Success rates, profit tracking, latency
- **System Health**: CPU, memory, disk, network
- **Ethereum Node**: Sync status, peer count, gas prices

### Alerting Rules

#### Critical Alerts
- Ethereum node disconnection
- Private key access failures
- Profit below threshold for > 1 hour
- High error rates (>5%)

#### Warning Alerts
- Low success rate (<50%)
- High latency (>100ms)
- Disk space low (<20%)
- Memory usage high (>80%)

## Operational Procedures

### Startup Sequence
1. Start Ethereum node and wait for sync
2. Verify node health and API access
3. Start JIT bot application
4. Verify metrics endpoint
5. Run health checks
6. Enable production mode

### Health Checks
```bash
# Check Ethereum node
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' \
  http://localhost:8545

# Check JIT bot health
curl http://localhost:9090/health

# Check metrics
curl http://localhost:9090/metrics
```

### Backup Procedures
```bash
# Backup configuration
tar -czf backup-config-$(date +%Y%m%d).tar.gz src/config/

# Backup historical data
tar -czf backup-data-$(date +%Y%m%d).tar.gz data/

# Backup logs
tar -czf backup-logs-$(date +%Y%m%d).tar.gz logs/
```

### Disaster Recovery

#### Emergency Shutdown
```bash
# Graceful shutdown
docker-compose down

# Emergency stop (if needed)
sudo pkill -f "jit-bot"
```

#### Recovery Procedure
1. Verify Ethereum node sync status
2. Restore configuration from backup
3. Restore historical data (optional)
4. Start application in safe mode
5. Verify all systems operational
6. Enable production mode

## Performance Tuning

### System Optimization
```bash
# Increase file descriptor limits
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# Network tuning
echo "net.core.rmem_max = 134217728" >> /etc/sysctl.conf
echo "net.core.wmem_max = 134217728" >> /etc/sysctl.conf
echo "net.ipv4.tcp_congestion_control = bbr" >> /etc/sysctl.conf
sysctl -p
```

### Application Tuning
- Adjust `MAX_CONCURRENT_PLANS` based on CPU cores
- Tune database auto-save intervals
- Optimize log levels for performance
- Configure connection pooling

This deployment guide provides comprehensive instructions for setting up a production-ready JIT liquidity bot with proper security, monitoring, and operational procedures.