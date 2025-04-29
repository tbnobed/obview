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
```

3. Make sure the wait-for-db.sh script is executed before the application starts:
```bash
# Check entrypoint script permissions
docker compose exec app ls -la /app/scripts/
```

4. Make sure the scripts are executable:
```bash
chmod +x scripts/*.sh
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