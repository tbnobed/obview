#!/bin/sh
set -e

# Get database connection details from environment variables
DB_HOST=${POSTGRES_HOST:-db}
DB_PORT=${POSTGRES_PORT:-5432}
DB_USER=${POSTGRES_USER:-postgres}
DB_PASSWORD=${POSTGRES_PASSWORD:-postgres}
DB_NAME=${POSTGRES_DB:-obview}

echo "Waiting for PostgreSQL to become available on $DB_HOST:$DB_PORT..."
echo "Database: $DB_NAME, User: $DB_USER"

MAX_RETRIES=60
RETRY=0

until PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d $DB_NAME -c "SELECT 1" > /dev/null 2>&1; do
  RETRY=$((RETRY+1))
  if [ $RETRY -ge $MAX_RETRIES ]; then
    echo "ERROR: Failed to connect to PostgreSQL after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "PostgreSQL is unavailable - attempt $RETRY/$MAX_RETRIES - waiting for 2 seconds"
  sleep 2
done

echo "SUCCESS: PostgreSQL is up and running"
echo "Connection to $DB_HOST:$DB_PORT as $DB_USER to database $DB_NAME was successful"