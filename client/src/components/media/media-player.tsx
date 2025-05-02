import { useState, useRef, useEffect } from "react";
import { AlertCircle, Check, Layers, Maximize, Pause, Play, Volume2, File } from "lucide-react";
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
import { Comment, File as StorageFile } from "@shared/schema";

export default function MediaPlayer({
  file,
  files,
  onSelectFile,
}: {
  file: StorageFile | null;
  files: StorageFile[];
  onSelectFile: (fileId: number) => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [mediaError, setMediaError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCommentsTab, setShowCommentsTab] = useState(true);
  const [activeCommentId, setActiveCommentId] = useState<number | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const mediaContainerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Fetch comments for the current file
  const { data: comments = [] } = useQuery({
    queryKey: ['/api/files', file?.id, 'comments'],
    queryFn: () => file ? apiRequest('GET', `/api/files/${file.id}/comments`) : Promise.resolve([]),
    enabled: !!file,
  });

  // Fetch approval status for the current file
  const { data: approvals = [] } = useQuery({
    queryKey: ['/api/files', file?.id, 'approvals'],
    queryFn: () => file ? apiRequest('GET', `/api/files/${file.id}/approvals`) : Promise.resolve([]),
    enabled: !!file,
  });
  
  // Find user's approval (if any)
  const userApproval = approvals && approvals.length > 0 ? approvals[0] : null;

  // Approval mutation
  const approveMutation = useMutation({
    mutationFn: async ({ fileId, status }: { fileId: number, status: string }) => {
      const res = await apiRequest('POST', `/api/files/${fileId}/approve`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/files', file?.id, 'approvals'] });
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

  useEffect(() => {
    // Reset media error when file changes
    setMediaError(false);
    setErrorMessage("");
    
    // Reset video state
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    
    // Reset active comment 
    setActiveCommentId(null);
  }, [file?.id]);

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

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    } else if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
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
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = duration * pos;
    
    setCurrentTime(newTime);
    
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    } else if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  // Format time (MM:SS)
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
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

  const handleMediaError = () => {
    setMediaError(true);
    setErrorMessage("This file is no longer available. It may have been deleted from the server.");
    setIsPlaying(false);
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

    // Detect file type
    const fileType = file.fileType.toLowerCase();
    
    if (fileType.startsWith('image/')) {
      // Image file
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
    } else if (fileType.startsWith('video/')) {
      // Video file
      return (
        <div
          ref={mediaContainerRef}
          className="relative h-full flex items-center justify-center bg-black"
        >
          <video
            ref={videoRef}
            src={`/api/files/${file.id}/content`}
            className="max-h-full max-w-full"
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onEnded={handleMediaEnded}
            onError={handleMediaError}
            controls={false}
          />
        </div>
      );
    } else if (fileType.startsWith('audio/')) {
      // Audio file
      return (
        <div
          ref={mediaContainerRef}
          className="flex flex-col items-center justify-center h-full bg-neutral-900 text-white"
        >
          <div className="p-8 text-center">
            <div className="bg-neutral-800 p-10 rounded-lg mb-8">
              <File className="h-24 w-24 mx-auto text-primary dark:text-[#026d55]" />
            </div>
            <h3 className="text-lg font-medium">{file.filename}</h3>
            <p className="text-sm text-neutral-400 mt-1">Audio file</p>
          </div>
          <audio
            ref={audioRef}
            src={`/api/files/${file.id}/content`}
            className="hidden"
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onEnded={handleMediaEnded}
            onError={handleMediaError}
          />
        </div>
      );
    } else {
      // Unsupported file type
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
      {/* Media Viewer - Takes 2/3 of the space on large screens */}
      <div className="lg:col-span-2">
        <div className="relative">
          <div className="h-[calc(100vh-300px)] min-h-[500px] bg-neutral-900 rounded-t-lg overflow-hidden">
            {renderMediaContent()}
          </div>
          
          <div className="bg-white dark:bg-[#0a0d14] p-4 border-t border-neutral-100 dark:border-gray-800">
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
                
                <div
                  ref={progressRef}
                  className="video-progress flex-grow mx-4 relative h-2 bg-neutral-200 dark:bg-gray-800 hover:bg-neutral-300 dark:hover:bg-gray-700 cursor-pointer rounded-full group"
                  onClick={handleProgressClick}
                  onMouseMove={(e) => {
                    if (e.buttons === 1 && progressRef.current) {
                      // Handle dragging (mouse down + move)
                      handleProgressClick(e);
                    }
                  }}
                >
                  <div
                    className="video-progress-fill absolute top-0 left-0 h-full bg-primary dark:bg-[#026d55] rounded-full"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  ></div>
                  <div
                    className="playhead absolute top-1/2 -translate-y-1/2 h-4 w-4 bg-primary dark:bg-[#026d55] rounded-full shadow-md -ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ left: `${(currentTime / duration) * 100}%` }}
                  ></div>
                  
                  {/* Timeline markers for comments */}
                  {comments && comments.length > 0 && comments.map((comment: Comment) => {
                    // Only show markers for comments with timestamps (not replies)
                    if (comment.timestamp === null || comment.parentId !== null) return null;
                    
                    // Calculate percentage position
                    const timestamp = comment.timestamp || 0;
                    const position = (timestamp / duration) * 100;
                    
                    return (
                      <div 
                        key={comment.id}
                        className={`absolute top-0 h-full w-1.5 ${activeCommentId === comment.id ? 'bg-secondary' : 'bg-yellow-400'} z-10 cursor-pointer`}
                        style={{ left: `${position}%` }}
                        title={`${comment.content} (${formatTime(comment.timestamp)})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          // Set active comment and jump to timestamp
                          setActiveCommentId(comment.id);
                          if (videoRef.current && comment.timestamp !== null) {
                            videoRef.current.currentTime = comment.timestamp;
                            setCurrentTime(comment.timestamp);
                          }
                        }}
                      />
                    );
                  })}
                </div>
                
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
              "flex justify-between items-center border-t border-neutral-100 dark:border-gray-800",
              !mediaError ? "mt-3 pt-3" : "pt-2"
            )}>
              <div className="flex space-x-2 items-center">
                <Select 
                  value={file?.id.toString()} 
                  onValueChange={(value) => onSelectFile(parseInt(value))}
                >
                  <SelectTrigger className="w-auto min-w-[180px]">
                    <SelectValue placeholder="Select file" />
                  </SelectTrigger>
                  <SelectContent>
                    {files.map((f) => (
                      <SelectItem key={f.id} value={f.id.toString()}>
                        {f.filename} {f.isLatestVersion && "(Latest)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {file && (
                  <div className="text-xs text-neutral-500 dark:text-gray-400">
                    Version {file.version}
                  </div>
                )}
              </div>
              
              <div className="flex space-x-2">
                {file && (
                  <>
                    <DownloadButton 
                      fileId={file.id} 
                      filename={file.filename} 
                      size="sm" 
                      variant="default"
                      isAvailable={file.isAvailable}
                    />
                    <ShareLinkButton 
                      fileId={file.id} 
                      size="sm"
                      variant="default"
                    />
                  </>
                )}
              </div>
            </div>
            
            {/* Approval actions - Only show when there's no media error */}
            {!mediaError && file && (
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-neutral-100 dark:border-gray-800">
                <div className="flex items-center text-sm">
                  {userApproval && (
                    <div className={cn(
                      "flex items-center px-2 py-1 rounded-full",
                      userApproval.status === "approved" 
                        ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400" 
                        : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                    )}>
                      {userApproval.status === "approved" ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          <span>You approved this file</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-4 w-4 mr-1" />
                          <span>You requested changes</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex items-center dark:bg-orange-900 dark:text-orange-200 dark:border-orange-900 dark:hover:bg-orange-950"
                    onClick={handleRequestChanges}
                    disabled={approveMutation.isPending}
                  >
                    <AlertCircle className="h-4 w-4 mr-1.5" />
                    Request Changes
                  </Button>
                  <Button 
                    size="sm" 
                    className="flex items-center bg-green-600 hover:bg-green-700"
                    onClick={handleApprove}
                    disabled={approveMutation.isPending}
                  >
                    <Check className="h-4 w-4 mr-1.5" />
                    Approve
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Comments Section - Takes 1/3 of the space on large screens */}
      {file && (
        <div className="border border-neutral-200 dark:border-gray-800 rounded-lg h-[calc(100vh-300px)] min-h-[500px] flex flex-col dark:bg-[#0f1218]">
          <Tabs defaultValue="comments" className="h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-gray-800">
              <TabsList className="dark:bg-gray-900">
                <TabsTrigger value="comments" onClick={() => setShowCommentsTab(true)}>Comments</TabsTrigger>
                <TabsTrigger value="versions" onClick={() => setShowCommentsTab(false)}>Versions</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="comments" className="flex-grow overflow-auto px-4 py-3">
              <TimelineComments 
                fileId={file.id} 
                duration={duration} 
                currentTime={currentTime}
                activeCommentId={activeCommentId}
                onCommentSelect={(commentId: number) => setActiveCommentId(commentId)}
                onTimeClick={(time: number) => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = time;
                    setCurrentTime(time);
                  }
                }}
              />
            </TabsContent>
            
            <TabsContent value="versions" className="flex-grow overflow-auto px-4 py-3">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium dark:text-white">File Versions</h3>
                  <Button className="flex items-center dark:bg-[#026d55] dark:hover:bg-[#025943] dark:text-white" size="sm">
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
                          "flex items-center justify-between p-3 rounded-md border",
                          version.id === file.id 
                            ? "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-900"
                            : "bg-white dark:bg-gray-900 border-neutral-200 dark:border-gray-800 hover:bg-neutral-50 dark:hover:bg-gray-800"
                        )}
                        onClick={() => onSelectFile(version.id)}
                      >
                        <div className="flex items-center">
                          <Layers className="h-5 w-5 mr-3 text-neutral-500 dark:text-gray-400" />
                          <div>
                            <div className="font-medium dark:text-white">Version {version.version}</div>
                            <div className="text-xs text-neutral-500 dark:text-gray-400">
                              {new Date(version.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        {version.isLatestVersion && (
                          <Badge>Latest</Badge>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}