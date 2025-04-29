#!/bin/sh
# wait-for-db.sh: Wait for the database to be ready

set -e

host=$(echo $DATABASE_URL | sed -e 's/^.*@\(.*\):\(.*\)\/.*$/\1/')
port=$(echo $DATABASE_URL | sed -e 's/^.*@\(.*\):\(.*\)\/.*$/\2/')
db_name=$(echo $DATABASE_URL | sed -e 's/^.*\/\(.*\)$/\1/')
user=$(echo $DATABASE_URL | sed -e 's/^.*:\/\/\(.*\):.*@.*$/\1/')
password=$(echo $DATABASE_URL | sed -e 's/^.*:\/\/.*:\(.*\)@.*$/\1/')

echo "Waiting for PostgreSQL to become available on $host:$port..."

# Extract just the host and port
until PGPASSWORD=$password psql -h "$host" -p "$port" -U "$user" -d "$db_name" -c '\q'; do
  >&2 echo "PostgreSQL is unavailable - sleeping for 1 second"
  sleep 1
done

>&2 echo "PostgreSQL is up - continuing"