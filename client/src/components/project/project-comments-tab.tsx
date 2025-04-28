import { useProjectComments } from "@/hooks/use-comments";
import { Loader2, FileVideo, Clock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatTimeAgo } from "@/lib/utils/formatters";
import type { Comment } from "@shared/schema";
import { useLocation } from "wouter";

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
  
  // Function to navigate to file with timestamp
  const navigateToComment = (comment: Comment & { file?: any }) => {
    if (comment.timestamp !== null && comment.file?.id) {
      // Update URL to include time parameter for the specific file
      navigate(`/projects/${projectId}?time=${comment.timestamp}&media=${comment.file.id}`);
    }
  };
  
  return (
    <div className="space-y-4">
      {sortedComments.map((comment: Comment & { user?: any, file?: any }) => (
        <div 
          key={comment.id} 
          className={`border rounded-lg p-4 ${comment.timestamp !== null && comment.file?.id ? 'cursor-pointer hover:bg-neutral-50' : ''}`}
          onClick={() => navigateToComment(comment)}
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
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}