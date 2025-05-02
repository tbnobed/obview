# Obviu.io Deployment Guide

This guide explains how to deploy the Obviu.io application either using Docker (recommended for production) or directly from the Git repository (for development or customization).

## Prerequisites

- Ubuntu 20.04 LTS or newer
- Docker and Docker Compose installed
- Git (to clone the repository)
- Domain name pointed to your server (optional but recommended)

## System Requirements

**Minimum:**
- 2 CPU cores
- 4GB RAM
- 20GB storage (more if you plan to handle large media files)

**Recommended:**  
- 4 CPU cores
- 8GB RAM
- 50GB+ storage for production use with multiple projects

**Storage Allocation Guide:**
- Database: ~5GB base + growth based on number of projects
- Media uploads: Allocate at least 25GB for production use
- Application and system: ~5GB
- Database backups: ~15GB (if storing locally)

For high-traffic deployment or large media file storage needs, consider:
- Setting up a separate storage volume for uploads
- Configuring regular offsite backup procedures
- Monitoring disk usage with alerts at 80% capacity

## Installation Options

Obviu.io can be deployed in two ways: using Docker (recommended for production) or directly from the Git repository (useful for development or customization).

## Option 1: Docker Deployment (Recommended for Production)

### 1. Install Docker and Docker Compose

If not already installed, install Docker and Docker Compose:

```bash
# Update package lists
sudo apt update

# Install prerequisites
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -

# Add Docker repository
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.22.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Add your user to the docker group to run docker without sudo
sudo usermod -aG docker $USER
```

Log out and log back in for the group membership to take effect.

### 2. Clone the Repository

```bash
git clone <repository-url> obviu
cd obviu
```

### 3. Configure Environment Variables

Create an environment file from the template:

```bash
cp .env.example .env
```

Then edit the `.env` file to set your configuration:

```bash
nano .env
```

Make sure to update:
- `POSTGRES_PASSWORD`: Use a strong, random password
- `SESSION_SECRET`: Generate a secure random string
- `SENDGRID_API_KEY`: Your SendGrid API key for email functionality
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`, etc.: Credentials for the initial admin user

### 4. Build and Start the Application

```bash
docker-compose up -d
```

This will:
- Build the application Docker image
- Create a PostgreSQL database
- Run the necessary migrations
- Create an initial admin user
- Start the application

### 5. Access the Application

Once deployed, you can access the application at:

http://your-server-ip:3000

### 6. Set Up a Reverse Proxy (Optional)

For production use, it's recommended to set up Nginx as a reverse proxy and enable HTTPS with Let's Encrypt:

```bash
# Install Nginx and Certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Set up Nginx configuration
sudo nano /etc/nginx/sites-available/obviu

# Add the following configuration (replace obviu.io with your actual domain if different)
server {
    listen 80;
    server_name obviu.io www.obviu.io;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Set larger client_max_body_size for file uploads
        client_max_body_size 100M;
    }
}

# Enable the site
sudo ln -s /etc/nginx/sites-available/obviu /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Obtain SSL certificate
sudo certbot --nginx -d obviu.io -d www.obviu.io
```

### 7. Monitoring and Maintenance

#### Application Monitoring

Obviu.io includes a health check API that provides detailed system information:

```bash
# Check application health
curl http://localhost:3000/api/health

# Set up continuous monitoring with watch (refreshes every 5 seconds)
watch -n 5 'curl -s http://localhost:3000/api/health'
```

The health endpoint provides:
- Application status
- Database connectivity
- Memory usage
- Uptime statistics
- Environment information

Consider using monitoring solutions like Prometheus or Grafana for production deployments.

#### View logs

```bash
# View all logs
docker-compose logs -f

# View only app container logs
docker-compose logs -f app

# View database logs
docker-compose logs -f db

# Filter logs for errors
docker-compose logs -f | grep -i error
```

#### Restart the application

```bash
# Restart all services
docker-compose restart

# Restart only the application (not the database)
docker-compose restart app
```

#### Update the application

```bash
# Pull the latest code
git pull

# Take down the existing containers 
docker-compose down

