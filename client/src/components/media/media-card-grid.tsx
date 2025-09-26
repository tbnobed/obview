import { useState, useRef, useEffect } from "react";
import { Play, FileVideo, FileAudio, Image as ImageIcon, FileText, MoreHorizontal, Clock, Eye, Download, Share2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatFileSize, formatTimeAgo } from "@/lib/utils/formatters";
import { File as StorageFile } from "@shared/schema";

interface MediaCardGridProps {
  files: StorageFile[];
  onSelectFile: (fileId: number) => void;
  projectId: number;
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

// Get processing status for file
const getProcessingStatus = (fileId: number) => {
  const { data: processing } = useQuery({
    queryKey: ['/api/files', fileId, 'processing'],
    queryFn: ({ signal }) => apiRequest('GET', `/api/files/${fileId}/processing`, undefined, { signal }),
    enabled: !!fileId,
    staleTime: 5000, // Cache for 5 seconds
    retry: false
  });
  
  return processing;
};

interface MediaCardProps {
  file: StorageFile;
  onSelect: (fileId: number) => void;
}

function MediaCard({ file, onSelect }: MediaCardProps) {
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);
  const [spriteMetadata, setSpriteMetadata] = useState<any>(null);
  const [spriteLoaded, setSpriteLoaded] = useState(false);
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

  const handleViewDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Navigate to the file view page
    onSelect(file.id);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(`/api/files/${file.id}/content`);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Download started",
        description: `Downloading ${file.filename}`,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to download the file. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleShareLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Generate a view-only share link (no comments) using the file's share token
      const shareUrl = `${window.location.origin}/share/${file.shareToken}?viewOnly=true`;
      
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
        toast({
          title: "View-only link copied",
          description: "The view-only share link has been copied to your clipboard.",
        });
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        toast({
          title: "View-only link copied",
          description: "The view-only share link has been copied to your clipboard.",
        });
      }
    } catch (error) {
      toast({
        title: "Failed to copy link",
        description: "Could not copy the share link. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const processing = getProcessingStatus(file.id);
  
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
      className="group cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] bg-[#1a1f26] border-gray-700 hover:border-gray-600"
      onClick={handleCardClick}
      data-testid={`media-card-${file.id}`}
    >
      <CardContent className="p-0">
        {/* Thumbnail Container */}
        <div 
          className="relative aspect-video bg-gray-900 rounded-t-lg overflow-hidden"
          style={{
            cursor: `url("data:image/svg+xml,%3csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M8 5v10l8-5-8-5z' fill='%23ffffff'/%3e%3c/svg%3e") 10 10, pointer`
          }}
          onMouseMove={(e) => {
            if (!spriteMetadata || file.fileType !== 'video') return;
            
            const rect = e.currentTarget.getBoundingClientRect();
            if (rect.width === 0) return;
            
            const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setScrubPosition(pos);
            
            console.log(`🎬 [SPRITE-SCRUB] Position: ${(pos * 100).toFixed(1)}%`);
          }}
          onMouseEnter={() => {
            if (!spriteMetadata || file.fileType !== 'video') return;
            
            console.log('🎬 [SPRITE-SCRUB] Mouse entered - activating sprite scrub mode');
            setIsScrubbing(true);
            setScrubPosition(0);
          }}
          onMouseLeave={() => {
            console.log('🎬 [SPRITE-SCRUB] Mouse left - deactivating sprite scrub mode');
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
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
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
                    <div
                      className="w-full h-full bg-center bg-no-repeat bg-cover pointer-events-none"
                      data-testid={`sprite-preview-${file.id}`}
                      style={{
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
                  ) : null}
                  
                  {/* Fallback for failed thumbnail or while loading */}
                  {(!thumbnailLoaded || thumbnailError) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
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
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
              <FileIcon className="h-12 w-12 text-gray-500" />
              {file.fileType === 'audio' && duration && (
                <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded font-mono">
                  {formatDuration(duration)}
                </div>
              )}
            </div>
          )}

          {/* Status Badge */}
          <div className="absolute top-2 left-2">
            <div className={cn("w-3 h-3 rounded-full", statusInfo.color)}></div>
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
                <DropdownMenuItem onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleShareLink} disabled={!file.shareToken}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Share Link
                </DropdownMenuItem>
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
          <h3 className="font-medium text-white text-sm mb-1 truncate" title={file.filename}>
            {file.filename}
          </h3>
          
          {/* Metadata */}
          <div className="flex items-center justify-between text-xs text-gray-400">
            <div className="flex items-center gap-1">
              <span>{formatFileSize(file.fileSize)}</span>
              <span>•</span>
              <span>{formatTimeAgo(file.createdAt)}</span>
            </div>
            
            {/* Status Text */}
            <Badge 
              variant="outline" 
              className={cn(
                "text-xs border-0 text-white",
                statusInfo.color
              )}
            >
              {statusInfo.text}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MediaCardGrid({ files, onSelectFile, projectId }: MediaCardGridProps) {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white mb-1">Media Files</h2>
          <p className="text-gray-400 text-sm">{files.length} file{files.length !== 1 ? 's' : ''}</p>
        </div>
        
        {/* View Options - could add list/grid toggle here */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-gray-400 border-gray-600 hover:border-gray-500">
            Sort by Date
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {files.map((file) => (
          <MediaCard 
            key={file.id} 
            file={file} 
            onSelect={onSelectFile}
          />
        ))}
      </div>
    </div>
  );
}