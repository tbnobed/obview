#!/bin/sh
set -e

# Ensure IS_DOCKER environment variable is set
export IS_DOCKER=true

# Wait for database to be ready
echo "Waiting for database to be ready..."
/app/scripts/wait-for-db.sh || {
  echo "Database connection failed. Check your connection parameters."
  exit 1
}

# Create comments_unified table safely if it doesn't exist
echo "Ensuring unified comment system table exists..."
psql $DATABASE_URL -c "
CREATE TABLE IF NOT EXISTS comments_unified (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id INTEGER NOT NULL,
    user_id INTEGER,
    is_public BOOLEAN NOT NULL DEFAULT false,
    author_name TEXT NOT NULL,
    author_email TEXT,
    creator_token TEXT,
    parent_id TEXT,
    content TEXT NOT NULL,
    timestamp INTEGER,
    annotations TEXT,
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add annotations column if missing (for existing deployments)
ALTER TABLE comments_unified ADD COLUMN IF NOT EXISTS annotations TEXT;

-- Add foreign key constraints if they don't exist
DO \$\$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_comments_unified_file_id') THEN
        ALTER TABLE comments_unified ADD CONSTRAINT fk_comments_unified_file_id FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_comments_unified_user_id') THEN
        ALTER TABLE comments_unified ADD CONSTRAINT fk_comments_unified_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_comments_unified_parent_id') THEN
        ALTER TABLE comments_unified ADD CONSTRAINT fk_comments_unified_parent_id FOREIGN KEY (parent_id) REFERENCES comments_unified(id) ON DELETE SET NULL;
    END IF;
END \$\$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_comments_unified_file_id ON comments_unified(file_id);
CREATE INDEX IF NOT EXISTS idx_comments_unified_user_id ON comments_unified(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_unified_parent_id ON comments_unified(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_unified_file_timestamp ON comments_unified(file_id, timestamp);
" || {
  echo "Warning: Could not create comments_unified table. Attempting to continue..."
}

# Create comment_reactions table safely if it doesn't exist
echo "Ensuring comment reactions table exists..."
psql $DATABASE_URL -c "
CREATE TABLE IF NOT EXISTS comment_reactions (
    id SERIAL PRIMARY KEY,
    comment_id TEXT NOT NULL,
    user_id INTEGER,
    creator_token TEXT,
    reaction_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add foreign key constraints if they don't exist
DO \$\$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_comment_reactions_comment_id') THEN
        ALTER TABLE comment_reactions ADD CONSTRAINT fk_comment_reactions_comment_id FOREIGN KEY (comment_id) REFERENCES comments_unified(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_comment_reactions_user_id') THEN
        ALTER TABLE comment_reactions ADD CONSTRAINT fk_comment_reactions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END \$\$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id ON comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_reaction ON comment_reactions(comment_id, reaction_type);
" || {
  echo "Warning: Could not create comment_reactions table. Attempting to continue..."
}

# Create unique indexes for comment reactions (separate step to handle partial index syntax)
psql $DATABASE_URL -c "
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_comment_reactions_unique_user') THEN
        CREATE UNIQUE INDEX idx_comment_reactions_unique_user 
        ON comment_reactions(comment_id, reaction_type, user_id) 
        WHERE creator_token IS NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_comment_reactions_unique_anonymous') THEN
        CREATE UNIQUE INDEX idx_comment_reactions_unique_anonymous 
        ON comment_reactions(comment_id, reaction_type, creator_token) 
        WHERE user_id IS NULL;
    END IF;
END \$\$;
" || {
  echo "Warning: Could not create unique indexes for comment reactions. Continuing..."
}

# Use the full DATABASE_URL directly for all psql/pg_dump invocations.
# Regex-parsing DATABASE_URL is brittle for passwords containing @, :, %, etc.
# psql/pg_dump accept a libpq connection string as their first positional argument.

# Safety net: take a pre-migration backup on every container start.
# If anything goes wrong with a migration, the admin has an immediate
# rollback point inside the /app/db-backups directory (mount as a volume
# in docker-compose.yml for durability across container recreation).
BACKUP_DIR="/app/db-backups"
mkdir -p "$BACKUP_DIR"
BACKUP_TS=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/pre-migration-$BACKUP_TS.sql"
echo "Taking pre-migration database backup to $BACKUP_FILE ..."
if pg_dump "$DATABASE_URL" > "$BACKUP_FILE" 2>/tmp/pgdump.err; then
  echo "✅ Pre-migration backup saved: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
  # Keep only the last 10 pre-migration backups to bound disk usage
  ls -1t "$BACKUP_DIR"/pre-migration-*.sql 2>/dev/null | tail -n +11 | xargs -r rm -f
else
  echo "⚠️  Warning: pg_dump failed (continuing). Error:"
  cat /tmp/pgdump.err 2>/dev/null || true
  rm -f "$BACKUP_FILE"
fi

# Create migration tracking table so migrations do not silently re-run
# destructive SQL on every container restart. Each applied migration is
# recorded by filename + sha256 of its contents.
echo "Ensuring migration tracking table exists..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT NOW()
);
" || {
  echo "⚠️  Warning: could not ensure schema_migrations table; migrations will still run but may re-apply."
}

