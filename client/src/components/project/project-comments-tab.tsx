import { useProjectComments } from "@/hooks/use-comments";
import { Loader2, FileVideo, Clock, Play } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatTimeAgo } from "@/lib/utils/formatters";
import type { Comment } from "@shared/schema";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
        
        // 5. Force direct DOM update as a last resort
        try {
          // This is a direct DOM manipulation to set the video time
          // It will attempt to find the video element and set its time directly
          setTimeout(() => {
            const videoElement = document.querySelector('video');
            if (videoElement) {
              videoElement.currentTime = timestamp;
              videoElement.play().catch(e => console.error("Failed to play video:", e));
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
    <div className="space-y-4">
      {sortedComments.map((comment: Comment & { user?: any, file?: any }) => (
        <div 
          key={comment.id} 
          className={`border rounded-lg p-4 ${comment.file?.id ? 'cursor-pointer hover-smooth-light dark:hover-subtle-dark hover:border-primary-400 dark:hover:border-[#026d55] hover:shadow-sm transition-all duration-200' : ''}`}
          onClick={() => navigateToComment(comment)}
          title={comment.file?.id ? `Click to view ${comment.timestamp !== null ? `at ${formatTime(comment.timestamp)}` : ''} in ${comment.file.filename}` : ''}
        >
          <div className="flex items-start gap-4">
            <Avatar>
              <AvatarFallback>
                {((comment as any).authorName || comment.user?.name) ? ((comment as any).authorName || comment.user?.name).substring(0, 2).toUpperCase() : 'U'}
              </AvatarFallback>
              {comment.user?.avatarUrl && <AvatarImage src={comment.user.avatarUrl} />}
            </Avatar>
            
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium">{(comment as any).authorName || comment.user?.name || 'Unknown User'}</div>
                <div className="text-sm text-neutral-500">{formatTimeAgo(new Date(comment.createdAt))}</div>
              </div>
              
              <div className="text-neutral-700 comment-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    img: ({ node, ...props }) => (
                      <img 
                        {...props} 
                        className="max-w-full h-auto rounded-md my-1 border border-gray-200"
                        style={{ maxHeight: '200px' }}
                        onClick={(e) => e.stopPropagation()} 
                      />
                    ),
                    a: ({ node, ...props }) => (
                      <a 
                        {...props} 
                        className="text-primary hover:underline"
                        target="_blank" 
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {props.children}
                      </a>
                    )
                  }}
                >
                  {comment.content}
                </ReactMarkdown>
              </div>
              
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
                
                {comment.file?.id && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="h-6 px-2 py-0 text-xs bg-primary-100 text-primary hover:text-primary-600 hover:bg-primary-200 border-primary-200 dark:bg-[#026d55]/20 dark:text-[#026d55] dark:hover:bg-[#025943]/30 dark:hover:text-[#03ffc8] dark:border-[#025943] transition-all duration-200"
                    onClick={(e) => {
                      e.stopPropagation();  // Prevent parent div click
                      navigateToComment(comment);
                    }}
                  >
                    <Play className="h-3 w-3 mr-1" />
                    {comment.timestamp !== null ? 'Jump to timestamp' : 'View media'}
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