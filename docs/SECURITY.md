# JIT Liquidity Bot Security Guide

## Overview

This document outlines comprehensive security practices for the JIT Liquidity Bot, covering private key management, operational security, and risk mitigation strategies.

## Private Key Management

### Hardware Security Modules (HSM) - RECOMMENDED

#### AWS CloudHSM Integration
```typescript
interface HSMConfig {
  clusterId: string;
  keyLabel: string;
  pkcs11Library: string;
  userPin: string; // From secure vault
  sessionTimeout: number;
}
```

**Benefits**:
- FIPS 140-2 Level 3 compliance
- Tamper-resistant hardware
- Secure key generation and storage
- Audit trail for all operations

#### Implementation Example
```bash
# Install CloudHSM client
sudo yum install cloudhsm-client

# Configure connection
echo "server $CLUSTER_IP" > /opt/cloudhsm/etc/cloudhsm_client.cfg

# Initialize HSM session
cloudhsm-cli loginHSM -u CU -p $CU_PASSWORD
```

### Local Key Storage (Development/Testing Only)

#### Secure Key Generation
```bash
# Generate private key with high entropy
openssl rand -hex 32 > private.key

# Set restrictive permissions
chmod 600 private.key
chown jitbot:jitbot private.key

# Store in encrypted directory
sudo cryptsetup luksFormat /dev/sdb1
sudo cryptsetup luksOpen /dev/sdb1 secure_keys
sudo mount /dev/mapper/secure_keys /secure/keys
```

#### Key Rotation Policy
- **Frequency**: Every 30 days minimum
- **Emergency Rotation**: Within 4 hours of suspected compromise
- **Automated Process**: Use infrastructure as code
- **Verification**: Multi-signature confirmation required

### Multi-Signature Wallets

#### Gnosis Safe Integration
```typescript
interface MultiSigConfig {
  safeAddress: string;
  owners: string[];
  threshold: number;
  fallbackHandler: string;
}

// Example: 3-of-5 multisig for production
const prodConfig: MultiSigConfig = {
  safeAddress: "0x...",
  owners: ["0xOwner1", "0xOwner2", "0xOwner3", "0xOwner4", "0xOwner5"],
  threshold: 3,
  fallbackHandler: "0x..."
};
```

**Operational Benefits**:
- No single point of failure
- Requires multiple approvals for transactions
- Enhanced audit trail
- Reduced insider threat risk

## Operational Security

### Environment Security

#### Secure Boot Configuration
```bash
# Enable secure boot
sudo mokutil --enable-validation

# Verify secure boot status
mokutil --sb-state

# Configure trusted boot measurements
sudo tpm2_takeownership -o owner_password -e endorsement_password
```

#### Network Security
```bash
# Configure strict firewall rules
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default deny outgoing

# Allow only necessary connections
sudo ufw allow out 443/tcp  # HTTPS
sudo ufw allow out 8545/tcp # Ethereum RPC
sudo ufw allow in 22/tcp    # SSH (limit to specific IPs)
sudo ufw allow in 9090/tcp  # Metrics (internal network only)

sudo ufw enable
```

#### Process Isolation
```bash
# Create dedicated user
sudo useradd -r -m -s /bin/bash jitbot
sudo usermod -aG docker jitbot

# Configure systemd service with security
cat > /etc/systemd/system/jit-bot.service << EOF
[Unit]
Description=JIT Liquidity Bot
After=network.target

[Service]
Type=simple
User=jitbot
Group=jitbot
WorkingDirectory=/opt/jit-bot
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/jit-bot/data /opt/jit-bot/logs
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

[Install]
WantedBy=multi-user.target
EOF
```

### Access Control

