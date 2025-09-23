import { useProjectComments } from "@/hooks/use-comments";
import { Loader2, FileVideo, Clock, Play, MessageSquare, MoreHorizontal, Filter, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatTimeAgo } from "@/lib/utils/formatters";
import type { Comment } from "@shared/schema";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Format time for Frame.io style (HH:MM:SS:FF - hours:minutes:seconds:frames)
const formatTime = (time: number | null) => {
  if (time === null) return null;
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = Math.floor(time % 60);
  const frames = Math.floor((time % 1) * 24); // Assume 24fps for frame calculation
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
};

// Get user initials for avatar fallback
const getUserInitials = (name: string) => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

export function ProjectCommentsTab({ projectId }: { projectId: number }) {
  const { data: comments, isLoading, error } = useProjectComments(projectId);
  const [_, navigate] = useLocation();
  
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary dark:text-[#026d55]" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="text-center py-8 text-neutral-500">
        Error loading comments. Please try again.
      </div>
    );
  }
  
  if (!comments || comments.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500">
        No comments found for this project.
      </div>
    );
  }
  
  // Sort comments by timestamp (null timestamps at the end)
  const sortedComments = [...comments].sort((a, b) => {
    // If both have timestamps, sort by timestamp
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
  
  // Function to navigate to file with timestamp - DIRECT METHOD
  const navigateToComment = (comment: Comment & { file?: any }) => {
    console.log("Navigating to comment:", comment);
    
    // Allow navigation for any comment that has a valid file ID, even if timestamp is null
    if (comment.file?.id) {
      // If timestamp is null, default to 0 (beginning of the file)
      const timestamp = comment.timestamp !== null ? comment.timestamp : 0;
      
      console.log(`Navigating to file ${comment.file.id} at timestamp ${timestamp} (original timestamp: ${comment.timestamp})`);
      
      // Use multiple approaches to ensure cross-browser compatibility
      
      // 1. Direct approach: set a global variable on the window object
      try {
        (window as any).Obviu_jumpToMedia = {
          fileId: comment.file.id,
          timestamp: timestamp,
          projectId: projectId,
          timestamp_ms: Date.now(), // Add timestamp to ensure it's detected as a new event
          originalComment: comment.id // Add comment ID for tracing
        };
      } catch (e) {
        console.error("Failed to set global variable:", e);
      }
      
      // 2. Use direct window location change with hash fragment and query params
      const url = `/projects/${projectId}?media=${comment.file.id}&time=${timestamp}#media`;
      
      if (window.location.pathname.includes(`/projects/${projectId}`)) {
        // If we're already on the project page, just replace the URL and dispatch a custom event
        try {
          window.history.replaceState(null, '', url);
        } catch (e) {
          console.error("Failed to update history:", e);
        }
        
        // 3. Dispatch a custom event to notify the page that we want to navigate
        try {
          const jumpEvent = new CustomEvent('obviu_jump_to_timestamp', { 
            detail: { fileId: comment.file.id, timestamp: timestamp, commentId: comment.id }
          });
          window.dispatchEvent(jumpEvent);
          
          // 4. Extra backup approach - dispatch using a more traditional event
          const backupEvent = document.createEvent('CustomEvent');
          backupEvent.initCustomEvent('obviu_jump_to_timestamp_backup', true, true, { 
            fileId: comment.file.id, 
            timestamp: timestamp,
            commentId: comment.id
          });
          document.dispatchEvent(backupEvent);
        } catch (e) {
          console.error("Failed to dispatch event:", e);
        }
        
        // 5. Force direct DOM update as a last resort (without auto-play)
        try {
          // This is a direct DOM manipulation to set the video time
          // It will attempt to find the video element and set its time directly
          setTimeout(() => {
            const videoElement = document.querySelector('video');
            if (videoElement) {
              videoElement.currentTime = timestamp;
              // Removed auto-play - let user manually play if they want
            }
          }, 300);
        } catch (e) {
          console.error("Failed direct DOM manipulation:", e);
        }
      } else {
        // If we're on a different page, navigate to the new URL
        window.location.href = url;
      }
    } else {
      console.log("Comment cannot be navigated to because file.id is missing");
    }
  };
  
  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] text-white rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium">All comments</span>
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
        <div className="divide-y divide-gray-700">
          {sortedComments.map((comment: Comment & { user?: any, file?: any }, index: number) => (
            <div 
              key={comment.id} 
              className={`p-4 hover:bg-gray-800/50 transition-colors ${comment.file?.id ? 'cursor-pointer' : ''}`}
              onClick={() => comment.file?.id && navigateToComment(comment)}
              title={comment.file?.id ? `Click to view ${comment.timestamp !== null ? `at ${formatTime(comment.timestamp)}` : ''} in ${comment.file.filename}` : ''}
            >
              <div className="flex gap-3">
                {/* Avatar */}
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={comment.user?.avatarUrl} />
                  <AvatarFallback className="bg-gray-600 text-white text-xs">
                    {getUserInitials((comment as any).authorName || comment.user?.name || 'U')}
                  </AvatarFallback>
                </Avatar>

                {/* Comment Content */}
                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {(comment as any).authorName || comment.user?.name || 'Unknown User'}
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

                  {/* File Info */}
                  {comment.file && (
                    <div className="flex items-center gap-1 mb-2">
                      <FileVideo className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-300">{comment.file.filename}</span>
                    </div>
                  )}

                  {/* Timestamp */}
                  {comment.timestamp !== null && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (comment.file?.id) navigateToComment(comment);
                      }}
                      className="inline-block mb-2 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer font-mono text-sm"
                      title="Jump to this time in the video"
                    >
                      {formatTime(comment.timestamp)}
                    </button>
                  )}

                  {/* Comment Text */}
                  <div className="text-sm text-gray-200 mb-3">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        img: ({ node, ...props }) => (
                          <img 
                            {...props} 
                            className="max-w-full h-auto rounded-md my-1 border border-gray-600"
                            style={{ maxHeight: '200px' }}
                            onClick={(e) => e.stopPropagation()} 
                          />
                        ),
                        a: ({ node, ...props }) => (
                          <a 
                            {...props} 
                            className="text-blue-400 hover:text-blue-300 underline"
                            target="_blank" 
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {props.children}
                          </a>
                        )
                      }}
                    >
                      {comment.content.length > 150 ? `${comment.content.substring(0, 150)}...` : comment.content}
                    </ReactMarkdown>
                  </div>

                  {/* Status and Actions */}
                  <div className="flex items-center gap-2">
                    {comment.isResolved && (
                      <span className="text-xs px-2 py-1 bg-green-900/30 text-green-400 rounded">
                        Resolved
                      </span>
                    )}
                    
                    {comment.file?.id && (
                      <Button 
                        size="sm" 
                        variant="ghost"
                        className="h-6 px-2 py-0 text-xs text-gray-400 hover:text-white hover:bg-gray-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateToComment(comment);
                        }}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        {comment.timestamp !== null ? 'Jump to timestamp' : 'View media'}
                      </Button>
                    )}
                    
                    <button className="text-xs text-gray-400 hover:text-white transition-colors">
                      Reply
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}