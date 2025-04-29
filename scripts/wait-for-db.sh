#!/bin/sh
# wait-for-db.sh: Wait for the database to be ready

set -e

# Maximum number of attempts before giving up
MAX_ATTEMPTS=60
# Seconds to wait between attempts
WAIT_SECONDS=2
# Counter for the attempts
ATTEMPTS=0

# Parse database connection details from DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

host=$(echo $DATABASE_URL | sed -e 's/^.*@\(.*\):\(.*\)\/.*$/\1/' | tr -d '[:space:]')
port=$(echo $DATABASE_URL | sed -e 's/^.*@\(.*\):\(.*\)\/.*$/\2/' | tr -d '[:space:]')
db_name=$(echo $DATABASE_URL | sed -e 's/^.*\/\(.*\)$/\1/' | tr -d '[:space:]')
user=$(echo $DATABASE_URL | sed -e 's/^.*:\/\/\(.*\):.*@.*$/\1/' | tr -d '[:space:]')
password=$(echo $DATABASE_URL | sed -e 's/^.*:\/\/.*:\(.*\)@.*$/\1/' | tr -d '[:space:]')

# Validate extracted parameters
if [ -z "$host" ] || [ -z "$port" ] || [ -z "$db_name" ] || [ -z "$user" ] || [ -z "$password" ]; then
  echo "ERROR: Failed to parse all required parameters from DATABASE_URL"
  echo "host=$host, port=$port, db_name=$db_name, user=$user"
  exit 1
fi

echo "Waiting for PostgreSQL to become available on $host:$port..."
echo "Database: $db_name, User: $user"

# Try to connect to the database
until PGPASSWORD=$password psql -h "$host" -p "$port" -U "$user" -d "$db_name" -c '\q' > /dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ $ATTEMPTS -ge $MAX_ATTEMPTS ]; then
    echo "ERROR: Maximum attempts ($MAX_ATTEMPTS) reached. PostgreSQL is still not available."
    exit 1
  fi
  
  echo "PostgreSQL is unavailable - attempt $ATTEMPTS/$MAX_ATTEMPTS - waiting for $WAIT_SECONDS seconds"
  sleep $WAIT_SECONDS
done

echo "SUCCESS: PostgreSQL is up and running"
echo "Connection to $host:$port as $user to database $db_name was successful"