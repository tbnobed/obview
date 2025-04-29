#!/bin/bash
set -e

echo "Running database initialization script..."

# No need to try to run migrations since we're using the direct SQL approach
echo "Migrations already applied via SQL scripts"

# Check if admin user exists
export PGPASSWORD="$POSTGRES_PASSWORD"
if psql -U postgres -d obview -t -c "SELECT COUNT(*) FROM users WHERE username = 'admin';" | grep -q '0'; then
  echo "Creating admin user..."
  psql -U postgres -d obview -c "
    INSERT INTO users (username, password, email, name, role, \"createdAt\") 
    VALUES ('admin', 'a7b13d2b2b89eacba6e3d2c10b08f7d0cf5ba0a79d0b99d27e8912613f087d6bfe21ef50c43709a97269d9ff7c779e17adf12d2a6722a7e6d30b70a9d87e0bde.7c3cde42af095f81af3fc6c5a95bf273', 'admin@example.com', 'Administrator', 'admin', NOW())
    ON CONFLICT (username) DO NOTHING;
  "
else
  echo "Admin user already exists."
fi

echo "Database initialization completed successfully."