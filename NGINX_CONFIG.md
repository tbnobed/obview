# Nginx Configuration for Large File Uploads

To fix the "413 Request Entity Too Large" error when uploading files larger than 1.5GB to Obviu.io, you need to update your Nginx configuration. This error occurs because the default Nginx body size limit (typically 1MB) is much smaller than what your application allows (5GB).

## Steps to Update Your Nginx Configuration

1. **Locate your Nginx configuration file**:

   Your Nginx configuration file is typically in one of these locations:
   ```
   /etc/nginx/nginx.conf
   /etc/nginx/sites-available/default
   /etc/nginx/conf.d/default.conf
   ```

2. **Edit the configuration file**:

   ```bash
   sudo nano /etc/nginx/sites-available/default  # Adjust path as needed
   ```

3. **Add the following directives** to your server block:

   ```nginx
   server {
       # Existing configuration...
       
       # Increase maximum upload size
       client_max_body_size 5120M;
       
       # Increase timeouts for large uploads
       client_body_timeout 3600s;
       client_header_timeout 3600s;
       keepalive_timeout 3600s;
       send_timeout 3600s;
       proxy_connect_timeout 3600s;
       proxy_send_timeout 3600s;
       proxy_read_timeout 3600s;
       
       # Optimize buffer settings for large uploads
       proxy_buffer_size 128k;
       proxy_buffers 4 256k;
       proxy_busy_buffers_size 256k;
       client_body_buffer_size 10M;
       
       # Existing configuration...
   }
   ```

4. **Test the configuration** to make sure there are no syntax errors:

   ```bash
   sudo nginx -t
   ```

5. **Reload Nginx** to apply the changes:

   ```bash
   sudo systemctl reload nginx
   ```

## Verification

After making these changes, try uploading a large file (>1.5GB) to verify the issue is resolved. The file should upload without encountering the 413 error.

## Additional Notes

- The `client_max_body_size 5120M` sets the maximum upload size to 5GB (5120MB)
- The timeout settings of 3600 seconds (1 hour) allow plenty of time for large uploads to complete
- The buffer settings are optimized for handling large file uploads efficiently
- These changes only affect the Nginx server, not your application's internal settings
- Your application is already configured to handle files up to 5GB