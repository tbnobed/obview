#!/bin/bash
set -e

# This script ensures the database exists and has proper permissions
# It runs on PostgreSQL container startup

echo "Checking if database exists..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    -- Create database if it doesn't exist
    SELECT 'CREATE DATABASE obview'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'obview');
    
    -- Grant privileges
    GRANT ALL PRIVILEGES ON DATABASE obview TO postgres;
    
    -- Connect to the database and create required extensions
    \c obview
    
    -- Create extensions
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
EOSQL

echo "Database setup completed successfully!"