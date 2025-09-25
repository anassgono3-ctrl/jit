# JIT Liquidity Bot Operations Runbook

## Overview

This runbook provides step-by-step procedures for operating the JIT Liquidity Bot in production. It covers normal operations, troubleshooting, and emergency procedures.

## Daily Operations

### Morning Checklist
1. **System Health Check**
   ```bash
   # Check overall system status
   curl http://localhost:9090/health
   
   # Verify Ethereum node sync
   curl -X POST -H "Content-Type: application/json" \
     --data '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' \
     http://localhost:8545
   ```

2. **Review Overnight Performance**
   - Check Grafana dashboards for anomalies
   - Review profit/loss summary
   - Verify no critical alerts fired

3. **Validate Configuration**
   - Pool configurations are current
   - Strategy parameters are optimal
   - No pools disabled unexpectedly

### Monitoring Dashboard Review

#### Key Metrics to Monitor
- **Success Rate**: Should be > 60% during active periods
- **Average Profit**: Should exceed gas costs by 2x minimum
- **Latency**: End-to-end execution < 150ms
- **Error Rate**: Should be < 5%
- **Pool Health**: All monitored pools should be healthy

#### Daily KPIs
```bash
# Get daily summary
curl http://localhost:9090/api/daily-summary

# Expected output:
{
  "date": "2024-01-01",
  "totalAttempts": 145,
  "successfulAttempts": 89,
  "successRate": 0.614,
  "totalProfitUsd": "2,840.50",
  "averageProfitUsd": "31.91",
  "topPerformingPool": "USDC/WETH-0.3%"
}
```

## Lifecycle Management

### Safe Startup Procedure
```bash
# 1. Verify Ethereum node is fully synced
./scripts/check-node-sync.sh

# 2. Run pre-flight checks
npm run preflight-check

# 3. Start in test mode first
NODE_ENV=test npm start

# 4. Run validation tests
npm run validate-live

# 5. Switch to production mode
NODE_ENV=production npm start
```

### Graceful Shutdown
```bash
# 1. Stop accepting new opportunities
curl -X POST http://localhost:9090/admin/pause

# 2. Wait for current operations to complete
sleep 30

# 3. Graceful shutdown
npm run stop

# 4. Verify all positions are closed
npm run verify-no-open-positions
```

### Configuration Updates

#### Pool Configuration Changes
```bash
# 1. Validate new configuration
npm run validate-config src/config/pools.json

# 2. Create backup
cp src/config/pools.json src/config/pools.json.backup.$(date +%Y%m%d)

# 3. Apply configuration (hot reload)
curl -X POST http://localhost:9090/admin/reload-pools

# 4. Verify changes
curl http://localhost:9090/admin/pool-status
```

#### Strategy Parameter Updates
```bash
# 1. Update strategy-config.json
vim src/config/strategy-config.json

# 2. Validate parameters
npm run validate-strategy-config

# 3. Hot reload (if supported)
curl -X POST http://localhost:9090/admin/reload-strategy

# 4. Monitor impact
tail -f logs/jit-bot.log | grep "strategy_decision"
```

## Troubleshooting

### Common Issues

#### Issue: Low Success Rate
**Symptoms**: Success rate < 40%
```bash
# Diagnosis
curl http://localhost:9090/metrics | grep jit_success_rate

# Check for common causes
tail -n 1000 logs/jit-bot.log | grep "failed" | sort | uniq -c
```

**Resolution Steps**:
1. Check gas price competitiveness
2. Verify mempool connectivity
3. Review inclusion probability model
4. Adjust strategy parameters

#### Issue: High Latency
**Symptoms**: Execution time > 200ms
```bash
# Check latency breakdown
curl http://localhost:9090/api/latency-breakdown

# Monitor real-time latency
tail -f logs/jit-bot.log | grep "execution_time"
```

**Resolution Steps**:
1. Check Ethereum node performance
2. Verify network connectivity
3. Review application performance
4. Consider scaling resources

#### Issue: Ethereum Node Disconnection
**Symptoms**: RPC errors, sync status false
```bash
# Check node status
systemctl status erigon

# Check node logs
journalctl -u erigon -f

# Test RPC connectivity
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://localhost:8545
```

**Resolution Steps**:
1. Restart Ethereum node service
2. Check disk space and IOPS
3. Verify network connectivity
4. Consider alternative node endpoints

### Performance Diagnostics

#### Memory Usage Analysis
```bash
# Check application memory
ps aux | grep "jit-bot"

# Check system memory
free -h

# Node.js heap analysis (if needed)
kill -USR2 <jit-bot-pid>  # Generates heap dump
```

#### CPU Performance Analysis
```bash
# Check CPU usage
top -p $(pgrep -f "jit-bot")

# Profile application (if needed)
npm run profile
```

