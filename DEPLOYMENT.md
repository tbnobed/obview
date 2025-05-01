# OBview.io Deployment Guide

This guide explains how to deploy the OBview.io application on an Ubuntu server using Docker and Docker Compose.

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

## Installation Steps

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
git clone <repository-url> obview
cd obview
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
sudo nano /etc/nginx/sites-available/obview

# Add the following configuration (replace obview.io with your actual domain if different)
server {
    listen 80;
    server_name obview.io www.obview.io;

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
sudo ln -s /etc/nginx/sites-available/obview /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Obtain SSL certificate
sudo certbot --nginx -d obview.io -d www.obview.io
```

### 7. Monitoring and Maintenance

#### Application Monitoring

OBview.io includes a health check API that provides detailed system information:

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

OBview.io includes automated scripts for database backup and restoration:

```bash
# Backup the database using the automated script (maintains the last 5 backups)
docker-compose exec app /app/scripts/backup-db.sh

# Backup to a specific directory
docker-compose exec app /app/scripts/backup-db.sh /path/to/backup/directory

# Manual backup if needed
docker-compose exec db pg_dump -U postgres obview > backup_$(date +%Y-%m-%d).sql

# Restore from backup using the automated script
docker-compose exec app /app/scripts/restore-db.sh /app/backups/obview_backup_20250501_123045.sql

# Manual restore if needed
cat backup_file.sql | docker-compose exec -T db psql -U postgres -d obview
```

For production environments, consider setting up a cron job for regular backups:

```bash
# Add to crontab (backup daily at 2 AM)
0 2 * * * docker-compose -f /path/to/docker-compose.yml exec -T app /app/scripts/backup-db.sh >> /var/log/obview-backup.log 2>&1
```

## Troubleshooting

### Container Health Check Failures

The Docker Compose setup includes health checks for both app and database containers. If health checks fail:

```bash
# Check the status of all containers to see which one failed
docker-compose ps

# View app container logs for health check failures
docker-compose logs app

# Manually test app health endpoint
curl http://localhost:3000/api/health
```

### Database Connectivity Issues

If the application can't connect to the database, check:

```bash
# Verify the database container is running
docker-compose ps

# Check database logs
docker-compose logs db

# Check if the environment variables are correct
docker-compose exec app env | grep DATABASE_URL

# Test database connectivity directly
docker-compose exec db psql -U postgres -c "SELECT 1"
```

### Email Sending Issues

If emails aren't being sent properly:

1. Verify your SendGrid API key is correct
2. Check that the sender email address is verified in SendGrid 
3. Check the application logs for any SendGrid-related errors:
   ```bash
   docker-compose logs app | grep -i sendgrid
   ```

### Upload Storage Issues

If file uploads fail or uploaded files are not accessible:

1. Verify the uploads volume is properly mounted:
   ```bash
   docker-compose exec app ls -la /app/uploads
   ```
   
2. Check file permissions:
   ```bash
   docker-compose exec app stat -c '%a %n' /app/uploads
   ```

3. Make sure the uploads directory is writable by the app:
   ```bash
   docker-compose exec app touch /app/uploads/test_file && docker-compose exec app rm /app/uploads/test_file
   ```