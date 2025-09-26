import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useParams } from "wouter";
import { AlertCircle, Maximize, Pause, Play, Volume2, MessageCircle, Clock, MessageSquare, MoreHorizontal, Filter, Search, Send, X, FileVideo, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { insertCommentsUnifiedSchema, type UnifiedComment } from "@shared/schema";
import { z } from "zod";

// Schema for request changes form
const requestChangesSchema = z.object({
  requesterName: z.string().min(1, "Name is required"),
  requesterEmail: z.string().email("Valid email is required"),
});

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
  const { toast } = useToast();
  
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
  const [scrubPreviewLeft, setScrubPreviewLeft] = useState(0);
  const [scrubPreviewTop, setScrubPreviewTop] = useState(0);
  const [hoveredComment, setHoveredComment] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [isRequestChangesOpen, setIsRequestChangesOpen] = useState(false);
  
  // Sprite scrubbing state for shared links
  const [spriteMetadata, setSpriteMetadata] = useState<any>(null);
  const [spriteLoaded, setSpriteLoaded] = useState(false);
  
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

  // Fetch video processing data for proxy versions (for shared files)
  const { data: videoProcessing } = useQuery({
    queryKey: ['/api/share', token, 'processing'],
    queryFn: async () => {
      // For shared files, we need to check if processing is available via a different endpoint
      // This will require server-side support for shared file processing data
      const response = await fetch(`/api/share/${token}/processing`);
      if (!response.ok) {
        return null; // Return null if processing data not available for shared files
      }
      return response.json();
    },
    enabled: !!token && !!file && file.fileType === 'video',
    retry: false
  });

  // Load sprite metadata for shared video files
  useEffect(() => {
    if (file && file.fileType === 'video' && videoProcessing?.status === 'completed') {
      fetch(`/api/share/${token}/sprite-metadata`)
        .then(res => res.ok ? res.json() : null)
        .then(metadata => {
          if (metadata) {
            setSpriteMetadata(metadata);
            console.log(`🎬 [SHARE-SPRITE] Loaded metadata for shared file ${file.id}:`, metadata);
          }
        })
        .catch(err => console.warn(`🎬 [SHARE-SPRITE] Failed to load metadata for shared file ${file.id}:`, err));
    } else {
      setSpriteMetadata(null);
      setSpriteLoaded(false);
    }
  }, [file?.id, file?.fileType, videoProcessing?.status, token]);

  // Request changes form
  const requestChangesForm = useForm<z.infer<typeof requestChangesSchema>>({
    resolver: zodResolver(requestChangesSchema),
    defaultValues: {
      requesterName: "",
      requesterEmail: "",
    },
  });

  // Request changes mutation
  const requestChangesMutation = useMutation({
    mutationFn: (data: z.infer<typeof requestChangesSchema>) => {
      return apiRequest('POST', `/api/share/${token}/request-changes`, data);
    },
    onSuccess: () => {
      toast({
        title: "Changes requested",
        description: "Your request has been sent successfully. Project members will be notified via email."
      });
      setIsRequestChangesOpen(false);
      requestChangesForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to request changes",
        description: error.message,
        variant: "destructive"
      });
    }
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
          
          // Position preview using viewport coordinates
          const progressRect = progressRef.current.getBoundingClientRect();
          const previewWidth = 208;
          const previewHeight = 150;
          const desiredLeft = e.clientX - previewWidth / 2;
          const left = Math.max(8, Math.min(window.innerWidth - previewWidth - 8, desiredLeft));
          const top = progressRect.top - previewHeight - 12;
          
          setScrubPreviewLeft(left);
          setScrubPreviewTop(top);
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
  
  // Keyboard controls for play/pause (matching authenticated player)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Check if the active element is not an input field or textarea
      const activeElement = document.activeElement;
      const isInput = activeElement instanceof HTMLInputElement || 
                      activeElement instanceof HTMLTextAreaElement || 
                      activeElement instanceof HTMLSelectElement;
      
      if (isInput) return;
      
      const mediaElement = videoRef.current || audioRef.current;
      if (!mediaElement || mediaError || !file) return;
      
      switch (e.code) {
        case 'Space':
          e.preventDefault(); // Prevent scrolling the page
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          // Skip back 5 seconds (or 1 second with Shift)
          const backwardSkip = e.shiftKey ? 1 : 5;
          const newBackTime = Math.max(0, currentTime - backwardSkip);
          performSeek(newBackTime);
          setCurrentTime(newBackTime);
          break;
        case 'ArrowRight':
          e.preventDefault();
          // Skip forward 5 seconds (or 1 second with Shift)
          const forwardSkip = e.shiftKey ? 1 : 5;
          const newForwardTime = Math.min(duration, currentTime + forwardSkip);
          performSeek(newForwardTime);
          setCurrentTime(newForwardTime);
          break;
      }
    };
    
    document.addEventListener('keydown', handleKeyPress);
    
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [isPlaying, mediaError, file, togglePlay, currentTime, duration]);
  
  // Handle progress bar hover for scrub preview
  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || isDragging) return;
    
    const rect = progressRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const hoverTime = duration * pos;
    
    setScrubPreviewTime(hoverTime);
    
    // Position preview using viewport coordinates  
    const previewWidth = 208;
    const previewHeight = 150;
    const desiredLeft = e.clientX - previewWidth / 2;
    const left = Math.max(8, Math.min(window.innerWidth - previewWidth - 8, desiredLeft));
    const top = rect.top - previewHeight - 12;
    
    setScrubPreviewLeft(left);
    setScrubPreviewTop(top);
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col w-full">
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
          
          {/* Request Changes Button - Only show when comments are allowed */}
          {!isViewOnly && (
            <Dialog open={isRequestChangesOpen} onOpenChange={setIsRequestChangesOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline"
                  className="bg-red-500 border-red-500 text-white hover:bg-red-600 hover:border-red-600"
                  data-testid="request-changes-button"
                >
                  Request Changes
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Request Changes</DialogTitle>
                </DialogHeader>
                <Form {...requestChangesForm}>
                  <form onSubmit={requestChangesForm.handleSubmit((data) => requestChangesMutation.mutate(data))} className="space-y-4">
                    <FormField
                      control={requestChangesForm.control}
                      name="requesterName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter your full name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={requestChangesForm.control}
                      name="requesterEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="Enter your email address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsRequestChangesOpen(false)}
                        disabled={requestChangesMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="bg-red-500 hover:bg-red-600"
                        disabled={requestChangesMutation.isPending}
                        data-testid="submit-request-changes"
                      >
                        {requestChangesMutation.isPending ? "Sending..." : "Send Request"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Main content area - fills remaining height */}
      <div className="flex-1 p-2 sm:p-4 pb-20" style={{ minHeight: 'calc(100vh - 200px)' }}>
        {/* Flexbox layout: single column when view-only, two columns when comments enabled */}
        <div className={cn("flex gap-2 sm:gap-4", isViewOnly ? "flex-col" : "flex-col lg:flex-row")} style={{ minHeight: 'calc(100vh - 250px)' }}>
          {/* Media Player - Full width when view-only, 66% when comments shown */}
          <div className={cn("flex-1", !isViewOnly && "lg:w-2/3")}>
            <Card className="h-full flex flex-col w-full">
              <CardContent className="flex-1 flex flex-col p-2">
                {/* Video container - fills available space */}
                <div ref={mediaContainerRef} className="relative rounded-lg overflow-hidden w-full flex-1">
              {!mediaError ? (
                <>
                  {file.fileType === 'video' && (
                    <video
                      ref={videoRef}
                      className="w-full h-full object-contain"
                      onTimeUpdate={handleTimeUpdate}
                      onDurationChange={handleDurationChange}
                      onPlay={handlePlay}
                      onPause={handlePause}
                      onError={handleMediaError}
                      preload="metadata"
                      data-testid="shared-video-player"
                    >
                      {/* Use 720p proxy for shared files when available */}
                      {videoProcessing?.status === 'completed' && 
                       videoProcessing.qualities?.some((q: any) => q.resolution === '720p') && (
                        <source src={`/api/share/${token}/qualities/720p`} type="video/mp4" />
                      )}
                      {/* Always include original shared file as fallback */}
                      <source src={`/public/share/${token}`} type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>
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
              <div className="mt-4 p-4 bg-neutral-50 dark:bg-gray-800 rounded-lg">
                
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
                    {/* Extended hover area around progress bar */}
                    <div
                      className="relative py-4 cursor-pointer"
                      onClick={handleProgressClick}
                      onMouseMove={(e) => {
                        if (!progressRef.current || isDragging) return;
                        
                        const progressRect = progressRef.current.getBoundingClientRect();
                        // Calculate viewport position for preview
                        const pos = Math.max(0, Math.min(1, (e.clientX - progressRect.left) / progressRect.width));
                        const hoverTime = duration * pos;
                        
                        // Position preview using viewport coordinates
                        const previewWidth = 208; // w-48 + padding = 192 + 16
                        const previewHeight = 150; // Approximate height
                        const desiredLeft = e.clientX - previewWidth / 2;
                        const left = Math.max(8, Math.min(window.innerWidth - previewWidth - 8, desiredLeft));
                        const top = progressRect.top - previewHeight - 12;
                        
                        setScrubPreviewTime(hoverTime);
                        setScrubPreviewLeft(left);
                        setScrubPreviewTop(top);
                        setShowScrubPreview(true);
                        
                        if (previewVideoRef.current && duration > 0) {
                          previewVideoRef.current.currentTime = hoverTime;
                        }
                      }}
                      onMouseLeave={handleProgressLeave}
                      data-testid="progress-bar-extended-area"
                    >
                      {/* Progress bar */}
                      <div
                        ref={progressRef}
                        className="video-progress relative h-3 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 cursor-pointer rounded-full group border border-gray-400 dark:border-gray-500"
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
                  
                  {/* Comment markers rail */}
                  <div className="relative h-5 overflow-visible pointer-events-none" aria-hidden="true">
                    {!isViewOnly && duration > 0 && comments && comments.length > 0 && comments.map((comment: UnifiedComment) => {
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

          {/* Comments Section - Takes 34% of space on large screens, hidden in view-only mode */}
          {!isViewOnly && (
            <div className="flex-shrink-0 h-full lg:w-1/3 w-full">
              <div className="h-full flex flex-col rounded-lg overflow-hidden" style={{ backgroundColor: 'hsl(210, 25%, 8%)' }}>
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
                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 w-full">
                  <CommentsList token={token!} onTimestampClick={seekToTimestamp} />
                </div>

                {/* Comment Input - Frame.io Style Single Element */}
                <div className="mx-3 mb-3 mt-6">
                  <div 
                    className="rounded-lg p-3 w-full max-w-none"
                    style={{
                      backgroundColor: 'hsl(210, 20%, 12%)',
                      border: '1px solid hsl(210, 15%, 18%)'
                    }}
                  >
                    <PublicCommentForm token={token!} fileId={file.id} currentTime={currentTime} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Portal-based scrub preview that can extend beyond progress bar */}
      {showScrubPreview && duration > 0 && file.fileType === 'video' && createPortal(
        <div
          ref={scrubPreviewRef}
          className="pointer-events-none z-50"
          style={{
            position: 'fixed',
            left: `${scrubPreviewLeft}px`,
            top: `${scrubPreviewTop}px`
          }}
        >
          <div className="p-2">
            <div className="relative">
              {/* Video-based scrub preview using scrub version */}
              <video
                className="w-48 h-32 rounded object-cover bg-gray-800 pointer-events-none"
                data-testid="shared-video-scrub-preview"
                src={`/api/share/${token}/scrub`}
                muted
                playsInline
                ref={(video) => {
                  if (video && !isNaN(scrubPreviewTime)) {
                    video.currentTime = scrubPreviewTime;
                  }
                }}
              />
            </div>
            <div className="text-white text-lg text-center mt-1 font-mono font-bold drop-shadow-lg px-2 py-1">
              {formatTime(scrubPreviewTime)}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Public Comment Form Component
function PublicCommentForm({ token, fileId, currentTime, parentId, onSuccess }: { 
  token: string; 
  fileId: number; 
  currentTime: number; 
  parentId?: string;
  onSuccess?: () => void;
}) {
  const { toast } = useToast();
  
  // Load saved name from localStorage
  const savedName = typeof window !== 'undefined' ? localStorage.getItem('public-commenter-name') || '' : '';
  
  const form = useForm<z.infer<typeof insertCommentsUnifiedSchema>>({
    resolver: zodResolver(insertCommentsUnifiedSchema),
    defaultValues: {
      authorName: savedName,
      content: "",
      fileId: fileId,
      parentId: parentId || undefined,
      timestamp: Math.floor(currentTime), // Always include current time
      isPublic: true,
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertCommentsUnifiedSchema>) => {
      return await apiRequest("POST", `/api/share/${token}/comments`, data);
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/share', token, 'comments'] });
      
      // Store the creatorToken in localStorage for future deletion
      if (response.creatorToken && response.id) {
        localStorage.setItem(`comment-token-${response.id}`, response.creatorToken);
      }
      
      // Get current name value before reset and preserve it
      const currentName = form.getValues('authorName');
      form.reset({
        authorName: currentName, // Preserve the name
        content: "",              // Clear only the comment content
        fileId: fileId,
        parentId: parentId || undefined,
        timestamp: Math.floor(currentTime),
        isPublic: true,
      });
      
      toast({
        title: parentId ? "Reply posted!" : "Comment posted!",
        description: parentId ? "Your reply has been added." : "Your comment has been added to the discussion.",
      });
      
      // Call the onSuccess callback if provided (for closing reply form)
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error posting comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof insertCommentsUnifiedSchema>) => {
    // Save name to localStorage for future comments
    if (typeof window !== 'undefined' && data.authorName) {
      localStorage.setItem('public-commenter-name', data.authorName);
    }
    
    // Always attach current time and parentId
    const dataWithTime = {
      ...data,
      timestamp: Math.floor(currentTime),
      parentId: parentId || undefined,
      isPublic: true,
    };
    createCommentMutation.mutate(dataWithTime);
  };

  const [content, setContent] = useState("");
  const [authorName, setAuthorName] = useState(savedName);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea function - same as main timeline comments
  const autoGrowTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  };

  // Auto-grow on content change
  useEffect(() => {
    autoGrowTextarea();
  }, [content]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !authorName.trim()) return;
    
    const data = {
      authorName: authorName.trim(),
      content: content.trim(),
      fileId,
      parentId: parentId || undefined,
      timestamp: Math.floor(currentTime),
      isPublic: true,
    };
    
    // Save name to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('public-commenter-name', authorName.trim());
    }
    
    createCommentMutation.mutate(data);
  };

  // Reset content after successful submission
  useEffect(() => {
    if (!createCommentMutation.isPending && content) {
      setContent("");
    }
  }, [createCommentMutation.isPending]);

  return (
    <form onSubmit={handleSubmit} className="w-full" data-comment-form>
      {/* Name input for public users - compact design */}
      {!parentId && (
        <div className="mb-3">
          <input
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="Your name"
            className="w-full px-3 py-2 text-sm rounded border border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            data-testid="input-name"
            required
          />
        </div>
      )}
      
      {/* Unified comment input container - Frame.io style */}
      <div className="flex items-start gap-3 w-full">
        {/* Auto-growing textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit(e);
            }
            // Prevent spacebar from triggering video controls
            if (e.key === ' ' || e.key === 'k') {
              e.stopPropagation();
            }
          }}
          placeholder={parentId ? "Write a reply..." : "Leave your comment..."}
          className="flex-1 bg-transparent text-white placeholder-gray-400 text-sm resize-none border-none outline-none min-h-[2.5rem] leading-relaxed"
          style={{ 
            fontFamily: 'inherit',
            overflow: 'hidden',
            resize: 'none'
          }}
          rows={1}
          data-testid="textarea-comment"
          required
        />
        
        {/* Submit button */}
        <button
          type="submit"
          disabled={!content.trim() || !authorName.trim() || createCommentMutation.isPending}
          className="flex-shrink-0 p-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
          data-testid="button-submit-comment"
        >
          <Send className="h-4 w-4 text-white" />
        </button>
      </div>
      
      {/* Timestamp indicator */}
      <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
        <Clock className="h-3 w-3" />
        <span>Will be posted at {formatTime(currentTime)}</span>
      </div>
    </form>
  );
}


// Comments List Component
function CommentsList({ token, onTimestampClick }: { token: string; onTimestampClick?: (timestamp: number) => void }) {
  const [replyingToId, setReplyingToId] = useState<number | null>(null);
  const { toast } = useToast();
  
  // Delete comment mutation for public comments
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      const creatorToken = localStorage.getItem(`comment-token-${commentId}`);
      return await apiRequest("DELETE", `/api/public-comments/${commentId}`, { creatorToken });
    },
    onSuccess: () => {
      toast({
        title: "Comment deleted",
        description: "Your comment has been removed.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/share', token, 'comments'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Check if user can delete a comment (based on localStorage creatorToken)
  const canDeleteComment = (commentId: number) => {
    return localStorage.getItem(`comment-token-${commentId}`) !== null;
  };

  // Handle delete comment
  const handleDeleteComment = (commentId: number) => {
    if (window.confirm("Are you sure you want to delete this comment? This action cannot be undone.")) {
      deleteCommentMutation.mutate(commentId);
    }
  };
  
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

  // Build comment threads safely with cycle detection
  const buildCommentThreads = useMemo(() => {
    if (!comments?.length) return [];
    
    // Step 1: Build a map of all comments for fast lookup
    const commentMap = new Map<number, any>();
    
    // Initialize all comments with empty children arrays
    comments.forEach((comment: any) => {
      commentMap.set(comment.id, { ...comment, children: [] });
    });
    
    // Step 2: Build parent-child relationships with cycle detection
    comments.forEach((comment: any) => {
      if (comment.parentId) {
        const parent = commentMap.get(comment.parentId);
        const child = commentMap.get(comment.id);
        
        // Check for cycles and orphaned references
        if (parent && child) {
          // Detect cycles by checking if we're trying to make an ancestor a child
          let currentParent = parent;
          let cycleDetected = false;
          let depth = 0;
          
          while (currentParent && depth < 15) {
            if (currentParent.id === comment.id) {
              cycleDetected = true;
              break;
            }
            currentParent = currentParent.parentId ? commentMap.get(currentParent.parentId) : null;
            depth++;
          }
          
          if (!cycleDetected && depth < 10) {
            parent.children.push(child);
          } else {
            // Break the cycle by making this a top-level comment
            console.warn(`Cycle detected or max depth exceeded for comment ${comment.id}, making it top-level`);
            child.parentId = null;
          }
        }
      }
    });
    
    // Step 3: Get top-level comments and sort by timestamp (timeline order)
    const topLevelComments = Array.from(commentMap.values()).filter((comment: any) => !comment.parentId);
    
    // Sort comments by timestamp - same logic as authenticated TimelineComments
    topLevelComments.sort((a: any, b: any) => {
      // If both have timestamps, sort by timestamp (timeline order)
      if (a.timestamp !== null && b.timestamp !== null) {
        return a.timestamp - b.timestamp;
      }
      // If only a has timestamp, a comes first
      if (a.timestamp !== null) return -1;
      // If only b has timestamp, b comes first  
      if (b.timestamp !== null) return 1;
      // If neither has timestamp, maintain original order
      return 0;
    });
    
    return topLevelComments;
  }, [comments]);

  // Get user initials for avatar
  const getUserInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

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


  // Recursive component to render nested replies with strict safety
  const RenderReplies = ({ comment, depth = 0, visited = new Set() }: { 
    comment: any, 
    depth?: number,
    visited?: Set<number>
  }) => {
    // Safety check - ensure comment exists
    if (!comment || !comment.id) {
      console.warn('RenderReplies: comment is undefined or missing id');
      return null;
    }

    // Prevent infinite loops with multiple safety checks
    if (depth > 10 || visited.has(comment.id)) {
      console.warn(`Cycle or max depth detected for comment ${comment.id} at depth ${depth}`);
      return null;
    }
    
    // Add to visited set for this render path
    const newVisited = new Set(visited);
    newVisited.add(comment.id);
    
    return (
      <div key={comment.id}>
        <div 
          className="rounded-lg p-3"
          style={{
            backgroundColor: 'hsl(210, 20%, 12%)',
            border: '1px solid hsl(210, 15%, 18%)'
          }}
        >
        <div className="flex gap-3">
          <Avatar className="h-6 w-6 flex-shrink-0">
            <AvatarImage src={undefined} />
            <AvatarFallback className="bg-gray-600 text-white text-xs">
              {getUserInitials(comment.authorName || 'A')}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-white">
                {comment.authorName || 'Anonymous'}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(comment.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="text-xs text-gray-200 mb-2">
              {comment.content}
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button 
                className="text-xs text-gray-400 hover:text-white transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setReplyingToId(replyingToId === comment.id ? null : comment.id);
                }}
              >
                Reply
              </button>
              
              {canDeleteComment(comment) && (
                <button
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm("Are you sure you want to delete this comment?")) {
                      deleteCommentMutation.mutate(comment.id);
                    }
                  }}
                  disabled={deleteCommentMutation.isPending}
                >
                  <Trash2 className="h-3 w-3 inline mr-1" />
                  Delete
                </button>
              )}
            </div>

            {/* Reply Form */}
            {replyingToId === comment.id && (
              <div className="mt-3">
                <div 
                  className="rounded-lg p-3"
                  style={{
                    backgroundColor: 'hsl(210, 20%, 12%)',
                    border: '1px solid hsl(210, 15%, 18%)'
                  }}
                >
                  <PublicCommentForm 
                    token={token} 
                    fileId={comment.fileId} 
                    currentTime={comment.timestamp || 0}
                    parentId={comment.id}
                    onSuccess={() => setReplyingToId(null)}
                  />
                </div>
              </div>
            )}

            {/* Render children recursively with safety checks */}
            {comment.children?.length > 0 && (
              <div className="mt-3 ml-4 pl-4 border-l border-gray-600 space-y-3">
                {comment.children.map((child: any) => (
                  <RenderReplies 
                    key={child.id}
                    comment={child} 
                    depth={depth + 1} 
                    visited={newVisited}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    );
  };

  // Filter for top-level comments only (no parent)
  const topLevelComments = buildCommentThreads;

  return (
    <div className="space-y-3 w-full max-w-none" data-testid="comments-list">
      {topLevelComments.map((comment: any, index: number) => (
        <div 
          key={comment.id} 
          onClick={comment.timestamp !== null ? () => onTimestampClick?.(comment.timestamp!) : undefined}
          onKeyDown={comment.timestamp !== null ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onTimestampClick?.(comment.timestamp!);
            }
          } : undefined}
          className={`rounded-lg p-4 transition-colors ${comment.timestamp !== null ? 'cursor-pointer hover:opacity-80' : ''}`}
          style={{
            backgroundColor: 'hsl(210, 20%, 12%)',
            border: '1px solid hsl(210, 15%, 18%)'
          }}
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

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                <button 
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setReplyingToId(replyingToId === comment.id ? null : comment.id);
                  }}
                >
                  {replyingToId === comment.id ? "Cancel Reply" : "Reply"}
                </button>
                
                {canDeleteComment(comment.id) && (
                  <button 
                    className="text-xs text-gray-400 hover:text-red-400 transition-colors flex items-center gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteComment(comment.id);
                    }}
                    disabled={deleteCommentMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                )}
              </div>

              {/* Reply Form */}
              {replyingToId === comment.id && (
                <div className="mt-3">
                  <div 
                    className="rounded-lg p-3"
                    style={{
                      backgroundColor: 'hsl(210, 20%, 12%)',
                      border: '1px solid hsl(210, 15%, 18%)'
                    }}
                  >
                    <PublicCommentForm 
                      token={token} 
                      fileId={comment.fileId} 
                      currentTime={comment.timestamp || 0}
                      parentId={comment.id}
                      onSuccess={() => setReplyingToId(null)}
                    />
                  </div>
                </div>
              )}

              {/* Nested Replies - Render children with cycle-safe recursion */}
              {comment.children?.length > 0 && (
                <div className="mt-3 ml-4 pl-4 border-l border-gray-600 space-y-3">
                  {comment.children.map((child: any) => (
                    <RenderReplies 
                      key={child.id}
                      comment={child} 
                      depth={1} 
                      visited={new Set()}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}