import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, Layers, Maximize, Pause, Play, Volume2, File, FileVideo, ClipboardCheck, Loader2, Upload, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import TimelineComments from "@/components/media/timeline-comments";
import { DownloadButton } from "@/components/download-button";
import { ShareLinkButton } from "@/components/share-link-button";
import { Comment, File as StorageFile, Project } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { uploadService } from "@/lib/upload-service";

export default function MediaPlayer({
  file,
  files,
  onSelectFile,
  projectId,
  initialTime,
  project,
}: {
  file: StorageFile | null;
  files: StorageFile[];
  onSelectFile: (fileId: number) => void;
  projectId: number;
  initialTime?: number | null;
  project?: Project;
}) {
  const { user } = useAuth();
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [mediaError, setMediaError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCommentsTab, setShowCommentsTab] = useState(true);
  const [activeCommentId, setActiveCommentId] = useState<number | undefined>(undefined);
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false);
  const [selectedVersionFile, setSelectedVersionFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [seekingToTime, setSeekingToTime] = useState<number | null>(null);
  const [showScrubPreview, setShowScrubPreview] = useState(false);
  const [scrubPreviewTime, setScrubPreviewTime] = useState(0);
  const [scrubPreviewLeft, setScrubPreviewLeft] = useState(0);
  const [scrubPreviewTop, setScrubPreviewTop] = useState(0);
  const [hoveredComment, setHoveredComment] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  
  // Mobile-specific state - start with proper detection
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [isLandscape, setIsLandscape] = useState(() => typeof window !== 'undefined' ? window.innerWidth > window.innerHeight && window.innerWidth < 1024 : false);
  const [commentsPanelHeight, setCommentsPanelHeight] = useState(120); // Start with input height
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartHeight, setDragStartHeight] = useState(0);
  
  // Sprite scrubbing state
  const [spriteMetadata, setSpriteMetadata] = useState<any>(null);
  const [spriteLoaded, setSpriteLoaded] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const mediaContainerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSeekTimeRef = useRef<number>(0);
  const seekThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const scrubPreviewRef = useRef<HTMLDivElement>(null);

  // Fetch comments for the current file
  const { data: comments = [] } = useQuery({
    queryKey: ['/api/files', file?.id, 'comments'],
    queryFn: () => file ? apiRequest('GET', `/api/files/${file.id}/comments`) : Promise.resolve([]),
    enabled: !!user && !!file,
  });

  // Fetch video processing data for proxy versions (optional optimization)
  const { data: videoProcessing, error: processingError } = useQuery({
    queryKey: ['/api/files', file?.id, 'processing'],
    queryFn: async () => {
      if (!file) return null;
      try {
        const result = await apiRequest('GET', `/api/files/${file.id}/processing`);
        return result;
      } catch (error) {
        // Processing not available yet or failed - that's OK, use original file
        console.log(`[VideoProcessing] Processing data not available for file ${file.id}, using original file`);
        return null;
      }
    },
    enabled: !!user && !!file && file.fileType === 'video',
    retry: (failureCount, error: any) => {
      // Retry up to 3 times for 401 errors (session race condition)
      if (error?.message?.includes('Unauthorized') && failureCount < 3) {
        return true;
      }
      return false;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 30000),
    refetchOnWindowFocus: false,
    // Don't show query errors, processing is optional
    meta: { suppressErrorToast: true }
  });

  // Fetch approval status for the current file
  const { data: approvals = [] } = useQuery({
    queryKey: ['/api/files', file?.id, 'approvals'],
    queryFn: () => file ? apiRequest('GET', `/api/files/${file.id}/approvals`) : Promise.resolve([]),
    enabled: !!user && !!file,
  });
  
  // Load sprite metadata for video files
  useEffect(() => {
    if (file && file.fileType === 'video' && videoProcessing?.status === 'completed') {
      fetch(`/api/files/${file.id}/sprite-metadata`)
        .then(res => res.ok ? res.json() : null)
        .then(metadata => {
          if (metadata) {
            setSpriteMetadata(metadata);
            console.log(`🎬 [PLAYER-SPRITE] Loaded metadata for file ${file.id}:`, metadata);
          }
        })
        .catch(err => console.warn(`🎬 [PLAYER-SPRITE] Failed to load metadata for file ${file.id}:`, err));
    } else {
      setSpriteMetadata(null);
      setSpriteLoaded(false);
    }
  }, [file?.id, file?.fileType, videoProcessing?.status]);
  
  // Mobile and orientation detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
      setIsLandscape(window.innerWidth > window.innerHeight && window.innerWidth < 1024); // landscape mobile/tablet
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    window.addEventListener('orientationchange', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('orientationchange', checkMobile);
    };
  }, []);
  
  // Touch/drag handlers for mobile comments panel
  const handlePanelTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    setIsDraggingPanel(true);
    setDragStartY(e.touches[0].clientY);
    setDragStartHeight(commentsPanelHeight);
  };
  
  const handlePanelTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingPanel || !isMobile) return;
    
    const currentY = e.touches[0].clientY;
    const diff = dragStartY - currentY; // Positive when dragging up
    const newHeight = Math.max(120, Math.min(window.innerHeight * 0.8, dragStartHeight + diff));
    
    setCommentsPanelHeight(newHeight);
  };
  
  const handlePanelTouchEnd = () => {
    if (!isMobile) return;
    setIsDraggingPanel(false);
    
    // Snap to positions based on current height
    if (commentsPanelHeight < 200) {
      setCommentsPanelHeight(120); // Collapsed to input only
    } else if (commentsPanelHeight < 400) {
      setCommentsPanelHeight(350); // Half screen
    } else {
      setCommentsPanelHeight(window.innerHeight * 0.8); // Full expanded
    }
  };
  
  // Auto-pause video when comment input is focused on mobile
  const handleCommentInputFocus = () => {
    if (isMobile && isPlaying) {
      const mediaElement = videoRef.current || audioRef.current;
      if (mediaElement) {
        mediaElement.pause();
        setIsPlaying(false);
      }
    }
  };
  
  // Find user's approval (if any)
  const userApproval = approvals && approvals.length > 0 ? approvals[0] : null;

  // Format time utility
  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "00:00";
    
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Media playback functions
  const togglePlay = () => {
    if (mediaError) return;
    
    const mediaElement = videoRef.current || audioRef.current;
    if (!mediaElement) return;
    
    if (isPlaying) {
      mediaElement.pause();
    } else {
      mediaElement.play();
    }
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
    setCurrentTime(e.currentTarget.currentTime);
  };

  const handleDurationChange = (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
    setDuration(e.currentTarget.duration);
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  const handleMediaError = (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
    console.error('Media error:', e);
    setMediaError(true);
    setErrorMessage("Unable to load media file");
  };

  const handleMediaEnded = () => {
    setIsPlaying(false);
  };

  // Progress bar click handler
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    
    const rect = progressRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = pos * duration;
    
    const mediaElement = videoRef.current || audioRef.current;
    if (mediaElement) {
      mediaElement.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  // Handle progress bar leave
  const handleProgressLeave = () => {
    setShowScrubPreview(false);
  };

  // Media content rendering
  const renderMediaContent = () => {
    if (!file) return null;

    if (mediaError) {
      return (
        <div className="flex items-center justify-center h-full bg-neutral-900 text-white">
          <div className="text-center p-8">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
            <h3 className="text-xl font-medium mb-2">Unable to load media</h3>
            <p className="text-neutral-400">{errorMessage}</p>
          </div>
        </div>
      );
    }

    // Video files
    if (file.fileType.startsWith('video/')) {
      return (
        <div className="relative h-full w-full">
          <video
            ref={videoRef}
            className="h-full w-full object-contain"
            controls={false}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={handleMediaEnded}
            onError={handleMediaError}
            playsInline
            preload="metadata"
          >
            <source src={`/api/files/${file.id}/content`} type={file.fileType} />
            Your browser does not support the video element.
          </video>
        </div>
      );
    }
    
    // Audio files
    if (file.fileType.startsWith('audio/')) {
      return (
        <div className="flex items-center justify-center h-full bg-neutral-900 text-white">
          <div className="text-center p-8">
            <Volume2 className="h-24 w-24 mx-auto mb-6 text-neutral-400" />
            <h3 className="text-2xl font-medium mb-2">{file.filename}</h3>
            <p className="text-neutral-400">Audio file</p>
          </div>
          
          <audio
            ref={audioRef}
            className="hidden"
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onEnded={handleMediaEnded}
            onError={handleMediaError}
            preload="metadata"
          >
            <source src={`/api/files/${file.id}/content`} type={file.fileType} />
            Your browser does not support the audio element.
          </audio>
        </div>
      );
    }
    
    // Image files
    if (file.fileType.startsWith('image/')) {
      return (
        <div className="flex items-center justify-center h-full bg-neutral-900">
          <img
            src={`/api/files/${file.id}/content`}
            alt={file.filename}
            className="max-h-full max-w-full object-contain"
            onError={() => setMediaError(true)}
          />
        </div>
      );
    }
    
    // Default - unsupported file type
    return (
      <div className="flex items-center justify-center h-full bg-neutral-900 text-white">
        <div className="text-center p-8">
          <File className="h-12 w-12 mx-auto mb-4 text-neutral-400" />
          <h3 className="text-xl font-medium">{file.filename}</h3>
          <p className="text-neutral-400 mt-2">This file type cannot be previewed</p>
          <div className="mt-4">
            <DownloadButton
              fileId={file.id}
              filename={file.filename}
              size="sm"
              variant="outline"
              isAvailable={file.isAvailable}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={cn(
      "h-full min-h-0",
      // Mobile layout
      isMobile && !isLandscape ? "flex flex-col" : 
      // Desktop layout  
      "flex flex-col lg:flex-row"
    )}>
      {/* Mobile Landscape - Full screen video */}
      {isMobile && isLandscape ? (
        <div className="relative h-full w-full bg-black">
          {renderMediaContent()}
          {/* Minimal controls overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            <div className="flex items-center justify-between">
              <Button
                onClick={togglePlay}
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20"
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>
              <span className="font-mono text-sm text-white/80">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Media Viewer - Takes remaining space */}
          <div className={cn(
            "flex-1 min-h-0",
            isMobile ? "relative" : "grid grid-rows-[auto,1fr,auto]"
          )}>
            {!isMobile && <div></div>}
            
            {/* Media container - grows to fill space */}
            <div className={cn(
              "relative min-h-0 bg-black overflow-hidden",
              isMobile ? "h-full" : ""
            )}>
              {renderMediaContent()}
            </div>
            
            {/* Desktop controls area */}
            {!isMobile && (
              <div className="bg-black p-6 border-t border-gray-800">
                {/* Media player controls - Only shown when no error */}
                {!mediaError && (
                  <div className="flex items-center mb-2 space-x-2">
                    <Button
                      onClick={togglePlay}
                      variant="ghost"
                      size="icon"
                      className="text-neutral-600 hover:text-neutral-900 dark:text-gray-400 dark:hover:text-[#026d55]"
                    >
                      {isPlaying ? (
                        <Pause className="h-6 w-6" />
                      ) : (
                        <Play className="h-6 w-6" />
                      )}
                    </Button>
                    
                    <span className="font-mono text-sm text-neutral-600 dark:text-gray-400">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                    
                    {/* Progress bar container */}
                    <div className="flex-grow mx-4 relative">
                      <div
                        className="relative py-4 cursor-pointer"
                        onClick={handleProgressClick}
                        onMouseLeave={handleProgressLeave}
                        data-testid="progress-bar-extended-area"
                      >
                        {/* Progress bar */}
                        <div
                          ref={progressRef}
                          className="video-progress relative h-2 bg-neutral-200 dark:bg-gray-800 hover:bg-neutral-300 dark:hover:bg-gray-700 cursor-pointer rounded-full group"
                          data-testid="progress-bar"
                        >
                          <div
                            className="video-progress-fill absolute top-0 left-0 h-full bg-primary dark:bg-[#026d55] rounded-full"
                            style={{ width: `${(currentTime / duration) * 100}%` }}
                          ></div>
                          <div
                            className="playhead absolute top-1/2 -translate-y-1/2 h-4 w-4 bg-primary dark:bg-[#026d55] rounded-full shadow-md -ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ left: `${(currentTime / duration) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Volume and fullscreen controls */}
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-neutral-600 hover:text-neutral-900 dark:text-gray-400 dark:hover:text-[#026d55]"
                      >
                        <Volume2 className="h-5 w-5" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-neutral-600 hover:text-neutral-900 dark:text-gray-400 dark:hover:text-[#026d55]"
                      >
                        <Maximize className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile Comments Panel - Swipeable from bottom */}
          {isMobile && (
            <div 
              className="absolute bottom-0 left-0 right-0 bg-white dark:bg-[#0f1218] border-t border-gray-200 dark:border-gray-700 transition-all duration-300"
              style={{ height: commentsPanelHeight }}
            >
              {/* Drag handle */}
              <div 
                className="w-full py-3 flex justify-center cursor-grab active:cursor-grabbing"
                onTouchStart={handlePanelTouchStart}
                onTouchMove={handlePanelTouchMove}
                onTouchEnd={handlePanelTouchEnd}
              >
                <div className="w-12 h-1 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
              </div>
              
              {/* Comments content */}
              <div className="px-4 pb-4 h-full overflow-y-auto">
                {commentsPanelHeight > 150 && (
                  <div className="mb-4">
                    <TimelineComments
                      fileId={file?.id || 0}
                      currentTime={currentTime}
                      duration={duration}
                      onTimeClick={(time: number) => {
                        const mediaElement = videoRef.current || audioRef.current;
                        if (mediaElement) {
                          mediaElement.currentTime = time;
                          setCurrentTime(time);
                        }
                      }}
                    />
                  </div>
                )}
                
                {/* Comment input always visible */}
                <div className="mt-auto">
                  <TimelineComments
                    fileId={file?.id || 0}
                    currentTime={currentTime}
                    duration={duration}
                    onTimeClick={(time: number) => {
                      const mediaElement = videoRef.current || audioRef.current;
                      if (mediaElement) {
                        mediaElement.currentTime = time;
                        setCurrentTime(time);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Desktop Comments Section */}
          {!isMobile && file && (
            <div className="w-96 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0f1218] flex flex-col min-h-0">
              <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                <h3 className="font-medium text-gray-900 dark:text-white">Comments</h3>
              </div>
              
              <div className="flex-1 min-h-0 overflow-y-auto">
                <TimelineComments
                  fileId={file.id}
                  currentTime={currentTime}
                  duration={duration}
                  onTimeClick={(time: number) => {
                    const mediaElement = videoRef.current || audioRef.current;
                    if (mediaElement) {
                      mediaElement.currentTime = time;
                      setCurrentTime(time);
                    }
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}