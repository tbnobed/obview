import { useState, useRef, useEffect } from "react";
import { Play, FileVideo, FileAudio, Image as ImageIcon, FileText, MoreHorizontal, Clock, Eye, Download, Share2, Trash2, Layers } from "lucide-react";
import ShareLinksDialog from "@/components/sharing/share-links-dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatFileSize, formatTimeAgo } from "@/lib/utils/formatters";
import { File as StorageFile } from "@shared/schema";
import MediaInfoDialog from "./media-info-dialog";
import { setDragPayload, clearDragPayload } from "@/lib/drag-drop";
import MediaRow from "./media-row";
import { useViewMode } from "@/hooks/use-view-mode";
import ViewModeToggle from "@/components/ui/view-mode-toggle";

interface MediaCardGridProps {
  files: StorageFile[];
  onSelectFile: (fileId: number) => void;
  projectId: number;
  onMoveFile?: (file: StorageFile) => void;
}

// Format duration from seconds to MM:SS or HH:MM:SS
const formatDuration = (seconds: number | null) => {
  if (!seconds || seconds === 0) return "00:00";
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
};

// Get file type icon
const getFileIcon = (fileType: string) => {
  switch (fileType) {
    case 'video':
      return FileVideo;
    case 'audio': 
      return FileAudio;
    case 'image':
      return ImageIcon;
    default:
      return FileText;
  }
};

