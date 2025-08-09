#!/bin/bash

# CAD AI Platform Database Backup Script
# This script creates automated backups of the PostgreSQL database

set -e

# Configuration
BACKUP_DIR="/backups/database"
RETENTION_DAYS=30
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="cadai_backup_${TIMESTAMP}.sql"
COMPRESSED_FILE="${BACKUP_FILE}.gz"

# Database connection details
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-cadai_prod}"
DB_USER="${DB_USER:-cadai_user}"

# S3 backup configuration (optional)
S3_BUCKET="${BACKUP_S3_BUCKET}"
S3_PREFIX="database-backups"

# Logging
LOG_FILE="/var/log/backup-database.log"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

log "Starting database backup for $DB_NAME"

# Create database dump
log "Creating database dump..."
if PGPASSWORD="$DB_PASSWORD" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --verbose \
    --no-owner \
    --no-privileges \
    --format=custom \
    --file="$BACKUP_DIR/$BACKUP_FILE"; then
    log "Database dump created successfully: $BACKUP_FILE"
else
    log "ERROR: Failed to create database dump"
    exit 1
fi

# Compress the backup
log "Compressing backup file..."
if gzip "$BACKUP_DIR/$BACKUP_FILE"; then
    log "Backup compressed successfully: $COMPRESSED_FILE"
else
    log "ERROR: Failed to compress backup file"
    exit 1
fi

# Verify backup integrity
log "Verifying backup integrity..."
if gunzip -t "$BACKUP_DIR/$COMPRESSED_FILE"; then
    log "Backup integrity verified"
else
    log "ERROR: Backup integrity check failed"
    exit 1
fi

# Upload to S3 if configured
if [ -n "$S3_BUCKET" ]; then
    log "Uploading backup to S3..."
    if aws s3 cp "$BACKUP_DIR/$COMPRESSED_FILE" "s3://$S3_BUCKET/$S3_PREFIX/$COMPRESSED_FILE"; then
        log "Backup uploaded to S3 successfully"
    else
        log "WARNING: Failed to upload backup to S3"
    fi
fi

# Clean up old backups
log "Cleaning up old backups (older than $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "cadai_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
log "Old backups cleaned up"

# Clean up old S3 backups if configured
if [ -n "$S3_BUCKET" ]; then
    log "Cleaning up old S3 backups..."
    aws s3 ls "s3://$S3_BUCKET/$S3_PREFIX/" | while read -r line; do
        backup_date=$(echo "$line" | awk '{print $1}')
        backup_file=$(echo "$line" | awk '{print $4}')
        
        if [ -n "$backup_date" ] && [ -n "$backup_file" ]; then
            backup_timestamp=$(date -d "$backup_date" +%s)
            cutoff_timestamp=$(date -d "$RETENTION_DAYS days ago" +%s)
            
            if [ "$backup_timestamp" -lt "$cutoff_timestamp" ]; then
                aws s3 rm "s3://$S3_BUCKET/$S3_PREFIX/$backup_file"
                log "Deleted old S3 backup: $backup_file"
            fi
        fi
    done
fi

# Get backup size
BACKUP_SIZE=$(du -h "$BACKUP_DIR/$COMPRESSED_FILE" | cut -f1)
log "Backup completed successfully. Size: $BACKUP_SIZE"

# Send notification (optional)
if [ -n "$WEBHOOK_URL" ]; then
    curl -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"Database backup completed successfully. File: $COMPRESSED_FILE, Size: $BACKUP_SIZE\"}"
fi

log "Database backup process completed"