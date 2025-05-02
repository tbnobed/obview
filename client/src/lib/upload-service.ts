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
    
    // Track upload progress
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percentComplete = (event.loaded / event.total) * 100;
        this.updateProgress(uploadId, percentComplete);
      }
    });
    
    // Handle timeout with longer duration for large files
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