# Run migrations with STRICT error handling.
# Migrations that fail are NOT recorded as applied, so they retry next boot.
echo "Running database migrations..."
run_migrations() {
  if [ -f "/app/server/db-migrate.cjs" ]; then
    echo "Found db-migrate.cjs, running migrations..."
    node /app/server/db-migrate.cjs || echo "Warning: db-migrate.cjs reported issues."
  elif [ -f "/app/server/db-migrate.js" ]; then
    echo "Found db-migrate.js, running migrations..."
    node /app/server/db-migrate.js || echo "Warning: db-migrate.js reported issues."
  fi

  # Apply any SQL migrations directly if they exist, skipping already-applied ones
  if [ -d "/app/migrations" ]; then
    echo "Scanning SQL migrations directory..."
    for migration in /app/migrations/*.sql; do
      [ -f "$migration" ] || continue
      MIG_NAME=$(basename "$migration")
      MIG_SUM=$(sha256sum "$migration" | cut -d' ' -f1)

      # Checksum and filename are well-constrained (sha256 hex + basename), but
      # we still use -v vars instead of string interpolation for safety.
      ALREADY_APPLIED=$(psql "$DATABASE_URL" -tAc \
        -v migname="$MIG_NAME" -v migsum="$MIG_SUM" \
        "SELECT 1 FROM schema_migrations WHERE filename=:'migname' AND checksum=:'migsum' LIMIT 1;" 2>/dev/null || echo "")

      if [ "$ALREADY_APPLIED" = "1" ]; then
        echo "⏭  Skipping $MIG_NAME (already applied with matching checksum)."
        continue
      fi

      echo "▶ Applying SQL migration: $MIG_NAME"
      # STRICT mode: ON_ERROR_STOP=1 + single transaction so partial failures abort cleanly.
      # Some migrations use DO $$ blocks that catch their own exceptions internally,
      # so only unhandled SQL errors outside those blocks will abort the transaction.
      if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f "$migration"; then
        psql "$DATABASE_URL" -v migname="$MIG_NAME" -v migsum="$MIG_SUM" -c \
          "INSERT INTO schema_migrations (filename, checksum) VALUES (:'migname', :'migsum')
           ON CONFLICT (filename) DO UPDATE SET checksum=EXCLUDED.checksum, applied_at=NOW();" > /dev/null 2>&1 || true
        echo "✅ Applied $MIG_NAME"
      else
        echo "❌ ERROR: $MIG_NAME failed. NOT recorded as applied; will retry on next startup."
        echo "   Investigate the error above before restarting, and consider restoring $BACKUP_FILE if data was affected."
      fi
    done
  fi

  echo "Database migration process completed."
}

run_migrations

# Post-migration verification: ensure critical foreign keys actually exist.
# Without these FKs, deletes do NOT cascade — which is how production DBs
# ended up with orphaned rows pointing at deleted parents. Loudly flag any
# missing constraints so ops can intervene before users notice.
echo "Verifying critical foreign keys are present..."
REQUIRED_FKS="projects_created_by_id_fkey
files_project_id_fkey
files_uploaded_by_id_fkey
project_users_project_id_fkey
project_users_user_id_fkey
comments_file_id_fkey
comments_user_id_fkey
approvals_file_id_fkey
activity_logs_user_id_fkey
invitations_created_by_id_fkey
invitations_accepted_by_id_fkey
password_resets_user_id_fkey"

MISSING_FKS=""
for fk in $REQUIRED_FKS; do
  EXISTS=$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM pg_constraint WHERE conname='$fk' LIMIT 1;" 2>/dev/null || echo "")
  if [ "$EXISTS" != "1" ]; then
    MISSING_FKS="$MISSING_FKS $fk"
  fi
done

if [ -n "$MISSING_FKS" ]; then
  echo "⚠️  ⚠️  ⚠️  CRITICAL: the following required foreign keys are MISSING:"
  for fk in $MISSING_FKS; do echo "       - $fk"; done
  echo "   Without these, deletes will not cascade and orphaned rows can accumulate."
  echo "   This usually means existing data violates the FK (e.g. orphan rows from a prior broken migration)."
  echo "   Inspect with:  psql \$DATABASE_URL -c 'SELECT * FROM files WHERE project_id NOT IN (SELECT id FROM projects);'"
  echo "   Application will continue to start, but please address ASAP."
else
  echo "✅ All required foreign keys are in place."
fi

# Create admin user with error handling
echo "Setting up admin user if needed..."
if [ -f "/app/scripts/setup.cjs" ]; then
  node /app/scripts/setup.cjs || {
    echo "Warning: Admin user setup encountered issues."
    echo "This might be normal if the user already exists. Continuing..."
  }
elif [ -f "/app/scripts/setup.js" ]; then
  node /app/scripts/setup.js || {
    echo "Warning: Admin user setup encountered issues."
    echo "This might be normal if the user already exists. Continuing..."
  }
else
  echo "Setup script not found. This might cause issues if no admin user exists."
fi

# Create required directories with proper permissions
mkdir -p /app/dist/server
mkdir -p /app/uploads/processed

# Ensure proper permissions for file operations
chown -R $(whoami):$(whoami) /app/uploads 2>/dev/null || true
chmod -R 755 /app/uploads

# Verify filesystem utilities are available for cleanup operations
echo "Verifying filesystem utilities for admin cleanup operations..."
if [ ! -d "/app/uploads" ]; then
  echo "Warning: Upload directory not found at /app/uploads"
fi

# Test write permissions
touch /app/uploads/.test_write 2>/dev/null && rm -f /app/uploads/.test_write && echo "✅ Upload directory write permissions verified" || echo "⚠️  Warning: Upload directory may not be writable"

# Find a valid entry point for the server - prefer built JS over TypeScript source  
find_server_entry() {
  # First priority: built server file from npm run build (check the file the build actually creates)
  if [ -f "/app/dist/index.js" ]; then
    echo "Found built server entry point: /app/dist/index.js"
    export SERVER_ENTRY="/app/dist/index.js"
    return 0
  elif [ -f "/app/dist/server/index.js" ]; then
    echo "Found built server entry point: /app/dist/server/index.js"
    export SERVER_ENTRY="/app/dist/server/index.js"
    return 0
  # Second priority: JS source files
  elif [ -f "/app/server/index.js" ]; then
    echo "Found JavaScript source entry point: /app/server/index.js"
    export SERVER_ENTRY="/app/server/index.js"
    return 0
  # For TypeScript fallback, don't set SERVER_ENTRY - let CMD handle it
  elif [ -f "/app/server/index.ts" ]; then
    echo "TypeScript source found. Letting CMD handle the tsx fallback..."
    unset SERVER_ENTRY
    return 1
  else
    return 1
  fi
}

# Check for existing build files
find_server_entry || echo "No built JavaScript files found. CMD will use tsx fallback."

# Start the application
echo "Starting the application..."
exec "$@"
