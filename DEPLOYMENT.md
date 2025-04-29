# OBview.io Deployment Guide

This guide provides detailed instructions for deploying OBview.io using Docker.

## Prerequisites

Ensure you have the following installed:
- Docker (version 20.10.0 or later)
- Docker Compose (version 2.0.0 or later)
- Git (for cloning the repository)

## Quick Deployment

For a quick deployment, use our automated deployment script:

```bash
# Make the script executable
chmod +x scripts/direct-fix.sh

# Run the script
./scripts/direct-fix.sh
```

This script will:
1. Create all necessary directories and files
2. Set proper permissions on scripts
3. Build and start the Docker containers

After a successful deployment, the application will be available at: http://localhost:3000

## Manual Deployment

If you prefer to deploy manually, follow these steps:

### 1. Prepare the environment

First, create the necessary directories:

```bash
mkdir -p drizzle migrations uploads
chmod 777 uploads
```

### 2. Make all scripts executable

```bash
find scripts -name "*.sh" -exec chmod +x {} \;
find init-scripts -name "*.sh" -exec chmod +x {} \;
```

### 3. Set up Docker configuration files

All necessary Docker configuration files are already in place. You don't need to modify them unless you want to customize the deployment.

### 4. Build and start the Docker containers

```bash
# Build the containers
docker compose build --no-cache

# Start the containers
docker compose up -d
```

### 5. Verify deployment

```bash
# Check the logs
docker compose logs -f

# Check the container status
docker compose ps
```

## Environment Variables

The application uses the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | postgresql://postgres:postgres@db:5432/obview |
| `POSTGRES_PASSWORD` | PostgreSQL password | postgres |
| `POSTGRES_USER` | PostgreSQL username | postgres |
| `POSTGRES_DB` | PostgreSQL database name | obview |
| `SESSION_SECRET` | Secret for session cookies | obview-default-session-secret |
| `NODE_ENV` | Node.js environment | production |

You can customize these by creating a `.env` file in the project root or by setting them in the environment before deployment.

## Database Access

To access the PostgreSQL database directly:

```bash
# Connect to the database
docker compose exec db psql -U postgres -d obview

# View tables
\dt

# Check users
SELECT * FROM users;

# Exit PostgreSQL
\q
```

## Troubleshooting

If you encounter issues during deployment, try the following:

1. Check the logs:
   ```bash
   docker compose logs -f
   ```

2. Restart the containers:
   ```bash
   docker compose restart
   ```

3. Reset the environment:
   ```bash
   docker compose down -v
   docker compose up -d
   ```

4. For more specific issues, refer to the `DOCKER_TROUBLESHOOTING.md` file.

## Production Deployment

For production deployment:

1. Use strong passwords and secrets:
   ```bash
   # Create a .env file with secure values
   echo "POSTGRES_PASSWORD=your-secure-password" > .env
   echo "SESSION_SECRET=your-secure-session-secret" >> .env
   ```

2. Configure with proper volume mounts for data persistence:
   ```yaml
   # In docker-compose.yml
   volumes:
     - /path/to/persistent/storage/uploads:/app/uploads
     - /path/to/persistent/storage/postgres:/var/lib/postgresql/data
   ```

3. Set up HTTPS with a reverse proxy like Nginx or Traefik.

4. Implement regular database backups:
   ```bash
   # Create a backup script
   echo '#!/bin/bash
   TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
   docker compose exec -T db pg_dump -U postgres obview > backup_${TIMESTAMP}.sql
   ' > backup.sh
   chmod +x backup.sh
   
   # Add to crontab for daily backups
   # 0 2 * * * /path/to/project/backup.sh
   ```

## Default Login

After deployment, you can log in with the default admin credentials:
- Username: `admin`
- Password: `admin123`

**Important:** Change the default password immediately after first login in a production environment.

## License

OBview.io is licensed under the terms provided in the LICENSE file.