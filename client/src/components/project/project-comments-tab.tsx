import { useProjectComments } from "@/hooks/use-comments";
import { Loader2, FileVideo, Clock, Play } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatTimeAgo } from "@/lib/utils/formatters";
import type { Comment } from "@shared/schema";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

// Format time (seconds to MM:SS)
const formatTime = (time: number | null) => {
  if (time === null) return null;
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export function ProjectCommentsTab({ projectId }: { projectId: number }) {
  const { data: comments, isLoading, error } = useProjectComments(projectId);
  const [_, navigate] = useLocation();
  
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
    
    if (comment.timestamp !== null && comment.file?.id) {
      // Direct approach: set a global variable on the window object
      // This is more reliable than sessionStorage across different origins
      (window as any).OBview_jumpToMedia = {
        fileId: comment.file.id,
        timestamp: comment.timestamp,
        projectId: projectId,
        timestamp_ms: Date.now() // Add timestamp to ensure it's detected as a new event
      };
      
      // Use direct window location change with hash fragment and query params
      // This ensures both the tab is activated AND we have the parameters available
      const url = `/projects/${projectId}?media=${comment.file.id}&time=${comment.timestamp}#media`;
      
      if (window.location.pathname.includes(`/projects/${projectId}`)) {
        // If we're already on the project page, just replace the URL and dispatch a custom event
        window.history.replaceState(null, '', url);
        
        // Dispatch a custom event to notify the page that we want to navigate
        const jumpEvent = new CustomEvent('obview_jump_to_timestamp', { 
          detail: { fileId: comment.file.id, timestamp: comment.timestamp }
        });
        window.dispatchEvent(jumpEvent);
      } else {
        // If we're on a different page, navigate to the new URL
        window.location.href = url;
      }
    } else {
      console.log("Comment cannot be navigated to because:", 
        comment.timestamp === null ? "timestamp is null" : "file.id is missing");
    }
  };
  
  return (
    <div className="space-y-4">
      {sortedComments.map((comment: Comment & { user?: any, file?: any }) => (
        <div 
          key={comment.id} 
          className={`border rounded-lg p-4 ${comment.timestamp !== null && comment.file?.id ? 'cursor-pointer hover:bg-neutral-50 hover:border-primary-400 hover:shadow-sm transition-all' : ''}`}
          onClick={() => navigateToComment(comment)}
          title={comment.timestamp !== null && comment.file?.id ? `Click to view at ${formatTime(comment.timestamp)} in ${comment.file.filename}` : ''}
        >
          <div className="flex items-start gap-4">
            <Avatar>
              <AvatarFallback>
                {comment.user?.name ? comment.user.name.substring(0, 2).toUpperCase() : 'U'}
              </AvatarFallback>
              {comment.user?.avatarUrl && <AvatarImage src={comment.user.avatarUrl} />}
            </Avatar>
            
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium">{comment.user?.name || 'Unknown User'}</div>
                <div className="text-sm text-neutral-500">{formatTimeAgo(new Date(comment.createdAt))}</div>
              </div>
              
              <div className="text-neutral-700">{comment.content}</div>
              
              <div className="mt-2 flex items-center flex-wrap gap-2 text-sm">
                <div className="bg-neutral-100 px-2 py-1 rounded text-neutral-600 flex items-center">
                  <FileVideo className="h-3 w-3 mr-1" />
                  {comment.file?.filename || 'Unknown file'}
                </div>
                
                {comment.timestamp !== null && (
                  <div className="bg-yellow-50 px-2 py-1 rounded text-yellow-700 flex items-center font-mono">
                    <Clock className="h-3 w-3 mr-1" />
                    {formatTime(comment.timestamp)}
                  </div>
                )}
                
                {comment.isResolved && (
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Resolved</Badge>
                )}
                
                {comment.timestamp !== null && comment.file?.id && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="h-6 px-2 py-0 text-xs bg-primary-100 text-primary hover:text-primary-600 hover:bg-primary-200 border-primary-200"
                    onClick={(e) => {
                      e.stopPropagation();  // Prevent parent div click
                      navigateToComment(comment);
                    }}
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Jump to timestamp
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}