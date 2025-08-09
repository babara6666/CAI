#!/bin/bash

# CAD AI Platform File Storage Backup Script
# This script creates automated backups of uploaded files and AI models

set -e

# Configuration
BACKUP_DIR="/backups/files"
RETENTION_DAYS=30
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Source directories
FILES_DIR="/app/uploads"
MODELS_DIR="/app/models"

# S3 backup configuration
S3_BUCKET="${BACKUP_S3_BUCKET}"
S3_PREFIX="file-backups"

# Logging
LOG_FILE="/var/log/backup-files.log"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

log "Starting file backup process"

# Function to backup directory
backup_directory() {
    local source_dir="$1"
    local backup_name="$2"
    local tar_file="$BACKUP_DIR/${backup_name}_${TIMESTAMP}.tar.gz"
    
    if [ -d "$source_dir" ]; then
        log "Backing up $source_dir to $tar_file"
        
        if tar -czf "$tar_file" -C "$(dirname "$source_dir")" "$(basename "$source_dir")"; then
            log "Successfully created backup: $tar_file"
            
            # Verify backup
            if tar -tzf "$tar_file" > /dev/null; then
                log "Backup integrity verified for $tar_file"
            else
                log "ERROR: Backup integrity check failed for $tar_file"
                return 1
            fi
            
            # Upload to S3 if configured
            if [ -n "$S3_BUCKET" ]; then
                log "Uploading $tar_file to S3..."
                if aws s3 cp "$tar_file" "s3://$S3_BUCKET/$S3_PREFIX/$(basename "$tar_file")"; then
                    log "Successfully uploaded $tar_file to S3"
                else
                    log "WARNING: Failed to upload $tar_file to S3"
                fi
            fi
            
        else
            log "ERROR: Failed to create backup for $source_dir"
            return 1
        fi
    else
        log "WARNING: Source directory $source_dir does not exist, skipping"
    fi
}

# Backup uploaded files
backup_directory "$FILES_DIR" "uploaded_files"

# Backup AI models
backup_directory "$MODELS_DIR" "ai_models"

# Create incremental backup using rsync (for large files)
INCREMENTAL_DIR="$BACKUP_DIR/incremental"
mkdir -p "$INCREMENTAL_DIR"

log "Creating incremental backup..."
if rsync -av --delete --link-dest="$INCREMENTAL_DIR/latest" "$FILES_DIR/" "$INCREMENTAL_DIR/$TIMESTAMP/"; then
    # Update latest symlink
    rm -f "$INCREMENTAL_DIR/latest"
    ln -s "$TIMESTAMP" "$INCREMENTAL_DIR/latest"
    log "Incremental backup created successfully"
else
    log "WARNING: Incremental backup failed"
fi

# Clean up old backups
log "Cleaning up old backups (older than $RETENTION_DAYS days)..."

# Clean up tar.gz backups
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete

# Clean up old incremental backups
find "$INCREMENTAL_DIR" -maxdepth 1 -type d -name "20*" -mtime +$RETENTION_DAYS -exec rm -rf {} \;

log "Old backups cleaned up"

# Clean up old S3 backups if configured
if [ -n "$S3_BUCKET" ]; then
    log "Cleaning up old S3 file backups..."
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

# Calculate total backup size
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
log "File backup process completed. Total backup size: $TOTAL_SIZE"

# Send notification (optional)
if [ -n "$WEBHOOK_URL" ]; then
    curl -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"File backup completed successfully. Total size: $TOTAL_SIZE\"}"
fi

log "File backup process completed"