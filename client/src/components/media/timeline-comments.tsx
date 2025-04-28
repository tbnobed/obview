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
}

export default function TimelineComments({ 
  fileId, 
  duration, 
  currentTime,
  onTimeClick
}: TimelineCommentsProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
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
      const topLevelComments = comments.filter(c => !c.parentId && c.timestamp !== null);
      
      // Calculate marker positions
      const newMarkers = topLevelComments.map(comment => {
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

  // Filter comments
  const filteredComments = comments?.filter(comment => {
    if (filter === "unresolved") return !comment.isResolved;
    if (filter === "resolved") return comment.isResolved;
    return true;
  });

  // Group top-level comments (no parent)
  const topLevelComments = filteredComments?.filter(c => !c.parentId) || [];

  return (
    <div>
      {/* Timeline markers visualization */}
      <div className="mb-6 bg-neutral-100 h-8 relative rounded-md" ref={timelineRef}>
        {/* Current time indicator */}
        <div 
          className="absolute top-0 h-full w-px bg-primary-500 z-10"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        ></div>
        
        {/* Comment markers */}
        {markers.map((marker, index) => (
          <div
            key={index}
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-secondary-500 rounded-full cursor-pointer transform hover:scale-150 transition-transform"
            style={{ left: marker.left }}
            title={`Comment at ${formatTime(marker.time)}`}
            onClick={() => onTimeClick(marker.time)}
          ></div>
        ))}
        
        {/* Time labels */}
        <div className="absolute top-0 left-0 w-full h-full flex justify-between px-2 text-xs text-neutral-500">
          <span className="self-center">0:00</span>
          <span className="self-center">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-neutral-900">
          Comments ({comments?.length || 0})
        </h3>
        <div className="flex items-center">
          <span className="text-sm text-neutral-500 mr-3">Filter:</span>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px]">
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
        className="mb-6"
      />
      
      {/* Comment list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-md">
          Error loading comments: {error.message}
        </div>
      ) : topLevelComments.length > 0 ? (
        <div className="space-y-6">
          {topLevelComments.map(comment => (
            <CommentThread 
              key={comment.id} 
              comment={comment} 
              comments={comments || []}
              onTimeClick={onTimeClick}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-neutral-500">
          <p>No comments yet. Add the first comment to start the conversation!</p>
        </div>
      )}
    </div>
  );
}
