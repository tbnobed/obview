# OBview.io Deployment Guide

This guide explains how to deploy the OBview.io application on an Ubuntu server using Docker and Docker Compose.

## Quick Setup (Automated)

For a quick automated setup on Ubuntu, you can use our setup script:

```bash
# Clone the repository
git clone https://github.com/yourusername/obview.git
cd obview

# Make the script executable
chmod +x scripts/ubuntu-setup.sh

# Run the setup script (add your domain for automatic SSL setup)
sudo ./scripts/ubuntu-setup.sh yourdomain.com
```

This script will:
- Install all required dependencies (Docker, Nginx, etc.)
- Configure your server with security best practices
- Set up the application with Docker Compose
- Configure Nginx and obtain SSL certificates
- Set up automatic backups and system updates

For a manual setup or more control over the installation process, follow the steps below.

## Prerequisites

- Ubuntu 22.04 LTS or newer (recommended for best performance)
- Minimum 2GB RAM, 2 vCPUs, and 20GB storage
- Domain name pointed to your server (strongly recommended for production use)
- Root or sudo access to the server

## Manual Installation Steps

### 1. Connect to Your Ubuntu Server

```bash
ssh username@your-server-ip
```

### 2. Install Docker and Docker Compose

The following steps will install Docker and Docker Compose on Ubuntu 22.04:

```bash
# Update package lists and install prerequisites
sudo apt update
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up the repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Update package lists and install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Install Docker Compose v2
sudo apt install -y docker-compose-plugin

# Add your user to the docker group to run docker without sudo
sudo usermod -aG docker $USER

# Apply group changes without logout
newgrp docker
```

### 3. Create Project Directory and Clone Repository

```bash
# Create a directory for your project
mkdir -p /opt/obview
cd /opt/obview

# Clone the repository (replace with your actual repository URL)
git clone https://github.com/yourusername/obview.git .
```

### 4. Configure Environment Variables

Create an environment file from the template:

```bash
cp .env.example .env
```

Then edit the `.env` file to set your configuration:

```bash
nano .env
```

Make sure to update:
- `POSTGRES_PASSWORD`: Generate a strong password (e.g., `openssl rand -base64 24`)
- `SESSION_SECRET`: Generate a secure random string (e.g., `openssl rand -base64 32`)
- `SENDGRID_API_KEY`: Your SendGrid API key for email functionality
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`: Secure credentials for the initial admin user
- `ADMIN_EMAIL`: Your email address or the address of the primary administrator

### 5. Build and Start the Application

```bash
docker compose up -d
```

This command will:
- Build the application Docker image
- Create a PostgreSQL database
- Run the database migrations automatically
- Create the initial admin user
- Start the application

The initial build may take a few minutes depending on your server's resources.

### 6. Set Up a Domain Name with HTTPS

For production use, you should configure your domain with Nginx and Let's Encrypt:

```bash
# Install Nginx and Certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Create Nginx configuration for your domain
sudo nano /etc/nginx/sites-available/obview.conf
```

Add the following configuration (replace `obview.io` with your actual domain):

```nginx
server {
    listen 80;
    server_name obview.io www.obview.io;

    # Allow large file uploads
    client_max_body_size 500M;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
    }
    
    # Add WebSocket support for real-time features
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and obtain SSL certificate:

```bash
# Create a symlink to enable the site
sudo ln -s /etc/nginx/sites-available/obview.conf /etc/nginx/sites-enabled/

# Remove the default site if needed
sudo rm /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# If test successful, reload Nginx
sudo systemctl reload nginx

# Obtain SSL certificate
sudo certbot --nginx -d obview.io -d www.obview.io

# Verify auto-renewal is set up
sudo systemctl status certbot.timer
```

### 7. Set Up Automatic Updates (Recommended)

To keep your system secure, set up automatic security updates:

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 8. Set Up Regular Database Backups (Recommended)

Create a backup script:

```bash
nano /opt/obview/backup.sh
```

Add the following content:

```bash
#!/bin/bash
BACKUP_DIR="/opt/obview/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
mkdir -p $BACKUP_DIR

# Database backup
cd /opt/obview
docker compose exec -T db pg_dump -U postgres obview > $BACKUP_DIR/obview_db_$TIMESTAMP.sql

# Compress the backup
gzip $BACKUP_DIR/obview_db_$TIMESTAMP.sql

# Keep only the last 7 backups
ls -t $BACKUP_DIR/obview_db_*.sql.gz | tail -n +8 | xargs -r rm

# Log the backup
echo "Backup completed at $(date)" >> $BACKUP_DIR/backup_log.txt
```

Make the script executable and set up a daily cron job:

```bash
chmod +x /opt/obview/backup.sh
sudo crontab -e
```

Add the following line to run the backup daily at 2 AM:

```
0 2 * * * /opt/obview/backup.sh
```

## Maintenance and Management

### View Application Logs

```bash
# View all logs
cd /opt/obview
docker compose logs

# Follow logs in real-time
docker compose logs -f

# View logs for a specific service
docker compose logs app
docker compose logs db
```

### Restart the Application

```bash
cd /opt/obview
docker compose restart
```

### Update the Application

```bash
cd /opt/obview
git pull
docker compose down
docker compose up -d
```

### Perform a Manual Database Backup

```bash
cd /opt/obview
docker compose exec db pg_dump -U postgres obview > obview_backup_$(date +%Y-%m-%d).sql
```

### Restore from a Backup

```bash
cd /opt/obview
docker compose down
docker compose up -d db
sleep 10  # Wait for the database to start
cat your-backup-file.sql | docker compose exec -T db psql -U postgres obview
docker compose up -d
```

## Troubleshooting

### Database Connectivity Issues

If the application can't connect to the database:

```bash
# Check if containers are running
cd /opt/obview
docker compose ps

# Check database logs
docker compose logs db

# Verify environment variables
docker compose exec app env | grep DATABASE_URL

# Restart the services
docker compose restart
```

### Email Sending Issues

If emails aren't being sent properly:

1. Verify your SendGrid API key is correct in the `.env` file
2. Check that the sender email address is verified in your SendGrid account
3. Check for any SendGrid-related errors in the application logs:

```bash
cd /opt/obview
docker compose logs app | grep -i sendgrid
```

4. Test the SendGrid connection directly:

```bash
docker compose exec app node -e "
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
sgMail.send({
  to: 'test@example.com',
  from: 'your-verified-sender@yourdomain.com',
  subject: 'SendGrid Test',
  text: 'If you receive this, SendGrid is working properly.'
}).then(() => console.log('Email sent successfully'))
.catch(error => console.error('Error sending email:', error.toString()));
"
```

### Application Not Accessible

If the application is not accessible through your domain:

1. Check if the application is running:

```bash
cd /opt/obview
docker compose ps
```

2. Verify Nginx configuration:

```bash
sudo nginx -t
sudo systemctl status nginx
```

3. Check firewall settings:

```bash
sudo ufw status
# If needed, allow HTTP and HTTPS traffic
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

4. Check Docker network:

```bash
docker network ls
docker network inspect obview_app_network
```

## Security Recommendations

1. **Firewall Configuration**: Configure UFW (Uncomplicated Firewall) to only allow necessary ports:

```bash
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```

2. **Fail2Ban Installation**: Install Fail2Ban to protect against brute force attacks:

```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

3. **Regular Updates**: Keep your system and OBview.io updated regularly:

```bash
# System updates
sudo apt update && sudo apt upgrade -y

# OBview.io updates
cd /opt/obview
git pull
docker compose down
docker compose up -d
```