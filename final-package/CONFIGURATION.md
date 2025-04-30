# OBview.io Configuration Guide

This guide explains how to configure OBview.io after installation.

## Table of Contents

- [Environment Variables](#environment-variables)
- [Database Configuration](#database-configuration)
- [Server Configuration](#server-configuration)
- [Nginx Configuration](#nginx-configuration)
- [File Storage](#file-storage)
- [User Management](#user-management)
- [Security Considerations](#security-considerations)

## Environment Variables

OBview.io uses several environment variables that can be set in the systemd service file (`/etc/systemd/system/obview.service`):

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | The port the server listens on | `5000` |
| `NODE_ENV` | Environment mode (`development` or `production`) | `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://obviewuser:tbn123456789@localhost:5432/obview` |
| `SESSION_SECRET` | Secret for session cookie encryption | Auto-generated during installation |
| `UPLOAD_DIR` | Directory for file uploads | `/opt/obview/uploads` |
| `MAX_UPLOAD_SIZE` | Maximum upload file size in bytes | `524288000` (500MB) |

To modify these variables, edit the systemd service file and then restart the service:

```bash
sudo systemctl edit obview.service
sudo systemctl daemon-reload
sudo systemctl restart obview
```

## Database Configuration

OBview.io uses PostgreSQL for data storage. The default connection uses:

- **Host**: localhost
- **Port**: 5432
- **Database**: obview
- **Username**: obviewuser
- **Password**: tbn123456789 (You should change this in production)

To modify the database configuration, update the `DATABASE_URL` environment variable in the systemd service file.

### Database Schema

The database schema is defined in `database-schema.sql`. If you need to rebuild the database, you can use:

```bash
sudo -u postgres psql -d obview -f /opt/obview/database-schema.sql
```

### Database Maintenance

Use the included `check-database.js` script to verify the database connection and schema:

```bash
node check-database.js
```

This tool can help diagnose and fix issues with the database schema.

## Server Configuration

The Node.js server is configured to run as a systemd service. The service file is at `/etc/systemd/system/obview.service`.

### Log Management

Server logs are managed by systemd. You can view logs with:

```bash
journalctl -u obview
```

For specific errors:

```bash
journalctl -u obview -p err
```

## Nginx Configuration

OBview.io is designed to run behind an Nginx reverse proxy. The default Nginx configuration is at `/etc/nginx/sites-available/obview`.

### SSL Configuration

To enable HTTPS, modify the Nginx configuration to include SSL certificates. For example, with Let's Encrypt:

```nginx
server {
    listen 80;
    server_name obview.io www.obview.io;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name obview.io www.obview.io;
    
    ssl_certificate /etc/letsencrypt/live/obview.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/obview.io/privkey.pem;
    
    # Rest of your configuration
    # ...
}
```

After changing the configuration, restart Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## File Storage

Uploaded files are stored in `/opt/obview/uploads` by default. This directory should be:

- Owned by the `obtv-admin` user
- Have sufficient disk space
- Be backed up regularly

You can use the `backup.sh` script for automatic backups.

## User Management

### Default Admin Account

During installation, a default admin account is created:

- **Username**: admin
- **Password**: admin

It is **strongly recommended** to change this password immediately after installation.

### Managing Users

To reset a user password, use the `password-util.js` script:

```bash
node password-util.js
```

Select option 2 to reset a user's password.

### User Roles

OBview.io has three user roles:

- **admin**: Full system access
- **editor**: Can create projects and edit files
- **viewer**: Can view and comment on files

User roles can only be changed directly in the database:

```sql
UPDATE users SET role = 'admin' WHERE username = 'username';
```

## Security Considerations

For production deployments, consider these security recommendations:

1. **Change default passwords**: Both database and admin user
2. **Enable HTTPS**: Set up SSL certificates
3. **Firewall configuration**: Restrict access to ports 80/443 only
4. **Regular updates**: Keep the system updated
5. **Regular backups**: Use the built-in backup script

For additional security, consider implementing:

- Rate limiting in Nginx
- IP-based access controls
- Secure file storage with encryption