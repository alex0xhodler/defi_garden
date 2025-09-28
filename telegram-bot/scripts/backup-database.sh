#!/bin/bash

# Database Backup Script
# Usage: ./scripts/backup-database.sh [optional-suffix]

set -e

# Configuration
DB_PATH="${DB_PATH:-./defi-garden.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SUFFIX="${1:-}"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Determine backup filename
if [ -n "$SUFFIX" ]; then
    BACKUP_NAME="defi-garden-${TIMESTAMP}-${SUFFIX}.sqlite"
else
    BACKUP_NAME="defi-garden-${TIMESTAMP}.sqlite"
fi

BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

# Check if source database exists
if [ ! -f "$DB_PATH" ]; then
    echo "❌ Database not found at: $DB_PATH"
    exit 1
fi

# Create backup
echo "📦 Creating database backup..."
echo "   Source: $DB_PATH"
echo "   Backup: $BACKUP_PATH"

cp "$DB_PATH" "$BACKUP_PATH"

# Also backup WAL and SHM files if they exist
if [ -f "${DB_PATH}-wal" ]; then
    cp "${DB_PATH}-wal" "${BACKUP_PATH}-wal"
    echo "   WAL: ${BACKUP_PATH}-wal"
fi

if [ -f "${DB_PATH}-shm" ]; then
    cp "${DB_PATH}-shm" "${BACKUP_PATH}-shm"
    echo "   SHM: ${BACKUP_PATH}-shm"
fi

# Verify backup
if [ -f "$BACKUP_PATH" ]; then
    ORIGINAL_SIZE=$(stat -f%z "$DB_PATH" 2>/dev/null || stat -c%s "$DB_PATH" 2>/dev/null)
    BACKUP_SIZE=$(stat -f%z "$BACKUP_PATH" 2>/dev/null || stat -c%s "$BACKUP_PATH" 2>/dev/null)
    
    if [ "$ORIGINAL_SIZE" = "$BACKUP_SIZE" ]; then
        echo "✅ Backup created successfully!"
        echo "   Size: $BACKUP_SIZE bytes"
        echo "   Path: $BACKUP_PATH"
    else
        echo "❌ Backup verification failed - size mismatch"
        echo "   Original: $ORIGINAL_SIZE bytes"
        echo "   Backup: $BACKUP_SIZE bytes"
        exit 1
    fi
else
    echo "❌ Backup creation failed"
    exit 1
fi

# Cleanup old backups (keep last 30 days)
echo "🧹 Cleaning up old backups..."
find "$BACKUP_DIR" -name "defi-garden-*.sqlite" -mtime +30 -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "defi-garden-*.sqlite-wal" -mtime +30 -delete 2>/dev/null || true  
find "$BACKUP_DIR" -name "defi-garden-*.sqlite-shm" -mtime +30 -delete 2>/dev/null || true

echo "✅ Backup process completed!"