# Rebuild the application
docker-compose build

# Start everything up again
docker-compose up -d
```

#### Backup and Restore Database

Obviu.io includes automated scripts for comprehensive backup and restoration:

##### Database Backups

```bash
# Backup the database using the automated script (maintains the last 5 backups)
docker-compose exec app /app/scripts/backup-db.sh

# Backup to a specific directory
docker-compose exec app /app/scripts/backup-db.sh /path/to/backup/directory

# Manual backup if needed
docker-compose exec db pg_dump -U postgres obviu > backup_$(date +%Y-%m-%d).sql

# Restore from backup using the automated script
docker-compose exec app /app/scripts/restore-db.sh /app/backups/obviu_backup_20250501_123045.sql

# Manual restore if needed
cat backup_file.sql | docker-compose exec -T db psql -U postgres -d obviu
```

##### Volume Backups (for uploads and database data)

```bash
# Stop the application first for consistent backups
docker-compose stop

# Backup all volumes
/app/scripts/backup-volumes.sh /path/to/backup/directory

# Restart the application
docker-compose start

# Restore volumes from backup (with application stopped)
docker-compose stop
/app/scripts/restore-volumes.sh /path/to/backup/directory/obviu_volumes_20250501_123045.tar.gz
docker-compose start
```

**Important:** The backup scripts target Docker volumes named `workspace_postgres_data` and `workspace_uploads` by default. If your Docker Compose project directory has a different name, the volume names will be prefixed differently. Edit the scripts before using them:

```bash
# To see your actual Docker volume names
docker volume ls

# Edit the scripts if needed
nano /app/scripts/backup-volumes.sh
nano /app/scripts/restore-volumes.sh
```

##### Disk Space Monitoring

```bash
# Check disk space usage with alerts
/app/scripts/monitor-disk.sh

# View detailed disk usage information
docker-compose exec app df -h
```

For production environments, consider setting up cron jobs for regular backups and monitoring:

```bash
# Add to crontab - Database backup daily at 2 AM
0 2 * * * docker-compose -f /path/to/docker-compose.yml exec -T app /app/scripts/backup-db.sh >> /var/log/obviu-backup.log 2>&1

# Add to crontab - Volume backup weekly on Sunday at 3 AM
0 3 * * 0 cd /path/to/obviu && /app/scripts/backup-volumes.sh >> /var/log/obviu-volume-backup.log 2>&1

