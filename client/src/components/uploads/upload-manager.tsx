import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Loader2, Pause, Play } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { uploadService, type UploadProgress } from '@/lib/upload-service';
import { useLocation } from 'wouter';

// Floating panel that shows every in-flight, paused, completed or failed
// upload. Subscribes to uploadService so it auto-refreshes as chunks land.
export function UploadManager() {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const unsubscribe = uploadService.subscribe((updatedUploads) => {
      setUploads(updatedUploads);
      if (updatedUploads.length > 0 && !isOpen) {
        setIsOpen(true);
      }
    });
    return unsubscribe;
  }, [isOpen]);

  if (uploads.length === 0) {
    return null;
  }

  const activeUploads = uploads.filter(
    (u) => u.status === 'uploading' || u.status === 'pending' || u.status === 'paused' || u.status === 'queued'
  ).length;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end space-y-2">
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

      {isOpen && (
        <Card className="w-96 shadow-lg">
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
                  onPause={() => uploadService.pauseUpload(upload.id)}
                  onResume={() => uploadService.resumeUpload(upload.id)}
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

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${Math.round(bytes || 0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number | undefined): string {
  if (seconds == null || !isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function UploadItem({
  upload,
  onPause,
  onResume,
  onCancel,
  onRemove,
  onViewProject,
}: {
  upload: UploadProgress;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onViewProject: () => void;
}) {
  const isUploading = upload.status === 'uploading' || upload.status === 'pending';
  const isQueued = upload.status === 'queued';
  const isPaused = upload.status === 'paused';
  const isActive = isUploading || isPaused || isQueued;

  return (
    <div className="border rounded-md p-2 bg-background">
      <div className="flex justify-between items-start mb-1 gap-2">
        <div className="truncate flex-1 min-w-0">
          <p className="text-xs font-medium truncate" title={upload.filename}>
            {upload.filename}
          </p>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {isUploading && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onPause}
              title="Pause upload"
            >
              <Pause className="h-3 w-3" />
            </Button>
          )}
          {isPaused && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onResume}
              title="Resume upload"
            >
              <Play className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={isActive ? onCancel : onRemove}
            title={isActive ? 'Cancel upload' : 'Dismiss'}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {isActive && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {upload.status === 'queued' && 'Queued — waiting for a free slot'}
              {upload.status === 'pending' && 'Preparing…'}
              {upload.status === 'uploading' && `${formatBytes(upload.bytesPerSecond || 0)}/s`}
              {upload.status === 'paused' && 'Paused'}
            </span>
            <span>
              {formatBytes(upload.bytesUploaded)} / {formatBytes(upload.fileSize)}
              {upload.status === 'uploading' && upload.etaSeconds != null && (
                <> · {formatDuration(upload.etaSeconds)} left</>
              )}
            </span>
          </div>
          <Progress value={upload.progress} className="h-1.5" />
          <div className="text-right text-[10px] text-muted-foreground">
            {Math.round(upload.progress)}%
          </div>
        </div>
      )}

      {upload.status === 'completed' && (
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center text-xs text-green-600 dark:text-green-500">
            <CheckCircle className="h-3 w-3 mr-1" />
            <span>Upload complete</span>
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
