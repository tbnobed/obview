import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, Layers, Maximize, Pause, Play, Volume2, File, FileVideo, ClipboardCheck, Loader2, Upload, X, Image as ImageIcon, ChevronDown, Share2 } from "lucide-react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
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
  
  // Find user's approval (if any)
  const userApproval = approvals && approvals.length > 0 ? approvals[0] : null;

  // Approval mutation
  const approveMutation = useMutation({
    mutationFn: async ({ fileId, status }: { fileId: number, status: string }) => {
      // Use direct fetch here instead of apiRequest to have full control over the response handling
      const response = await fetch(`/api/files/${fileId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to update approval status';
        try {
          const errorText = await response.text();
          if (errorText) {
            try {
              const errorJson = JSON.parse(errorText);
              errorMessage = errorJson.message || errorMessage;
            } catch (e) {
              errorMessage = errorText;
            }
          }
        } catch (e) {
          console.error('Error reading error response:', e);
        }
        throw new Error(errorMessage);
      }
      
      // Safely parse JSON response or return empty object if parsing fails
      try {
        const text = await response.text();
        return text ? JSON.parse(text) : {};
      } catch (e) {
        console.error('Error parsing response:', e);
        return {};
      }
    },
    onSuccess: () => {
      // Invalidate approvals query to update the file approval status
      queryClient.invalidateQueries({ queryKey: ['/api/files', file?.id, 'approvals'] });
      
      // Also invalidate project query to update project badge status
      if (file?.projectId) {
        // Invalidate specific project
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${file.projectId}`] });
        // Also invalidate the projects list
        queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      }
      
      toast({
        title: "File approval updated",
        description: "Your approval status has been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating approval",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleApprove = () => {
    if (!file) return;
    approveMutation.mutate({ fileId: file.id, status: 'approved' });
  };

  const handleRequestChanges = () => {
    if (!file) return;
    approveMutation.mutate({ fileId: file.id, status: 'changes_requested' });
  };
  
  // Project status update mutation
  const updateProjectStatusMutation = useMutation({
    mutationFn: async ({ projectId, status }: { projectId: number, status: string }) => {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
        credentials: 'include',
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to update project status';
        try {
          const errorData = await response.json();
          if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch (e) {
          // If we can't parse the JSON, just use the default error message
        }
        throw new Error(errorMessage);
      }
      
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Project marked as In Review",
        description: "Project status has been updated successfully",
      });
      
      // Invalidate queries to update the UI without a full page refresh
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update project status",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsUpdatingStatus(false);
    },
  });
  
  // Function to update project status to "In Review"
  const handleMarkAsInReview = () => {
    if (!project || !projectId || project.status === 'in_review' || project.status === 'approved') return;
    
    setIsUpdatingStatus(true);
    updateProjectStatusMutation.mutate({ projectId, status: 'in_review' });
  };

  useEffect(() => {
    // Reset media error when file changes
    setMediaError(false);
    setErrorMessage("");
    
    // Reset video state
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    
    // Reset active comment 
    setActiveCommentId(undefined);

    // If there's a video/audio element, load the content manually
    if (file && file.isAvailable !== false) {
      // Debug information about file URL 
      const fileUrl = `/api/files/${file.id}/content`;
      console.log(`[DEBUG] File URL: ${fileUrl}`);
      
      // Use HEAD request to check if the file is accessible without loading the entire file
      const checkFileAvailability = async () => {
        try {
          // Only check headers to avoid double-downloading large files
          const headResponse = await fetch(fileUrl, { 
            method: 'HEAD',
            credentials: 'include' 
          });
          
          console.log(`[DEBUG] File HEAD check status: ${headResponse.status} ${headResponse.statusText}`);
          
          if (!headResponse.ok) {
            console.error(`[DEBUG] Failed to load file: ${headResponse.status} ${headResponse.statusText}`);
            setMediaError(true);
            setErrorMessage(`Error loading file: ${headResponse.status} ${headResponse.statusText}`);
            return false;
          }
          
          return true;
        } catch (error) {
          console.error('[DEBUG] Error checking file availability:', error);
          setMediaError(true);
          setErrorMessage(`Error loading file: ${error instanceof Error ? error.message : 'Unknown error'}`);
          return false;
        }
      };
      
      // Check file availability then load media if available
      checkFileAvailability().then(isAvailable => {
        if (isAvailable) {
          console.log("[DEBUG] File is available, loading media elements");
          if (videoRef.current) {
            videoRef.current.load();
          }
          if (audioRef.current) {
            audioRef.current.load();
          }
          console.log("Loading media for file:", file.filename, "type:", file.fileType);
        }
      });
    }
  }, [file?.id]);

  // Handle file selection for version upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedVersionFile(e.target.files[0]);
    }
  };
  
  // Handle version upload
  const handleVersionUpload = () => {
    if (!selectedVersionFile || !file || !projectId) return;
    
    // Use the original filename to ensure it's treated as a version
    uploadService.uploadFile(selectedVersionFile, projectId, file.filename);
    
    // Close dialog and reset state
    setIsVersionDialogOpen(false);
    setSelectedVersionFile(null);
    
    // Show toast
    toast({
      title: "Upload started",
      description: "Your new version is being uploaded. You can track progress in the uploads panel.",
    });
  };
  
  // Open file browser dialog
  const openFileBrowser = () => {
    fileInputRef.current?.click();
  };
  
  // Handle fullscreen
  const toggleFullscreen = () => {
    if (!mediaContainerRef.current) return;
    
    if (!document.fullscreenElement) {
      mediaContainerRef.current.requestFullscreen().catch(err => {
        toast({
          title: "Fullscreen error",
          description: `Error attempting to enable fullscreen: ${err.message}`,
          variant: "destructive",
        });
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
      // Perform immediate seek
      mediaElement.currentTime = time;
      lastSeekTimeRef.current = now;
      setSeekingToTime(null);
    } else {
      // Schedule delayed seek
      setSeekingToTime(time);
      seekThrottleRef.current = setTimeout(() => {
        mediaElement.currentTime = time;
        lastSeekTimeRef.current = Date.now();
        setSeekingToTime(null);
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
  
  // Define togglePlay before it's used in useEffect hooks
  const togglePlay = () => {
    // Handle both video and audio playback
    const mediaElement = videoRef.current || audioRef.current;
    
    if (!mediaElement) return;
    
    if (isPlaying) {
      // Pause is always safe to call
      mediaElement.pause();
      setIsPlaying(false);
    } else {
      // Use the Promise returned by play() to catch any autoplay restrictions
      const playPromise = mediaElement.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
          })
          .catch(error => {
            console.error("Error playing media:", error);
            // Don't show error toast for user gesture errors (common with autoplay restrictions)
            setIsPlaying(false);
            
            toast({
              title: "Playback issue",
              description: "Unable to play media. Click the play button again or check browser autoplay settings.",
              variant: "destructive",
            });
          });
      } else {
        // For older browsers that don't return a promise
        setIsPlaying(true);
      }
    }
  };
  
  // Enhanced keyboard controls - only when media container is focused
  
  const handleMediaKeyPress = (e: React.KeyboardEvent) => {
    // Check if target is an editable element
    const target = e.target as HTMLElement;
    if (target instanceof HTMLInputElement || 
        target instanceof HTMLTextAreaElement || 
        target instanceof HTMLSelectElement ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'INPUT' ||
        target.contentEditable === 'true') {
      return;
    }
    
    const mediaElement = videoRef.current || audioRef.current;
    if (!mediaElement || mediaError || !file) return;
    
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        const backwardSkip = e.shiftKey ? 1 : 5;
        const newBackTime = Math.max(0, currentTime - backwardSkip);
        performSeek(newBackTime);
        setCurrentTime(newBackTime);
        break;
      case 'ArrowRight':
        e.preventDefault();
        const forwardSkip = e.shiftKey ? 1 : 5;
        const newForwardTime = Math.min(duration, currentTime + forwardSkip);
        performSeek(newForwardTime);
        setCurrentTime(newForwardTime);
        break;
      case 'Home':
        e.preventDefault();
        performSeek(0);
        setCurrentTime(0);
        break;
      case 'End':
        e.preventDefault();
        performSeek(duration);
        setCurrentTime(duration);
        break;
      case 'Comma':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const frameBackTime = Math.max(0, currentTime - (1/30));
          performSeek(frameBackTime);
          setCurrentTime(frameBackTime);
        }
        break;
      case 'Period':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const frameForwardTime = Math.min(duration, currentTime + (1/30));
          performSeek(frameForwardTime);
          setCurrentTime(frameForwardTime);
        }
        break;
      case 'KeyJ':
        e.preventDefault();
        const rewindTime = Math.max(0, currentTime - 10);
        performSeek(rewindTime);
        setCurrentTime(rewindTime);
        break;
      case 'KeyL':
        e.preventDefault();
        const fastForwardTime = Math.min(duration, currentTime + 10);
        performSeek(fastForwardTime);
        setCurrentTime(fastForwardTime);
        break;
      case 'KeyK':
        e.preventDefault();
        togglePlay();
        break;
    }
  };

  const handleVolumeChange = (value: string) => {
    const newVolume = parseFloat(value);
    setVolume(newVolume);
    
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    } else if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current) return;
    
    const rect = progressRef.current.getBoundingClientRect();
    // Constrain position between 0 and 1 for safety (in case cursor is outside element)
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = duration * pos;
    
    setCurrentTime(newTime);
    
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    } else if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  // Format time (HH:MM:SS)
  const formatTime = (time: number) => {
    if (time == null || isNaN(time)) return '00:00:00';
    
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Handle media events
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
    setCurrentTime(e.currentTarget.currentTime);
  };

  const handleDurationChange = (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
    setDuration(e.currentTarget.duration);
  };

  const handleMediaEnded = () => {
    setIsPlaying(false);
  };

  const handleMediaError = (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement | HTMLImageElement | HTMLIFrameElement>) => {
    console.error('[DEBUG] Media error event:', e);
    console.error('[DEBUG] Media error target src:', (e.target as any)?.src);
    console.error('[DEBUG] Media error target currentSrc:', (e.target as any)?.currentSrc);
    console.error('[DEBUG] Network state:', (e.target as any)?.networkState);
    console.error('[DEBUG] Ready state:', (e.target as any)?.readyState);
    
    // Try to get more detailed error info from video/audio elements
    const mediaElement = e.target as HTMLVideoElement | HTMLAudioElement;
    if (mediaElement && 'error' in mediaElement && mediaElement.error) {
      console.error('[DEBUG] Media element error details:', {
        code: mediaElement.error.code,
        message: mediaElement.error.message
      });
      
      // Map error codes to user-friendly messages
      let userMessage = "This file is no longer available. It may have been deleted from the server.";
      switch (mediaElement.error.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          userMessage = "Video playback was aborted. Please try again.";
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          userMessage = "Network error while loading the video. Please check your connection.";
          break;
        case MediaError.MEDIA_ERR_DECODE:
          userMessage = "Video format is not supported or file is corrupted.";
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          userMessage = "Video format is not supported by your browser.";
          break;
        default:
          userMessage = `Media error (code: ${mediaElement.error.code}). Please try refreshing the page.`;
      }
      setErrorMessage(userMessage);
    } else {
      setErrorMessage("This file is no longer available. It may have been deleted from the server.");
    }
    
    setMediaError(true);
    setIsPlaying(false);
  };
  
  // Handle preview video load
  const handlePreviewVideoLoad = () => {
    if (previewVideoRef.current && videoRef.current) {
      // Sync preview video with main video when loaded
      previewVideoRef.current.currentTime = videoRef.current.currentTime;
    }
  };

  // Render appropriate media content based on file type
  const renderMediaContent = () => {
    if (!file) {
      return (
        <div className="flex items-center justify-center h-full bg-neutral-900 text-white">
          <div className="text-center p-8">
            <File className="h-12 w-12 mx-auto mb-4 text-neutral-400" />
            <h3 className="text-xl font-medium">No file selected</h3>
            <p className="text-neutral-400 mt-2">Select a file to view</p>
          </div>
        </div>
      );
    }

    // Check if file is marked as unavailable in the database
    if (file.isAvailable === false || mediaError) {
      return (
        <div className="flex items-center justify-center h-full bg-neutral-900 text-white">
          <div className="text-center p-8 max-w-md">
            <div className="bg-red-900/30 p-6 rounded-lg">
              <File className="h-12 w-12 mx-auto mb-4 text-red-400" />
              <h3 className="text-xl font-medium text-red-400">File Not Available</h3>
              <p className="text-neutral-300 mt-2">{errorMessage || "This file is no longer available. It may have been deleted from the server."}</p>
              <p className="text-neutral-400 mt-4 text-sm">{file.filename}</p>
              <p className="text-neutral-500 mt-2 text-sm">The comments and feedback for this file are still available.</p>
            </div>
          </div>
        </div>
      );
    }

    // Determine file type by extension if MIME type detection fails
    const fileExt = file.filename.split('.').pop()?.toLowerCase();
    const fileType = file.fileType.toLowerCase();
    
    // Image files
    if (fileType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(fileExt || '')) {
      return (
        <div className="flex items-center justify-center h-full bg-neutral-900">
          <img
            src={`/api/files/${file.id}/content`}
            alt={file.filename}
            className="max-h-full max-w-full object-contain"
            onError={handleMediaError}
          />
        </div>
      );
    } 
    // Video files
    else if (fileType.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(fileExt || '')) {
      return (
        <div
          ref={mediaContainerRef}
          className="relative w-full h-full bg-black"
          tabIndex={0}
          onKeyDown={handleMediaKeyPress}
        >
          {/* Fullscreen controls overlay - only visible in fullscreen mode */}
          {isFullscreen && (
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 p-4 z-10 flex items-center space-x-2">
              <Button
                onClick={togglePlay}
                variant="ghost"
                size="icon"
                className="text-white hover:text-[#026d55]"
              >
                {isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6" />
                )}
              </Button>
              
              <span className="font-mono text-sm text-white">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              
              <div
                className="video-progress flex-grow mx-4 relative h-2 bg-gray-700 hover:bg-gray-600 cursor-pointer rounded-full group"
                onClick={handleProgressClick}
              >
                <div
                  className="video-progress-fill absolute top-0 left-0 h-full bg-[#026d55] rounded-full"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                ></div>
                <div
                  className="playhead absolute top-1/2 -translate-y-1/2 h-4 w-4 bg-[#026d55] rounded-full shadow-md -ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                ></div>
              </div>
              
              <div className="flex items-center">
                <Volume2 className="h-5 w-5 text-white mr-2" />
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
              
              <Button
                onClick={toggleFullscreen}
                variant="ghost"
                size="icon"
                className="text-white hover:text-[#026d55]"
                title="Exit fullscreen"
              >
                <Maximize className="h-5 w-5" />
              </Button>
            </div>
          )}
          
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-contain bg-black"
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onEnded={handleMediaEnded}
            onError={handleMediaError}
            autoPlay={false}
            controls={false}
            preload="metadata"
          >
            {/* Use 720p proxy when available for better performance, fallback to original */}
            {(() => {
              // Check if 720p proxy is available and processing completed
              const has720p = videoProcessing?.status === 'completed' && 
                            videoProcessing.qualities?.some((q: any) => q.resolution === '720p');
              
              const mimeType = file.fileType.startsWith('video/') 
                ? file.fileType 
                : file.filename.toLowerCase().endsWith('.mp4') 
                  ? 'video/mp4' 
                  : file.filename.toLowerCase().endsWith('.webm') 
                    ? 'video/webm'
                    : 'video/mp4';

              return (
                <>
                  {/* Use 720p proxy if available */}
                  {has720p && (
                    <source src={`/api/files/${file.id}/qualities/720p`} type="video/mp4" />
                  )}
                  {/* Always include original as fallback */}
                  <source src={`/api/files/${file.id}/content`} type={mimeType} />
                </>
              );
            })()} 
            Your browser does not support the video tag.
          </video>
        </div>
      );
    } 
    // Audio files
    else if (fileType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(fileExt || '')) {
      return (
        <div
          ref={mediaContainerRef}
          className="flex flex-col items-center justify-center h-full bg-neutral-900 text-white"
          tabIndex={0}
          onKeyDown={handleMediaKeyPress}
        >
          {/* Fullscreen controls overlay - only visible in fullscreen mode */}
          {isFullscreen && (
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 p-4 z-10 flex items-center space-x-2">
              <Button
                onClick={togglePlay}
                variant="ghost"
                size="icon"
                className="text-white hover:text-[#026d55]"
              >
                {isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6" />
                )}
              </Button>
              
              <span className="font-mono text-sm text-white">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              
              <div
                className="video-progress flex-grow mx-4 relative h-2 bg-gray-700 hover:bg-gray-600 cursor-pointer rounded-full group"
                onClick={handleProgressClick}
              >
                <div
                  className="video-progress-fill absolute top-0 left-0 h-full bg-[#026d55] rounded-full"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                ></div>
                <div
                  className="playhead absolute top-1/2 -translate-y-1/2 h-4 w-4 bg-[#026d55] rounded-full shadow-md -ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                ></div>
              </div>
              
              <div className="flex items-center">
                <Volume2 className="h-5 w-5 text-white mr-2" />
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
              
              <Button
                onClick={toggleFullscreen}
                variant="ghost"
                size="icon"
                className="text-white hover:text-[#026d55]"
                title="Exit fullscreen"
              >
                <Maximize className="h-5 w-5" />
              </Button>
            </div>
          )}
          
          <div className="p-8 text-center">
            <div className="bg-neutral-800 p-10 rounded-lg mb-8">
              <File className="h-24 w-24 mx-auto text-primary dark:text-[#026d55]" />
            </div>
            <h3 className="text-lg font-medium">{file.filename}</h3>
            <p className="text-sm text-neutral-400 mt-1">Audio file</p>
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
    // PDF files
    else if (fileType === 'application/pdf' || fileExt === 'pdf') {
      return (
        <div className="h-full w-full">
          <iframe
            src={`/api/files/${file.id}/content`}
            className="h-full w-full"
            title={file.filename}
            onError={handleMediaError}
          />
        </div>
      );
    } 
    // Default - unsupported file type
    else {
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
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0">
      {/* Media Viewer - Takes remaining space */}
      <div className="flex-1 min-h-0 min-h-[60vh] lg:min-h-0 grid grid-rows-[auto,1fr,auto]">
        {/* Header/toolbar area if needed */}
        <div></div>
        
        {/* Media container - grows to fill space */}
        <div className="relative min-h-0 bg-black overflow-hidden">
          {renderMediaContent()}
        </div>
        
        {/* Bottom controls area */}
        <div className="bg-black p-3 sm:p-6 border-t border-gray-800">
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
                
                {/* Progress bar and markers container */}
                <div className="flex-grow flex flex-col gap-1 mx-4 relative">
                  
                  {/* Extended hover area around progress bar */}
                  <div
                    className="relative py-4 cursor-pointer"
                    onClick={handleProgressClick}
                    onMouseMove={(e) => {
                      if (e.buttons === 1 && progressRef.current) {
                        // Handle dragging (mouse down + move)
                        handleProgressClick(e);
                      } else {
                        // Handle hover for scrub preview with pixel positioning
                        if (!progressRef.current || isDragging) return;
                        
                        const rect = progressRef.current.getBoundingClientRect();
                        // Calculate viewport position for preview
                        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        const hoverTime = duration * pos;
                        
                        // Position preview using viewport coordinates
                        const previewWidth = 208; // w-48 + padding = 192 + 16
                        const previewHeight = 150; // Approximate height
                        const desiredLeft = e.clientX - previewWidth / 2;
                        const left = Math.max(8, Math.min(window.innerWidth - previewWidth - 8, desiredLeft));
                        const top = rect.top - previewHeight - 12;
                        
                        setScrubPreviewTime(hoverTime);
                        setScrubPreviewLeft(left);
                        setScrubPreviewTop(top);
                        setShowScrubPreview(true);
                        
                        if (previewVideoRef.current && duration > 0) {
                          previewVideoRef.current.currentTime = hoverTime;
                        }
                      }
                    }}
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
                  
                  {/* Comment markers rail */}
                  <div className="relative h-5 overflow-visible pointer-events-none" aria-hidden="true">
                    {duration > 0 && comments && comments.length > 0 && comments.map((comment: Comment) => {
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
                          key={`${(comment as any).isPublic ? 'public' : 'auth'}-${comment.id}`}
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
                            // Set active comment and jump to timestamp
                            setActiveCommentId(comment.id);
                            const mediaElement = videoRef.current || audioRef.current;
                            if (mediaElement && comment.timestamp !== null) {
                              mediaElement.currentTime = comment.timestamp;
                              setCurrentTime(comment.timestamp);
                            }
                          }}
                          data-testid={`comment-marker-${comment.id}`}
                        >
                          <div className={`w-6 h-6 ${activeCommentId === comment.id ? 'bg-blue-500' : 'bg-yellow-400'} rounded-full flex items-center justify-center text-xs font-bold text-black shadow-lg border-2 border-white`}>
                            {(comment as any).authorName?.charAt(0)?.toUpperCase() || (comment as any).user?.name?.charAt(0)?.toUpperCase() || 'A'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Comment Marker Tooltip */}
                {hoveredComment && comments && (
                  (() => {
                    const comment = comments.find((c: Comment) => c.id === hoveredComment);
                    if (!comment) return null;
                    
                    // Position tooltip using viewport coordinates
                    const hasActivePreview = showScrubPreview && duration > 0 && file?.fileType === 'video';
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
                              {(comment as any).authorName?.charAt(0) || (comment as any).user?.name?.charAt(0) || 'A'}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-xs">
                                {(comment as any).authorName || (comment as any).user?.name || 'Anonymous'}
                              </span>
                              <span className="text-yellow-400 text-xs font-mono">
                                {formatTime(comment.timestamp)}
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
                
                <Button
                  onClick={toggleFullscreen}
                  variant="ghost"
                  size="icon"
                  className="text-neutral-600 hover:text-neutral-900 dark:text-gray-400 dark:hover:text-[#026d55]"
                  title="Toggle fullscreen"
                >
                  <Maximize className="h-5 w-5" />
                </Button>
              </div>
            )}
            
          {/* File selector and actions - Always visible regardless of error state */}
          <div className={cn(
              "flex justify-end items-center",
              !mediaError ? "mt-2 pt-2" : "pt-1"
            )}>
              {/* Desktop: Show all buttons in a row */}
              <div className="hidden lg:flex space-x-1">
                {file && (
                  <>
                    <ShareLinkButton 
                      fileId={file.id} 
                      size="sm"
                      variant="ghost"
                      compact={true}
                      className="h-7 w-7 p-0"
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 w-7 p-0 dark:bg-orange-900 dark:text-orange-200 dark:border-orange-900 dark:hover:bg-orange-950"
                      onClick={handleRequestChanges}
                      disabled={approveMutation.isPending}
                      title="Request changes"
                    >
                      <AlertCircle className="h-3 w-3" />
                    </Button>
                    <Button 
                      size="sm" 
                      className="h-7 w-7 p-0 bg-green-600 hover:bg-green-700"
                      onClick={handleApprove}
                      disabled={approveMutation.isPending}
                      title="Approve"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    {(user?.role === 'admin' || user?.role === 'editor') && project && (
                      <Button 
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0 dark:bg-blue-600 dark:text-white dark:border-blue-600 dark:hover:bg-blue-700 dark:hover:border-blue-700"
                        onClick={handleMarkAsInReview}
                        disabled={isUpdatingStatus || !project || project.status === 'in_review' || project.status === 'approved'}
                        title={project.status === 'in_review' || project.status === 'approved' ? 'Project already in review or approved' : 'Mark project as ready for review'}
                      >
                        {isUpdatingStatus ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ClipboardCheck className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </>
                )}
              </div>

            </div>
        </div>
      </div>
      
      {/* Comments Section - Fixed width for optimal button spacing */}
      {file && (
        <div className="w-full lg:w-[387px] h-full max-h-[40vh] lg:max-h-none min-h-0 flex flex-col dark:bg-[#0f1218]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <Tabs defaultValue="comments" className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-gray-800">
              <TabsList className="dark:bg-gray-900">
                <TabsTrigger value="comments" onClick={() => setShowCommentsTab(true)}>Comments</TabsTrigger>
                <TabsTrigger value="versions" onClick={() => setShowCommentsTab(false)}>Versions</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="comments" className="flex-1 min-h-0 p-0 overflow-auto">
              <TimelineComments 
                fileId={file.id} 
                duration={duration} 
                currentTime={currentTime}
                activeCommentId={activeCommentId?.toString()}
                onCommentSelect={(commentId: string) => setActiveCommentId(parseInt(commentId))}
                onTimeClick={(time: number) => {
                  const mediaElement = videoRef.current || audioRef.current;
                  if (mediaElement) {
                    mediaElement.currentTime = time;
                    setCurrentTime(time);
                  }
                }}
              />
            </TabsContent>
            
            <TabsContent value="versions" className="flex-grow overflow-auto px-4 py-3">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium dark:text-white">File Versions</h3>
                  <Button 
                    className="flex items-center dark:bg-[#026d55] dark:hover:bg-[#025943] dark:text-white" 
                    size="sm"
                    onClick={() => setIsVersionDialogOpen(true)}
                  >
                    <Layers className="h-4 w-4 mr-1.5" />
                    Upload New Version
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {files
                    .filter(f => f.filename === file.filename)
                    .sort((a, b) => b.version - a.version)
                    .map((version) => (
                      <div 
                        key={version.id} 
                        className={cn(
                          "flex items-center justify-between p-3 rounded-md border cursor-pointer transition-all relative",
                          version.id === file.id 
                            ? "bg-primary-50 dark:bg-[#026d55]/20 border-primary-300 dark:border-[#026d55] ring-1 ring-primary-200 dark:ring-[#026d55]/40 shadow-sm"
                            : "bg-white dark:bg-gray-900 border-neutral-200 dark:border-gray-800 hover:bg-neutral-50 dark:hover:bg-gray-800"
                        )}
                        onClick={() => onSelectFile(version.id)}
                      >
                        {version.id === file.id && (
                          <div className="absolute left-0 top-0 h-full w-1 bg-primary-500 dark:bg-[#026d55] rounded-l-md"></div>
                        )}
                        <div className="flex items-center">
                          <div className={cn(
                            "rounded-full flex items-center justify-center", 
                            version.id === file.id && "bg-primary-100 dark:bg-[#026d55]/30 p-1.5"
                          )}>
                            <Layers className={cn(
                              "h-5 w-5 mr-3",
                              version.id === file.id 
                                ? "text-primary-700 dark:text-[#026d55]" 
                                : "text-neutral-500 dark:text-gray-400"
                            )} />
                          </div>
                          <div>
                            <div className={cn(
                              "font-medium dark:text-white",
                              version.id === file.id && "text-primary-700 dark:text-[#026d55]"
                            )}>
                              Version {version.version}
                            </div>
                            <div className="text-xs text-neutral-500 dark:text-gray-400">
                              {new Date(version.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        {version.isLatestVersion && (
                          <Badge className={cn(
                            version.id === file.id 
                              ? "bg-primary-500 hover:bg-primary-600 dark:bg-[#026d55] dark:hover:bg-[#025943]" 
                              : ""
                          )}>Latest</Badge>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
      
      {/* File upload dialog */}
      <Dialog open={isVersionDialogOpen} onOpenChange={setIsVersionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload New Version</DialogTitle>
            <DialogDescription>
              Upload a new version of <span className="font-medium">{file?.filename}</span>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div 
              className={cn(
                "border-2 border-dashed rounded-lg h-44 flex flex-col items-center justify-center text-center p-4 transition-colors",
                selectedVersionFile 
                  ? "border-primary bg-primary/5" 
                  : "border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600"
              )}
              onClick={openFileBrowser}
            >
              {selectedVersionFile ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary mx-auto">
                    {selectedVersionFile.type.startsWith('video/') ? (
                      <FileVideo className="h-5 w-5" />
                    ) : selectedVersionFile.type.startsWith('image/') ? (
                      <ImageIcon className="h-5 w-5" />
                    ) : (
                      <File className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">File Selected</p>
                    <p className="text-sm text-gray-500 truncate max-w-[260px]">
                      {selectedVersionFile.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {(selectedVersionFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                    <p className="text-xs text-primary mt-2">Click to change file</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-center h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-800 mb-3">
                    <Upload className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <p className="text-sm font-medium">
                    Click to select a file
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    or drag and drop
                  </p>
                </>
              )}
            </div>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept="video/*,image/*,audio/*,application/pdf"
            />
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsVersionDialogOpen(false);
                setSelectedVersionFile(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleVersionUpload}
              disabled={!selectedVersionFile}
              className="dark:bg-[#026d55] dark:hover:bg-[#025943] dark:text-white"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Portal-based scrub preview that can extend beyond progress bar */}
      {showScrubPreview && duration > 0 && file?.fileType === 'video' && createPortal(
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
                data-testid="video-scrub-preview"
                src={`/api/files/${file.id}/scrub`}
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

      {/* Portal: Mobile actions dropdown in top-left container */}
      {file && typeof document !== 'undefined' && document.getElementById('mobile-actions-container') && createPortal(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-white/90 backdrop-blur-sm border-gray-300 dark:bg-gray-800/90 dark:border-gray-600 dark:text-white dark:hover:bg-gray-700/90"
              data-testid="mobile-actions-dropdown"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            {/* Share Link Option - Renders ShareLinkButton inside dropdown */}
            <DropdownMenuItem asChild>
              <ShareLinkButton 
                fileId={file.id} 
                size="sm"
                variant="ghost"
                compact={false}
                className="w-full justify-start p-2 text-sm font-normal hover:bg-accent focus:bg-accent"
              />
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuItem
              onClick={handleRequestChanges}
              disabled={approveMutation.isPending}
              className="text-orange-600 focus:text-orange-600"
              data-testid="mobile-request-changes"
            >
              <AlertCircle className="h-4 w-4 mr-2" />
              Request Changes
            </DropdownMenuItem>
            
            <DropdownMenuItem
              onClick={handleApprove}
              disabled={approveMutation.isPending}
              className="text-green-600 focus:text-green-600"
              data-testid="mobile-approve"
            >
              <Check className="h-4 w-4 mr-2" />
              Approve
            </DropdownMenuItem>
            
            {(user?.role === 'admin' || user?.role === 'editor') && project && (
              <DropdownMenuItem
                onClick={handleMarkAsInReview}
                disabled={isUpdatingStatus || !project || project.status === 'in_review' || project.status === 'approved'}
                className="text-blue-600 focus:text-blue-600"
                data-testid="mobile-mark-in-review"
              >
                {isUpdatingStatus ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                )}
                Mark as In Review
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>,
        document.getElementById('mobile-actions-container')!
      )}
    </div>
  );
}