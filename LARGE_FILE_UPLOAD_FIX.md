# Large File Upload Fix

This document explains the implementation of robust large file upload capabilities in Obviu.io.

## Problem Overview

Large file uploads (particularly video files) were failing at approximately 95% completion without any clear error messages. This occurred because:

1. The progress tracking was simulated rather than based on actual upload progress
2. The upload was using the fetch API, which lacks progress tracking capabilities
3. There was no proper error handling for network timeouts
4. Uploads would stop if users navigated away from the upload page

## Solution Implementation

### 1. Server-Side Configuration

The server is already properly configured for large file uploads with:

- 5GB file size limit in Multer:
  ```javascript
  const upload = multer({ 
    storage: storage_config,
    limits: {
      fileSize: 5 * 1024 * 1024 * 1024, // 5GB limit
    }
  });
  ```

- Extended request timeout (1 hour) in Express:
  ```javascript
  app.use((req, res, next) => {
    res.setTimeout(3600000); // 1 hour timeout
    next();
  });
  ```

- Increased JSON body size limits:
  ```javascript
  app.use(express.json({ limit: '5120mb' }));
  app.use(express.urlencoded({ extended: false, limit: '5120mb' }));
  ```

### 2. Client-Side Implementation

The client-side upload implementation was enhanced to:

- Use XMLHttpRequest instead of fetch to track real upload progress
- Set appropriate timeout thresholds for large files
- Provide detailed error messages for various failure scenarios
- Continue uploads in the background even when navigating away from the upload page

Key changes for accurate progress tracking:

```javascript
// Use XMLHttpRequest for real progress updates
const xhr = new XMLHttpRequest();

// Track upload progress
xhr.upload.addEventListener('progress', (event) => {
  if (event.lengthComputable) {
    const percentComplete = (event.loaded / event.total) * 100;
    setUploadProgress(percentComplete);
  }
});

// Handle timeout with a longer duration for large files
xhr.timeout = 3600000; // 1 hour in milliseconds

// Set up timeout handler
xhr.ontimeout = () => {
  reject(new Error('Upload timed out. The file may be too large or your connection is slow.'));
};
```

### 3. Background Upload Service

A dedicated upload service was implemented to handle uploads independently of component lifecycles, allowing uploads to continue even when navigating away from the upload page:

- **Upload Service**: A singleton service that manages uploads across the application
- **Upload Manager**: A persistent UI component that displays upload progress and allows cancellation
- **Global Integration**: The upload manager is integrated at the application root level

Key components:

```typescript
// Upload Service (manages background uploads)
class UploadService {
  private uploads: Map<string, UploadProgress> = new Map();
  private xhrInstances: Map<string, XMLHttpRequest> = new Map();
  private listeners: Set<(uploads: UploadProgress[]) => void> = new Set();
  
  // Upload a file to a project and continue in background
  uploadFile(file: File, projectId: number, customFilename?: string): string {
    // Implementation handles the upload and notifies listeners
  }
  
  // Cancel an upload that's in progress
  cancelUpload(id: string): boolean {
    const xhr = this.xhrInstances.get(id);
    if (xhr) {
      xhr.abort();
      // Update status and notify listeners
    }
  }
}

// Upload Manager Component (displays uploads across the application)
export function UploadManager() {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  
  // Subscribe to upload service updates
  useEffect(() => {
    const unsubscribe = uploadService.subscribe(setUploads);
    return unsubscribe;
  }, []);
  
  // Display upload progress and controls
}
```

### 4. Advanced Error Handling and Recovery for Large Files

For large files, a special upload mechanism was implemented to handle various failure modes:

- **Connection Termination Detection**: Automatically detects when the connection has been terminated
- **Stalled Upload Detection**: Monitors progress and reacts if uploads stall for more than 30 seconds
- **Automatic Retries**: Implements up to 3 retry attempts with increasing delays between attempts
- **Detailed Logging**: Comprehensive logging of all upload steps to help diagnose issues
- **Enhanced Status Messages**: Clearer error messages and status indicators shown to users

Key implementation features:

```typescript
// Different strategies based on file size
private startUpload(uploadId: string, file: File, projectId: number): void {
  // For large files, use a more reliable approach with retries
  const isLargeFile = file.size > 100 * 1024 * 1024; // 100MB threshold
  
  if (isLargeFile) {
    this.startLargeFileUpload(uploadId, file, projectId);
  } else {
    this.startStandardUpload(uploadId, file, projectId);
  }
}

// Handle early connection termination with status code 48
xhr.onerror = (event) => {
  // Status code 48 is a network error in Chrome, usually means connection terminated
  const isConnectionTerminated = xhr.status === 48 || 
                               connectionTerminated || 
                               xhr.readyState < 4;
  
  // Check if we should retry
  if (retryCount < maxRetries) {
    retryCount++;
    // Retry with appropriate delay based on error type
    setTimeout(attemptUpload, isConnectionTerminated ? 8000 : 3000);
  }
};

// Detect stalled uploads with progress check interval
progressCheckInterval = window.setInterval(() => {
  const timeSinceLastProgress = Date.now() - lastProgressTime;
  
  // If no progress for 30 seconds, consider it a connection problem
  if (timeSinceLastProgress > 30000 && !connectionTerminated) {
    connectionTerminated = true;
    xhr.abort();
    // Attempt retry if under max retry count
  }
}, 5000);
```

## Benefits

1. **Accurate Progress Tracking**: Users now see the real upload progress rather than a simulated approximation
2. **Improved Error Handling**: Specific error messages for network issues, timeouts, and server errors
3. **Increased Reliability**: Uploads can complete successfully regardless of file size (up to 5GB limit)
4. **Background Uploads**: Users can navigate away from the upload page without interrupting uploads
5. **Cancelable Uploads**: Users can cancel ongoing uploads from anywhere in the application
6. **Better User Experience**: Clear indication of progress and any issues that arise

## Troubleshooting Tips

If large file uploads still fail:

1. Check server logs for any memory or disk space issues
2. Verify that any proxy or load balancer timeout settings are set to at least 1 hour
3. Ensure there are no network interruptions during the upload
4. For file sizes above 5GB, increase the limits in both Multer configuration and Express body parser

## Docker Implementation Notes

When running in Docker, ensure container resource limits are sufficient for large uploads:

```yaml
services:
  app:
    # ...
    deploy:
      resources:
        limits:
          memory: 4G
```