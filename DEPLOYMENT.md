# OBview.io Deployment Guide

This guide explains how to deploy the OBview.io application on an Ubuntu server using Docker and Docker Compose.

## Prerequisites

- Ubuntu 20.04 LTS or newer
- Docker and Docker Compose installed
- Git (to clone the repository)
- Domain name pointed to your server (optional but recommended)

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
    }
}

# Enable the site
sudo ln -s /etc/nginx/sites-available/obview /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Obtain SSL certificate
sudo certbot --nginx -d obview.io -d www.obview.io
```

### 7. Maintenance Tasks

#### View logs

```bash
docker-compose logs -f
```

#### Restart the application

```bash
docker-compose restart
```

#### Update the application

```bash
git pull
docker-compose down
docker-compose build
docker-compose up -d
```

#### Backup the database

```bash
docker-compose exec db pg_dump -U postgres obview > backup_$(date +%Y-%m-%d).sql
```

## Troubleshooting

### Database Connectivity Issues

If the application can't connect to the database, check:

```bash
# Verify the database container is running
docker-compose ps

# Check database logs
docker-compose logs db

# Check if the environment variables are correct
docker-compose exec app env | grep DATABASE_URL
```

### Email Sending Issues

If emails aren't being sent properly:

1. Verify your SendGrid API key is correct
2. Check that the sender email address is verified in SendGrid
3. Check the application logs for any SendGrid-related errors: