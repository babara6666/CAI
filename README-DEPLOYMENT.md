# CAD AI Platform Deployment Guide

This document provides comprehensive instructions for deploying the CAD AI Platform to production and staging environments.

## Prerequisites

### System Requirements
- Docker 20.10+ and Docker Compose 2.0+
- Linux server with at least 16GB RAM and 100GB storage
- SSL certificates for HTTPS (Let's Encrypt recommended)
- Domain name configured with DNS

### Required Services
- PostgreSQL 15+ (can be containerized)
- Redis 7+ (can be containerized)
- S3-compatible storage (AWS S3, MinIO, etc.)
- SMTP server for notifications

## Quick Start

### 1. Clone Repository
```bash
git clone <repository-url>
cd cad-ai-platform
```

### 2. Configure Environment
```bash
# Copy environment template
cp .env.production.template .env.production

# Edit environment variables
nano .env.production
```

### 3. Generate SSL Certificates
```bash
# For Let's Encrypt
certbot certonly --standalone -d yourdomain.com

# Or use the provided script
./scripts/generate-ssl-certs.sh yourdomain.com
```

### 4. Deploy
```bash
# Deploy to production
./scripts/deploy/deploy.sh production latest

# Or use Docker Compose directly
docker-compose -f docker-compose.prod.yml up -d
```

## Environment Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_PASSWORD` | PostgreSQL password | `secure_password_123` |
| `JWT_SECRET` | JWT signing secret | `your-256-bit-secret` |
| `ENCRYPTION_KEY` | File encryption key | `32-byte-hex-key` |
| `AWS_ACCESS_KEY_ID` | S3 access key | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | S3 secret key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `S3_BUCKET` | S3 bucket name | `cadai-files-prod` |
| `REDIS_PASSWORD` | Redis password | `redis_password_123` |

### Optional Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GRAFANA_PASSWORD` | Grafana admin password | `admin` |
| `WEBHOOK_URL` | Notification webhook | None |
| `BACKUP_S3_BUCKET` | Backup storage bucket | None |
| `SSL_DOMAIN` | SSL certificate domain | `localhost` |

## Deployment Methods

### Method 1: Automated Script (Recommended)

```bash
# Deploy to staging
./scripts/deploy/deploy.sh staging

# Deploy to production
./scripts/deploy/deploy.sh production v1.2.3
```

### Method 2: Docker Compose

```bash
# Production deployment
docker-compose -f docker-compose.prod.yml up -d

# Staging deployment
docker-compose -f docker-compose.staging.yml up -d
```

### Method 3: CI/CD Pipeline

The project includes GitHub Actions workflows for automated deployment:

- Push to `main` branch triggers staging deployment
- Manual workflow dispatch allows production deployment
- Includes automated testing, security scanning, and rollback capabilities

## Monitoring and Logging

### Access Monitoring Dashboards

- **Grafana**: http://your-domain:3000 (admin/password from env)
- **Prometheus**: http://your-domain:9090
- **Kibana**: http://your-domain:5601

### Log Locations

- Application logs: `/logs/` directory in containers
- Nginx logs: `/logs/nginx/`
- Database logs: `/logs/postgres/`
- Backup logs: `/var/log/backup-*.log`

## Backup and Recovery

### Automated Backups

Backups run automatically via cron jobs:

```bash
# Database backup every 6 hours
0 */6 * * * /opt/cad-ai-platform/scripts/backup/backup-database.sh

# File backup daily at 2 AM
0 2 * * * /opt/cad-ai-platform/scripts/backup/backup-files.sh
```

### Manual Backup

```bash
# Backup database
./scripts/backup/backup-database.sh

# Backup files
./scripts/backup/backup-files.sh
```

### Disaster Recovery

```bash
# Restore from latest backup
./scripts/disaster-recovery/restore-database.sh --latest

# Restore from specific date
./scripts/disaster-recovery/restore-database.sh --date 2024-01-15

# Restore from S3
./scripts/disaster-recovery/restore-database.sh --s3 --latest
```

## Health Checks

### Manual Health Check

```bash
# Run comprehensive health check
./scripts/health-check.sh

# Check specific environment
./scripts/health-check.sh staging
```

### Automated Health Monitoring

Health checks run automatically and send alerts via:
- Slack notifications
- Email alerts
- PagerDuty integration (production)

### Health Check Endpoints

- Overall health: `GET /health`
- Backend API: `GET /api/health`
- AI Service: `GET /ai/health`
- Frontend: `GET /health` (served by nginx)

## Scaling

### Horizontal Scaling

```bash
# Scale backend service
docker-compose -f docker-compose.prod.yml up -d --scale backend=3

# Scale AI service
docker-compose -f docker-compose.prod.yml up -d --scale ai-service=2

# Scale Celery workers
docker-compose -f docker-compose.prod.yml up -d --scale celery-worker=4
```

### Load Balancing

Nginx is configured to load balance between multiple backend instances automatically.

## Security

### SSL/TLS Configuration

- All traffic encrypted with TLS 1.2+
- HSTS headers enabled
- Security headers configured in Nginx

### Database Security

- Encrypted at rest
- Connection encryption enforced
- Regular security updates

### File Storage Security

- Files encrypted before storage
- Malware scanning on upload
- Access controls enforced

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   ```bash
   # Check database status
   docker-compose -f docker-compose.prod.yml logs postgres
   
   # Restart database
   docker-compose -f docker-compose.prod.yml restart postgres
   ```

2. **High Memory Usage**
   ```bash
   # Check memory usage
   docker stats
   
   # Restart services
   docker-compose -f docker-compose.prod.yml restart
   ```

3. **SSL Certificate Issues**
   ```bash
   # Check certificate expiry
   openssl x509 -in /path/to/cert.pem -text -noout
   
   # Renew Let's Encrypt certificate
   certbot renew
   ```

### Log Analysis

```bash
# View application logs
docker-compose -f docker-compose.prod.yml logs -f backend

# Search logs for errors
docker-compose -f docker-compose.prod.yml logs backend | grep ERROR

# View Nginx access logs
tail -f logs/nginx/access.log
```

### Performance Issues

```bash
# Check system resources
htop
df -h
free -h

# Monitor database performance
docker-compose -f docker-compose.prod.yml exec postgres psql -U cadai_user -d cadai_prod -c "SELECT * FROM pg_stat_activity;"

# Check Redis performance
docker-compose -f docker-compose.prod.yml exec redis redis-cli info
```

## Maintenance

### Regular Maintenance Tasks

1. **Weekly**
   - Review monitoring dashboards
   - Check backup integrity
   - Update security patches

2. **Monthly**
   - Review and rotate logs
   - Update dependencies
   - Performance optimization review

3. **Quarterly**
   - Disaster recovery drill
   - Security audit
   - Capacity planning review

### Updates and Patches

```bash
# Update to new version
./scripts/deploy/deploy.sh production v1.3.0

# Rollback if needed
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

## Support

### Emergency Contacts

- **DevOps Team**: devops@cadai-platform.com
- **On-call Engineer**: +1-555-0101
- **Escalation**: cto@cadai-platform.com

### Documentation

- [Disaster Recovery Plan](scripts/disaster-recovery/disaster-recovery-plan.md)
- [API Documentation](http://your-domain/api/docs)
- [Monitoring Runbook](monitoring/runbook.md)

### Getting Help

1. Check this deployment guide
2. Review application logs
3. Check monitoring dashboards
4. Contact support team

## Appendix

### Useful Commands

```bash
# View all containers
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f [service]

# Execute command in container
docker-compose -f docker-compose.prod.yml exec [service] [command]

# Update single service
docker-compose -f docker-compose.prod.yml up -d --no-deps [service]

# View resource usage
docker stats

# Clean up unused resources
docker system prune -f
```

### Configuration Files

- Docker Compose: `docker-compose.prod.yml`
- Nginx Config: `nginx/nginx.prod.conf`
- Prometheus Config: `monitoring/prometheus.yml`
- Environment Template: `.env.production.template`