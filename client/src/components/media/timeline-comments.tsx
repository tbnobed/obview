import { useState, useEffect, useRef } from "react";
import { useComments } from "@/hooks/use-comments";
import CommentForm from "@/components/comments/comment-form";
import CommentThread from "@/components/comments/comment-thread";
import { Loader2, MessageSquare, MoreHorizontal, Filter, Search, Trash2, Paperclip, Smile, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getUserInitials } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";


interface TimelineCommentsProps {
  fileId: number;
  duration: number;
  currentTime: number;
  onTimeClick: (time: number) => void;
  activeCommentId?: string;
  onCommentSelect?: (commentId: string) => void;
}

export default function TimelineComments({ 
  fileId, 
  duration, 
  currentTime,
  onTimeClick,
  activeCommentId,
  onCommentSelect
}: TimelineCommentsProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<string>("all");
  const [markers, setMarkers] = useState<{ time: number, left: string, commentId: string }[]>([]);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  
  const { user } = useAuth();
  const { toast } = useToast();
  
  const { 
    data: comments, 
    isLoading, 
    error 
  } = useComments(fileId);

  // Delete comment mutation  
  const deleteCommentMutation = useMutation({
    mutationFn: async ({ commentId, creatorToken }: { commentId: string, creatorToken?: string }) => {
      if (creatorToken) {
        // For public comments, include creator token
        return await apiRequest("DELETE", `/api/public-comments/${commentId}`, { creatorToken });
      } else {
        // For authenticated comments
        return await apiRequest("DELETE", `/api/comments/${commentId}`);
      }
    },
    onSuccess: () => {
      toast({
        title: "Comment deleted",
        description: "Your comment has been removed.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/files', fileId, 'comments'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Check if user can delete a comment
  const canDeleteComment = (comment: any) => {
    if (comment.isPublic) {
      // For public comments, allow deletion if we have the creatorToken OR user is admin
      return !!localStorage.getItem(`comment-token-${comment.id}`) || (user?.role === 'admin');
    } else {
      // For authenticated comments, check if user is the author or admin
      return !!user && (comment.userId === user.id || user.role === 'admin');
    }
  };

  // Handle delete comment
  const handleDeleteComment = (comment: any) => {
    if (window.confirm("Are you sure you want to delete this comment? This action cannot be undone.")) {
      const creatorToken = comment.isPublic ? localStorage.getItem(`comment-token-${comment.id}`) : undefined;
      deleteCommentMutation.mutate({ 
        commentId: comment.id, 
        creatorToken: creatorToken || undefined
      });
    }
  };

  // Recursive component to render nested replies
  const RenderReplies = ({ comments, parentId, depth }: { 
    comments: any[], 
    parentId: string, 
    depth: number
  }) => {
    const replies = comments?.filter((c: any) => c.parentId === parentId) || [];
    
    if (replies.length === 0) return null;
    
    return (
      <div className={`mt-3 space-y-3 ${depth > 0 ? 'ml-4 pl-4 border-l border-gray-600' : ''}`}>
        {replies.map((reply: any) => (
          <div key={`${(reply as any).isPublic ? 'public' : 'auth'}-${reply.id}`}>
            <div className="flex gap-3">
              <Avatar className="h-6 w-6 flex-shrink-0">
                <AvatarImage src={reply.user?.avatar} />
                <AvatarFallback className="bg-gray-600 text-white text-xs">
                  {getUserInitials((reply as any).authorName || reply.user?.name || reply.user?.username || 'U')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-white">
                    {(reply as any).authorName || reply.user?.name || reply.user?.username || 'Unknown User'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(reply.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-xs text-gray-200 mb-2">
                  {reply.content}
                </div>
                
                {/* Action Buttons for nested replies */}
                <div className="flex items-center gap-3">
                  <button 
                    className="text-xs text-gray-400 hover:text-white transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setReplyingToId(replyingToId === reply.id ? null : reply.id);
                    }}
                  >
                    {replyingToId === reply.id ? "Cancel Reply" : "Reply"}
                  </button>
                  
                  {canDeleteComment(reply) && (
                    <button 
                      className="text-xs text-gray-400 hover:text-red-400 transition-colors flex items-center gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteComment(reply);
                      }}
                      disabled={deleteCommentMutation.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  )}
                </div>

                {/* Reply Form for nested replies */}
                {replyingToId === reply.id && (
                  <div className="mt-3 pl-4 border-l-2 border-gray-600">
                    <CommentForm
                      fileId={fileId}
                      parentId={reply.id}
                      onSuccess={() => setReplyingToId(null)}
                      className="bg-gray-800 border-gray-600"
                    />
                  </div>
                )}
              </div>
            </div>
            {/* Recursively render nested replies */}
            <RenderReplies comments={comments} parentId={reply.id} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  };

  // Format time (HH:MM:SS)
  const formatTime = (time: number) => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };


  // Calculate timeline markers positions
  useEffect(() => {
    if (comments && duration > 0) {
      // Get all top-level comments with timestamps
      const topLevelComments = comments.filter((c: any) => !c.parentId && c.timestamp !== null);
      
      // Calculate marker positions
      const newMarkers = topLevelComments.map((comment: any) => {
        const time = comment.timestamp || 0;
        const percentage = (time / duration) * 100;
        return {
          time,
          left: `${percentage}%`,
          commentId: comment.id
        };
      });
      
      setMarkers(newMarkers);
    }
  }, [comments, duration]);
  
  // Scroll to active comment when it changes
  useEffect(() => {
    if (activeCommentId) {
      // Find the comment element
      const commentElement = document.getElementById(`comment-${activeCommentId}`);
      if (commentElement) {
        // Scroll the comment into view with smooth behavior
        commentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeCommentId]);

  // Filter comments
  const filteredComments = comments?.filter((comment: any) => {
    if (filter === "unresolved") return !comment.isResolved;
    if (filter === "resolved") return comment.isResolved;
    return true;
  });

  // Group top-level comments (no parent) and sort by timestamp
  const topLevelComments = filteredComments?.filter((c: any) => !c.parentId) || [];
  
  // Sort comments by timestamp (null timestamps at the end)
  topLevelComments.sort((a: any, b: any) => {
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

  return (
    <div className="h-full flex flex-col" style={{backgroundColor: 'hsl(var(--comments-bg))'}}>
      {/* Comments List */}
      <div className="flex-1 overflow-y-auto space-y-3 px-3">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" style={{color: 'hsl(var(--comments-muted))'}} />
          </div>
        ) : error ? (
          <div className="p-4 bg-red-900/20 text-red-400 text-sm rounded-lg">
            Error loading comments: {error.message}
          </div>
        ) : topLevelComments.length > 0 ? (
          <>
            {topLevelComments.map((comment: any, index: number) => {
              return (
                <div 
                  key={`${(comment as any).isPublic ? 'public' : 'auth'}-${comment.id}`}
                  id={`comment-${(comment as any).isPublic ? 'public' : 'auth'}-${comment.id}`}
                  onClick={comment.timestamp !== null ? () => onTimeClick(comment.timestamp) : undefined}
                  onKeyDown={comment.timestamp !== null ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onTimeClick(comment.timestamp);
                    }
                  } : undefined}
                  className={`relative rounded-lg border p-4 transition-all duration-200 ${
                    activeCommentId === comment.id ? 'ring-2 ring-blue-500/50' : ''
                  } ${comment.timestamp !== null ? 'cursor-pointer hover:shadow-lg' : ''}`}
                  style={{
                    backgroundColor: 'hsl(var(--comments-card))',
                    borderColor: 'hsl(var(--comments-card-border))',
                    color: 'hsl(var(--comments-text))'
                  }}
                  title={comment.timestamp !== null ? `Jump to ${formatTime(comment.timestamp)} in the video` : undefined}
                  role={comment.timestamp !== null ? 'button' : undefined}
                  tabIndex={comment.timestamp !== null ? 0 : undefined}
                >

                  <div className="flex gap-3">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage src={comment.user?.avatar} />
                      <AvatarFallback className="bg-gray-600 text-white text-xs">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                        </svg>
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium" style={{color: 'hsl(var(--comments-text))'}}>
                            {(comment as any).authorName || comment.user?.name || comment.user?.username || 'Unknown User'}
                          </span>
                          <span className="text-xs" style={{color: 'hsl(var(--comments-muted))'}}>
                            {new Date(comment.createdAt).toLocaleDateString()}
                          </span>
                          {comment.timestamp !== null && (
                            <span 
                              className="text-xs font-mono px-2 py-1 rounded"
                              style={{
                                backgroundColor: 'hsl(var(--comments-timestamp-bg))',
                                color: 'hsl(var(--comments-timestamp-fg))'
                              }}
                            >
                              {formatTime(comment.timestamp)}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-medium" style={{color: 'hsl(var(--comments-muted))'}}>
                          #{index + 1}
                        </span>
                      </div>


                      <div className="text-sm mb-3 leading-relaxed" style={{color: 'hsl(var(--comments-text))'}}>
                        {comment.content}
                      </div>

                      <button 
                        className="text-xs font-medium transition-colors"
                        style={{color: 'hsl(var(--comments-muted))'}}
                        onMouseEnter={(e) => e.currentTarget.style.color = 'hsl(var(--comments-text))'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(var(--comments-muted))'}
                        onClick={(e) => {
                          e.stopPropagation();
                          setReplyingToId(replyingToId === comment.id ? null : comment.id);
                        }}
                      >
                        Reply
                      </button>
                    </div>
                  </div>

                  {replyingToId === comment.id && (
                    <div className="mt-3 pl-11 border-l-2" style={{borderColor: 'hsl(var(--comments-card-border))'}}>
                      <CommentForm
                        fileId={fileId}
                        parentId={comment.id}
                        onSuccess={() => setReplyingToId(null)}
                        className="bg-gray-800 border-gray-600"
                      />
                    </div>
                  )}

                  <div className="pl-11">
                    <RenderReplies comments={comments} parentId={comment.id} depth={0} />
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-12 w-12 mb-3" style={{color: 'hsl(var(--comments-muted))'}} />
            <p className="text-sm" style={{color: 'hsl(var(--comments-muted))'}}>No comments yet</p>
            <p className="text-xs" style={{color: 'hsl(var(--comments-muted))'}}>Be the first to comment!</p>
          </div>
        )}
      </div>

      {/* Comment Input - Frame.io Style Single Element */}
      <div className="p-3">
        <div 
          className="flex items-center gap-3 px-3 py-2 rounded-lg"
          style={{
            backgroundColor: 'hsl(var(--comments-card))',
            border: '1px solid hsl(var(--comments-card-border))'
          }}
        >
          {/* Timestamp chip */}
          <span 
            className="text-xs font-mono px-2 py-1 rounded shrink-0"
            style={{
              backgroundColor: 'hsl(var(--comments-timestamp-bg))',
              color: 'hsl(var(--comments-timestamp-fg))'
            }}
            data-testid="chip-timestamp"
          >
            {formatTime(currentTime)}
          </span>
          
          {/* Comment input field */}
          <input
            type="text"
            placeholder="Leave your comment..."
            className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-gray-500"
            style={{ color: 'hsl(var(--comments-text))' }}
            data-testid="input-comment"
          />
          
          {/* Action buttons */}
          <button 
            className="p-1.5 rounded hover:bg-gray-700/30 transition-colors"
            style={{color: 'hsl(var(--comments-muted))'}}
            onMouseEnter={(e) => e.currentTarget.style.color = 'hsl(var(--comments-text))'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(var(--comments-muted))'}
            data-testid="button-attach"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          
          <button 
            className="p-1.5 rounded hover:bg-gray-700/30 transition-colors"
            style={{color: 'hsl(var(--comments-muted))'}}
            onMouseEnter={(e) => e.currentTarget.style.color = 'hsl(var(--comments-text))'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(var(--comments-muted))'}
            data-testid="button-emoji"
          >
            <Smile className="h-4 w-4" />
          </button>
          
          <div 
            className="px-3 py-1 rounded text-xs font-medium cursor-pointer hover:bg-gray-700/30 transition-colors"
            style={{
              backgroundColor: 'hsl(var(--comments-card-border))', 
              color: 'hsl(var(--comments-muted))'
            }}
            data-testid="toggle-privacy"
          >
            Public
          </div>
          
          <button 
            className="p-2 rounded transition-all duration-200 hover:opacity-80"
            style={{
              backgroundColor: '#7c3aed',
              color: 'white'
            }}
            data-testid="button-send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