#### SSH Hardening
```bash
# Disable password authentication
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

# Enable key-based authentication only
sudo sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config

# Disable root login
sudo sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config

# Configure fail2ban
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

#### API Security
```typescript
interface APISecurityConfig {
  authentication: {
    method: "jwt" | "api_key" | "oauth2";
    tokenExpiry: number;
    refreshTokens: boolean;
  };
  authorization: {
    roles: string[];
    permissions: Record<string, string[]>;
  };
  rateLimiting: {
    windowMs: number;
    maxRequests: number;
  };
}
```

### Code Security

#### Dependency Management
```bash
# Audit dependencies regularly
npm audit

# Fix vulnerabilities
npm audit fix

# Use lock files
npm ci --only=production

# Monitor for new vulnerabilities
npm install -g npm-check-updates
ncu -u
```

#### Secure Coding Practices
```typescript
// Input validation
function validateAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Sanitize logging data
function sanitizeLogData(data: any): any {
  const sensitive = ['privateKey', 'mnemonic', 'password'];
  return JSON.parse(JSON.stringify(data, (key, value) => 
    sensitive.includes(key) ? '[REDACTED]' : value
  ));
}

// Rate limiting
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
```

## Monitoring and Detection

### Security Monitoring

#### Log Analysis
```bash
# Monitor authentication attempts
tail -f /var/log/auth.log | grep "authentication failure"

# Monitor file access
sudo auditctl -w /secure/keys -p rwxa -k key_access
sudo ausearch -k key_access

# Monitor network connections
netstat -antup | grep jit-bot
```

#### Intrusion Detection
```bash
# Install AIDE (Advanced Intrusion Detection Environment)
sudo apt install aide
sudo aideinit

# Configure monitoring
cat > /etc/aide/aide.conf << EOF
/secure/keys PERMS+CONTENT+MD5+SHA1
/opt/jit-bot PERMS+CONTENT+MD5+SHA1
/etc/jit-bot PERMS+CONTENT+MD5+SHA1
EOF

# Daily integrity checks
echo "0 2 * * * root /usr/bin/aide --check" | sudo tee -a /etc/crontab
```

### Anomaly Detection

#### Transaction Monitoring
```typescript
interface TransactionAnomaly {
  type: 'unusual_amount' | 'unusual_frequency' | 'unusual_destination';
  threshold: number;
  action: 'alert' | 'block' | 'review';
}

const anomalyRules: TransactionAnomaly[] = [
  {
    type: 'unusual_amount',
    threshold: 100000, // USD
    action: 'block'
  },
  {
    type: 'unusual_frequency',
    threshold: 100, // transactions per hour
    action: 'alert'
  }
];
```

#### Behavioral Analysis
- Monitor for unusual API access patterns
- Track changes in success rates
- Alert on configuration modifications
- Analyze transaction timing patterns

## Incident Response

### Security Incident Classification

#### Critical (P0) - Immediate Response
- **Private key compromise**: Suspected or confirmed unauthorized access
- **Unauthorized transactions**: Funds moved without authorization
- **System breach**: Evidence of unauthorized system access

**Response Time**: < 15 minutes
**Actions**:
1. Immediately disable all systems
2. Isolate affected infrastructure
3. Assess scope of compromise
4. Engage security team and legal counsel

#### High (P1) - 1 Hour Response
- **Anomalous trading patterns**: Unusual profit/loss or activity
- **Failed authentication spikes**: Potential brute force attacks
- **Configuration tampering**: Unauthorized changes to settings

#### Medium (P2) - 4 Hour Response
- **Performance anomalies**: Unusual latency or error rates
- **Dependency vulnerabilities**: Newly discovered security issues
- **Access policy violations**: Policy breaches without immediate risk

### Incident Response Procedures

#### Immediate Response (First 15 minutes)
```bash
# 1. Emergency shutdown
curl -X POST http://localhost:9090/admin/emergency-stop

# 2. Isolate network
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default deny outgoing
sudo ufw enable

# 3. Preserve evidence
sudo dd if=/dev/sda of=/backup/forensic-image-$(date +%Y%m%d-%H%M).img
sudo tar -czf /backup/logs-$(date +%Y%m%d-%H%M).tar.gz /var/log/

