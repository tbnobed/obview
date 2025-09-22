import { useState, useEffect, useRef } from "react";
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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDeleteComment } from "@/hooks/use-comments";

interface CommentThreadProps {
  comment: Comment & { user?: any };
  comments: (Comment & { user?: any })[];
  onTimeClick?: (time: number) => void;
  isActive?: boolean;
}

export default function CommentThread({ comment, comments, onTimeClick, isActive = false }: CommentThreadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showReplyForm, setShowReplyForm] = useState(false);
  const commentsRef = useRef<HTMLDivElement>(null);
  
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
      // apiRequest already parses the JSON response, so we don't need to call .json() on it
      return await apiRequest("PATCH", `/api/comments/${comment.id}`, {
        isResolved: !comment.isResolved
      });
    },
    onSuccess: (updatedComment) => {
      // Use the updated comment from the response for the toast message
      const newStatus = updatedComment.isResolved;
      toast({
        title: newStatus ? "Comment marked as resolved" : "Comment marked as unresolved",
        description: "",
      });
      
      // Force a refetch by invalidating the comments query
      // Use array-format query key to match the format used in the hooks
      queryClient.invalidateQueries({ queryKey: ['/api/files', comment.fileId, 'comments'] });
      
      // Also invalidate any project comments queries that might exist
      queryClient.invalidateQueries({ queryKey: ['/api/projects', null, 'comments'] });
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
  const authorName = (comment as any).authorName || comment.user?.name;
  const userInitial = authorName 
    ? authorName.charAt(0).toUpperCase() 
    : 'U';

  // Effect to scroll to this comment when it's active
  useEffect(() => {
    if (isActive && commentsRef.current) {
      commentsRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isActive]);

  return (
    <div 
      id={`comment-${comment.id}`}
      className={cn(
        "mb-5 pb-5",
        comment.isResolved ? "opacity-60" : "",
        isActive ? "bg-yellow-50 dark:bg-yellow-900/20 -mx-4 px-4 py-3 rounded-md transition-all duration-300" : "",
        comment.timestamp !== null ? "cursor-pointer hover-smooth-light dark:hover-subtle-dark" : "",
        comments.indexOf(comment) < comments.length - 1 ? "border-b border-neutral-200 dark:border-gray-800" : ""
      )}
      onClick={(e) => {
        // Prevent click if we're clicking on interactive elements
        const target = e.target as HTMLElement;
        const isInteractive = target.closest('button') || 
                              target.closest('a') || 
                              target.closest('input') ||
                              target.closest('textarea');
        
        if (!isInteractive && comment.timestamp !== null && onTimeClick) {
          console.log("Jumping to timestamp:", comment.timestamp);
          onTimeClick(comment.timestamp);
        }
      }}
      ref={isActive ? commentsRef : undefined}>
      <div className="flex space-x-2">
        <Avatar className="h-7 w-7 mt-0.5 hidden sm:block">
          <AvatarFallback className="bg-primary-100 text-primary-700 text-xs">
            {userInitial}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1">
          <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1">
            <h4 className="text-xs font-medium text-neutral-900 dark:text-white">
              {authorName || "Unknown User"}
            </h4>
            <div className="flex flex-wrap items-center gap-1.5">
              {comment.timestamp !== null && (
                <button 
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 dark:bg-gray-800 text-neutral-800 dark:text-gray-300 transition-colors duration-200"
                  onClick={() => onTimeClick && onTimeClick(comment.timestamp || 0)}
                >
                  <span className="font-mono">{formatTime(comment.timestamp)}</span>
                </button>
              )}
              <span className="text-[10px] text-neutral-500 dark:text-gray-400">
                {formatTimeAgo(new Date(comment.createdAt))}
              </span>
              {comment.isResolved && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-success bg-opacity-10 dark:bg-success/20 text-success">
                  Resolved
                </span>
              )}
            </div>
          </div>
          
          <div className="mt-1 text-xs text-neutral-700 dark:text-gray-300 comment-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Override image rendering to add proper styling
                img: ({ node, ...props }) => (
                  <img 
                    {...props} 
                    className="max-w-full h-auto rounded-md my-1 border border-gray-200"
                    style={{ maxHeight: '300px' }}
                    onClick={(e) => e.stopPropagation()} 
                  />
                ),
                // Override link rendering with special handling for file downloads
                a: ({ node, href, ...props }) => {
                  // Check if this is a file download link
                  const isFileDownload = href && href.startsWith('/api/files/') && href.includes('/content');
                  
                  return (
                    <a 
                      href={href}
                      {...props} 
                      className={`${isFileDownload ? 'text-blue-600 font-medium' : 'text-primary'} hover:underline`}
                      target="_blank" 
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        e.stopPropagation();
                        // For file downloads, we want to trigger the download attribute
                        if (isFileDownload) {
                          e.preventDefault();
                          window.open(href, '_blank');
                        }
                      }}
                    >
                      {isFileDownload && <span className="mr-1">📎</span>}
                      {props.children}
                    </a>
                  );
                }
              }}
            >
              {comment.content}
            </ReactMarkdown>
          </div>
          
          <div className="mt-2 flex flex-wrap gap-3">
            <Button 
              variant="link" 
              className="text-[10px] p-0 h-auto"
              onClick={() => setShowReplyForm(!showReplyForm)}
            >
              {showReplyForm ? "Cancel" : "Reply"}
            </Button>
            
            {canResolve && (
              <Button 
                variant="link" 
                className={cn(
                  "text-[10px] p-0 h-auto",
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
                className="text-[10px] p-0 h-auto text-destructive"
                onClick={handleDeleteComment}
                disabled={deleteCommentMutation.isPending}
              >
                <Trash2 className="h-2.5 w-2.5 mr-1 inline" />
                Delete
              </Button>
            )}
          </div>
          
          {showReplyForm && (
            <div className="mt-3">
              <CommentForm 
                fileId={comment.fileId}
                parentId={comment.id}
                onSuccess={() => setShowReplyForm(false)}
              />
            </div>
          )}
          
          {/* Comment Replies */}
          {replies.length > 0 && (
            <div className="mt-3 space-y-3 pl-3 border-l border-neutral-200 dark:border-gray-800">
              {replies.map(reply => (
                <div key={reply.id} className="flex space-x-2">
                  <Avatar className="h-5 w-5 mt-0.5 hidden sm:block">
                    <AvatarFallback className="bg-primary-100 text-primary-700 text-[10px]">
                      {reply.user?.name ? reply.user.name.charAt(0).toUpperCase() : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1">
                    <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1">
                      <h4 className="text-xs font-medium text-neutral-900 dark:text-white">
                        {reply.user?.name || "Unknown User"}
                      </h4>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-neutral-500 dark:text-gray-400">
                          {formatTimeAgo(new Date(reply.createdAt))}
                        </span>
                        {canDelete && (
                          <Button
                            variant="link"
                            className="text-[10px] p-0 h-auto text-destructive"
                            onClick={() => {
                              if (window.confirm("Are you sure you want to delete this reply?")) {
                                deleteCommentMutation.mutate(reply.id);
                              }
                            }}
                            disabled={deleteCommentMutation.isPending}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-0.5 text-xs text-neutral-700 dark:text-gray-300 comment-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          img: ({ node, ...props }) => (
                            <img 
                              {...props} 
                              className="max-w-full h-auto rounded-md my-1 border border-gray-200"
                              style={{ maxHeight: '300px' }}
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
                        {reply.content}
                      </ReactMarkdown>
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
