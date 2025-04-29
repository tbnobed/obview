# OBview.io Configuration Guide

This document provides detailed instructions for configuring and customizing your OBview.io installation.

## Table of Contents

1. [Server Configuration](#server-configuration)
2. [Database Configuration](#database-configuration)
3. [User Management](#user-management)
4. [File Storage](#file-storage)
5. [Email Notifications](#email-notifications)
6. [Security Settings](#security-settings)
7. [Performance Optimization](#performance-optimization)
8. [Nginx Configuration](#nginx-configuration)
9. [SSL/TLS Setup](#ssltls-setup)
10. [Backup Strategy](#backup-strategy)

## Server Configuration

### Environment Variables

The following environment variables can be set in the `/etc/systemd/system/obview.service` file:

```
Environment=NODE_ENV=production
Environment=PORT=5000
Environment=DATABASE_URL=postgresql://obviewuser:tbn123456789@localhost:5432/obview
Environment=SESSION_SECRET=change-this-to-a-secure-random-string
Environment=UPLOADS_DIR=/opt/obview/uploads
Environment=MAX_UPLOAD_SIZE=500
```

After changing these variables, reload the systemd daemon and restart the service:

```bash
sudo systemctl daemon-reload
sudo systemctl restart obview
```

### Server Requirements

Minimum system requirements:
- 2 CPU cores
- 4 GB RAM
- 50 GB storage (for application and user uploads)
- 10 Mbps network connection

Recommended for larger installations:
- 4+ CPU cores
- 8+ GB RAM
- 200+ GB SSD storage
- 100+ Mbps network connection

## Database Configuration

### Database Schema

The database schema is defined in `database-schema.sql`. If you need to modify the schema, update this file and apply changes manually.

### Connection Pool Settings

Database connection pool settings can be adjusted in `server.js`:

```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,               // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle
  connectionTimeoutMillis: 2000, // How long to wait for a connection
  maxUses: 7500,         // Close and replace a connection after this many uses
});
```

### Database Maintenance

Regular maintenance tasks:

1. **Vacuum the database** - Reclaims storage and updates statistics
   ```sql
   VACUUM ANALYZE;
   ```

2. **Index maintenance** - Rebuilds indexes that might be fragmented
   ```sql
   REINDEX DATABASE obview;
   ```

3. **Database statistics** - Updates query planner statistics
   ```sql
   ANALYZE;
   ```

## User Management

### User Roles

OBview.io has the following roles:
- `admin`: Full system access
- `manager`: Can create projects and manage users
- `editor`: Can add content and approve media
- `viewer`: Can view and comment only

### Creating New Admin Users

To create a new admin user, use the PostgreSQL command line:

```sql
INSERT INTO users (username, password, email, name, role)
VALUES (
  'newadmin', 
  -- Use the password-util.js script to generate a hashed password
  'hashed-password-goes-here', 
  'admin@yourdomain.com', 
  'Admin Name', 
  'admin'
);
```

### Password Policy

By default, there is no enforced password policy. For enhanced security, consider implementing:

- Minimum 10 characters
- At least one uppercase letter
- At least one number
- At least one special character

## File Storage

### Storage Location

By default, files are stored in `/opt/obview/uploads`. This location can be changed by:

1. Updating the `UPLOADS_DIR` environment variable in `obview.service`
2. Updating the `uploadsDir` variable in `server.js`
3. Moving existing files to the new location
4. Updating file paths in the database

### File Types

OBview.io supports the following file types:
- Video: MP4, MOV, AVI, WebM
- Images: JPG, PNG, GIF, SVG
- Documents: PDF
- Audio: MP3, WAV

To add additional file types, extend the media type validations in the upload middleware.

## Email Notifications

Email notifications require additional setup with a service like SendGrid.

1. Install the required package:
   ```bash
   npm install @sendgrid/mail
   ```

2. Add your SendGrid API key to the environment variables:
   ```
   Environment=SENDGRID_API_KEY=your-api-key
   ```

3. Update the `server.js` file to include the email notification system.

## Security Settings

### Session Configuration

The session configuration can be adjusted in `server.js`:

```javascript
app.use(session({
  secret: process.env.SESSION_SECRET || 'obview-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));
```

### CORS Settings

For cross-origin resource sharing (CORS) settings, add the following to `server.js`:

```javascript
import cors from 'cors';

// Configure CORS for specific domains
const corsOptions = {
  origin: ['https://yourdomain.com', 'https://anotherdomain.com'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
```

## Performance Optimization

### Server-Side Caching

Implement caching to improve performance:

```javascript
import apicache from 'apicache';

const cache = apicache.middleware;

// Cache GET requests to specific endpoints for 5 minutes
app.get('/api/projects', cache('5 minutes'), async (req, res) => {
  // Your code here
});
```

### Database Indexing

The default schema includes indexes for common queries. For high-traffic instances, consider adding more specific indexes based on query patterns.

## Nginx Configuration

### SSL Termination

For SSL termination with Nginx:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    
    # Other SSL settings...
    
    location / {
        proxy_pass http://localhost:5000;
        # Other proxy settings...
    }
}
```

### Load Balancing

For multiple application instances:

```nginx
upstream obview {
    server 127.0.0.1:5000;
    server 127.0.0.1:5001;
    server 127.0.0.1:5002;
}

server {
    # SSL settings...
    
    location / {
        proxy_pass http://obview;
        # Other proxy settings...
    }
}
```

## SSL/TLS Setup

### Let's Encrypt with Certbot

1. Install Certbot:
   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   ```

2. Obtain and install certificates:
   ```bash
   sudo certbot --nginx -d yourdomain.com
   ```

3. Set up auto-renewal:
   ```bash
   sudo certbot renew --dry-run
   ```

## Backup Strategy

### Automated Backups

Set up automated daily backups using a cron job:

```bash
# Edit crontab
sudo crontab -e

# Add this line to run backup daily at 2 AM
0 2 * * * /opt/obview/backup.sh
```

### Remote Backup Storage

For added security, copy backups to a remote location:

1. Install rclone:
   ```bash
   sudo apt install rclone
   ```

2. Configure rclone with your remote storage provider:
   ```bash
   rclone config
   ```

3. Add a script to upload backups:
   ```bash
   #!/bin/bash
   # Copy latest backup to remote storage
   LATEST_BACKUP=$(ls -t /opt/obview/backups/*.gz | head -1)
   rclone copy "$LATEST_BACKUP" remote:obview-backups/
   ```

4. Add this to your cron jobs to run after the backup.