# 4. Document incident
echo "$(date): Security incident detected. System isolated." >> /var/log/security-incidents.log
```

#### Investigation Phase (First 2 hours)
1. **Evidence Collection**
   - System logs and audit trails
   - Network traffic captures
   - File system changes
   - Memory dumps if needed

2. **Impact Assessment**
   - Financial impact calculation
   - Data exposure assessment
   - System compromise scope
   - Regulatory requirements

3. **Containment**
   - Isolate affected systems
   - Change all credentials
   - Deploy patches/fixes
   - Monitor for persistence

#### Recovery Phase (2-24 hours)
1. **System Restoration**
   - Rebuild from clean images
   - Apply security updates
   - Restore from clean backups
   - Implement additional controls

2. **Validation**
   - Security testing
   - Penetration testing
   - Code review
   - Configuration audit

## Compliance and Auditing

### Regulatory Compliance

#### Data Protection (GDPR/CCPA)
- **Minimize Data Collection**: Only collect necessary transaction data
- **Data Retention**: Implement automatic purging of old data
- **Anonymization**: Remove personally identifiable information
- **Access Controls**: Restrict access to sensitive data

#### Financial Regulations
- **Transaction Reporting**: Maintain records for regulatory reporting
- **Anti-Money Laundering**: Implement basic AML checks
- **Know Your Customer**: Verify counterparty legitimacy where possible
- **Market Manipulation**: Ensure legitimate trading practices

### Security Auditing

#### Regular Security Assessments
- **Quarterly**: Internal security reviews
- **Annually**: External penetration testing
- **Continuous**: Automated vulnerability scanning
- **As-needed**: Incident-driven assessments

#### Audit Trail Requirements
```typescript
interface SecurityAuditLog {
  timestamp: number;
  userId: string;
  action: string;
  resource: string;
  result: 'success' | 'failure';
  ipAddress: string;
  userAgent: string;
  sessionId: string;
}
```

### Backup and Recovery

#### Backup Strategy
```bash
# Encrypted incremental backups
#!/bin/bash
BACKUP_DATE=$(date +%Y%m%d-%H%M)
BACKUP_DIR="/backup/jit-bot"

# Configuration backup
tar -czf "$BACKUP_DIR/config-$BACKUP_DATE.tar.gz" /opt/jit-bot/src/config/

# Data backup
tar -czf "$BACKUP_DIR/data-$BACKUP_DATE.tar.gz" /opt/jit-bot/data/

# Encrypt backups
gpg --cipher-algo AES256 --compress-algo 1 --s2k-mode 3 \
    --s2k-digest-algo SHA512 --s2k-count 65536 --symmetric \
    --output "$BACKUP_DIR/config-$BACKUP_DATE.tar.gz.gpg" \
    "$BACKUP_DIR/config-$BACKUP_DATE.tar.gz"

# Remove unencrypted backup
rm "$BACKUP_DIR/config-$BACKUP_DATE.tar.gz"
```

#### Recovery Testing
- **Monthly**: Test backup restoration procedures
- **Quarterly**: Full disaster recovery simulation
- **Annually**: Cross-region recovery testing

## Security Metrics and KPIs

### Key Security Indicators
- **Mean Time to Detection (MTTD)**: Average time to detect security incidents
- **Mean Time to Response (MTTR)**: Average time to respond to incidents
- **Security Patch Level**: Percentage of systems with latest security updates
- **Access Review Compliance**: Percentage of access reviews completed on time

### Security Dashboard
```typescript
interface SecurityMetrics {
  failedLoginAttempts: number;
  suspiciousTransactions: number;
  vulnerabilitiesOpen: number;
  securityAlertsActive: number;
  lastSecurityAudit: Date;
  backupStatus: 'healthy' | 'warning' | 'critical';
}
```

This security guide should be reviewed and updated regularly to address evolving threats and incorporate lessons learned from security incidents and industry best practices.