import { toast } from "@/hooks/use-toast";
import { queryClient } from "./queryClient";

// Interface to track upload progress
export interface UploadProgress {
  id: string;
  filename: string;
  projectId: number;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  createdAt: Date;
}

// Class to manage uploads across component lifecycles
class UploadService {
  private uploads: Map<string, UploadProgress> = new Map();
  private xhrInstances: Map<string, XMLHttpRequest> = new Map();
  private listeners: Set<(uploads: UploadProgress[]) => void> = new Set();

  // Subscribe to upload state changes
  subscribe(callback: (uploads: UploadProgress[]) => void): () => void {
    this.listeners.add(callback);
    callback(this.getAllUploads());
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  // Notify all listeners of changes
  private notifyListeners(): void {
    const uploads = this.getAllUploads();
    this.listeners.forEach(listener => listener(uploads));
  }

  // Get all active uploads
  getAllUploads(): UploadProgress[] {
    return Array.from(this.uploads.values());
  }

  // Get a specific upload by ID
  getUpload(id: string): UploadProgress | undefined {
    return this.uploads.get(id);
  }

  // Upload a file to a project 
  uploadFile(file: File, projectId: number, customFilename?: string): string {
    // Generate unique ID for this upload
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Create initial upload state
    const uploadProgress: UploadProgress = {
      id: uploadId,
      filename: file.name,
      projectId,
      progress: 0,
      status: 'pending',
      createdAt: new Date()
    };
    
    // Save to upload state
    this.uploads.set(uploadId, uploadProgress);
    this.notifyListeners();
    
    // Start the upload process
    this.startUpload(uploadId, file, projectId, customFilename);
    
    // Return the ID for tracking
    return uploadId;
  }
  
  // Cancel an upload if it's still in progress
  cancelUpload(id: string): boolean {
    const xhr = this.xhrInstances.get(id);
    if (xhr) {
      xhr.abort();
      this.xhrInstances.delete(id);
      
      // Update upload status
      const upload = this.uploads.get(id);
      if (upload) {
        this.uploads.set(id, {
          ...upload,
          status: 'error',
          error: 'Upload cancelled'
        });
        this.notifyListeners();
      }
      
      return true;
    }
    return false;
  }
  
  // Remove an upload from the tracking (for completed or failed uploads)
  removeUpload(id: string): void {
    this.cancelUpload(id);
    this.uploads.delete(id);
    this.notifyListeners();
  }
  
  // Start the actual upload process
  private startUpload(uploadId: string, file: File, projectId: number, customFilename?: string): void {
    // For large files, use a more reliable approach with retries
    const isLargeFile = file.size > 100 * 1024 * 1024; // 100MB threshold
    
    if (isLargeFile) {
      this.startLargeFileUpload(uploadId, file, projectId, customFilename);
    } else {
      this.startStandardUpload(uploadId, file, projectId, customFilename);
    }
  }
  
  // Standard upload for smaller files
  private startStandardUpload(uploadId: string, file: File, projectId: number, customFilename?: string): void {
    const formData = new FormData();
    formData.append("file", file);
    
    if (customFilename && customFilename !== file.name) {
      formData.append("customFilename", customFilename);
      formData.append("originalName", file.name);
    }
    
    // Update status to uploading
    this.uploads.set(uploadId, {
      ...this.uploads.get(uploadId)!,
      status: 'uploading'
    });
    this.notifyListeners();
    
    // Create XHR for upload
    const xhr = new XMLHttpRequest();
    this.xhrInstances.set(uploadId, xhr);
    
    // Track upload progress with more debug information
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percentComplete = (event.loaded / event.total) * 100;
        this.updateProgress(uploadId, percentComplete);
        
        // Add logging for debugging large file upload issues
        if (percentComplete > 40 && percentComplete < 60) {
          console.log(`[Upload Debug] Progress at ${Math.round(percentComplete)}%`, {
            loaded: event.loaded,
            total: event.total,
            fileSize: file.size,
            uploadId
          });
        }
      }
    });
    
    // Handle timeout with longer duration for files
    xhr.timeout = 3600000; // 1 hour in milliseconds
    
    // Open connection
    xhr.open('POST', `/api/projects/${projectId}/upload`, true);
    
    // Set up completion handler
    xhr.onload = () => {
      this.xhrInstances.delete(uploadId);
      
      if (xhr.status >= 200 && xhr.status < 300) {
        // Success
        this.uploads.set(uploadId, {
          ...this.uploads.get(uploadId)!,
          progress: 100,
          status: 'completed'
        });
        
        toast({
          title: "Upload successful",
          description: `${file.name} has been uploaded successfully`
        });
        
        // Invalidate the query to refresh the file list
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/files`] });
      } else {
        // Error
        const errorMessage = xhr.responseText || `Upload failed with status ${xhr.status}`;
        this.uploads.set(uploadId, {
          ...this.uploads.get(uploadId)!,
          status: 'error',
          error: errorMessage
        });
        
        toast({
          title: "Upload failed",
          description: errorMessage,
          variant: "destructive"
        });
      }
      
      this.notifyListeners();
    };
    
    // Error handler
    xhr.onerror = () => {
      this.xhrInstances.delete(uploadId);
      this.uploads.set(uploadId, {
        ...this.uploads.get(uploadId)!,
        status: 'error',
        error: 'Network error during upload'
      });
      
      toast({
        title: "Upload failed",
        description: "Network error during upload. Please check your connection.",
        variant: "destructive"
      });
      
      this.notifyListeners();
    };
    
    // Timeout handler
    xhr.ontimeout = () => {
      this.xhrInstances.delete(uploadId);
      this.uploads.set(uploadId, {
        ...this.uploads.get(uploadId)!,
        status: 'error',
        error: 'Upload timed out. The file may be too large or your connection is slow.'
      });
      
      toast({
        title: "Upload timed out",
        description: "The upload took too long to complete. The file may be too large or your connection is slow.",
        variant: "destructive"
      });
      
      this.notifyListeners();
    };
    
    // Start the upload
    xhr.send(formData);
  }
  
  // Enhanced upload for large files with extra reliability measures
  private startLargeFileUpload(uploadId: string, file: File, projectId: number, customFilename?: string): void {
    // Update status to uploading
    this.uploads.set(uploadId, {
      ...this.uploads.get(uploadId)!,
      status: 'uploading'
    });
    this.notifyListeners();
    
    // Create XHR for upload with additional reliability settings
    const xhr = new XMLHttpRequest();
    this.xhrInstances.set(uploadId, xhr);
    
    // Keep track of failed attempts
    let retryCount = 0;
    const maxRetries = 3;
    
    // Create form data
    const formData = new FormData();
    formData.append("file", file);
    
    if (customFilename && customFilename !== file.name) {
      formData.append("customFilename", customFilename);
      formData.append("originalName", file.name);
    }
    
    // Add metadata indicating this is a large file
    formData.append("isLargeFile", "true");
    
    // Function to start or retry upload
    const attemptUpload = () => {
      // Create a new XHR for each attempt
      const xhr = new XMLHttpRequest();
      this.xhrInstances.set(uploadId, xhr);
      
      // Flag to detect early connection termination
      let connectionTerminated = false;
      let lastProgressTime = Date.now();
      let progressCheckInterval: number | null = null;
      
      // Track upload progress with more debug information
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          // Update last progress time
          lastProgressTime = Date.now();
          
          const percentComplete = (event.loaded / event.total) * 100;
          this.updateProgress(uploadId, percentComplete);
          
          console.log(`[Upload] Progress at ${Math.round(percentComplete)}%`, {
            loaded: event.loaded,
            total: event.total,
            fileSize: file.size,
            uploadId,
            retryCount,
            time: new Date().toISOString()
          });
        }
      });
      
      // Add additional event listeners for better error detection
      xhr.addEventListener('readystatechange', () => {
        console.log(`[XHR] ReadyState changed to ${xhr.readyState}`, {
          uploadId,
          status: xhr.status,
          statusText: xhr.statusText,
          time: new Date().toISOString()
        });
      });
      
      // Setup longer timeout
      xhr.timeout = 3600000; // 1 hour
      
      // Setup a progress check interval to detect connection termination
      progressCheckInterval = window.setInterval(() => {
        const timeSinceLastProgress = Date.now() - lastProgressTime;
        
        // If no progress for 30 seconds and we're in the middle of an upload, consider it a connection problem
        if (timeSinceLastProgress > 30000 && !connectionTerminated) {
          console.log('[Upload] No progress detected for 30 seconds, assuming connection problem', { 
            uploadId, 
            retryCount,
            time: new Date().toISOString() 
          });
          
          connectionTerminated = true;
          
          // Clear the interval
          if (progressCheckInterval !== null) {
            clearInterval(progressCheckInterval);
            progressCheckInterval = null;
          }
          
          // Abort current attempt
          xhr.abort();
          this.xhrInstances.delete(uploadId);
          
          // Attempt retry
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`[Upload] Connection problem detected, retrying (${retryCount}/${maxRetries})`, { uploadId, fileName: file.name });
            
            this.uploads.set(uploadId, {
              ...this.uploads.get(uploadId)!,
              progress: 0, // Reset progress
              status: 'uploading',
              error: `Connection interrupted, retrying (attempt ${retryCount}/${maxRetries})...`
            });
            this.notifyListeners();
            
            // Delay before retry
            setTimeout(attemptUpload, 5000);
          } else {
            this.uploads.set(uploadId, {
              ...this.uploads.get(uploadId)!,
              status: 'error',
              error: 'Upload failed due to connection problems after multiple attempts'
            });
            
            toast({
              title: "Upload failed",
              description: "Connection interrupted repeatedly. Please try again when you have a stable connection.",
              variant: "destructive"
            });
            
            this.notifyListeners();
          }
        }
      }, 5000); // Check every 5 seconds
      
      // Open connection
      xhr.open('POST', `/api/projects/${projectId}/upload`, true);
      
      // On successful completion
      xhr.onload = () => {
        // Clear interval
        if (progressCheckInterval !== null) {
          clearInterval(progressCheckInterval);
          progressCheckInterval = null;
        }
        
        this.xhrInstances.delete(uploadId);
        
        console.log(`[Upload] onload fired with status ${xhr.status}`, {
          uploadId,
          status: xhr.status,
          responseText: xhr.responseText.substring(0, 100), // Log first 100 chars
          time: new Date().toISOString()
        });
        
        if (xhr.status >= 200 && xhr.status < 300) {
          // Success
          this.uploads.set(uploadId, {
            ...this.uploads.get(uploadId)!,
            progress: 100,
            status: 'completed'
          });
          
          toast({
            title: "Upload successful",
            description: `${file.name} has been uploaded successfully`
          });
          
          // Invalidate the query to refresh the file list
          queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/files`] });
        } else {
          // Request was completed but server returned an error
          const errorMessage = xhr.responseText || `Upload failed with status ${xhr.status}`;
          
          // Check if we should retry
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`[Upload] Server error, retrying (${retryCount}/${maxRetries})`, { 
              uploadId, 
              status: xhr.status,
              responseText: xhr.responseText.substring(0, 100)
            });
            
            this.uploads.set(uploadId, {
              ...this.uploads.get(uploadId)!,
              progress: 0, // Reset progress for retry
              status: 'uploading',
              error: `Server error (${xhr.status}), retrying (attempt ${retryCount}/${maxRetries})...`
            });
            this.notifyListeners();
            
            // Wait a moment before retrying
            setTimeout(attemptUpload, 3000);
          } else {
            // Out of retries, mark as failed
            this.uploads.set(uploadId, {
              ...this.uploads.get(uploadId)!,
              status: 'error',
              error: `Server error: ${errorMessage}`
            });
            
            toast({
              title: "Upload failed",
              description: `The server returned an error (code ${xhr.status})`,
              variant: "destructive"
            });
          }
        }
        
        this.notifyListeners();
      };
      
      // Network error handler
      xhr.onerror = (event) => {
        // Clear interval
        if (progressCheckInterval !== null) {
          clearInterval(progressCheckInterval);
          progressCheckInterval = null;
        }
        
        this.xhrInstances.delete(uploadId);
        
        console.log(`[Upload] onerror fired`, {
          uploadId,
          event,
          status: xhr.status,
          readyState: xhr.readyState,
          time: new Date().toISOString()
        });
        
        // Status code 48 is a network error in Chrome, usually means connection terminated
        const isConnectionTerminated = xhr.status === 48 || 
                                      connectionTerminated || 
                                      xhr.readyState < 4;
        
        // Check if we should retry
        if (retryCount < maxRetries) {
          retryCount++;
          
          console.log(`[Upload] Network error detected, retrying (${retryCount}/${maxRetries})`, { 
            uploadId, 
            isConnectionTerminated,
            status: xhr.status,
            readyState: xhr.readyState
          });
          
          let errorMsg = isConnectionTerminated 
            ? `Connection terminated, retrying (attempt ${retryCount}/${maxRetries})...`
            : `Network error, retrying (attempt ${retryCount}/${maxRetries})...`;
          
          this.uploads.set(uploadId, {
            ...this.uploads.get(uploadId)!,
            progress: 0, // Reset progress for retry
            status: 'uploading',
            error: errorMsg
          });
          this.notifyListeners();
          
          // Wait a moment before retrying, longer for connection issues
          const retryDelay = isConnectionTerminated ? 8000 : 3000;
          setTimeout(attemptUpload, retryDelay);
        } else {
          // Out of retries, mark as failed
          let errorMsg = isConnectionTerminated 
            ? 'Upload failed due to connection termination'
            : 'Network error during upload after multiple attempts';
          
          this.uploads.set(uploadId, {
            ...this.uploads.get(uploadId)!,
            status: 'error',
            error: errorMsg
          });
          
          toast({
            title: "Upload failed",
            description: isConnectionTerminated
              ? "Your connection was interrupted during upload. Try again with a more stable connection."
              : "Network error during upload. Please check your connection.",
            variant: "destructive"
          });
        }
        
        this.notifyListeners();
      };
      
      // Timeout handler
      xhr.ontimeout = () => {
        // Clear interval
        if (progressCheckInterval !== null) {
          clearInterval(progressCheckInterval);
          progressCheckInterval = null;
        }
        
        this.xhrInstances.delete(uploadId);
        
        console.log(`[Upload] ontimeout fired`, {
          uploadId,
          time: new Date().toISOString()
        });
        
        // Check if we should retry
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`[Upload] Timeout, retrying (${retryCount}/${maxRetries})`, { uploadId });
          
          this.uploads.set(uploadId, {
            ...this.uploads.get(uploadId)!,
            progress: 0, // Reset progress for retry
            status: 'uploading',
            error: `Timeout, retrying (attempt ${retryCount}/${maxRetries})...`
          });
          this.notifyListeners();
          
          // Wait a moment before retrying
          setTimeout(attemptUpload, 3000);
        } else {
          // Out of retries, mark as failed
          this.uploads.set(uploadId, {
            ...this.uploads.get(uploadId)!,
            status: 'error',
            error: 'Upload timed out after multiple attempts'
          });
          
          toast({
            title: "Upload timed out",
            description: "The upload took too long to complete after multiple attempts. The file may be too large or your connection is slow.",
            variant: "destructive"
          });
        }
        
        this.notifyListeners();
      };
      
      // Abort handler
      xhr.onabort = () => {
        // Clear interval
        if (progressCheckInterval !== null) {
          clearInterval(progressCheckInterval);
          progressCheckInterval = null;
        }
        
        console.log(`[Upload] onabort fired`, {
          uploadId,
          time: new Date().toISOString()
        });
        
        // Only handle aborts if they're not from our own code (due to connection termination detection)
        if (!connectionTerminated) {
          this.xhrInstances.delete(uploadId);
          
          this.uploads.set(uploadId, {
            ...this.uploads.get(uploadId)!,
            status: 'error',
            error: 'Upload cancelled'
          });
          
          this.notifyListeners();
        }
      };
      
      // Start the upload
      console.log(`[Upload] Starting upload attempt ${retryCount + 1}`, {
        uploadId,
        fileName: file.name,
        fileSize: file.size,
        time: new Date().toISOString()
      });
      
      xhr.send(formData);
    };
    
    // Begin the first upload attempt
    attemptUpload();
  }
  
  // Update progress for an upload
  private updateProgress(id: string, progress: number): void {
    const upload = this.uploads.get(id);
    if (upload && upload.status === 'uploading') {
      this.uploads.set(id, {
        ...upload,
        progress
      });
      this.notifyListeners();
    }
  }
}

// Create a singleton instance
export const uploadService = new UploadService();

// Export default for convenience
export default uploadService;