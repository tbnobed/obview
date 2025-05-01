#!/bin/sh
# wait-for-db.sh: Wait for the database to be ready

set -e

# Default to using environment variables directly if available
if [ -n "$PGHOST" ] && [ -n "$PGPORT" ] && [ -n "$PGUSER" ] && [ -n "$PGPASSWORD" ] && [ -n "$PGDATABASE" ]; then
  host=$PGHOST
  port=$PGPORT
  db_name=$PGDATABASE
  user=$PGUSER
  password=$PGPASSWORD
  echo "Using database connection parameters from environment variables"
# Otherwise parse the DATABASE_URL
elif [ -n "$DATABASE_URL" ]; then
  # Parse connection parameters from DATABASE_URL with improved regex
  # Handle both postgresql:// and postgres:// URL formats
  if echo "$DATABASE_URL" | grep -q "@"; then
    # URL contains authentication
    host=$(echo $DATABASE_URL | sed -E 's/^.+@([^:]+)(:[0-9]+)?\/.+$/\1/')
    port=$(echo $DATABASE_URL | sed -E 's/^.+@[^:]+:([0-9]+)\/.+$/\1/; s/^$/5432/')
    db_name=$(echo $DATABASE_URL | sed -E 's/^.+\/([^?]+)(\?.+)?$/\1/')
    user=$(echo $DATABASE_URL | sed -E 's/^.+:\/\/([^:]+):.+@.+$/\1/')
    password=$(echo $DATABASE_URL | sed -E 's/^.+:\/\/.+:([^@]+)@.+$/\1/')
  else
    # URL without authentication (unlikely but handle it)
    host=$(echo $DATABASE_URL | sed -E 's/^.+:\/\/([^:]+)(:[0-9]+)?\/.+$/\1/')
    port=$(echo $DATABASE_URL | sed -E 's/^.+:\/\/[^:]+:([0-9]+)\/.+$/\1/; s/^$/5432/')
    db_name=$(echo $DATABASE_URL | sed -E 's/^.+\/([^?]+)(\?.+)?$/\1/')
    user="postgres"
    password=""
  fi
  
  # If port extraction failed, default to 5432
  if [ -z "$port" ]; then
    port=5432
  fi
else
  # Default to standard Docker Compose PostgreSQL settings
  host="db"
  port="5432"
  db_name="obview"
  user="postgres"
  password=${POSTGRES_PASSWORD:-postgres}
  
  echo "WARNING: No DATABASE_URL or PGHOST found, using default connection parameters"
fi

echo "Attempting to connect to PostgreSQL at $host:$port as $user..."
echo "Database name: $db_name"

# Maximum number of attempts before giving up
max_attempts=60
attempt_count=0

# Use PGPASSWORD environment variable to avoid password prompt
while [ $attempt_count -lt $max_attempts ]; do
  if PGPASSWORD=$password psql -h "$host" -p "$port" -U "$user" -d "$db_name" -c '\q' 2>/dev/null; then
    echo "PostgreSQL is available at $host:$port - connection successful"
    exit 0
  else
    attempt_count=$((attempt_count + 1))
    if [ $attempt_count -eq $max_attempts ]; then
      echo "ERROR: PostgreSQL connection failed after $max_attempts attempts. Check your connection parameters."
      echo "Host: $host"
      echo "Port: $port"
      echo "User: $user"
      echo "Database: $db_name"
      exit 1
    fi
    echo "PostgreSQL is unavailable at $host:$port - sleeping for 1 second (attempt $attempt_count/$max_attempts)"
    sleep 1
  fi
done