// Get processing status for file. Polls every 3s while a job is running so
// the badge flips from "Processing" to "Ready" without the user refreshing,
// and invalidates the parent file list on the pending→completed edge so
// duration / poster / hasScrubVersion show up immediately.
const getProcessingStatus = (fileId: number, projectId?: number) => {
  const queryClient = useQueryClient();
  const prevStatusRef = useRef<string | undefined>(undefined);
  const { data: processing } = useQuery({
    queryKey: ['/api/files', fileId, 'processing'],
    queryFn: ({ signal }) => apiRequest('GET', `/api/files/${fileId}/processing`, undefined, { signal }),
    enabled: !!fileId,
    staleTime: 5000,
    retry: false,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.status;
      return s === 'completed' || s === 'failed' ? false : 3000;
    },
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const status = (processing as any)?.status;
    if (
      projectId &&
      prevStatusRef.current &&
      prevStatusRef.current !== 'completed' &&
      status === 'completed'
    ) {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'files'] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/files`] });
    }
    prevStatusRef.current = status;
  }, [(processing as any)?.status, projectId, queryClient]);

  return processing;
};

interface MediaCardProps {
  file: StorageFile;
  onSelect: (fileId: number) => void;
  onMove?: (file: StorageFile) => void;
  versionCount?: number;
  approvalStatus?: "approved" | "changes_requested" | null;
}

function MediaCard({ file, onSelect, onMove, versionCount = 1, approvalStatus }: MediaCardProps) {
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);
  const [spriteMetadata, setSpriteMetadata] = useState<any>(null);
  const [spriteLoaded, setSpriteLoaded] = useState(false);
  const scrubRafRef = useRef<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Delete file mutation
  const deleteMutation = useMutation({
    mutationFn: (fileId: number) => apiRequest('DELETE', `/api/files/${fileId}`),
    onSuccess: () => {
      // Invalidate and refetch all related queries
      queryClient.invalidateQueries({ queryKey: ['/api/projects', file.projectId, 'files'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', file.projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${file.projectId}/files`] });
      // Invalidate file-specific queries (comments, processing, etc.)
      queryClient.invalidateQueries({ queryKey: ['/api/files', file.id, 'comments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/files', file.id, 'processing'] });
      queryClient.invalidateQueries({ queryKey: ['/api/files', file.id, 'approvals'] });
      
      toast({
        title: "File deleted",
        description: "The file has been successfully deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting file",
        description: error.message || "Failed to delete the file. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete "${file.filename}"? This action cannot be undone.`)) {
      deleteMutation.mutate(file.id);
    }
  };

  const [mediaInfoOpen, setMediaInfoOpen] = useState(false);

  const handleViewDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMediaInfoOpen(true);
  };

  // Trigger a browser download via a hidden anchor. We deliberately do NOT
  // round-trip the bytes through fetch+blob: blob storage is capped well
  // below multi-GB and would silently fail or OOM the tab on large files
  // (the bug that broke 7 GB Original downloads). Instead we navigate to a
  // URL that responds with Content-Disposition: attachment so the browser
  // streams straight to disk. `download` attribute is a hint for the
  // filename; the server's Content-Disposition wins when both are present.
  const downloadUrlAs = async (url: string, downloadName: string) => {
    try {
      const sep = url.includes('?') ? '&' : '?';
      const downloadHref = `${url}${sep}download=1&filename=${encodeURIComponent(downloadName)}`;
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = downloadHref;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast({
        title: "Download started",
        description: `Downloading ${downloadName}`,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to start the download. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadOriginal = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Use /download (forces Content-Disposition: attachment) instead of
    // /content (inline media stream). For multi-GB originals the browser
    // must stream to disk, never buffer in memory.
    downloadUrlAs(`/api/files/${file.id}/download`, file.filename);
  };

  // Build a download filename like "myclip_720p.mp4" preserving the original
  // base name and the quality's container extension when possible.
  const buildQualityFilename = (resolution: string, sourcePath?: string) => {
    const base = file.filename.replace(/\.[^.]+$/, "");
    const ext = sourcePath?.match(/\.[a-z0-9]+$/i)?.[0] ?? ".mp4";
    return `${base}_${resolution}${ext}`;
  };

  const handleDownloadQuality = (e: React.MouseEvent, resolution: string, sourcePath?: string) => {
    e.stopPropagation();
    downloadUrlAs(
      `/api/files/${file.id}/qualities/${encodeURIComponent(resolution)}`,
      buildQualityFilename(resolution, sourcePath),
    );
  };

  // Per-file share-link manager — same UI/permissions as project/folder
  // shares (password, expiry, downloads, comments, email gate, watermark).
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const openShareDialog = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShareDialogOpen(true);
  };
  
  const processing = getProcessingStatus(file.id, file.projectId);
  
  // Load sprite metadata for video files
  useEffect(() => {
    if (file.fileType === 'video' && (processing as any)?.status === 'completed') {
      fetch(`/api/files/${file.id}/sprite-metadata`)
        .then(res => res.ok ? res.json() : null)
        .then(metadata => {
          if (metadata) {
            setSpriteMetadata(metadata);
            console.log(`🎬 [SPRITE] Loaded metadata for file ${file.id}:`, metadata);
          }
        })
        .catch(err => console.warn(`🎬 [SPRITE] Failed to load metadata for file ${file.id}:`, err));
    }
  }, [file.id, file.fileType, (processing as any)?.status]);
  
  // Load sprite for video files, direct content for image files
  const thumbnailSrc = file.fileType === 'video' 
    ? `/api/files/${file.id}/sprite` 
    : file.fileType === 'image' 
      ? `/api/files/${file.id}/content`
      : null;
  
  // Get duration from processing data
  const duration = (processing as any)?.originalDuration || null;
  
  const FileIcon = getFileIcon(file.fileType);
  
  const handleCardClick = () => {
    onSelect(file.id);
  };

  const handleThumbnailLoad = () => {
    setThumbnailLoaded(true);
    setThumbnailError(false);
  };

  const handleThumbnailError = () => {
    setThumbnailError(true);
    setThumbnailLoaded(false);
  };

  // Get status badge color and text
  const getStatusInfo = () => {
    if (!file.isAvailable) {
      return { color: "bg-red-500", text: "Unavailable" };
    }
    
    if (processing) {
      const status = (processing as any).status;
      
      // For video files, check if all processing components are truly ready
      if (file.fileType === 'video') {
        switch (status) {
          case 'pending':
            return { color: "bg-yellow-500", text: "Processing" };
          case 'processing':
            return { color: "bg-blue-500", text: "Processing" };
          case 'completed':
            // Only show "Ready" if we have qualities AND scrub version for videos
            const hasQualities = (processing as any).qualities && (processing as any).qualities.length > 0;
            const hasScrubVersion = (processing as any).scrubVersionPath || (processing as any).hasScrubVersion;
            
            if (hasQualities && hasScrubVersion) {
              return { color: "bg-green-500", text: "Ready" };
            } else {
              // Still processing some components
              return { color: "bg-blue-500", text: "Processing" };
            }
          case 'failed':
            return { color: "bg-red-500", text: "Failed" };
          default:
            return { color: "bg-gray-500", text: "Unknown" };
        }
      } else {
        // For non-video files, use simple status check
        switch (status) {
          case 'pending':
            return { color: "bg-yellow-500", text: "Processing" };
          case 'processing':
            return { color: "bg-blue-500", text: "Processing" };
          case 'completed':
            return { color: "bg-green-500", text: "Ready" };
          case 'failed':
            return { color: "bg-red-500", text: "Failed" };
          default:
            return { color: "bg-gray-500", text: "Unknown" };
        }
      }
    }
    
    // No processing data - for non-video files this means ready
    if (file.fileType !== 'video') {
      return { color: "bg-green-500", text: "Ready" };
    }
    
    // For video files without processing data, assume they are legacy processed files
    // New files will have processing records, old files without records are likely complete
    return { color: "bg-green-500", text: "Ready" };
  };

  const statusInfo = getStatusInfo();

  return (
    <Card 
      className="group cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] bg-card border-border hover:border-foreground/20 active:opacity-70"
      onClick={handleCardClick}
      draggable
      onDragStart={(e) => {
        // Carry source project id so drop targets can avoid no-op moves
        // and so the server can reject same-project drops cleanly.
        e.stopPropagation();
        setDragPayload(e, { type: "file", id: file.id, sourceProjectId: file.projectId });
      }}
      onDragEnd={clearDragPayload}
      data-testid={`media-card-${file.id}`}
    >
      <CardContent className="p-0">
        {/* Thumbnail Container */}
        <div 
          className="relative aspect-video bg-muted rounded-t-lg overflow-hidden"
          style={{
            cursor: `url("data:image/svg+xml,%3csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M8 5v10l8-5-8-5z' fill='%23ffffff'/%3e%3c/svg%3e") 10 10, pointer`
          }}
          onMouseMove={(e) => {
            if (!spriteMetadata || file.fileType !== 'video') return;
            const rect = e.currentTarget.getBoundingClientRect();
            if (rect.width === 0) return;
            const clientX = e.clientX;
            if (scrubRafRef.current != null) return;
            scrubRafRef.current = requestAnimationFrame(() => {
              scrubRafRef.current = null;
              const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
              setScrubPosition((prev) => (Math.abs(prev - pos) < 0.005 ? prev : pos));
            });
          }}
          onMouseEnter={() => {
            if (!spriteMetadata || file.fileType !== 'video') return;
            setIsScrubbing(true);
            setScrubPosition(0);
          }}
          onMouseLeave={() => {
            if (scrubRafRef.current != null) {
              cancelAnimationFrame(scrubRafRef.current);
              scrubRafRef.current = null;
            }
            setIsScrubbing(false);
            setScrubPosition(0);
          }}
          onClick={handleCardClick}
          data-testid={`video-preview-container-${file.id}`}
        >
          {(file.fileType === 'video' && thumbnailSrc && spriteMetadata) || (file.fileType === 'image' && thumbnailSrc) ? (
            <>
              {file.fileType === 'image' ? (
                /* Image file rendering */
                <>
                  <img
                    src={thumbnailSrc}
                    className="w-full h-full object-cover"
                    onLoad={handleThumbnailLoad}
                    onError={handleThumbnailError}
                    alt={file.filename}
                    data-testid={`image-preview-${file.id}`}
                  />
                  
                  {/* Fallback for failed image loading */}
                  {thumbnailError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted">
                      <FileIcon className="h-12 w-12 text-gray-500" />
                    </div>
                  )}
                </>
              ) : (
                /* Video file rendering with sprite logic */
                <>
                  {/* Hidden image to detect sprite loading */}
                  <img
                    src={thumbnailSrc}
                    className="hidden"
                    onLoad={() => {
                      console.log(`🎬 [SPRITE] ✅ Sprite loaded for file ${file.id}: ${file.filename}`);
                      setSpriteLoaded(true);
                      handleThumbnailLoad();
                    }}
                    onError={() => {
                      console.error(`🎬 [SPRITE] ❌ Sprite error for file ${file.id}`);
                      handleThumbnailError();
                    }}
                    alt=""
                  />
                  
                  {!thumbnailError && thumbnailLoaded ? (
                    // Letterbox the sprite cell inside the landscape card
                    // slot so portrait/vertical video keeps its true aspect
                    // instead of being squished to fill.
                    <div className="absolute inset-0 flex items-center justify-center bg-black">
                      <div
                        className="bg-center bg-no-repeat pointer-events-none max-w-full max-h-full"
                        data-testid={`sprite-preview-${file.id}`}
                        style={{
                          aspectRatio: `${spriteMetadata.thumbnailWidth || 16} / ${spriteMetadata.thumbnailHeight || 9}`,
                          width: (spriteMetadata.thumbnailWidth || 16) >= (spriteMetadata.thumbnailHeight || 9) ? '100%' : 'auto',
                          height: (spriteMetadata.thumbnailWidth || 16) >= (spriteMetadata.thumbnailHeight || 9) ? 'auto' : '100%',
                          backgroundImage: `url(${thumbnailSrc})`,
                          backgroundSize: `${spriteMetadata.cols * 100}% ${spriteMetadata.rows * 100}%`,
                          backgroundPosition: (() => {
                            if (!isScrubbing) {
                              // Show first frame when not scrubbing
                              return `0% 0%`;
                            }

                            // Calculate which thumbnail to show based on scrub position
                            const thumbnailIndex = Math.floor(scrubPosition * (spriteMetadata.thumbnailCount - 1));
                            const col = thumbnailIndex % spriteMetadata.cols;
                            const row = Math.floor(thumbnailIndex / spriteMetadata.cols);

                            // Calculate background position (negative values to shift the sprite)
                            const xPercent = spriteMetadata.cols > 1 ? (col / (spriteMetadata.cols - 1)) * 100 : 0;
                            const yPercent = spriteMetadata.rows > 1 ? (row / (spriteMetadata.rows - 1)) * 100 : 0;

                            return `${xPercent}% ${yPercent}%`;
                          })()
                        }}
                      />
                    </div>
                  ) : null}
                  
                  {/* Fallback for failed thumbnail or while loading */}
                  {(!thumbnailLoaded || thumbnailError) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted">
                      <FileIcon className="h-12 w-12 text-gray-500" />
                    </div>
                  )}
                  
                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/20">
                    <div className="bg-white/90 rounded-full p-3 shadow-lg">
                      <Play className="h-6 w-6 text-gray-900 fill-gray-900" />
                    </div>
                  </div>

                  {/* Duration Badge */}
                  {duration && (
                    <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded font-mono">
                      {formatDuration(duration)}
                    </div>
                  )}
                  
                  {/* Scrub Progress Bar */}
                  {isScrubbing && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-75"
                        style={{ width: `${scrubPosition * 100}%` }}
                      />
                      {/* Position indicator */}
                      <div 
                        className="absolute top-0 w-0.5 h-1 bg-white transform -translate-x-0.5"
                        style={{ left: `${scrubPosition * 100}%` }}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            /* Non-video files */
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <FileIcon className="h-12 w-12 text-gray-500" />
              {file.fileType === 'audio' && duration && (
                <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded font-mono">
                  {formatDuration(duration)}
                </div>
              )}
            </div>
          )}

          {/* Status Badge */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5">
            <div className={cn("w-3 h-3 rounded-full", statusInfo.color)}></div>
            {versionCount > 1 && (
              <div className="flex items-center gap-1 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                <Layers className="h-3 w-3" />
                v{file.version}
              </div>
            )}
          </div>

          {/* Actions Menu */}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleViewDetails}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                {(() => {
                  // For videos with completed processing, expose every encoded
                  // resolution alongside the original. For other file types
                  // (audio, image) there are no transcoded variants, so fall
                  // back to a single download item.
                  const qualities: Array<{ resolution: string; path: string; size: number }> =
                    (processing as any)?.qualities || [];
                  const hasQualityVariants =
                    file.fileType === "video" && qualities.length > 0;

                  if (!hasQualityVariants) {
                    return (
                      <DropdownMenuItem onClick={handleDownloadOriginal}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                    );
                  }

                  return (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-56">
                        <DropdownMenuItem onClick={handleDownloadOriginal}>
                          <span className="flex-1">Original</span>
                          <span className="ml-2 text-xs text-neutral-500">
                            {formatFileSize(file.fileSize)}
                          </span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {qualities.map((q) => (
                          <DropdownMenuItem
                            key={q.resolution}
                            onClick={(e) => handleDownloadQuality(e, q.resolution, q.path)}
                          >
                            <span className="flex-1">{q.resolution}</span>
                            {q.size ? (
                              <span className="ml-2 text-xs text-neutral-500">
                                {formatFileSize(q.size)}
                              </span>
                            ) : null}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  );
                })()}
                <DropdownMenuItem onClick={openShareDialog}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Share Link
                </DropdownMenuItem>
                {onMove && (
                  <DropdownMenuItem
                    onClick={(e) => { e.stopPropagation(); onMove(file); }}
                    data-testid={`move-file-${file.id}`}
                  >
                    <FileVideo className="h-4 w-4 mr-2" />
                    Move to folder…
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleDelete}
                  className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Card Footer */}
        <div className="p-4">
          {/* Filename */}
          <h3 className="font-medium text-card-foreground text-sm mb-1 truncate" title={file.filename}>
            {file.filename}
          </h3>
          
          {/* Metadata */}
          <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <span className="truncate">{formatFileSize(file.fileSize)}</span>
              <span>•</span>
              <span className="truncate">{formatTimeAgo(file.createdAt)}</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Approval status (file-level) — minimal dot pill */}
              {approvalStatus === "approved" && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400"
                  data-testid={`approval-badge-${file.id}`}
                  title="Approved"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Approved
                </span>
              )}
              {approvalStatus === "changes_requested" && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400"
                  data-testid={`approval-badge-${file.id}`}
                  title="Changes requested"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Changes
                </span>
              )}

              {/* Processing/availability — only surface non-ready states to keep things calm */}
              {statusInfo.text !== "Ready" && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-medium",
                    statusInfo.text === "Failed" || statusInfo.text === "Unavailable"
                      ? "text-red-400"
                      : "text-blue-400"
                  )}
                  title={statusInfo.text}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      statusInfo.text === "Failed" || statusInfo.text === "Unavailable"
                        ? "bg-red-400"
                        : "bg-blue-400 animate-pulse"
                    )}
                  />
                  {statusInfo.text}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>

      {/* MediaInfo-style technical details */}
      <MediaInfoDialog
        open={mediaInfoOpen}
        onOpenChange={setMediaInfoOpen}
        fileId={file.id}
        filename={file.filename}
      />

      <span onClick={(e) => e.stopPropagation()}>
        <ShareLinksDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          scopeType="file"
          scopeId={file.id}
          scopeName={file.filename}
        />
      </span>
    </Card>
  );
}

