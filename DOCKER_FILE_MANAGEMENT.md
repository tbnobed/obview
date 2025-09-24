# Docker File Management and Cleanup

This document describes the Docker configuration updates to support the comprehensive file deletion and cleanup system in Obviu.io.

## New Admin Cleanup Features

The Docker deployment now fully supports the new admin cleanup features:

### 1. Force Delete Unlinked Files
- **Endpoint**: `/api/admin/force-delete-unlinked`
- **Function**: Removes files that exist in the database but are not linked to any valid projects
- **Docker Support**: Properly handles volume-mounted file deletion

### 2. Orphaned File Cleanup  
- **Endpoint**: `/api/admin/cleanup-orphaned-files`
- **Function**: Removes files that exist on disk but have no database entries
- **Docker Support**: Scans the entire `/app/uploads` volume for orphaned files

## Docker Configuration Updates

### Dockerfile Changes
1. **Enhanced Permissions**: Added proper file permissions for upload directories
   ```dockerfile
   RUN mkdir -p /app/uploads/processed && \
       chmod -R 755 /app/uploads && \
       chown -R node:node /app/uploads
   ```

2. **Upload Directory Environment**: Added `UPLOAD_DIR=/app/uploads` environment variable

### Docker Compose Updates
1. **Upload Directory Variable**: Added `UPLOAD_DIR=/app/uploads` to environment variables
2. **Volume Persistence**: Maintains the `uploads:/app/uploads` volume mount for file persistence

### Entrypoint Script Enhancements
1. **Permission Verification**: Checks and sets proper permissions on startup
2. **Write Permission Test**: Verifies the upload directory is writable
3. **Directory Structure**: Ensures `/app/uploads/processed` exists for video processing

## File Cleanup Behavior in Docker

### Volume-Safe Deletion
- All cleanup operations respect the Docker volume mount at `/app/uploads`
- Files deleted through the admin interface are permanently removed from the persistent volume
- Cleanup operations work across container restarts and upgrades

### Permission Handling
- The container runs with proper permissions to read, write, and delete files
- The entrypoint script verifies permissions on startup
- File operations are logged for debugging purposes

### Database Consistency
- Cleanup operations maintain database consistency with the file system
- Files removed from disk are also removed from database records
- Database cleanup respects referential integrity

## Admin Interface Access

The file management features are accessible through:
- **Admin Panel**: Navigate to `/admin` in your browser
- **File Management Section**: View all uploaded files and their status
- **Cleanup Buttons**: 
  - "Clean Orphaned Files" - removes files without database records
  - "Force Delete Unlinked" - removes database files not linked to projects

## Monitoring and Logs

File cleanup operations are logged in the Docker container logs:
```bash
# View cleanup operation logs
docker-compose logs -f app | grep -E "(CLEANUP|FORCE DELETE)"
```

## Troubleshooting

### Permission Issues
If file cleanup fails with permission errors:
```bash
# Fix permissions manually
docker-compose exec app chown -R node:node /app/uploads
docker-compose exec app chmod -R 755 /app/uploads
```

### Volume Verification
To verify the upload volume is properly mounted:
```bash
# Check volume mount
docker-compose exec app ls -la /app/uploads

# Test write permissions
docker-compose exec app touch /app/uploads/test && docker-compose exec app rm /app/uploads/test
```

### Database Cleanup Verification
To verify database cleanup operations:
```bash
# Check for orphaned database entries
docker-compose exec app node -e "
const { getAllFiles } = require('./server/storage.js');
getAllFiles().then(files => console.log('Total files in DB:', files.length));
"
```

## Environment Variables

Ensure these environment variables are set in your `.env` file:
- `UPLOAD_DIR=/app/uploads` (automatically set in Docker)
- `DATABASE_URL` (automatically configured from docker-compose)
- All other standard configuration variables

## Security Considerations

- File deletion operations are restricted to admin users only
- All cleanup operations are logged for audit purposes
- Database referential integrity is maintained during cleanup
- Volume permissions prevent unauthorized file access