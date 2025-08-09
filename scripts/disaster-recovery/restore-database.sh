#!/bin/bash

# CAD AI Platform Database Restore Script
# This script restores the PostgreSQL database from backup

set -e

# Configuration
BACKUP_DIR="/backups/database"
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-cadai_prod}"
DB_USER="${DB_USER:-cadai_user}"

# S3 configuration
S3_BUCKET="${BACKUP_S3_BUCKET}"
S3_PREFIX="database-backups"

# Logging
LOG_FILE="/var/log/restore-database.log"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  -f, --file BACKUP_FILE    Restore from specific backup file"
    echo "  -d, --date DATE          Restore from backup closest to date (YYYY-MM-DD)"
    echo "  -l, --latest             Restore from latest backup (default)"
    echo "  -s, --s3                 Download backup from S3"
    echo "  --dry-run                Show what would be restored without actually doing it"
    echo "  -h, --help               Show this help message"
    exit 1
}

# Parse command line arguments
BACKUP_FILE=""
RESTORE_DATE=""
USE_LATEST=true
USE_S3=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--file)
            BACKUP_FILE="$2"
            USE_LATEST=false
            shift 2
            ;;
        -d|--date)
            RESTORE_DATE="$2"
            USE_LATEST=false
            shift 2
            ;;
        -l|--latest)
            USE_LATEST=true
            shift
            ;;
        -s|--s3)
            USE_S3=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

log "Starting database restore process"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Function to find backup file
find_backup_file() {
    if [ -n "$BACKUP_FILE" ]; then
        if [ -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
            echo "$BACKUP_DIR/$BACKUP_FILE"
        else
            log "ERROR: Specified backup file not found: $BACKUP_FILE"
            exit 1
        fi
    elif [ -n "$RESTORE_DATE" ]; then
        # Find backup closest to specified date
        local target_date=$(date -d "$RESTORE_DATE" +%Y%m%d)
        local closest_file=""
        local closest_diff=999999
        
        for file in "$BACKUP_DIR"/cadai_backup_*.sql.gz; do
            if [ -f "$file" ]; then
                local file_date=$(basename "$file" | sed 's/cadai_backup_\([0-9]\{8\}\)_.*/\1/')
                local diff=$((target_date - file_date))
                if [ $diff -ge 0 ] && [ $diff -lt $closest_diff ]; then
                    closest_diff=$diff
                    closest_file="$file"
                fi
            fi
        done
        
        if [ -n "$closest_file" ]; then
            echo "$closest_file"
        else
            log "ERROR: No backup found for date $RESTORE_DATE"
            exit 1
        fi
    else
        # Use latest backup
        local latest_file=$(ls -t "$BACKUP_DIR"/cadai_backup_*.sql.gz 2>/dev/null | head -n1)
        if [ -n "$latest_file" ]; then
            echo "$latest_file"
        else
            log "ERROR: No backup files found in $BACKUP_DIR"
            exit 1
        fi
    fi
}

# Download from S3 if requested
if [ "$USE_S3" = true ]; then
    if [ -z "$S3_BUCKET" ]; then
        log "ERROR: S3_BUCKET not configured"
        exit 1
    fi
    
    log "Downloading backups from S3..."
    aws s3 sync "s3://$S3_BUCKET/$S3_PREFIX/" "$BACKUP_DIR/"
    log "S3 download completed"
fi

# Find the backup file to restore
RESTORE_FILE=$(find_backup_file)
log "Selected backup file for restore: $RESTORE_FILE"

if [ "$DRY_RUN" = true ]; then
    log "DRY RUN: Would restore from $RESTORE_FILE"
    log "DRY RUN: Target database: $DB_NAME on $DB_HOST:$DB_PORT"
    exit 0
fi

# Verify backup file integrity
log "Verifying backup file integrity..."
if ! gunzip -t "$RESTORE_FILE"; then
    log "ERROR: Backup file integrity check failed"
    exit 1
fi
log "Backup file integrity verified"

# Create a backup of current database before restore
CURRENT_BACKUP="$BACKUP_DIR/pre_restore_backup_$(date +%Y%m%d_%H%M%S).sql"
log "Creating backup of current database before restore..."
if PGPASSWORD="$DB_PASSWORD" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --format=custom \
    --file="$CURRENT_BACKUP"; then
    log "Current database backed up to: $CURRENT_BACKUP"
else
    log "WARNING: Failed to backup current database"
fi

# Stop application services to prevent connections during restore
log "Stopping application services..."
docker-compose -f docker-compose.prod.yml stop backend ai-service celery-worker || true

# Wait for connections to close
sleep 10

# Terminate existing connections to the database
log "Terminating existing database connections..."
PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" || true

# Drop and recreate database
log "Dropping and recreating database..."
PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d postgres \
    -c "DROP DATABASE IF EXISTS $DB_NAME;"

PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d postgres \
    -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

# Restore database from backup
log "Restoring database from backup..."
if gunzip -c "$RESTORE_FILE" | PGPASSWORD="$DB_PASSWORD" pg_restore \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --verbose \
    --no-owner \
    --no-privileges; then
    log "Database restore completed successfully"
else
    log "ERROR: Database restore failed"
    
    # Attempt to restore from pre-restore backup
    if [ -f "$CURRENT_BACKUP" ]; then
        log "Attempting to restore from pre-restore backup..."
        PGPASSWORD="$DB_PASSWORD" pg_restore \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            --clean \
            --if-exists \
            "$CURRENT_BACKUP" || true
    fi
    
    exit 1
fi

# Verify restore
log "Verifying database restore..."
TABLE_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")

if [ "$TABLE_COUNT" -gt 0 ]; then
    log "Database restore verification successful. Found $TABLE_COUNT tables."
else
    log "ERROR: Database restore verification failed. No tables found."
    exit 1
fi

# Start application services
log "Starting application services..."
docker-compose -f docker-compose.prod.yml start backend ai-service celery-worker

# Wait for services to be ready
sleep 30

# Run database migrations if needed
log "Running database migrations..."
docker-compose -f docker-compose.prod.yml exec backend npm run migrate || true

log "Database restore process completed successfully"

# Send notification
if [ -n "$WEBHOOK_URL" ]; then
    curl -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"Database restore completed successfully from backup: $(basename "$RESTORE_FILE")\"}"
fi