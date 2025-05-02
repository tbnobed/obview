# Fixing "413 Request Entity Too Large" in Docker

## Solution Overview

The "413 Request Entity Too Large" error occurs because Nginx (your reverse proxy) has a default request body size limit that is too small for your large file uploads.

## Implementation Steps

### Option 1: If you're using the Docker Compose setup with Nginx

1. **Copy the nginx.conf file** to the same directory as your docker-compose.yml file:
   ```bash
   # Make sure nginx.conf is in the same directory as docker-compose.yml
   ```

2. **Restart your Docker stack**:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

### Option 2: If you're using a standalone Nginx server outside Docker

1. **Locate your Nginx configuration file**:
   This is typically found in one of these locations:
   - `/etc/nginx/nginx.conf`
   - `/etc/nginx/conf.d/default.conf`
   - `/etc/nginx/sites-available/default`

2. **Modify the Nginx configuration** to include these settings within your server block:
   ```nginx
   server {
       # Existing settings...
       
       # Add these lines:
       client_max_body_size 5120M;
       client_body_timeout 3600s;
       client_header_timeout 3600s;
       keepalive_timeout 3600s;
       send_timeout 3600s;
       proxy_connect_timeout 3600s;
       proxy_send_timeout 3600s;
       proxy_read_timeout 3600s;
       
       # Existing settings...
   }
   ```

3. **Test and reload Nginx**:
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

## Verification

After implementing either solution:

1. Try uploading a large file (>1.5GB)
2. The upload should now succeed without the 413 error

## Additional Troubleshooting

If you still encounter issues:

1. **Check Nginx logs**:
   ```bash
   docker logs obview_nginx  # If using Docker
   sudo tail -f /var/log/nginx/error.log  # If using standalone Nginx
   ```

2. **Verify file size limits**:
   - Check that both Nginx AND Express app limits are set high enough
   - Current settings allow up to 5GB files

3. **Check for network timeouts**:
   - Large file uploads may hit timeouts before completing
   - The configuration includes extended timeouts (1 hour)

## Other Potential Issues

1. **Server memory limitations**: Ensure your server has sufficient RAM to handle large file uploads
2. **Disk space**: Verify there's enough space on the server to store large files
3. **Network stability**: Large uploads require stable connections

If you continue to have issues after implementing these changes, please check server resource utilization during large file uploads.