import { useState } from "react";
import { Comment } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import CommentForm from "./comment-form";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import { useDeleteComment } from "@/hooks/use-comments";

interface CommentThreadProps {
  comment: Comment & { user?: any };
  comments: (Comment & { user?: any })[];
  onTimeClick?: (time: number) => void;
}

export default function CommentThread({ comment, comments, onTimeClick }: CommentThreadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showReplyForm, setShowReplyForm] = useState(false);
  
  // Delete comment mutation
  const deleteCommentMutation = useDeleteComment(comment.fileId);
  
  // Find replies to this comment
  const replies = comments.filter(c => c.parentId === comment.id);
  
  // Format time (seconds to MM:SS)
  const formatTime = (time: number | null) => {
    if (time === null) return null;
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Toggle comment resolution status mutation
  const toggleResolutionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/comments/${comment.id}`, {
        isResolved: !comment.isResolved
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: comment.isResolved ? "Comment marked as unresolved" : "Comment marked as resolved",
        description: "",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/files/${comment.fileId}/comments`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle resolve/unresolve comment
  const handleToggleResolution = () => {
    toggleResolutionMutation.mutate();
  };
  
  // Handle delete comment
  const handleDeleteComment = () => {
    if (window.confirm("Are you sure you want to delete this comment? This action cannot be undone.")) {
      deleteCommentMutation.mutate(comment.id);
    }
  };

  // Check if the user can resolve this comment (comment author or editor/admin)
  const canResolve = user && (
    user.id === comment.userId || 
    user.role === "admin" || 
    user.role === "editor"
  );
  
  // Check if user can delete this comment (comment author or admin)
  const canDelete = user && (
    user.id === comment.userId ||
    user.role === "admin"
  );

  // Get user initial for avatar
  const userInitial = comment.user?.name 
    ? comment.user.name.charAt(0).toUpperCase() 
    : 'U';

  return (
    <div className={cn(
      "mb-6 pb-6",
      comment.isResolved ? "opacity-60" : "",
      comments.indexOf(comment) < comments.length - 1 ? "border-b border-neutral-200" : ""
    )}>
      <div className="flex space-x-3">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-primary-100 text-primary-700">
            {userInitial}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-neutral-900">
              {comment.user?.name || "Unknown User"}
            </h4>
            <div className="flex items-center space-x-2">
              {comment.timestamp !== null && (
                <button 
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-800"
                  onClick={() => onTimeClick && onTimeClick(comment.timestamp || 0)}
                >
                  <span className="font-mono">{formatTime(comment.timestamp)}</span>
                </button>
              )}
              <span className="text-sm text-neutral-500">
                {formatTimeAgo(new Date(comment.createdAt))}
              </span>
              {comment.isResolved && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success bg-opacity-10 text-success">
                  Resolved
                </span>
              )}
            </div>
          </div>
          
          <div className="mt-1 text-sm text-neutral-700">
            <p>{comment.content}</p>
          </div>
          
          <div className="mt-2 flex space-x-4">
            <Button 
              variant="link" 
              className="text-xs p-0 h-auto"
              onClick={() => setShowReplyForm(!showReplyForm)}
            >
              {showReplyForm ? "Cancel" : "Reply"}
            </Button>
            
            {canResolve && (
              <Button 
                variant="link" 
                className={cn(
                  "text-xs p-0 h-auto",
                  comment.isResolved ? "text-neutral-500" : "text-success"
                )}
                onClick={handleToggleResolution}
                disabled={toggleResolutionMutation.isPending}
              >
                {comment.isResolved ? "Unresolve" : "Resolve"}
              </Button>
            )}
            
            {canDelete && (
              <Button
                variant="link"
                className="text-xs p-0 h-auto text-destructive"
                onClick={handleDeleteComment}
                disabled={deleteCommentMutation.isPending}
              >
                <Trash2 className="h-3 w-3 mr-1 inline" />
                Delete
              </Button>
            )}
          </div>
          
          {showReplyForm && (
            <div className="mt-4">
              <CommentForm 
                fileId={comment.fileId}
                parentId={comment.id}
                onSuccess={() => setShowReplyForm(false)}
              />
            </div>
          )}
          
          {/* Comment Replies */}
          {replies.length > 0 && (
            <div className="mt-4 space-y-4 pl-6 border-l-2 border-neutral-200">
              {replies.map(reply => (
                <div key={reply.id} className="flex space-x-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary-100 text-primary-700 text-xs">
                      {reply.user?.name ? reply.user.name.charAt(0).toUpperCase() : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-neutral-900">
                        {reply.user?.name || "Unknown User"}
                      </h4>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-neutral-500">
                          {formatTimeAgo(new Date(reply.createdAt))}
                        </span>
                        {canDelete && (
                          <Button
                            variant="link"
                            className="text-xs p-0 h-auto text-destructive"
                            onClick={() => {
                              if (window.confirm("Are you sure you want to delete this reply?")) {
                                deleteCommentMutation.mutate(reply.id);
                              }
                            }}
                            disabled={deleteCommentMutation.isPending}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-1 text-sm text-neutral-700">
                      <p>{reply.content}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
