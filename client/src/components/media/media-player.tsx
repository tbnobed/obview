import { useState, useRef, useEffect } from "react";
import { File, Comment } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Pause, Volume2, Maximize, Type, Layers, Check, AlertCircle } from "lucide-react";
import TimelineComments from "./timeline-comments";
import { useApprovals, useComments } from "@/hooks/use-comments";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ShareLinkButton } from "@/components/share-link-button";
import { DownloadButton } from "@/components/download-button";

interface MediaPlayerProps {
  file?: File;
  projectId: number;
  files: File[];
  onSelectFile: (fileId: number) => void;
  initialTime?: number | null;
}

export default function MediaPlayer({ file, projectId, files, onSelectFile, initialTime = null }: MediaPlayerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [showCommentsTab, setShowCommentsTab] = useState(true);
  const [activeCommentId, setActiveCommentId] = useState<number | undefined>(undefined);
  
  const { data: approvals } = useApprovals(file?.id);
  const { data: comments } = useComments(file?.id);
  
  // Get user's approval status for this file
  const [userApproval, setUserApproval] = useState<any>(null);
  
  // Update userApproval when approvals data changes
  useEffect(() => {
    if (approvals && user) {
      const currentUserApproval = approvals.find((approval: any) => approval.userId === user.id);
      setUserApproval(currentUserApproval || null);
    }
  }, [approvals, user]);

  useEffect(() => {
    // Reset player state when file changes
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [file]);
  
  // Effect to handle initialTime changes
  useEffect(() => {
    console.log("initialTime changed:", initialTime);
    
    if (videoRef.current && initialTime !== null && initialTime !== undefined) {
      console.log("Setting video time to:", initialTime);
      videoRef.current.currentTime = initialTime;
      setCurrentTime(initialTime);
      
      // Auto-play when jumping to a specific time
      if (!isPlaying) {
        console.log("Auto-playing video at timestamp");
        videoRef.current.play()
          .then(() => setIsPlaying(true))
          .catch(err => console.error("Failed to auto-play:", err));
      }
    }
  }, [initialTime]);

  // Handle metadata loaded
  const handleMetadataLoaded = () => {
    if (videoRef.current) {
      console.log("Video metadata loaded, duration:", videoRef.current.duration);
      setDuration(videoRef.current.duration);
      
      // If initialTime is provided, set the video to that time
      if (initialTime !== null && initialTime !== undefined) {
        console.log("Setting initial time on metadata load:", initialTime);
        videoRef.current.currentTime = initialTime;
        setCurrentTime(initialTime);
        
        // Auto-play when setting initial time
        console.log("Auto-playing on metadata load");
        videoRef.current.play()
          .then(() => setIsPlaying(true))
          .catch(err => console.error("Failed to auto-play on metadata load:", err));
      }
    }
  };

  // Handle time update
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const newTime = videoRef.current.currentTime;
      setCurrentTime(newTime);
      
      // Find if we're at or near a comment's timestamp to highlight it
      if (comments && comments.length > 0) {
        // Find comments with timestamps that are close to current time (within 0.5 second)
        const nearbyComment = comments.find((comment: any) => 
          comment.timestamp !== null && 
          comment.parentId === null && // Only top-level comments
          Math.abs(comment.timestamp - newTime) < 0.5
        );
        
        if (nearbyComment) {
          setActiveCommentId(nearbyComment.id);
        } else if (activeCommentId && comments.every((c: any) => 
          c.id !== activeCommentId || 
          Math.abs((c.timestamp || 0) - newTime) >= 0.5
        )) {
          // Clear active comment if we've moved away from all comment timestamps
          setActiveCommentId(undefined);
        }
      }
    }
  };

  // Handle play/pause
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Handle progress bar click
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (progressRef.current && videoRef.current) {
      const rect = progressRef.current.getBoundingClientRect();
      const position = (e.clientX - rect.left) / rect.width;
      const newTime = position * duration;
      
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  // Handle volume change
  const handleVolumeChange = (value: string) => {
    const newVolume = parseFloat(value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
  };

  // Format time (seconds to MM:SS)
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Approve file mutation
  const approveMutation = useMutation({
    mutationFn: async (status: string) => {
      try {
        // Prepare the request data
        const requestData = {
          status,
          feedback: status === "approved" ? "Approved" : "Changes requested",
        };
        
        // Use the apiRequest helper function
        const result = await apiRequest("POST", `/api/files/${file?.id}/approvals`, requestData);
        
        // Return both the result and the status so we can use it in onSuccess
        return { result, status };
      } catch (err) {
        console.error("Approval submission error:", err);
        throw err; // Rethrow the error to be handled by onError
      }
    },
    onSuccess: (data) => {
      // Get the status from the returned data
      const { status, result } = data;
      
      // Show a success message
      toast({
        title: "Success",
        description: status === "approved" 
          ? "You've approved this file"
          : "You've requested changes to this file",
      });
      
      // Immediately update UI state without waiting for a refetch
      if (file) {
        // Update the local userApproval state
        setUserApproval({
          id: result.id,
          fileId: file.id,
          userId: result.userId,
          status: status,
          feedback: result.feedback, 
          createdAt: result.createdAt,
          user: result.user
        });
      }
      
      // Also invalidate the approvals query to refresh the data
      queryClient.invalidateQueries({ queryKey: [`/api/files/${file?.id}/approvals`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to submit: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Handle approve click
  const handleApprove = () => {
    if (file) {
      approveMutation.mutate("approved");
    }
  };

  // Handle request changes click
  const handleRequestChanges = () => {
    if (file) {
      approveMutation.mutate("requested_changes");
    }
  };

  // Determine file type icon/component
  const renderMediaContent = () => {
    if (!file) return null;

    switch (file.fileType) {
      case 'video':
        return (
          <video
            ref={videoRef}
            className="w-full h-full rounded-t-lg object-contain bg-black"
            src={`/api/files/${file.id}/content`}
            onLoadedMetadata={handleMetadataLoaded}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            controls={false}
          />
        );
      case 'audio':
        return (
          <div className="w-full h-full flex items-center justify-center bg-neutral-900 rounded-t-lg">
            <div className="text-center">
              <Volume2 className="h-20 w-20 text-neutral-400 mx-auto mb-4" />
              <p className="text-white text-lg font-medium">{file.filename}</p>
              <audio
                ref={videoRef as any}
                className="mt-4"
                src={`/api/files/${file.id}/content`}
                onLoadedMetadata={handleMetadataLoaded}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                controls={false}
              />
            </div>
          </div>
        );
      case 'image':
        return (
          <div className="w-full h-full bg-neutral-900 rounded-t-lg overflow-hidden flex items-center justify-center">
            <img
              src={`/api/files/${file.id}/content`}
              alt={file.filename}
              className="max-w-full h-full object-contain"
            />
          </div>
        );
      default:
        return (
          <div className="w-full h-full flex items-center justify-center bg-neutral-900 rounded-t-lg">
            <div className="text-center">
              <Type className="h-20 w-20 text-neutral-400 mx-auto mb-4" />
              <p className="text-white text-lg font-medium">{file.filename}</p>
              <p className="text-neutral-400">Unsupported file type</p>
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
          
          {/* Video Controls */}
          <div className="bg-white dark:bg-[#0a0d14] p-4 border-t border-neutral-100 dark:border-gray-800">
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
                variant="ghost"
                size="icon"
                className="text-neutral-600 hover:text-neutral-900 dark:text-gray-400 dark:hover:text-[#026d55]"
              >
                <Maximize className="h-5 w-5" />
              </Button>
            </div>
            
            {/* File selector and actions */}
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-neutral-100 dark:border-gray-800">
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
            
            {/* Approval actions */}
            {file && (
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
                onCommentSelect={(commentId) => setActiveCommentId(commentId)}
                onTimeClick={(time) => {
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
