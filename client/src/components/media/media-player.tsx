import { useState, useRef, useEffect } from "react";
import { File } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Share, DownloadCloud, Play, Pause, Volume2, Maximize, Type, Layers, Check, AlertCircle } from "lucide-react";
import TimelineComments from "./timeline-comments";
import { useApprovals } from "@/hooks/use-comments";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface MediaPlayerProps {
  file?: File;
  projectId: number;
  files: File[];
  onSelectFile: (fileId: number) => void;
}

export default function MediaPlayer({ file, projectId, files, onSelectFile }: MediaPlayerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [showCommentsTab, setShowCommentsTab] = useState(true);
  
  const { data: approvals } = useApprovals(file?.id);
  
  // Get user's approval status for this file
  const userApproval = approvals?.find(approval => approval.userId === user?.id);

  useEffect(() => {
    // Reset player state when file changes
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [file]);

  // Handle metadata loaded
  const handleMetadataLoaded = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  // Handle time update
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
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
      const res = await apiRequest("POST", `/api/files/${file?.id}/approvals`, {
        status,
        feedback: status === "approved" ? "Approved" : "Changes requested",
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Your feedback has been recorded",
      });
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
            className="w-full h-full max-h-[500px] rounded-t-lg object-contain bg-black"
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
              className="max-w-full max-h-[500px] object-contain"
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
    <div>
      {/* Media Viewer */}
      <div className="relative">
        <div className="max-h-[500px] aspect-w-16 aspect-h-9 bg-neutral-900 rounded-t-lg overflow-hidden">
          {renderMediaContent()}
        </div>
        
        {/* Video Controls */}
        <div className="bg-white p-4 border-t border-neutral-100">
          <div className="flex items-center mb-2 space-x-2">
            <Button
              onClick={togglePlay}
              variant="ghost"
              size="icon"
              className="text-neutral-600 hover:text-neutral-900"
            >
              {isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6" />
              )}
            </Button>
            
            <span className="font-mono text-sm text-neutral-600">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            
            <div
              ref={progressRef}
              className="video-progress flex-grow mx-4 relative rounded-full"
              onClick={handleProgressClick}
            >
              <div
                className="video-progress-fill rounded-full"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              ></div>
              <div
                className="playhead absolute top-1/2 -translate-y-1/2"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              ></div>
              
              {/* This would be timeline markers for comments */}
              {/* Implemented in the TimelineComments component */}
            </div>
            
            <div className="flex items-center">
              <Volume2 className="h-5 w-5 text-neutral-600 mr-2" />
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
              className="text-neutral-600 hover:text-neutral-900"
            >
              <Maximize className="h-5 w-5" />
            </Button>
          </div>
          
          {/* File selector and actions */}
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-neutral-100">
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
                <div className="text-xs text-neutral-500">
                  Version {file.version}
                </div>
              )}
            </div>
            
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" className="flex items-center">
                <Download className="h-4 w-4 mr-1.5" />
                Download
              </Button>
              <Button variant="outline" size="sm" className="flex items-center">
                <Share className="h-4 w-4 mr-1.5" />
                Share
              </Button>
            </div>
          </div>
          
          {/* Approval actions */}
          {file && (
            <div className="flex justify-between items-center mt-4 pt-4 border-t border-neutral-100">
              <div className="flex items-center text-sm">
                {userApproval && (
                  <div className={cn(
                    "flex items-center px-2 py-1 rounded-full",
                    userApproval.status === "approved" 
                      ? "bg-green-50 text-green-700" 
                      : "bg-amber-50 text-amber-700"
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
                  className="flex items-center"
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
      
      {/* Comments Section */}
      {file && (
        <div className="border-t border-neutral-200 px-4 sm:px-6 py-4">
          <Tabs defaultValue="comments">
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="comments" onClick={() => setShowCommentsTab(true)}>Comments</TabsTrigger>
                <TabsTrigger value="versions" onClick={() => setShowCommentsTab(false)}>Versions</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="comments">
              <TimelineComments 
                fileId={file.id} 
                duration={duration} 
                currentTime={currentTime}
                onTimeClick={(time) => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = time;
                    setCurrentTime(time);
                  }
                }}
              />
            </TabsContent>
            
            <TabsContent value="versions">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">File Versions</h3>
                  <Button className="flex items-center" size="sm">
                    <DownloadCloud className="h-4 w-4 mr-1.5" />
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
                            ? "bg-primary-50 border-primary-200"
                            : "bg-white border-neutral-200 hover:bg-neutral-50"
                        )}
                        onClick={() => onSelectFile(version.id)}
                      >
                        <div className="flex items-center">
                          <Layers className="h-5 w-5 mr-3 text-neutral-500" />
                          <div>
                            <div className="font-medium">Version {version.version}</div>
                            <div className="text-xs text-neutral-500">
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
