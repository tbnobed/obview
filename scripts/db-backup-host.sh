#!/usr/bin/env bash
# Host-level daily database backup for Obviu.io.
#
# Runs from the HOST (cron), not inside a container. It dumps through the
# `db` container so it uses Postgres 16's native pg_dump (the app image ships
# pg_dump 15, which fails against the v16 server with a "server version
# mismatch"). Output is gzipped to the dedicated backup disk and pruned after
# RETENTION_DAYS.
#
# Install (host crontab, runs 03:00 server/UTC time):
#   0 3 * * * /home/obtv-admin/obview/scripts/db-backup-host.sh >> /srv/obviu/db-backups/backup.log 2>&1
#
# Env overrides (optional):
#   COMPOSE_DIR      directory containing docker-compose.yml (default: script's parent)
#   BACKUP_DIR       where dumps land (default: /srv/obviu/db-backups)
#   RETENTION_DAYS   prune daily-*.sql.gz older than this (default: 30)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="${COMPOSE_DIR:-$(dirname "$SCRIPT_DIR")}"
BACKUP_DIR="${BACKUP_DIR:-/srv/obviu/db-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

cd "$COMPOSE_DIR"
mkdir -p "$BACKUP_DIR"

TS="$(date -u +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/daily-$TS.sql.gz"

echo "[db-backup] $(date -u +%FT%TZ) writing $OUT"

# Dump from inside the db container so pg_dump matches the server major version.
# -T disables TTY allocation so this works non-interactively from cron.
if docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' \
     | gzip > "$OUT"; then
  if gzip -t "$OUT" 2>/dev/null; then
    SIZE="$(du -h "$OUT" | cut -f1)"
    echo "[db-backup] OK ($SIZE)"
  else
    echo "[db-backup] FAILED: gzip integrity check failed, removing $OUT" >&2
    rm -f "$OUT"
    exit 1
  fi
else
  echo "[db-backup] FAILED: pg_dump returned non-zero, removing $OUT" >&2
  rm -f "$OUT"
  exit 1
fi

# Prune daily backups older than RETENTION_DAYS. Manual-* and pre-migration-*
# dumps use different prefixes and are left untouched.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'daily-*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete \
  | sed 's/^/[db-backup] pruned: /' || true
