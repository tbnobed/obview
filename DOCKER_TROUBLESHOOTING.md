# Docker Troubleshooting Guide

This document provides solutions for common Docker build and deployment issues with OBview.io.

## Common Build Issues

### Missing /app/drizzle Directory Error

**Error Message:**
```
ERROR [app production 9/12] COPY --from=builder /app/drizzle ./drizzle
failed to solve: failed to compute cache key: failed to calculate checksum of ref XXXX-XXXX-XXXX-XXXX::XXXXX: "/app/drizzle": not found
```

**Solution:**

The error occurs because the Dockerfile is trying to copy a directory that doesn't exist. We've implemented multiple fixes for this issue:

1. **Manually create the directory structure**:
   ```bash
   # On your host machine, before building
   mkdir -p drizzle
   touch drizzle/.gitkeep
   ```

2. **Force a clean build ignoring cache**:
   ```bash
   docker compose build --no-cache app
   ```

3. **Use the updated Dockerfile from the latest commit**:
   The latest Dockerfile includes fixes for this issue by:
   - Creating required directories during build
   - Making the COPY commands more resilient
   - Generating placeholder files when needed

### Database Migration Failures

**Error Message:**
```
ERROR: Database migration failed
```

**Solution:**

1. **Verify database connection**:
   Check that your DATABASE_URL environment variable is correctly set and the PostgreSQL server is running.

2. **Manually initialize the database**:
   If migrations are failing, you can manually run them:
   ```bash
   # Start just the database
   docker compose up -d db
   
   # Wait for DB to be ready
   sleep 10
   
   # Run migrations manually
   docker compose exec app node dist/server/db-migrate.js
   ```

3. **Use the setup-drizzle.js script**:
   ```bash
   docker compose exec app node scripts/setup-drizzle.js
   ```

## Build Process Overview

The Docker build process for OBview.io involves several key steps:

1. **Builder Stage**:
   - Installs dependencies
   - Builds the application
   - Generates drizzle migration files

2. **Production Stage**:
   - Copies built assets from the builder stage
   - Sets up directories for uploads and migrations
   - Runs database migrations and initializes the admin user
   - Starts the application

## Customizing the Build

You can customize the build process by modifying the following files:

- **Dockerfile**: Controls the build and packaging process
- **docker-compose.yml**: Defines services, networks, and volumes
- **scripts/docker-entrypoint.sh**: Controls initialization when the container starts
- **scripts/wait-for-db.sh**: Ensures database is ready before starting the app
- **scripts/setup-drizzle.js**: Handles drizzle migration setup

## Full Rebuild Instructions

If you need to completely rebuild the application from scratch:

```bash
# Stop all containers
docker compose down

# Remove volumes (caution: this deletes all data)
docker compose down -v

# Remove all images related to this project
docker images | grep obview | awk '{print $3}' | xargs docker rmi -f

# Rebuild everything
docker compose build --no-cache

# Start from scratch
docker compose up -d
```

This ensures a completely fresh environment with no cached artifacts from previous builds.

## Advanced Issues

### Missing NPM Packages

If the build fails with missing npm packages, try:

```bash
# In your project directory
npm ci

# Then rebuild
docker compose build --no-cache
```

### Permissions Issues

If you encounter permission issues with uploads or script execution:

```bash
# Fix permissions in the container
docker compose exec app chmod -R 755 /app/scripts
docker compose exec app chmod -R 777 /app/uploads

# Or rebuild with correct permissions
docker compose build --build-arg USER_ID=$(id -u) --build-arg GROUP_ID=$(id -g)
```

### Docker Context Size Issues

If your Docker build context is too large:

```bash
# Add more files to .dockerignore
echo "node_modules/" >> .dockerignore
echo "uploads/" >> .dockerignore

# Or build with a specific context
docker build -t obview -f Dockerfile .
```

## Getting Help

If you continue to experience issues with the Docker build, please:

1. Check the logs with `docker compose logs app`
2. Verify all environment variables are correctly set
3. Ensure your Docker version is up to date
4. Reference the detailed DEPLOYMENT.md document for complete setup instructions