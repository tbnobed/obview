# OBview.io Deployment Guide

This guide covers different deployment options for OBview.io, including direct server deployment and cloud hosting options.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Direct Server Deployment](#direct-server-deployment)
3. [High Availability Setup](#high-availability-setup)
4. [Cloud Deployment Options](#cloud-deployment-options)
5. [Deployment Checklist](#deployment-checklist)
6. [Maintenance and Updates](#maintenance-and-updates)
7. [Monitoring and Logging](#monitoring-and-logging)
8. [Scaling Considerations](#scaling-considerations)

## Prerequisites

Before deploying OBview.io, ensure you have:

- Domain name configured with DNS pointing to your server
- Server with root/sudo access
- Node.js v14+ installed
- PostgreSQL v12+ installed
- Nginx or similar web server
- SSL certificate (recommended for production)

## Direct Server Deployment

### Ubuntu/Debian Server

1. Update system packages:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. Install required dependencies:
   ```bash
   sudo apt install -y nodejs npm postgresql nginx certbot python3-certbot-nginx git
   ```

3. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/obview.git /opt/obview
   cd /opt/obview
   ```

4. Run the installation script:
   ```bash
   sudo chmod +x install.sh
   sudo ./install.sh
   ```

5. Set up SSL:
   ```bash
   sudo certbot --nginx -d yourdomain.com
   ```

6. Verify the installation:
   ```bash
   sudo systemctl status obview
   curl http://localhost:5000/api/health
   ```

### CentOS/RHEL/Fedora

1. Update system packages:
   ```bash
   sudo dnf update -y
   ```

2. Install Node.js and npm:
   ```bash
   sudo dnf install -y nodejs npm
   ```

3. Install PostgreSQL:
   ```bash
   sudo dnf install -y postgresql postgresql-server
   sudo postgresql-setup --initdb
   sudo systemctl start postgresql
   sudo systemctl enable postgresql
   ```

4. Install Nginx:
   ```bash
   sudo dnf install -y nginx
   sudo systemctl start nginx
   sudo systemctl enable nginx
   ```

5. Follow the same steps 3-6 as in the Ubuntu/Debian section.

## High Availability Setup

For mission-critical deployments, consider a high availability setup:

### Database Replication

1. Set up PostgreSQL with replication:
   ```bash
   # On primary server
   # Edit postgresql.conf
   listen_addresses = '*'
   wal_level = replica
   max_wal_senders = 10
   max_replication_slots = 10
   
   # Create replication user
   CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'secure-password';
   
   # On replica server
   # Configure and start as standby
   # Details depend on PostgreSQL version
   ```

2. Set up connection pooling with PgBouncer:
   ```bash
   sudo apt install -y pgbouncer
   # Configure pgbouncer.ini
   ```

### Application Load Balancing

1. Set up multiple application instances:
   ```bash
   # Create systemd service files for each instance, using different ports
   # obview-1.service -> PORT=5001
   # obview-2.service -> PORT=5002
   # etc.
   ```

2. Configure Nginx for load balancing:
   ```nginx
   upstream obview_backend {
       server 127.0.0.1:5001;
       server 127.0.0.1:5002;
       server 127.0.0.1:5003;
   }
   
   server {
       listen 80;
       server_name yourdomain.com;
       
       location / {
           proxy_pass http://obview_backend;
           # Other proxy settings...
       }
   }
   ```

## Cloud Deployment Options

### AWS Deployment

1. EC2 Instance setup:
   - Launch an EC2 instance with Ubuntu Server
   - Minimum recommended: t3.medium (2 vCPU, 4 GB RAM)
   - Add EBS volume for uploads (min 50 GB)
   
2. RDS for PostgreSQL:
   - Create a PostgreSQL RDS instance
   - Configure security groups to allow EC2 access
   
3. Application deployment:
   - Follow the direct server deployment steps
   - Use the RDS endpoint in your DATABASE_URL
   
4. Route 53 for DNS:
   - Set up DNS records pointing to your EC2 instance
   
5. CloudFront (optional):
   - Set up CloudFront for media file distribution

### Digital Ocean

1. Create Droplet:
   - Use Ubuntu 20.04 or newer
   - Minimum: 2 GB RAM / 2 vCPU
   
2. Managed Database:
   - Create PostgreSQL managed database
   - Connect your Droplet to the database
   
3. Deployment:
   - Follow direct server deployment steps
   - Use managed database connection details

### Heroku (not recommended for media-heavy applications)

1. Prepare the app:
   - Add `Procfile` with: `web: node server.js`
   - Configure for Heroku PostgreSQL
   
2. Deploy:
   ```bash
   heroku create
   heroku addons:create heroku-postgresql:hobby-dev
   git push heroku main
   ```
   
3. Limitations:
   - Heroku's ephemeral filesystem isn't suitable for file storage
   - Would need integration with S3 or similar for media storage

## Deployment Checklist

Before going live, ensure:

- [ ] Database backup and restore procedures are tested
- [ ] SSL/TLS certificates are installed and working
- [ ] File permissions are correctly set
- [ ] Default admin password is changed
- [ ] Application health check is passing
- [ ] Upload functionality is working
- [ ] Email notifications are configured (if applicable)
- [ ] Monitoring is set up
- [ ] Firewall rules are configured
- [ ] Rate limiting is implemented
- [ ] Database connections are optimized

## Maintenance and Updates

### Regular Maintenance

1. Database maintenance:
   ```bash
   # Connect to PostgreSQL
   sudo -u postgres psql
   
   # Within PostgreSQL:
   VACUUM ANALYZE;
   REINDEX DATABASE obview;
   ```

2. System updates:
   ```bash
   sudo apt update && sudo apt upgrade -y
   sudo systemctl restart obview
   ```

3. SSL certificate renewal:
   ```bash
   sudo certbot renew
   ```

### Application Updates

1. Pull latest changes:
   ```bash
   cd /opt/obview
   git pull origin main
   ```

2. Apply database migrations (if any):
   ```bash
   psql -U obviewuser -h localhost -d obview -f migrations/latest.sql
   ```

3. Restart the service:
   ```bash
   sudo systemctl restart obview
   ```

## Monitoring and Logging

### Log Management

1. View application logs:
   ```bash
   sudo journalctl -u obview -n 100 --no-pager
   ```

2. Nginx logs:
   ```bash
   sudo tail -f /var/log/nginx/access.log
   sudo tail -f /var/log/nginx/error.log
   ```

3. Database logs:
   ```bash
   sudo tail -f /var/log/postgresql/postgresql-*.log
   ```

### Monitoring Tools

1. Basic monitoring with systemd:
   ```bash
   systemctl status obview
   ```

2. Configure monitoring tools:
   - Prometheus + Grafana
   - Netdata
   - New Relic
   - Datadog

## Scaling Considerations

### Vertical Scaling

- Increase server resources (CPU, RAM)
- Optimize PostgreSQL configuration for larger resources
- Increase Node.js memory limits: `NODE_OPTIONS=--max_old_space_size=4096`

### Horizontal Scaling

- Split services:
  - Application servers
  - Database servers
  - File storage servers
  
- Implement load balancing
- Set up database read replicas
- Use a CDN for media file distribution

### Storage Scaling

- Move uploads to object storage (S3, MinIO)
- Implement tiered storage for different media types
- Consider video transcoding for different bitrates