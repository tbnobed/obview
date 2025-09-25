import { useState, useEffect, useRef } from "react";
import { useComments } from "@/hooks/use-comments";
import CommentForm from "@/components/comments/comment-form";
import CommentThread from "@/components/comments/comment-thread";
import { Loader2, MessageSquare, MoreHorizontal, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface TimelineCommentsProps {
  fileId: number;
  duration: number;
  currentTime: number;
  onTimeClick: (time: number) => void;
  activeCommentId?: number;
  onCommentSelect?: (commentId: number) => void;
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
  const [markers, setMarkers] = useState<{ time: number, left: string, commentId: number }[]>([]);
  const [replyingToId, setReplyingToId] = useState<number | null>(null);
  
  const { 
    data: comments, 
    isLoading, 
    error 
  } = useComments(fileId);

  // Format time for Frame.io style (HH:MM:SS:FF - hours:minutes:seconds:frames)
  const formatTime = (time: number) => {
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
    <div className="h-full flex flex-col bg-[#1e1e1e] text-white">
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
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="p-4 bg-red-900/20 text-red-400 text-sm">
            Error loading comments: {error.message}
          </div>
        ) : topLevelComments.length > 0 ? (
          <div className="divide-y divide-gray-700">
            {topLevelComments.map((comment: any, index: number) => (
              <div 
                key={comment.id} 
                id={`comment-${comment.id}`}
                onClick={comment.timestamp !== null ? () => onTimeClick(comment.timestamp) : undefined}
                onKeyDown={comment.timestamp !== null ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onTimeClick(comment.timestamp);
                  }
                } : undefined}
                className={`p-4 hover:bg-gray-800/50 transition-colors ${
                  activeCommentId === comment.id ? 'bg-gray-800/80' : ''
                } ${comment.timestamp !== null ? 'cursor-pointer' : ''}`}
                title={comment.timestamp !== null ? `Jump to ${formatTime(comment.timestamp)} in the video` : undefined}
                role={comment.timestamp !== null ? 'button' : undefined}
                tabIndex={comment.timestamp !== null ? 0 : undefined}
              >
                <div className="flex gap-3">
                  {/* Avatar */}
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={comment.user?.avatar} />
                    <AvatarFallback className="bg-gray-600 text-white text-xs">
                      {getUserInitials((comment as any).authorName || comment.user?.name || comment.user?.username || 'U')}
                    </AvatarFallback>
                  </Avatar>

                  {/* Comment Content */}
                  <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                          {(comment as any).authorName || comment.user?.name || comment.user?.username || 'Unknown User'}
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

                    {/* Timestamp */}
                    {comment.timestamp !== null && (
                      <span className="inline-block mb-2 text-amber-400 font-mono text-sm">
                        {formatTime(comment.timestamp)}
                      </span>
                    )}

                    {/* Comment Text */}
                    <div className="text-sm text-gray-200 mb-3 whitespace-pre-wrap">
                      {comment.content.length > 100 ? (
                        <>
                          {comment.content.substring(0, 100)}...
                          <button 
                            className="text-blue-400 hover:text-blue-300 ml-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Read more
                          </button>
                        </>
                      ) : (
                        comment.content
                      )}
                    </div>

                    {/* Reply Button */}
                    <button 
                      className="text-xs text-gray-400 hover:text-white transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReplyingToId(replyingToId === comment.id ? null : comment.id);
                      }}
                    >
                      {replyingToId === comment.id ? "Cancel Reply" : "Reply"}
                    </button>

                    {/* Reply Form */}
                    {replyingToId === comment.id && (
                      <div className="mt-3 pl-4 border-l-2 border-gray-600">
                        <CommentForm
                          fileId={fileId}
                          parentId={comment.id}
                          onSuccess={() => setReplyingToId(null)}
                          className="bg-gray-800 border-gray-600"
                        />
                      </div>
                    )}

                    {/* Replies */}
                    {comments && comments.filter((c: any) => c.parentId === comment.id).length > 0 && (
                      <div className="mt-3 space-y-3">
                        {comments.filter((c: any) => c.parentId === comment.id).map((reply: any) => (
                          <div key={reply.id} className="flex gap-3">
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
                              <div className="text-xs text-gray-200">
                                {reply.content}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-12 w-12 text-gray-600 mb-3" />
            <p className="text-gray-400 text-sm">No comments yet</p>
            <p className="text-gray-500 text-xs">Be the first to comment!</p>
          </div>
        )}
      </div>

      {/* Comment Input at Bottom */}
      <div className="border-t border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-amber-400 font-mono text-xs">
            {formatTime(currentTime)}
          </span>
          <span className="text-gray-400 text-xs">Leave your comment...</span>
        </div>
        <CommentForm 
          fileId={fileId} 
          currentTime={currentTime} 
          className="bg-transparent border-0 p-0"
        />
      </div>
    </div>
  );
}