# Add to crontab - Disk space monitoring hourly
0 * * * * /app/scripts/monitor-disk.sh >> /var/log/obviu-disk-monitor.log 2>&1
```

## Troubleshooting

### Important Note About Docker Deployment Configuration

When deploying the application using Docker, ensure the following configuration is correct:

1. **Migrations Directory**: The application uses the `migrations` directory for database migrations, not the `drizzle` directory. The Dockerfile should have:
   ```
   COPY --from=builder /app/migrations ./migrations
   ```

2. **Migration Script Path**: The docker-entrypoint.sh script must point to the correct path for the migration script:
   ```bash
   # Correct path in docker-entrypoint.sh
   node /app/server/db-migrate.js
   ```
   
3. **Server Directory**: Make sure the server directory is created and the migration script is copied:
   ```
   # Create server directory and copy migration script
   RUN mkdir -p ./server
   COPY --from=builder /app/server/db-migrate.js ./server/db-migrate.js
   ```

4. **Migration Folder Setting**: The database migration script must point to the correct directory:
   ```javascript
   await migrate(db, { migrationsFolder: 'migrations' });
   ```

5. **Module System Compatibility**:
   When using ES modules (`"type": "module"` in package.json), scripts using CommonJS-style `require()` statements need to use the `.cjs` extension:
   
   ```bash
   # Migration script
   # Change: node /app/server/db-migrate.js
   # To: node /app/server/db-migrate.cjs
   
   # Setup script
   # Change: node /app/scripts/setup.js
   # To: node /app/scripts/setup.cjs
   ```
   
   Make sure to create these files in your repo with the `.cjs` extension and update references in docker-entrypoint.sh.
   
6. **Common Docker Errors**:
   - If you see `"/app/drizzle": not found`, update the Dockerfile to use migrations directory
   - If you see `Cannot find module '/app/dist/server/db-migrate.js'`, ensure the server directory and script are correctly copied
   - If you see `ReferenceError: require is not defined in ES module scope`, this indicates a module system incompatibility. Rename affected scripts from `.js` to `.cjs` and update all references accordingly
   - If you see `Error: connect ECONNREFUSED 172.18.0.2:443` or WebSocket errors, this is caused by @neondatabase/serverless trying to use WSS connections in Docker. Make sure db-migrate.cjs and setup.cjs use the regular pg package instead of Neon Serverless
   - If you see `Error: All attempts to open a WebSocket to connect to the database failed`, this is the same WebSocket connectivity issue. Replace `const { Pool } = require('@neondatabase/serverless');` with `const { Pool } = require('pg');` in the affected scripts
   - If you see `error: relation "activity_logs" already exists`, this means migrations are being run multiple times. Update your db-migrate.cjs to handle the case where tables already exist (add try/catch logic that skips the 42P07 error code)
   - If you see `Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './pg-pool' is not defined by "exports"`, update the import in server/db.ts to use 'drizzle-orm/node-postgres' instead of 'drizzle-orm/pg-pool'
   - If you see `Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './pg-core/migrator' is not defined by "exports"`, the drizzle-orm package exports have changed. Use a simplified direct SQL approach for running migrations instead of depending on the drizzle-orm migrator
   - If you see `WARN[0000] /home/.../docker-compose.yml: the attribute 'version' is obsolete`, remove the `version` key from your docker-compose.yml file as it's no longer needed in Docker Compose V2

### Database Migration Issues

If you continue to experience issues with migrations, consider these options:

1. **Completely Reset Database**: If you're in development and can afford to start from scratch:
   ```bash
   # Stop and remove all containers
   docker-compose down
   
   # Remove the volume containing database data
   docker volume rm obviu_postgres_data
   
   # Start everything up again
   docker-compose up -d
   ```

2. **Manual Migration**: Connect to the database and execute the SQL directly:
   ```bash
   # Connect to the database container
   docker-compose exec db psql -U postgres -d obviu
   
   # Inside the PostgreSQL terminal, manually execute the migrations
   \i /docker-entrypoint-initdb.d/01-init-schema.sql
   ```

3. **Database Inspection**: Check if tables exist and their structure:
   ```bash
   # Connect to the database
   docker-compose exec db psql -U postgres -d obviu
   
   # List all tables
   \dt
   
   # Show table structure
   \d+ table_name
   ```

### Build and Directory Structure Issues

If you encounter errors about missing files or directories in the Docker container, try these solutions:

1. **Docker Build Syntax Issues**: Make sure your Dockerfile doesn't have syntax errors:
   ```bash
   # Check for unexpected newlines or escaped characters in RUN commands
   # This common error (new line with \n) will cause builds to fail:
   # RUN command && \
   #    next_command && \
   #    echo "text with newline \n" 
   #
   # Fix by removing the \n or any escaped characters that cause problems
   ```

2. **Multi-line CMD Statement**: When using multi-line commands in Dockerfile CMD statements, use one of these formats:
   ```bash
   # Format 1: Write everything on a single line
   CMD ["sh", "-c", "if [ condition ]; then cmd1; elif [ condition2 ]; then cmd2; else cmd3; fi"]
   
   # Format 2: Use proper bash here-document format
   CMD ["bash", "-c", "if [ condition ]; then\n  cmd1\nelse\n  cmd2\nfi"]
   ```

3. **Rebuild Docker Image**: Ensure your Dockerfile is properly copying all necessary files:
   ```bash
   # Build with verbose output to debug issues
   docker-compose build --no-cache --progress=plain app
   ```

4. **Check File Structure**: Inspect the container's filesystem:
   ```bash
   # Start a shell in the application container
   docker-compose exec app sh
   
   # Inside the container, check critical directories
   ls -la /app
   ls -la /app/dist
   ls -la /app/server
   ```
   
5. **Diagnosis and Recovery**: The application includes robust diagnostic and recovery mechanisms:
   ```bash
   # Inside the container, run the diagnostic report
   /app/scripts/docker-entrypoint.sh
   
   # This will check paths, server entry points, and attempt recovery
   ```
   
6. **Manually Trigger Build**: Sometimes you need to force a build inside the container:
   ```bash
   # Access container shell
   docker-compose exec app sh
   
   # Inside the container, try building
   npm run build
   ```

7. **Copy Build Output**: If your local build works but the Docker build fails:
   ```bash
   # Build locally first
   npm run build
   
   # Create a special Dockerfile.fix
   echo "FROM obviu_app
   COPY ./dist /app/dist" > Dockerfile.fix
   
   # Build fixed image
   docker build -t obviu_app_fixed -f Dockerfile.fix .
   
   # Update your docker-compose.yml to use obviu_app_fixed
   ```

### Container Health Check Failures

The Docker Compose setup includes health checks for both app and database containers. If health checks fail:

```bash
# Check the status of all containers to see which one failed
docker-compose ps

