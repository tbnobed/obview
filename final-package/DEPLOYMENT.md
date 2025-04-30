# OBview.io Deployment Guide

This guide walks through the steps to deploy OBview.io on an Ubuntu server.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Post-Installation Configuration](#post-installation-configuration)
- [Upgrading](#upgrading)
- [Troubleshooting](#troubleshooting)
- [Backup and Restore](#backup-and-restore)

## Prerequisites

Before installing OBview.io, ensure your system meets these requirements:

### System Requirements

- Ubuntu 20.04 LTS or newer
- At least 2GB RAM
- 20GB free disk space
- Internet connection

### Required Software

The following packages must be installed:

- Node.js 18.x or newer
- PostgreSQL 14.x or newer
- Nginx
- Let's Encrypt certbot (for SSL)

You can install these with:

```bash
# Add Node.js repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Add PostgreSQL repository
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -

# Update package lists
sudo apt update

# Install required packages
sudo apt install -y nodejs postgresql-14 nginx certbot python3-certbot-nginx
```

### Network Requirements

- A public domain name pointing to your server
- Open ports 80 and 443

## Installation

### 1. Extract the Installation Package

Upload the OBview.io installation package to your server and extract it:

```bash
tar -xzf obview-*.tar.gz
cd obview-*
```

### 2. Run the Installation Script

The installation script will set up the application, database, and web server:

```bash
sudo chmod +x install.sh
sudo ./install.sh
```

Follow the prompts during installation.

### 3. Configure SSL (Recommended)

Set up HTTPS with Let's Encrypt:

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Follow the prompts to complete the SSL configuration.

## Post-Installation Configuration

### Configure the Application

Review and adjust settings in the configuration files:

1. **Environment variables**: Edit `/etc/systemd/system/obview.service`
2. **Nginx settings**: Edit `/etc/nginx/sites-available/obview`

For detailed configuration options, see [CONFIGURATION.md](CONFIGURATION.md).

### Change Default Passwords

For security, change the default passwords:

1. **Admin user**: Use the `password-util.js` script:
   ```bash
   cd /opt/obview
   node password-util.js
   ```
   Choose option 2 to reset the admin password.

2. **Database password**: Update the PostgreSQL user password:
   ```bash
   sudo -u postgres psql
   postgres=# ALTER USER obviewuser WITH PASSWORD 'new_password';
   postgres=# \q
   ```
   
   Then update the `DATABASE_URL` in the service file:
   ```bash
   sudo systemctl edit obview.service
   # Update the DATABASE_URL with the new password
   sudo systemctl daemon-reload
   sudo systemctl restart obview
   ```

### Set Up Regular Backups

Configure scheduled backups using cron:

```bash
sudo crontab -e
```

Add a line to run backups daily:

```
0 2 * * * /opt/obview/backup.sh > /dev/null 2>&1
```

This will run backups at 2 AM daily.

## Upgrading

To upgrade OBview.io to a newer version:

1. **Backup the current installation**:
   ```bash
   cd /opt/obview
   sudo ./backup.sh
   ```

2. **Extract the new version** to a temporary location:
   ```bash
   sudo mkdir -p /tmp/obview-upgrade
   sudo tar -xzf obview-new-version.tar.gz -C /tmp/obview-upgrade
   ```

3. **Stop the current service**:
   ```bash
   sudo systemctl stop obview
   ```

4. **Copy new files**:
   ```bash
   sudo cp -r /tmp/obview-upgrade/* /opt/obview/
   ```

5. **Update permissions**:
   ```bash
   sudo chown -R obtv-admin:obtv-admin /opt/obview
   sudo chmod +x /opt/obview/*.js /opt/obview/*.sh
   ```

6. **Restart the service**:
   ```bash
   sudo systemctl start obview
   ```

7. **Clean up**:
   ```bash
   sudo rm -rf /tmp/obview-upgrade
   ```

## Troubleshooting

### Health Check Tool

Run the health check tool to diagnose common issues:

```bash
cd /opt/obview
node healthcheck.js
```

### Common Issues

#### Application Not Starting

Check the service status:

```bash
sudo systemctl status obview
```

View the logs for errors:

```bash
sudo journalctl -u obview -n 100
```

#### Database Connection Issues

Verify database settings and connectivity:

```bash
cd /opt/obview
node check-database.js
```

#### Nginx Configuration Issues

Test the Nginx configuration:

```bash
sudo nginx -t
```

If errors are found, fix them and reload:

```bash
sudo systemctl reload nginx
```

## Backup and Restore

### Manual Backup

Create a manual backup:

```bash
cd /opt/obview
sudo ./backup.sh
```

Backups are stored in `/opt/obview/backups/`.

### Restore from Backup

Restore from a previous backup:

```bash
cd /opt/obview
sudo ./restore.sh /opt/obview/backups/obview_backup_YYYYMMDD_HHMMSS.tar.gz
```

Follow the prompts to complete the restoration.

### Offsite Backups

Consider copying backups to an offsite location regularly:

```bash
# Example using rsync to a remote server
rsync -avz /opt/obview/backups/ user@backup-server:/path/to/backup/directory/
```

---

For additional support, contact your system administrator or refer to the OBview.io documentation.