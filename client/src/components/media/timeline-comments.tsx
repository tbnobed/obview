import { useState, useEffect, useRef } from "react";
import { useComments } from "@/hooks/use-comments";
import CommentForm from "@/components/comments/comment-form";
import CommentThread from "@/components/comments/comment-thread";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  
  const { 
    data: comments, 
    isLoading, 
    error 
  } = useComments(fileId);

  // Format time (seconds to MM:SS)
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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
    <div>
      {/* Timeline markers visualization */}
      <div className="mb-4 bg-neutral-100 h-6 relative rounded-md" ref={timelineRef}>
        {/* Current time indicator */}
        <div 
          className="absolute top-0 h-full w-px bg-primary-500 z-10"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        ></div>
        
        {/* Comment markers */}
        {markers.map((marker, index) => (
          <div
            key={index}
            className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-secondary-500 rounded-full cursor-pointer transform hover:scale-150 transition-transform"
            style={{ left: marker.left }}
            title={`Comment at ${formatTime(marker.time)}`}
            onClick={() => onTimeClick(marker.time)}
          ></div>
        ))}
        
        {/* Time labels */}
        <div className="absolute top-0 left-0 w-full h-full flex justify-between px-2 text-xs text-neutral-500">
          <span className="self-center text-[10px]">0:00</span>
          <span className="self-center text-[10px]">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-medium text-neutral-900">
          Comments ({comments?.length || 0})
        </h3>
        <div className="flex items-center">
          <span className="text-xs text-neutral-500 mr-1.5">Filter:</span>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-full max-w-[140px] h-7 text-xs py-0">
              <SelectValue placeholder="Filter comments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Comments</SelectItem>
              <SelectItem value="unresolved">Unresolved</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Comment input */}
      <CommentForm 
        fileId={fileId} 
        currentTime={currentTime} 
        className="mb-4"
      />
      
      {/* Comment list */}
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="p-3 bg-red-50 text-red-600 rounded-md text-xs">
          Error loading comments: {error.message}
        </div>
      ) : topLevelComments.length > 0 ? (
        <div className="space-y-0 divide-y divide-neutral-200">
          {topLevelComments.map((comment: any) => (
            <CommentThread 
              key={comment.id} 
              comment={comment} 
              comments={comments || []}
              onTimeClick={onTimeClick}
              isActive={activeCommentId === comment.id}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-neutral-500">
          <p className="text-xs">No comments yet.<br />Add a comment to start the conversation.</p>
        </div>
      )}
    </div>
  );
}
