import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { uploadService, type UploadProgress } from '@/lib/upload-service';
import { useLocation } from 'wouter';

// Component to display a list of ongoing uploads
export function UploadManager() {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [location, setLocation] = useLocation();

  // Subscribe to upload updates
  useEffect(() => {
    const unsubscribe = uploadService.subscribe((updatedUploads) => {
      setUploads(updatedUploads);
      
      // Auto-open when there are active uploads
      if (updatedUploads.length > 0 && !isOpen) {
        setIsOpen(true);
      }
    });

    return unsubscribe;
  }, [isOpen]);

  // If there are no uploads, don't render anything
  if (uploads.length === 0) {
    return null;
  }

  // Count active uploads
  const activeUploads = uploads.filter(u => u.status === 'uploading' || u.status === 'pending').length;
  
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end space-y-2">
      {/* Upload Manager Button */}
      <Button 
        onClick={() => setIsOpen(!isOpen)}
        size="sm"
        variant="default"
        className="rounded-full px-4"
      >
        {activeUploads > 0 ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {activeUploads} Active Upload{activeUploads !== 1 ? 's' : ''}
          </>
        ) : (
          <>Uploads</>
        )}
      </Button>
      
      {/* Upload Cards */}
      {isOpen && (
        <Card className="w-80 shadow-lg">
          <CardContent className="p-3">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium">File Uploads</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {uploads.map((upload) => (
                <UploadItem 
                  key={upload.id} 
                  upload={upload} 
                  onCancel={() => uploadService.cancelUpload(upload.id)}
                  onRemove={() => uploadService.removeUpload(upload.id)}
                  onViewProject={() => setLocation(`/projects/${upload.projectId}`)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Component to display a single upload with progress
function UploadItem({ 
  upload, 
  onCancel, 
  onRemove,
  onViewProject 
}: { 
  upload: UploadProgress;
  onCancel: () => void;
  onRemove: () => void;
  onViewProject: () => void;
}) {
  const isActive = upload.status === 'uploading' || upload.status === 'pending';
  
  return (
    <div className="border rounded-md p-2 bg-background">
      <div className="flex justify-between items-start mb-1">
        <div className="truncate flex-1 pr-2">
          <p className="text-xs font-medium truncate">{upload.filename}</p>
        </div>
        
        {isActive ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onCancel}
          >
            <X className="h-3 w-3" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onRemove}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      
      {/* Progress bar */}
      {isActive && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span>{upload.status === 'uploading' ? 'Uploading...' : 'Preparing...'}</span>
            <span>{Math.round(upload.progress)}%</span>
          </div>
          <Progress value={upload.progress} className="h-1.5" />
        </div>
      )}
      
      {/* Status indicators */}
      {upload.status === 'completed' && (
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center text-xs text-green-600 dark:text-green-500">
            <CheckCircle className="h-3 w-3 mr-1" />
            <span>Upload completed</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 py-0 text-xs"
            onClick={onViewProject}
          >
            View
          </Button>
        </div>
      )}
      
      {upload.status === 'error' && (
        <div className="flex items-center mt-1 text-xs text-red-600 dark:text-red-500">
          <AlertCircle className="h-3 w-3 mr-1" />
          <span className="truncate">{upload.error || 'Upload failed'}</span>
        </div>
      )}
    </div>
  );
}

export default UploadManager;