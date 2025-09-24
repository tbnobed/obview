import { useState, useRef, useEffect } from "react";
import { Play, FileVideo, FileAudio, Image as ImageIcon, FileText, MoreHorizontal, Clock, Eye, Download, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
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
    enabled: !!fileId,
    staleTime: 5000, // Cache for 5 seconds
    retry: false
  });
  
  return processing;
};

interface MediaCardProps {
  file: StorageFile;
  onSelect: (fileId: number) => void;
  isActive?: boolean;
  onHover?: (fileId: number | null) => void;
}

function MediaCard({ file, onSelect, isActive = false, onHover }: MediaCardProps) {
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [canScrub, setCanScrub] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number>();
  const processing = getProcessingStatus(file.id);
  
  // Try to load scrub preview for video files (Frame.io style)
  const thumbnailSrc = file.fileType === 'video' ? `/api/files/${file.id}/scrub` : null;
  
  // Get duration from processing data
  const duration = (processing as any)?.originalDuration || null;
  
  const FileIcon = getFileIcon(file.fileType);
  
  const handleCardClick = () => {
    // Don't trigger selection if user was scrubbing
    if (isScrubbing) return;
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

  const handleVideoLoadedMetadata = () => {
    const video = videoRef.current;
    if (video && video.duration && isFinite(video.duration)) {
      setVideoDuration(video.duration);
      setCanScrub(true);
    }
    handleThumbnailLoad();
  };

  const scrubToPosition = (clientX: number) => {
    const video = videoRef.current;
    const container = containerRef.current;
    
    if (!video || !container || !canScrub || videoDuration === 0) return;
    
    const rect = container.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const targetTime = progress * videoDuration;
    
    video.currentTime = targetTime;
  };

  const throttledScrub = (clientX: number) => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }
    
    rafIdRef.current = requestAnimationFrame(() => {
      scrubToPosition(clientX);
    });
  };

  const handleMouseEnter = () => {
    setIsHovering(true);
    onHover?.(file.id);
    
    const video = videoRef.current;
    if (video && isActive) {
      video.pause();
      // Switch to auto preload for better scrubbing performance
      video.preload = 'auto';
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setIsScrubbing(false);
    onHover?.(null);
    
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }
    
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
      // Switch back to metadata preload
      video.preload = 'metadata';
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isActive || !canScrub || !isHovering) return;
    
    setIsScrubbing(true);
    throttledScrub(e.clientX);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isActive || !canScrub) return;
    
    e.preventDefault();
    const container = containerRef.current;
    if (container) {
      container.setPointerCapture(e.pointerId);
      setIsScrubbing(true);
      scrubToPosition(e.clientX);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isActive || !canScrub || !isScrubbing) return;
    
    e.preventDefault();
    throttledScrub(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const container = containerRef.current;
    if (container) {
      container.releasePointerCapture(e.pointerId);
    }
    setIsScrubbing(false);
  };

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Get status badge color and text
  const getStatusInfo = () => {
    if (!file.isAvailable) {
      return { color: "bg-red-500", text: "Unavailable" };
    }
    
    if (processing) {
      switch ((processing as any).status) {
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
          ref={containerRef}
          className="relative aspect-video bg-gray-900 rounded-t-lg overflow-hidden"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ touchAction: 'none' }}
        >
          {file.fileType === 'video' && thumbnailSrc ? (
            <>
              {!thumbnailError ? (
                <video
                  ref={videoRef}
                  src={thumbnailSrc}
                  muted
                  playsInline
                  preload={isActive ? "auto" : "metadata"}
                  className={cn(
                    "w-full h-full object-cover transition-opacity duration-200 pointer-events-none",
                    thumbnailLoaded ? "opacity-100" : "opacity-0"
                  )}
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  onError={handleThumbnailError}
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
              
              {/* Scrub Progress Indicator */}
              {isActive && isHovering && canScrub && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                  <div 
                    className="h-full bg-white transition-all duration-75"
                    style={{ 
                      width: videoDuration > 0 && videoRef.current 
                        ? `${(videoRef.current.currentTime / videoDuration) * 100}%` 
                        : '0%'
                    }}
                  />
                </div>
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
                <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Share Link
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
  const [hoveredFileId, setHoveredFileId] = useState<number | null>(null);
  
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
            isActive={hoveredFileId === file.id}
            onHover={setHoveredFileId}
          />
        ))}
      </div>
    </div>
  );
}