# OBview.io

A self-hosted media review and collaboration platform similar to Frame.io, designed for easy deployment on your own infrastructure.

## Features

- Secure user authentication and authorization
- Project management with access control
- Media file upload and management
- Timeline-based commenting on media files
- Approval workflows
- Activity tracking
- Team collaboration

## Tech Stack

- Node.js backend with Express
- PostgreSQL database
- HTML5 video playback
- Responsive design for desktop and mobile

## Requirements

- Node.js (v14+)
- PostgreSQL (v12+)
- Nginx (recommended for production)
- Linux-based server (Ubuntu recommended)

## Installation

### Method 1: Quick Install (Recommended)

1. Clone the repository
   ```
   git clone https://github.com/yourusername/obview.git
   cd obview
   ```

2. Run the installation script
   ```
   sudo chmod +x install.sh
   sudo ./install.sh
   ```

3. Access the application at http://your-server-ip

### Method 2: Manual Installation

1. Install Node.js and PostgreSQL

2. Create a PostgreSQL database and user
   ```
   sudo -u postgres psql
   CREATE USER obviewuser WITH PASSWORD 'your-password';
   CREATE DATABASE obview OWNER obviewuser;
   \q
   ```

3. Import the database schema
   ```
   psql -U obviewuser -h localhost -d obview -f database-schema.sql
   ```

4. Install Node.js dependencies
   ```
   npm install
   ```

5. Set up environment variables
   ```
   export NODE_ENV=production
   export PORT=5000
   export DATABASE_URL=postgresql://obviewuser:your-password@localhost:5432/obview
   ```

6. Start the application
   ```
   node server.js
   ```

## Configuration

### Database Connection

The application connects to PostgreSQL using the `DATABASE_URL` environment variable. The default is:

```
postgresql://obviewuser:tbn123456789@localhost:5432/obview
```

Change this in the `obview.service` file and restart the service to update.

### File Storage

Media files are stored in the `/opt/obview/uploads` directory by default. Ensure this directory has sufficient disk space.

## Administration

### User Management

A default administrator account is created during installation:
- Username: `admin`
- Password: `admin`

**Important:** Change the default password after installation using the password utility:

```
node password-util.js
```

### Backup and Restore

To backup the database and uploaded files:

```
sudo ./backup.sh
```

To restore from a backup:

```
sudo ./restore.sh obview_backup_20250429_120000.sql.gz
```

## Customization

### Branding

To customize the logo and branding, replace the logo file at `dist/public/assets/logo.svg` and update the CSS in `dist/public/assets/index.css`.

### Email Notifications

Configure email notifications by updating the SMTP settings in the server configuration.

## Troubleshooting

### Service Management

```
# Check service status
sudo systemctl status obview

# View logs
sudo journalctl -u obview -n 100 --no-pager

# Restart service
sudo systemctl restart obview
```

### Database Issues

Connect to the database to check for issues:

```
psql -U obviewuser -h localhost -d obview -W
```

## License

This software is proprietary and confidential.

## Support

For support, please contact support@obview.io