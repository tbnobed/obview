# Docker Deployment Updates for Obviu.io

This document covers important updates for the Docker deployment of Obviu.io:

## Large File Upload Fix

### Issue
- When uploading files larger than 1.5GB (but still under the 5GB limit), users encounter a "413 Request Entity Too Large" error
- This happens because your Nginx reverse proxy has a default body size limit that is smaller than what the application allows

### Solution for Your Standalone Nginx

Since you're using a separate Nginx server as a reverse proxy:

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

## Theme Preference Status

Good news! The database verification shows that the **theme_preference** column already exists in your users table:

```
column_name,data_type,is_nullable
theme_preference,text,YES
```

This means the theme preference functionality should be working correctly with your current database setup. No further migration is needed.

## Docker Entrypoint Script Improvements

We've updated the Docker entrypoint script to be more robust:

1. **Better Migration Handling**:
   - The script now checks for both `.js` and `.cjs` versions of migration files
   - Improved error handling for database migrations

2. **Better Setup Script Handling**:
   - Added fallback mechanisms if either `.js` or `.cjs` versions of the setup files exist
   - Added better error reporting

These changes make your Docker deployment more resilient to file extension differences and provide better diagnostic information if issues occur.

## Implementation Checklist

- [x] Update your external Nginx configuration to increase upload limits
- [x] Verify the theme_preference column exists in the database (confirmed)
- [x] Update Docker entrypoint script to handle different file extensions
- [ ] Test large file upload functionality