# View app container logs for health check failures
docker-compose logs app

# Manually test app health endpoint - use port 5000 as the application runs on this port
curl http://localhost:5000/api/health
```

If you get "Connection refused" errors when trying to access the application from the host machine:

```bash
# Check if the container's internal health check is passing
docker inspect obviu_app | grep -A 10 Health

# Check the application logs to see which port it's actually listening on
docker-compose logs app | grep -i "serving on port"

# See if the application is binding to 0.0.0.0 instead of localhost inside container
docker-compose exec app netstat -tuln | grep 5000

# Verify port mapping is correct
docker-compose port app 5000
```

### Database Connectivity Issues

If the application cannot connect to the database, try these solutions:

```bash
# Check if the database is running
docker-compose ps db

# Check database logs
docker-compose logs db

# Try connecting manually to verify credentials
docker-compose exec db psql -U postgres -d obviu -c "SELECT 1"

# Verify the environment variables are correctly passed to the app
docker-compose exec app env | grep DATABASE_URL

# Check the application's configuration to confirm it's using the correct connection details
docker-compose exec app cat /app/.env | grep DATABASE_URL
```

### Application Boot Issues

If the application fails to start or crashes immediately:

```bash
# Check for application startup errors
docker-compose logs app

# Look for specific JavaScript errors
docker-compose logs app | grep "Error:"

# Check memory usage (OOM errors)
docker-compose exec app free -m

# Verify disk space (application might fail if disk is full)
docker-compose exec app df -h

# Try starting the application in debug mode
docker-compose exec app node --inspect=0.0.0.0:9229 /app/server/index.js
```

### File Upload Issues

If file uploads are failing:

```bash
# Check if the upload directory exists and has correct permissions
docker-compose exec app ls -la /app/uploads

# Fix upload directory permissions
docker-compose exec app mkdir -p /app/uploads
docker-compose exec app chmod 777 /app/uploads

# Verify Nginx upload limit (if using Nginx)
sudo nano /etc/nginx/sites-available/obviu
# Look for: client_max_body_size 100M;
# Increase if needed and restart Nginx
sudo systemctl restart nginx
```

## Disaster Recovery

Obviu.io includes a comprehensive disaster recovery strategy to help you quickly restore operations in case of failures.

### Backup Strategy

Ensure you have:

1. **Regular Database Backups**
   - Configured the automated backup scripts
   - Stored backups both locally and in offsite storage
   - Verified that backups are being created

2. **Volume/File Backups**
   - Backed up all Docker volumes (especially uploads)
   - Stored file backups separately from database backups
   - Prepared for efficient access to restore from
   
3. **Configuration Backups**
   - Stored a copy of .env files and Docker configuration
   - Documented custom configurations
   - Backed up any SSL certificates if not using Let's Encrypt

### Recovery Procedure

#### Complete System Restoration

If you need to restore the entire system to a new server:

```bash
# 1. Transfer backup files to the new server
scp obviu_backup_YYYYMMDD.sql new-server:/tmp/
scp obviu_volumes_YYYYMMDD.tar.gz new-server:/tmp/

