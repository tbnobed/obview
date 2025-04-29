# Docker Troubleshooting Guide

This document provides solutions to common Docker build and deployment issues with OBview.io.

## Quick Fix Scripts

### Standard Fix

For most Docker build issues, you can use our automated fix script:

```bash
# Make the script executable
chmod +x scripts/fix-docker-build.sh

# Run the fix script
./scripts/fix-docker-build.sh
```

For more stubborn issues, use the force clean option:

```bash
./scripts/fix-docker-build.sh --force-clean
```

### Direct Fix (For Critical Build Failures)

If you're experiencing persistent COPY command failures or other critical build issues, we have a direct fix script that completely rewrites the Dockerfile with a simplified version:

```bash
# Make the script executable
chmod +x scripts/direct-fix.sh

# Run the direct fix script
./scripts/direct-fix.sh
```

The direct fix script:
1. Creates a backup of your existing Dockerfile as Dockerfile.bak
2. Writes a new simplified Dockerfile designed to work in all environments
3. Creates all necessary directories and placeholder files
4. Rebuilds and starts the Docker containers

## Common Issues and Solutions

### Issue: Missing drizzle directory during build

**Error message:**
```
failed to solve: process "/bin/sh -c node scripts/setup-drizzle.js" did not complete successfully: exit code: 1
```

**Solution:**

1. Create the required directories in your project root:
```bash
mkdir -p drizzle
mkdir -p migrations
```

2. Create placeholder files:
```bash
echo "-- Placeholder migration file for Drizzle" > drizzle/placeholder.sql
echo "-- Placeholder migration file for Drizzle" > migrations/placeholder.sql
```

3. Rebuild Docker images:
```bash
docker compose build
docker compose up -d
```

### Issue: "require is not defined in ES module scope" error

**Error message:**
```
ReferenceError: require is not defined in ES module scope, you can use import instead
This file is being treated as an ES module because it has a '.js' file extension and '/app/package.json' contains "type": "module"
```

**Solution:**

This occurs because Node.js treats .js files as ES modules when "type": "module" is set in package.json. Use one of these solutions:

1. Use the CommonJS version of the script:
```bash
docker compose run --rm app node scripts/setup-drizzle.cjs
```

2. Skip the problematic script in the build process by modifying the Dockerfile:
```dockerfile
# Create drizzle directories manually instead of using the script
RUN mkdir -p drizzle migrations
RUN echo "-- Placeholder migration file for Drizzle" > drizzle/placeholder.sql
RUN echo "-- Placeholder migration file for Drizzle" > migrations/placeholder.sql
```

### Issue: Docker build cache issues

**Error message:**
```
 => ERROR [builder 7/8] RUN npm run build                                                                 5.2s
```

**Solution:**

Clear Docker's build cache and rebuild:

```bash
# Remove all stopped containers
docker container prune -f

# Clean the build cache
docker builder prune -f

# Rebuild without cache
docker compose build --no-cache
docker compose up -d
```

### Issue: Database connection failures

#### Error: Connection refused

**Error message:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:**

1. Check if the database container is running:
```bash
docker compose ps
```

2. Verify the database environment variables:
```bash
docker compose exec app env | grep DATABASE_URL
docker compose exec app env | grep POSTGRES_PASSWORD
```

3. Ensure database credentials are set in both containers by updating docker-compose.yml:
```yaml
# In docker-compose.yml, ensure both services have the same password
services:
  app:
    environment:
      - DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD:-postgres}@db:5432/obview
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
      - POSTGRES_USER=postgres
      - POSTGRES_HOST=db
  
  db:
    environment:
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
```

4. Create an initialization script for PostgreSQL:
```bash
mkdir -p init-scripts
cat > init-scripts/01-init-db.sql << EOF
-- Create database tables
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    -- add other columns...
);
-- Add more tables...

-- Add admin user
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin') THEN
    INSERT INTO users (username, password, email, name, role)
    VALUES ('admin', 'hashed_password', 'admin@example.com', 'Administrator', 'admin');
  END IF;
END \$\$;
EOF
```

5. Make all scripts executable and restart:
```bash
# Make scripts in scripts/ directory executable
chmod +x scripts/*.sh

# Make init-scripts/ executable too
chmod +x init-scripts/*.sh

docker compose down
docker compose build --no-cache
docker compose up -d
```

#### Error: Neon Database WebSocket Error

**Error message:**
```
All attempts to open a WebSocket to connect to the database failed. Please refer to https://github.com/neondatabase/serverless/blob/main/CONFIG.md#websocketconstructor-typeof-websocket--undefined
```

**Solution:**

This occurs because the application is trying to use the Neon database driver with WebSockets for a local PostgreSQL database connection, which doesn't support this protocol.

1. Use the direct-fix.sh script to fix the issue:
```bash
# Make executable
chmod +x scripts/direct-fix.sh

# Run the script
./scripts/direct-fix.sh
```

2. Alternatively, manually fix by:
   - Replace @neondatabase/serverless with pg in package.json
   - Update server/db.ts to use standard PostgreSQL connection:
   ```typescript
   import { Pool } from 'pg';
   import { drizzle } from 'drizzle-orm/node-postgres';
   import * as schema from "@shared/schema";

   export const pool = new Pool({ 
     connectionString: process.env.DATABASE_URL 
   });
   export const db = drizzle(pool, { schema });
   ```

