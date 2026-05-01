#!/bin/sh
# Daily database backup. Run from the in-container crond.
# Writes to /app/db-backups/daily-YYYYMMDD-HHMMSS.sql and prunes anything
# older than 30 days. The /app/db-backups directory should be a docker
# volume so the dumps survive container recreation.

set -eu

# Load DATABASE_URL/BACKUP_* persisted by docker-entrypoint.sh, since crond
# does not inherit the entrypoint's environment.
if [ -r /etc/cron-env.sh ]; then
  # shellcheck disable=SC1091
  . /etc/cron-env.sh
fi

BACKUP_DIR="${BACKUP_DIR:-/app/db-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[backup-cron] DATABASE_URL is not set, skipping backup." >&2
  exit 0
fi

TS=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/daily-$TS.sql"

echo "[backup-cron] Writing $OUT"
if pg_dump "$DATABASE_URL" > "$OUT" 2>/tmp/backup-cron.err; then
  SIZE=$(du -h "$OUT" | cut -f1)
  echo "[backup-cron] OK ($SIZE)"
else
  echo "[backup-cron] FAILED:" >&2
  cat /tmp/backup-cron.err >&2 || true
  rm -f "$OUT"
  exit 1
fi

# Prune daily backups older than RETENTION_DAYS days. Pre-migration backups
# (managed by docker-entrypoint.sh) use a different prefix and are untouched.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'daily-*.sql' -mtime "+$RETENTION_DAYS" -print -delete \
  | sed 's/^/[backup-cron] pruned: /' || true
