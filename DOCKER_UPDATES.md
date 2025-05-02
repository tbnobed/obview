# Docker Deployment Updates for Obviu.io

This document covers two important updates for the Docker deployment of Obviu.io:

1. **Large File Upload Fix** - Resolves the "413 Request Entity Too Large" error
2. **Theme Preference Migration** - Ensures user theme preferences are stored properly in the database

## Large File Upload Fix

### Issue
- When uploading files larger than 1.5GB (but still under the 5GB limit), users encounter a "413 Request Entity Too Large" error
- This happens because Nginx (the reverse proxy) has a default body size limit that is smaller than what the application allows

### Solution

#### Method 1: Using Docker Compose with Nginx Container (Recommended)

1. **Update your docker-compose.yml** to include an Nginx container (file already updated)

2. **Add the nginx.conf file** to your project:
   - The configuration sets `client_max_body_size 5120M` to allow 5GB uploads
   - Also increases timeouts and adjusts buffer settings for large file handling

3. **Restart your Docker containers**:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

#### Method 2: For Standalone Nginx

If you're using a separate Nginx installation outside of Docker:

1. **Locate and edit your Nginx configuration**:
   ```bash
   # Example path (may vary based on your setup)
   sudo nano /etc/nginx/sites-available/default
   ```

2. **Add these directives** within your server block:
   ```nginx
   client_max_body_size 5120M;
   client_body_timeout 3600s;
   proxy_read_timeout 3600s;
   ```

3. **Test and reload Nginx**:
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

## Theme Preference Migration

### Updates Made

1. **Migration File Creation**:
   - Created a properly versioned migration file: `0002_add_theme_preference.sql`
   - Added metadata file: `migrations/meta/0002_snapshot.json`

2. **Docker Entrypoint Script Update**:
   - Enhanced the `docker-entrypoint.sh` script to be more robust in finding migration and setup files
   - Added fallback mechanisms if either `.js` or `.cjs` versions of the files exist
   - Improved error handling for database migrations

### Verification

After deploying these changes:

1. **Verify migrations ran** by checking the database:
   ```sql
   \d users
   ```
   - You should see `theme_preference` column in the users table

2. **Verify large file uploads** by attempting to upload a file larger than 1.5GB

### Additional Notes

- The Docker entrypoint script now has better error handling for both migrations and admin user setup
- If migrations fail, the script will continue but log warnings
- All migrations are now properly versioned and include metadata for Drizzle

## Implementation Checklist

- [x] Update docker-compose.yml to include Nginx
- [x] Create nginx.conf with proper settings
- [x] Fix migration file naming to follow Drizzle conventions
- [x] Create migration metadata file
- [x] Update Docker entrypoint script to handle different file extensions
- [ ] Restart Docker containers
- [ ] Verify migrations ran successfully 
- [ ] Test large file upload functionality