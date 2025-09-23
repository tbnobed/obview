import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { AlertCircle, Maximize, Pause, Play, Volume2, MessageCircle, Clock, MessageSquare, MoreHorizontal, Filter, Search, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Logo from "@/components/ui/logo";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertPublicCommentSchema, type UnifiedComment } from "@shared/schema";
import { z } from "zod";

interface SharedFile {
  id: number;
  filename: string;
  fileType: string;
  fileSize: number;
  projectName: string;
  createdAt: string;
}

// Format time for Frame.io style (HH:MM:SS:FF - hours:minutes:seconds:frames)
const formatTime = (time: number) => {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = Math.floor(time % 60);
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
};

// Get user initials for avatar fallback
const getUserInitials = (name: string) => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

export default function PublicSharePage() {
  const { token } = useParams<{ token: string }>();
  
  // Check if this is a view-only link (hide comments)
  const urlParams = new URLSearchParams(window.location.search);
  const isViewOnly = urlParams.get('viewOnly') === 'true';
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [mediaError, setMediaError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [showScrubPreview, setShowScrubPreview] = useState(false);
  const [scrubPreviewTime, setScrubPreviewTime] = useState(0);
  const [scrubPreviewLeftPx, setScrubPreviewLeftPx] = useState(0);
  const [hoveredComment, setHoveredComment] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const mediaContainerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const scrubPreviewRef = useRef<HTMLDivElement>(null);
  const lastSeekTimeRef = useRef<number>(0);
  const seekThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Fetch shared file metadata
  const { data: file, isLoading, error } = useQuery<SharedFile>({
    queryKey: ['/api/share', token, 'metadata'],
    queryFn: async () => {
      const response = await fetch(`/api/share/${token}/metadata`);
      if (!response.ok) {
        throw new Error('File not found or expired');
      }
      return response.json();
    },
    enabled: !!token,
    retry: false
  });

  // Fetch comments for the markers
  const { data: comments } = useQuery<UnifiedComment[]>({
    queryKey: ['/api/share', token, 'comments'],
    queryFn: async () => {
      const response = await fetch(`/api/share/${token}/comments`);
      if (!response.ok) {
        throw new Error('Failed to fetch comments');
      }
      return response.json();
    },
    enabled: !!token && !!file,
    retry: false
  });

  // Handle play/pause
  const togglePlay = () => {
    const mediaElement = videoRef.current || audioRef.current;
    if (!mediaElement) return;

    if (isPlaying) {
      mediaElement.pause();
    } else {
      mediaElement.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Handle volume change
  const handleVolumeChange = (value: string) => {
    const newVolume = parseFloat(value);
    setVolume(newVolume);
    
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    } else if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  // Handle progress click
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current) return;
    
    const rect = progressRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = duration * pos;
    
    setCurrentTime(newTime);
    
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    } else if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  // Function to seek video to specific timestamp (for comment clicks)
  const seekToTimestamp = (timestamp: number) => {
    const mediaElement = videoRef.current || audioRef.current;
    if (!mediaElement) return;
    
    setCurrentTime(timestamp);
    mediaElement.currentTime = timestamp;
  };

  // Handle fullscreen
  const toggleFullscreen = () => {
    if (!mediaContainerRef.current) return;
    
    if (!document.fullscreenElement) {
      mediaContainerRef.current.requestFullscreen().catch(err => {
        console.error('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);
  
  // Optimized throttled seeking function
  const performSeek = (time: number) => {
    const mediaElement = videoRef.current || audioRef.current;
    if (!mediaElement) return;
    
    // Clear any pending seek operation
    if (seekThrottleRef.current) {
      clearTimeout(seekThrottleRef.current);
    }
    
    // Throttle seeking to avoid excessive operations
    const now = Date.now();
    const timeSinceLastSeek = now - lastSeekTimeRef.current;
    const SEEK_THROTTLE_MS = 100; // Limit to 10 seeks per second
    
    if (timeSinceLastSeek >= SEEK_THROTTLE_MS) {
      // Can seek immediately
      mediaElement.currentTime = time;
      lastSeekTimeRef.current = now;
    } else {
      // Schedule delayed seek
      seekThrottleRef.current = setTimeout(() => {
        mediaElement.currentTime = time;
        lastSeekTimeRef.current = Date.now();
      }, SEEK_THROTTLE_MS - timeSinceLastSeek);
    }
  };
  
  
  // Handle global mouse events for optimized scrubbing
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        // Perform final seek on mouse up
        performSeek(previewTime);
        setCurrentTime(previewTime);
      }
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && progressRef.current) {
        // Use RAF for smooth visual updates
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
        }
        
        rafIdRef.current = requestAnimationFrame(() => {
          if (!progressRef.current) return;
          
          const rect = progressRef.current.getBoundingClientRect();
          // Get x position relative to progress bar (clamped between 0 and 1)
          const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const newTime = duration * pos;
          
          // Update preview time immediately for visual feedback
          setPreviewTime(newTime);
          // CRITICAL FIX: Update scrub preview position to follow mouse
          setScrubPreviewTime(newTime);
          setScrubPreviewLeftPx(e.clientX - progressRef.current.getBoundingClientRect().left);
          setShowScrubPreview(true);
          
          // Update preview video time if it exists
          if (previewVideoRef.current && duration > 0) {
            previewVideoRef.current.currentTime = newTime;
          }
          
          // Only seek occasionally during drag for performance
          const now = Date.now();
          if (now - lastSeekTimeRef.current > 200) { // Seek every 200ms during drag
            performSeek(newTime);
            setCurrentTime(newTime);
          }
        });
      }
    };
    
    const handleMouseDown = (e: MouseEvent) => {
      // Check if the click was on the progress bar
      if (progressRef.current && progressRef.current.contains(e.target as Node)) {
        setIsDragging(true);
        // Set initial preview time
        const rect = progressRef.current.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newTime = duration * pos;
        setPreviewTime(newTime);
      }
    };
    
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mousedown', handleMouseDown);
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mousedown', handleMouseDown);
      
      // Cleanup RAF and timeouts
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (seekThrottleRef.current) {
        clearTimeout(seekThrottleRef.current);
      }
    };
  }, [duration, isDragging, previewTime]);
  
  // Handle progress bar hover for scrub preview
  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || isDragging) return;
    
    const rect = progressRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const hoverTime = duration * pos;
    
    setScrubPreviewTime(hoverTime);
    // Store pixel position for consistent positioning
    setScrubPreviewLeftPx(e.clientX - rect.left);
    setShowScrubPreview(true);
    
    // Update preview video time
    if (previewVideoRef.current && duration > 0) {
      previewVideoRef.current.currentTime = hoverTime;
    }
  };
  
  const handleProgressLeave = () => {
    setShowScrubPreview(false);
  };


  // Handle media events
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

  // Handle preview video load
  const handlePreviewVideoLoad = () => {
    if (previewVideoRef.current && videoRef.current) {
      // Sync preview video with main video when loaded
      previewVideoRef.current.currentTime = videoRef.current.currentTime;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Logo className="mx-auto mb-4" />
          <div className="text-gray-600 dark:text-gray-400">Loading shared file...</div>
        </div>
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <Logo className="mx-auto mb-6" />
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This shared file is no longer available or the link has expired.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Compact Header */}
      <div className="flex-shrink-0 py-2 px-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Logo className="h-6 w-6" />
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                {file.projectName}
              </h1>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {file.filename}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content area - fills remaining height */}
      <div className="flex-1 p-2 sm:p-4 pb-20">
        {/* Side-by-side layout: Media Player on left, Comments on right (unless view-only) */}
        <div className={cn("h-full grid grid-cols-1 gap-2 sm:gap-4", !isViewOnly && "lg:grid-cols-4")}>
          {/* Media Player - Takes 3/4 of space on large screens, full width in view-only mode */}
          <div className={cn("h-full", !isViewOnly ? "lg:col-span-3" : "lg:col-span-4")}>
            <Card className="h-full flex flex-col">
              <CardContent className="p-2 md:p-4 flex-1 flex flex-col pb-16">
                {/* Video container - fills available space */}
                <div ref={mediaContainerRef} className="relative bg-black rounded-lg overflow-visible flex-1 w-full">
              {!mediaError ? (
                <>
                  {file.fileType === 'video' && (
                    <video
                      ref={videoRef}
                      className="w-full h-full object-contain"
                      src={`/public/share/${token}`}
                      onTimeUpdate={handleTimeUpdate}
                      onDurationChange={handleDurationChange}
                      onPlay={handlePlay}
                      onPause={handlePause}
                      onError={handleMediaError}
                      preload="metadata"
                      data-testid="shared-video-player"
                    />
                  )}
                  
                  {file.fileType === 'audio' && (
                    <div className="flex items-center justify-center w-full h-full bg-gray-800">
                      <audio
                        ref={audioRef}
                        src={`/public/share/${token}`}
                        onTimeUpdate={handleTimeUpdate}
                        onDurationChange={handleDurationChange}
                        onPlay={handlePlay}
                        onPause={handlePause}
                        onError={handleMediaError}
                        preload="metadata"
                        className="hidden"
                        data-testid="shared-audio-player"
                      />
                      <div className="text-white text-center">
                        <div className="text-4xl md:text-6xl mb-2">🎵</div>
                        <div className="text-lg md:text-xl px-4">{file.filename}</div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center w-full h-full bg-gray-800">
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                </div>
              )}
            </div>

            {/* Media Controls - Always show for video/audio files */}
            {(file.fileType === 'video' || file.fileType === 'audio') && (
              <div className="relative mt-4 p-4 bg-neutral-50 dark:bg-gray-800 rounded-lg">
                {/* Scrub Preview Window - positioned relative to full container */}
                {showScrubPreview && duration > 0 && file.fileType === 'video' && (
                  <div
                    ref={scrubPreviewRef}
                    className="absolute bottom-full mb-2 pointer-events-none z-40"
                    style={{
                      left: `${scrubPreviewLeftPx + 16}px`, // Add offset for container padding
                      transform: 'translateX(-50%)'
                    }}
                  >
                    <div className="bg-black rounded-lg p-2 shadow-xl border border-gray-600 z-50">
                      <div className="relative">
                        <video
                          ref={previewVideoRef}
                          className="w-32 h-20 rounded object-cover bg-gray-800"
                          src={`/public/share/${token}`}
                          onLoadedData={handlePreviewVideoLoad}
                          muted
                          preload="metadata"
                          data-testid="scrub-preview-video"
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-20 rounded" />
                      </div>
                      <div className="text-white text-xs text-center mt-1 font-mono">
                        {formatTime(scrubPreviewTime)}
                      </div>
                      {/* Arrow pointing down */}
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-600" />
                    </div>
                  </div>
                )}
                
                <div className="flex items-center space-x-4">
                  <Button
                    onClick={togglePlay}
                    variant="ghost"
                    size="icon"
                    className="text-neutral-600 hover:text-neutral-900 dark:text-gray-400 dark:hover:text-white"
                    data-testid="play-pause-button"
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
                  
                  {/* Progress bar and markers container */}
                  <div className="flex-grow flex flex-col gap-1 mx-4">
                    {/* Progress bar */}
                    <div
                      ref={progressRef}
                      className="video-progress relative h-3 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 cursor-pointer rounded-full group border border-gray-400 dark:border-gray-500"
                      onClick={handleProgressClick}
                      onMouseMove={(e) => {
                        if (!progressRef.current || isDragging) return;
                        
                        const rect = progressRef.current.getBoundingClientRect();
                        // Use pixel-based positioning for preview extension
                        const leftPx = e.clientX - rect.left;
                        const pos = leftPx / rect.width; // Don't clamp - allow beyond 0-1
                        const hoverTime = Math.max(0, Math.min(duration, duration * pos)); // Only clamp time
                        
                        setScrubPreviewTime(hoverTime);
                        setScrubPreviewLeftPx(leftPx); // Store pixel position
                        setShowScrubPreview(true);
                        
                        if (previewVideoRef.current && duration > 0) {
                          previewVideoRef.current.currentTime = hoverTime;
                        }
                      }}
                      onMouseLeave={handleProgressLeave}
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
                  
                  {/* Comment markers rail */}
                  <div className="relative h-5 overflow-visible pointer-events-none" aria-hidden="true">
                    {duration > 0 && comments && comments.length > 0 && comments.map((comment: UnifiedComment) => {
                      // Only show markers for comments with timestamps (not replies)
                      if (comment.parentId !== null && comment.parentId !== undefined) return null;
                      if (comment.timestamp === null || comment.timestamp === undefined) return null;
                      
                      // Calculate percentage position - safely handle divide by zero
                      const timestamp = comment.timestamp || 0;
                      const position = duration > 0 ? (timestamp / duration) * 100 : 0;
                      
                      // Skip markers that would be off the timeline
                      if (position < 0 || position > 100) return null;
                      
                      return (
                        <div 
                          key={comment.id}
                          className="absolute -top-1 z-10 pointer-events-auto cursor-pointer"
                          style={{ 
                            left: `${position}%`, 
                            transform: 'translateX(-50%)'
                          }}
                          onMouseEnter={(e) => {
                            setHoveredComment(comment.id);
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltipPosition({
                              x: rect.left + rect.width / 2,
                              y: rect.top - 10
                            });
                          }}
                          onMouseLeave={() => {
                            setHoveredComment(null);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Jump to timestamp
                            const mediaElement = videoRef.current || audioRef.current;
                            if (mediaElement && comment.timestamp !== null) {
                              mediaElement.currentTime = comment.timestamp;
                              setCurrentTime(comment.timestamp);
                            }
                          }}
                          data-testid={`comment-marker-${comment.id}`}
                        >
                          <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center text-xs font-bold text-black shadow-lg border-2 border-white">
                            {comment.authorName?.charAt(0)?.toUpperCase() || 'A'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Comment Marker Tooltip */}
                {hoveredComment && comments && (
                  (() => {
                    const comment = comments.find(c => c.id === hoveredComment);
                    if (!comment) return null;
                    
                    // Position tooltip using viewport coordinates
                    const hasActivePreview = showScrubPreview && duration > 0 && file.fileType === 'video';
                    const positionStyle = hasActivePreview ? {
                      position: 'fixed' as const,
                      left: tooltipPosition.x - 180, // Position to the left of preview
                      top: tooltipPosition.y - 80,
                      transform: 'translateY(-100%)',
                      zIndex: 60
                    } : {
                      position: 'fixed' as const,
                      left: tooltipPosition.x,
                      top: tooltipPosition.y,
                      transform: 'translate(-50%, -100%)',
                      zIndex: 60
                    };
                    
                    return (
                      <div
                        className="pointer-events-none fixed z-50"
                        style={positionStyle}
                      >
                        <div className="bg-gray-900 dark:bg-gray-800 text-white text-sm rounded-lg p-3 shadow-lg max-w-xs">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-xs font-medium">
                              {comment.authorName?.charAt(0) || 'A'}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-xs">
                                {comment.authorName || 'Anonymous'}
                              </span>
                              <span className="text-yellow-400 text-xs font-mono">
                                {comment.timestamp !== null ? formatTime(comment.timestamp) : '00:00:00:00'}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs leading-relaxed break-words">
                            {comment.content}
                          </p>
                        </div>
                        {/* Arrow pointing down */}
                        <div className="absolute left-1/2 transform -translate-x-1/2 top-full">
                          <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                        </div>
                      </div>
                    );
                  })()
                )}
                
                <div className="flex items-center">
                  <Volume2 className="h-5 w-5 text-neutral-600 dark:text-gray-400 mr-2" />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={(e) => handleVolumeChange(e.target.value)}
                    className="w-20"
                  />
                </div>
                
                {file.fileType === 'video' && (
                  <Button
                    onClick={toggleFullscreen}
                    variant="ghost"
                    size="icon"
                    className="text-neutral-600 hover:text-neutral-900 dark:text-gray-400 dark:hover:text-white"
                    title="Toggle fullscreen"
                  >
                    <Maximize className="h-5 w-5" />
                  </Button>
                )}
                </div>
              </div>
            )}
              </CardContent>
            </Card>
          </div>

          {/* Comments Section - Takes 1/4 of space on large screens, hidden in view-only mode */}
          {!isViewOnly && (
            <div className="lg:col-span-1 h-full">
              <div className="h-full flex flex-col bg-[#1e1e1e] rounded-lg overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium text-white">All comments</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-white hover:bg-gray-700">
                      <Search className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-white hover:bg-gray-700">
                      <Filter className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-white hover:bg-gray-700">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Comments List */}
                <div className="flex-1 overflow-y-auto">
                  <CommentsList token={token!} onTimestampClick={seekToTimestamp} />
                </div>

                {/* Comment Input at Bottom */}
                <div className="border-t border-gray-700 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-amber-400 font-mono text-xs">
                      {formatTime(currentTime)}
                    </span>
                    <span className="text-gray-400 text-xs">Leave your comment...</span>
                  </div>
                  <PublicCommentForm token={token!} fileId={file.id} currentTime={currentTime} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Public Comment Form Component
function PublicCommentForm({ token, fileId, currentTime }: { token: string; fileId: number; currentTime: number }) {
  const { toast } = useToast();
  
  // Load saved name from localStorage
  const savedName = typeof window !== 'undefined' ? localStorage.getItem('public-commenter-name') || '' : '';
  
  const form = useForm<z.infer<typeof insertPublicCommentSchema>>({
    resolver: zodResolver(insertPublicCommentSchema),
    defaultValues: {
      displayName: savedName,
      content: "",
      fileId: fileId,
      timestamp: Math.floor(currentTime), // Always include current time
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertPublicCommentSchema>) => {
      return await apiRequest("POST", `/api/share/${token}/comments`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/share', token, 'comments'] });
      form.reset();
      toast({
        title: "Comment posted!",
        description: "Your comment has been added to the discussion.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error posting comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof insertPublicCommentSchema>) => {
    // Save name to localStorage for future comments
    if (typeof window !== 'undefined' && data.displayName) {
      localStorage.setItem('public-commenter-name', data.displayName);
    }
    
    // Always attach current time
    const dataWithTime = {
      ...data,
      timestamp: Math.floor(currentTime)
    };
    createCommentMutation.mutate(dataWithTime);
  };

  return (
    <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
      <h3 className="font-semibold mb-4">Leave a comment</h3>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Your Name</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Enter your name" 
                    {...field} 
                    data-testid="input-name"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Comment</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="Share your thoughts..." 
                    className="min-h-[100px]" 
                    {...field}
                    data-testid="textarea-comment"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
            <Clock className="h-4 w-4" />
            <span>Comment will be posted at {formatTime(currentTime)}</span>
          </div>

          <Button 
            type="submit" 
            disabled={createCommentMutation.isPending}
            data-testid="button-submit-comment"
          >
            {createCommentMutation.isPending ? "Posting..." : "Post Comment"}
          </Button>
        </form>
      </Form>
    </div>
  );
}


// Comments List Component
function CommentsList({ token, onTimestampClick }: { token: string; onTimestampClick?: (timestamp: number) => void }) {
  const { data: comments, isLoading, error } = useQuery<UnifiedComment[]>({
    queryKey: ['/api/share', token, 'comments'],
    queryFn: async () => {
      const response = await fetch(`/api/share/${token}/comments`);
      if (!response.ok) {
        throw new Error('Failed to fetch comments');
      }
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin h-6 w-6 border-2 border-gray-400 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/20 text-red-400 text-sm">
        Error loading comments: {error.message}
      </div>
    );
  }

  if (!comments || comments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MessageSquare className="h-12 w-12 text-gray-600 mb-3" />
        <p className="text-gray-400 text-sm">No comments yet</p>
        <p className="text-gray-500 text-xs">Be the first to comment!</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-700" data-testid="comments-list">
      {comments.map((comment, index) => (
        <div 
          key={comment.id} 
          onClick={comment.timestamp !== null ? () => onTimestampClick?.(comment.timestamp!) : undefined}
          onKeyDown={comment.timestamp !== null ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onTimestampClick?.(comment.timestamp!);
            }
          } : undefined}
          className={`p-4 hover:bg-gray-800/50 transition-colors ${comment.timestamp !== null ? 'cursor-pointer' : ''}`}
          title={comment.timestamp !== null ? `Jump to ${formatTime(comment.timestamp!)} in the video` : undefined}
          role={comment.timestamp !== null ? 'button' : undefined}
          tabIndex={comment.timestamp !== null ? 0 : undefined}
          data-testid={`comment-${comment.id}`}
        >
          <div className="flex gap-3">
            {/* Avatar */}
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarImage src={undefined} />
              <AvatarFallback className="bg-gray-600 text-white text-xs">
                {getUserInitials(comment.authorName || 'A')}
              </AvatarFallback>
            </Avatar>

            {/* Comment Content */}
            <div className="flex-1 min-w-0">
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">
                    {comment.authorName || 'Anonymous'}
                  </span>
                  <span className="text-xs text-gray-400">
                    #{index + 1}
                  </span>
                  <div className="w-1 h-1 bg-gray-500 rounded-full"></div>
                  <span className="text-xs text-gray-400">
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Timestamp */}
              {comment.timestamp !== null && (
                <span
                  className="inline-block mb-2 text-amber-400 font-mono text-sm"
                  data-testid={`timestamp-${comment.id}`}
                >
                  {formatTime(comment.timestamp)}
                </span>
              )}

              {/* Comment Text */}
              <div className="text-sm text-gray-200 mb-3 whitespace-pre-wrap">
                {comment.content.length > 100 ? (
                  <>
                    {comment.content.substring(0, 100)}...
                    <button 
                      className="text-blue-400 hover:text-blue-300 ml-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Read more
                    </button>
                  </>
                ) : (
                  comment.content
                )}
              </div>

              {/* Reply Button */}
              <button 
                className="text-xs text-gray-400 hover:text-white transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                Reply
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}