#### Database Performance
```bash
# Check database file sizes
ls -lh data/

# Analyze JSONL logs
tail -n 1000 data/jit_bot.jsonl | jq '.type' | sort | uniq -c

# Database cleanup (if needed)
npm run db-cleanup
```

## Emergency Procedures

### Emergency Stop (Kill Switch)
```bash
# Immediate shutdown
curl -X POST http://localhost:9090/admin/emergency-stop

# Force kill if needed
sudo pkill -f "jit-bot"

# Verify no open positions
npm run emergency-position-check
```

### Market Crisis Response
**Triggers**: Unusual market volatility, network congestion, flash crashes

**Immediate Actions**:
1. Pause all new JIT attempts
2. Monitor existing positions
3. Assess market conditions
4. Consider position closure

```bash
# Crisis mode activation
curl -X POST http://localhost:9090/admin/crisis-mode \
  -H "Content-Type: application/json" \
  -d '{"level": "high", "reason": "market_volatility"}'
```

### Security Incident Response

#### Suspected Compromise
1. **Immediate Isolation**
   ```bash
   # Emergency stop
   curl -X POST http://localhost:9090/admin/emergency-stop
   
   # Disable network access
   sudo ufw deny out
   ```

2. **Assessment**
   - Check for unauthorized transactions
   - Review access logs
   - Verify private key integrity

3. **Recovery**
   - Rotate private keys
   - Rebuild from clean image
   - Implement additional security measures

### Data Recovery

#### Configuration Recovery
```bash
# Restore from backup
cp backups/config-backup-YYYYMMDD.tar.gz ./
tar -xzf config-backup-YYYYMMDD.tar.gz

# Validate restored configuration
npm run validate-config src/config/pools.json
```

#### Historical Data Recovery
```bash
# Restore database
cp backups/data-backup-YYYYMMDD.tar.gz ./
tar -xzf data-backup-YYYYMMDD.tar.gz

# Verify data integrity
npm run verify-database
```

## Maintenance Procedures

### Weekly Maintenance

#### System Updates
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Node.js dependencies
npm audit fix

# Restart services
sudo systemctl restart erigon
systemctl restart jit-bot
```

#### Performance Review
- Analyze weekly performance reports
- Review and adjust strategy parameters
- Update pool priorities based on performance
- Clean up old log files

### Monthly Maintenance

#### Deep System Cleanup
```bash
# Clean old logs
find logs/ -name "*.log" -mtime +30 -delete

# Clean old backups
find backups/ -name "*.tar.gz" -mtime +90 -delete

# Database optimization
npm run db-optimize
```

#### Security Review
- Review access logs for anomalies
- Update security certificates
- Rotate API keys and tokens
- Test backup and recovery procedures

### Quarterly Maintenance

#### Strategy Optimization
- Comprehensive backtest analysis
- Parameter optimization based on historical data
- Pool portfolio rebalancing
- Competition analysis update

#### Infrastructure Review
- Server performance analysis
- Network latency optimization
- Capacity planning assessment
- Technology stack updates

## Alerting and Escalation

### Alert Severity Levels

#### Critical (P0) - Immediate Response Required
- System completely down
- Private key compromise suspected
- Large financial losses (>$10k/hour)
- **Response Time**: 5 minutes
- **Escalation**: Page on-call engineer

#### High (P1) - Response Within 30 Minutes
- Success rate < 20%
- Ethereum node disconnected
- Memory leaks or crashes
- **Response Time**: 30 minutes
- **Escalation**: Slack alert + email

#### Medium (P2) - Response Within 2 Hours
- Success rate 20-40%
- High latency (>200ms)
- Individual pool failures
- **Response Time**: 2 hours
- **Escalation**: Email notification

#### Low (P3) - Response Within 24 Hours
- Success rate 40-60%
- Minor configuration issues
- Non-critical warnings
- **Response Time**: 24 hours
- **Escalation**: Ticket creation

### Escalation Contacts
```yaml
Primary On-Call: +1-555-0001
Secondary On-Call: +1-555-0002
Engineering Manager: +1-555-0003
Emergency Hotline: +1-555-0911
```

## Compliance and Reporting

### Daily Reports
- Performance summary
- Profit/loss statement
- Risk metrics
- Compliance violations (if any)

### Weekly Reports
- Detailed performance analysis
- Strategy effectiveness review
- Market impact assessment
- Infrastructure health report

### Monthly Reports
- Financial performance summary
- Risk management review
- Technology debt assessment
- Strategic recommendations

This runbook should be regularly updated based on operational experience and changing market conditions. All procedures should be tested regularly to ensure effectiveness during actual incidents.