3. Rebuild and restart:
```bash
docker compose down
docker compose build
docker compose up -d
```

### Issue: Permission denied when executing scripts

**Error message:**
```
/app/scripts/docker-entrypoint.sh: Permission denied
```

**Solution:**

1. Make scripts executable locally:
```bash
chmod +x scripts/*.sh
```

2. Update Dockerfile to make scripts executable:
```dockerfile
# Make scripts executable
RUN chmod +x ./scripts/*.sh
```

3. Rebuild:
```bash
docker compose build
docker compose up -d
```

### Issue: Volume mounting problems

**Error message:**
```
Error response from daemon: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: error mounting "/var/lib/docker/volumes/..." to "/app/uploads": operation not permitted: unknown
```

**Solution:**

1. Check for proper volume configuration in docker-compose.yml:
```yaml
volumes:
  - ./uploads:/app/uploads
```

2. Use a named volume instead of a bind mount:
```yaml
volumes:
  - app_uploads:/app/uploads

volumes:
  app_uploads:
```

3. Check permissions on the host directory:
```bash
sudo chown -R $(id -u):$(id -g) ./uploads
```

### Issue: Out of disk space

**Error message:**
```
failed to solve: failed to register layer: write /var/lib/docker/tmp/...: no space left on device
```

**Solution:**

1. Clear Docker resources:
```bash
docker system prune -a -f
```

2. Remove unused images:
```bash
docker image prune -a -f
```

3. Check available disk space:
```bash
df -h
```

## Advanced Troubleshooting

### Inspecting Docker Build Process

To understand what's happening during the build process:

```bash
# Build with verbose output
docker compose build --progress=plain
```

### Debugging Container Issues

To debug a running container:

```bash
# Get into a running container
docker compose exec app /bin/sh

# View logs
docker compose logs -f app

# Check process list
docker compose top app
```

### Fixing Network Issues

If containers can't communicate:

```bash
# Check Docker networks
docker network ls

# Inspect the application network
docker network inspect obview_app_network

# Recreate the network
docker network rm obview_app_network
docker compose up -d
```

### Issue: Migrations and Schema Setup Failures

#### Error: Missing db-migrate.js file

**Error message:**
```
Error: Cannot find module '/app/dist/server/db-migrate.js'
```

**Solution:**

1. The simplest solution is to use the direct-fix.sh script, which addresses multiple issues:
```bash
chmod +x scripts/direct-fix.sh
./scripts/direct-fix.sh
```

2. If you prefer to fix manually, you can create database tables directly:
```bash
# Connect to PostgreSQL container
docker compose exec db psql -U postgres -d obview -c "
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    \"createdAt\" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Add other tables...
"
```

3. Or modify the docker-entrypoint.sh script to create the schema directly:
```bash
# Edit docker-entrypoint.sh to skip migrations and create tables directly
```

#### Error: ES Module vs CommonJS issues with setup.js

**Error message:**
```
ReferenceError: require is not defined in ES module scope, you can use import instead
This file is being treated as an ES module because it has a '.js' file extension and '/app/package.json' contains "type": "module".
```

**Solution:**

1. Rename the setup.js file to setup.cjs with pg package:
```bash
# Create a .cjs version of the script
cp scripts/setup.js scripts/setup.cjs
sed -i 's/@neondatabase\/serverless/pg/g' scripts/setup.cjs

# Update docker-entrypoint.sh to use the .cjs file
sed -i 's/setup.js/setup.cjs/g' scripts/docker-entrypoint.sh
```

2. If the admin user still isn't creating properly, you can add one manually:
```bash
docker compose exec db psql -U postgres -d obview -c "
INSERT INTO users (username, password, email, name, role, \"createdAt\") 
VALUES ('admin', 'a7b13d2b2b89eacba6e3d2c10b08f7d0cf5ba0a79d0b99d27e8912613f087d6bfe21ef50c43709a97269d9ff7c779e17adf12d2a6722a7e6d30b70a9d87e0bde.7c3cde42af095f81af3fc6c5a95bf273', 'admin@example.com', 'Administrator', 'admin', NOW())
ON CONFLICT (username) DO NOTHING;
"
```

## Database Recovery

If your database is corrupted or migrations fail:

1. Backup your data first:
```bash
docker compose exec db pg_dump -U postgres obview > backup.sql
```

2. Reset the database:
```bash
docker compose down
docker volume rm obview_db_data
docker compose up -d
```

3. Create a fresh database:
```bash
docker compose exec db createdb -U postgres obview
```

4. Restore from backup if needed:
```bash
cat backup.sql | docker compose exec -T db psql -U postgres obview
```

## Getting Additional Help

If you continue to experience issues after trying these solutions:

1. Check the GitHub repository issues section
2. Search the community forums
3. Contact support with the following details:
   - Docker and Docker Compose versions
   - Operating system and version
   - Full error messages
   - Output of `docker compose ps` and `docker compose logs`