# 2. Install Docker and Docker Compose on the new server
# (see installation instructions above)

# 3. Clone the repository
mkdir -p /path/to/obviu
cd /path/to/obviu
git clone <repository-url> .

# 4. Restore configuration
# Create .env file with correct settings

# 5. Start containers without initializing
docker-compose up -d --no-start

# 6. Restore volume data first
./scripts/restore-volumes.sh /tmp/obviu_volumes_YYYYMMDD.tar.gz

# 7. Start containers 
docker-compose start

# 8. Restore database
docker-compose exec app /app/scripts/restore-db.sh /tmp/obviu_backup_YYYYMMDD.sql
```

#### Database-Only Recovery

The Obviu.io disaster recovery process is designed to minimize downtime:

```bash
# For quick database-only recovery:
docker-compose stop app  # Stop just the application, leave DB running
./scripts/restore-volumes.sh /path/to/backup/obviu_volumes_YYYYMMDD.tar.gz
docker-compose exec app /app/scripts/restore-db.sh /path/to/backup/obviu_backup_YYYYMMDD.sql
docker-compose start app  # Restart the application
```

## Option 2: Direct Deployment (Development/Customization)

For development or customization purposes, you can deploy directly from the Git repository without Docker.

### 1. Prerequisites

```bash
# Install Node.js v18 or newer
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install build essentials
sudo apt install -y build-essential
```

### 2. Clone the Repository

```bash
git clone <repository-url> .
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
nano .env
```

Set the following variables at minimum:
- `DATABASE_URL=postgresql://username:password@localhost:5432/obviu`
- `SESSION_SECRET` (random secure string)
- `SENDGRID_API_KEY` (for email functionality)

### 4. Create PostgreSQL Database

```bash
sudo -u postgres psql
postgres=# CREATE USER your_username WITH PASSWORD 'your_password';
postgres=# CREATE DATABASE obviu;
postgres=# GRANT ALL PRIVILEGES ON DATABASE obviu TO your_username;
postgres=# \q
```

### 5. Install Dependencies and Build

```bash
npm install
npm run build
```

### 6. Run Migrations and Create Initial User

```bash
NODE_ENV=production npm run db:push
node scripts/setup.js
```

### 7. Start the Application

For development:
```bash
npm run dev
```

For production:
```bash
# Install PM2 for process management
npm install -g pm2

# Start the application with PM2
pm2 start npm --name "obviu" -- start
pm2 save
pm2 startup
```

### 8. Set Up Backup Cron Jobs

```bash
# Create a backup script
mkdir -p ~/backups

cat > ~/scripts/backup-db.sh << 'EOF'
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=~/backups
mkdir -p "$BACKUP_DIR"
pg_dump -U postgres obviu > "$BACKUP_DIR/obviu_backup_$TIMESTAMP.sql"
# Keep only the 5 most recent backups
ls -t "$BACKUP_DIR"/obviu_backup_*.sql | tail -n +6 | xargs -r rm
EOF

chmod +x ~/scripts/backup-db.sh

# Add cron job
(crontab -l 2>/dev/null; echo "0 2 * * * ~/scripts/backup-db.sh") | crontab -
```

## Code Extension and Customization

The Obviu.io codebase uses TypeScript for type safety. There are some common patterns to be aware of when extending the code:

1. **Schema Definition**: When adding new data models, define them in `shared/schema.ts` using Drizzle ORM's schema builder.
2. **Server Routes**: Routes are defined in `server/routes.ts`. Use the Express.js middleware pattern for authentication and validation.
3. **Frontend Components**: React components are in `client/src/components`. Use shadcn UI components where possible for consistency.
4. **Media Processing**: Media processing utilities are in `server/utils`. Follow the pattern for extending functionality.

## Browser Compatibility

Obviu.io is built with modern web standards and should work in all recent browser versions:
- Chrome/Edge/Brave (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)

For best performance, recommend Chrome or Edge to your users, especially when dealing with large media files.