export default function MediaCardGrid({ files, onSelectFile, projectId, onMoveFile }: MediaCardGridProps) {
  const latestFiles = files.filter((f) => f.isLatestVersion);
  const [viewMode, setViewMode] = useViewMode("media", "grid");

  const versionCounts = new Map<string, number>();
  for (const f of files) {
    const key = `${f.projectId}::${f.filename}`;
    versionCounts.set(key, (versionCounts.get(key) || 0) + 1);
  }

  const { data: fileApprovals } = useQuery<Record<number, "approved" | "changes_requested" | null>>({
    queryKey: ['/api/projects', projectId, 'file-approvals'],
    queryFn: ({ signal }) =>
      apiRequest('GET', `/api/projects/${projectId}/file-approvals`, undefined, { signal }),
    enabled: !!projectId,
    staleTime: 10000,
  });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-1">Media Files</h2>
          <p className="text-muted-foreground text-sm">{latestFiles.length} file{latestFiles.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="flex items-center gap-2">
          <ViewModeToggle
            value={viewMode}
            onChange={setViewMode}
            testIdPrefix="media-view"
          />
          <Button variant="outline" size="sm" className="text-muted-foreground border-border hover:border-foreground/30">
            Sort by Date
          </Button>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {latestFiles.map((file) => (
            <MediaCard
              key={file.id}
              file={file}
              onSelect={onSelectFile}
              onMove={onMoveFile}
              versionCount={versionCounts.get(`${file.projectId}::${file.filename}`) || 1}
              approvalStatus={fileApprovals?.[file.id] ?? null}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {latestFiles.map((file) => (
            <MediaRow
              key={file.id}
              file={file}
              onSelect={onSelectFile}
              onMove={onMoveFile}
              versionCount={versionCounts.get(`${file.projectId}::${file.filename}`) || 1}
              approvalStatus={fileApprovals?.[file.id] ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}