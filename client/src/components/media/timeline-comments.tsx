import { useState, useEffect, useRef } from "react";
import { useComments, useUpdateCommentContent } from "@/hooks/use-comments";
import CommentForm from "@/components/comments/comment-form";
import CommentThread from "@/components/comments/comment-thread";
import { markdownComponents200, markdownComponents300 } from "@/lib/markdown-comment-components";
import { Loader2, MessageSquare, MoreHorizontal, Filter, Search, Trash2, Paperclip, Smile, Send, Check, Clock, PenTool, Pencil, Reply } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getUserInitials } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ReactionPicker from "@/components/comments/reaction-picker";
import ReactionsDisplay from "@/components/comments/reactions-display";
import { useToggleCommentResolution } from "@/hooks/use-comments";
import { cn } from "@/lib/utils";

// True if the event target is (or sits inside) an editable element —
// input, textarea, select, or contenteditable. Used to keep the
// comment-card click/key handlers from hijacking events that belong
// to the inline edit textarea.
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
  );
}
import type { Annotation } from "@/components/media/annotation-canvas";


interface TimelineCommentsProps {
  fileId: number;
  duration: number;
  currentTime: number;
  onTimeClick: (time: number) => void;
  activeCommentId?: string;
  onCommentSelect?: (commentId: string) => void;
  pendingAnnotations?: Annotation[] | null;
  onStartAnnotation?: () => void;
  onClearAnnotations?: () => void;
  onCommentHover?: (comment: any) => void;
  onCommentLeave?: () => void;
  inPoint?: number | null;
  outPoint?: number | null;
  onClearInOutPoints?: () => void;
}

export default function TimelineComments({ 
  fileId, 
  duration, 
  currentTime,
  onTimeClick,
  activeCommentId,
  onCommentSelect,
  pendingAnnotations,
  onStartAnnotation,
  onClearAnnotations,
  onCommentHover,
  onCommentLeave,
  inPoint,
  outPoint,
  onClearInOutPoints,
}: TimelineCommentsProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<string>("all");
  const [markers, setMarkers] = useState<{ time: number, left: string, commentId: string }[]>([]);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>("");

  const { user } = useAuth();
  const { toast } = useToast();
  
  const { 
    data: comments, 
    isLoading, 
    error 
  } = useComments(fileId);
  

  // Toggle comment resolution mutation
  const toggleResolutionMutation = useToggleCommentResolution(fileId);
  
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

  // Edit comment mutation (handles both authed + public)
  const updateCommentMutation = useUpdateCommentContent(fileId);

  // Check if user can edit a comment (same rules as delete)
  const canEditComment = (comment: any) => {
    if (comment.isPublic) {
      return !!localStorage.getItem(`comment-token-${comment.id}`);
    }
    return !!user && comment.userId === user.id;
  };

  const handleStartEdit = (comment: any) => {
    setEditingId(comment.id);
    setEditContent(comment.content || "");
    setReplyingToId(null);
  };

  const handleSaveEdit = (comment: any) => {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    const creatorToken = comment.isPublic
      ? localStorage.getItem(`comment-token-${comment.id}`) || undefined
      : undefined;
    updateCommentMutation.mutate(
      { commentId: comment.id, content: trimmed, creatorToken },
      {
        onSuccess: () => {
          setEditingId(null);
          setEditContent("");
        },
      },
    );
  };

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
      <div className={`mt-3 space-y-3 ${depth > 0 ? 'ml-4 pl-4 border-l border-white/5' : ''}`}>
        {replies.map((reply: any) => (
          <div key={`${(reply as any).isPublic ? 'public' : 'auth'}-${reply.id}`}>
            <div className="flex gap-3">
              <Avatar className="h-6 w-6 flex-shrink-0">
                <AvatarImage src={reply.user?.avatar} />
                <AvatarFallback className="bg-muted text-foreground text-xs">
                  {getUserInitials((reply as any).authorName || reply.user?.name || reply.user?.username || 'U')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-zinc-200">
                    {(reply as any).authorName || reply.user?.name || reply.user?.username || 'Unknown User'}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {new Date(reply.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {editingId === reply.id ? (
                  <div className="mb-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="min-h-[60px] text-xs"
                      data-testid={`textarea-edit-comment-${reply.id}`}
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="h-6 text-xs px-2"
                        disabled={!editContent.trim() || updateCommentMutation.isPending}
                        onClick={(e) => { e.stopPropagation(); handleSaveEdit(reply); }}
                        data-testid={`button-save-edit-${reply.id}`}
                      >
                        <Check className="h-3 w-3 mr-1" /> Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs px-2"
                        onClick={(e) => { e.stopPropagation(); setEditingId(null); setEditContent(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs mb-2 text-zinc-300 leading-relaxed">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents200}
                    >
                      {reply.content}
                    </ReactMarkdown>
                  </div>
                )}
                
                {/* Reactions Display for Reply */}
                <ReactionsDisplay 
                  commentId={reply.id}
                />
                
                {/* Action Buttons and Emoji Picker on same row for nested replies */}
                <div className="flex items-center gap-3 mt-1">
                  <button 
                    className="text-xs font-medium transition-colors text-muted-foreground hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setReplyingToId(replyingToId === reply.id ? null : reply.id);
                    }}
                  >
                    {replyingToId === reply.id ? "Cancel Reply" : "Reply"}
                  </button>
                  
                  {canEditComment(reply) && editingId !== reply.id && (
                    <button
                      className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(reply);
                      }}
                      data-testid={`button-edit-comment-${reply.id}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}

                  {canDeleteComment(reply) && (
                    <button 
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteComment(reply);
                      }}
                      disabled={deleteCommentMutation.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                  
                  <div style={{scale: '0.8', transformOrigin: 'left'}}>
                    <ReactionPicker 
                      commentId={reply.id}
                    />
                  </div>
                </div>

                {/* Reply Form for nested replies */}
                {replyingToId === reply.id && (
                  <div className="mt-3 pl-4 border-l-2 border-white/10">
                    <CommentForm
                      fileId={fileId}
                      parentId={reply.id}
                      onSuccess={() => setReplyingToId(null)}
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
      // Try both possible ID formats (public and auth prefixes)
      let commentElement = document.getElementById(`comment-public-${activeCommentId}`) || 
                          document.getElementById(`comment-auth-${activeCommentId}`);
      
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

  // Format time for timestamp display
  const formatTimeShort = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
      <div className="comments-panel flex flex-col h-full min-h-0 bg-zinc-950 text-zinc-100">
      {/* Comment Input - Mobile: sticky at top, Desktop: hidden */}
      <div className="sticky top-0 z-10 bg-zinc-950 px-2 pt-0 pb-1 lg:hidden shrink-0">
        <CommentForm
          fileId={fileId}
          currentTime={currentTime}
          pendingAnnotations={pendingAnnotations}
          onStartAnnotation={onStartAnnotation}
          onClearAnnotations={onClearAnnotations}
          inPoint={inPoint}
          outPoint={outPoint}
          onClearInOutPoints={onClearInOutPoints}
        />
      </div>
      
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-3 py-3 shrink-0">
        <Filter className="h-4 w-4 text-zinc-400" />
        {(["all", "unresolved", "resolved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
              filter === f
                ? "bg-cyan-950/80 text-cyan-400"
                : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Comments List - Mobile: basic padding, Desktop: extended padding */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 px-3 py-3 pb-4">
        {isLoading ? (
          // Loading state - Mobile: compact padding, Desktop: normal padding
          <div className="flex justify-center py-4 lg:py-8">
            <Loader2 className="h-5 w-5 animate-spin lg:h-6 lg:w-6 text-zinc-500" />
          </div>
        ) : error ? (
          // Error state - Mobile: reduced padding, Desktop: full padding
          <div className="p-3 bg-red-900/20 text-red-400 text-sm rounded-lg lg:p-4">
            Error loading comments: {error.message}
          </div>
        ) : topLevelComments.length > 0 ? (
          <>
            {topLevelComments.map((comment: any, index: number) => {
              // Comment card - Mobile: compact padding, Desktop: spacious padding
              return (
                <div 
                  key={`${(comment as any).isPublic ? 'public' : 'auth'}-${comment.id}`}
                  id={`comment-${(comment as any).isPublic ? 'public' : 'auth'}-${comment.id}`}
                  onClick={(e) => {
                    // Ignore clicks that originated inside an editable
                    // descendant (e.g. the inline edit textarea) — otherwise
                    // typing/clicking inside the edit box re-fires the
                    // "select comment" path and remounts the textarea,
                    // wiping any manual resize.
                    if (isEditableTarget(e.target)) return;
                    if (comment.timestamp !== null) {
                      onTimeClick(comment.timestamp);
                    }
                    if (onCommentSelect) {
                      onCommentSelect(comment.id);
                    }
                  }}
                  onKeyDown={comment.timestamp !== null ? (e) => {
                    // Don't hijack Space/Enter when the user is typing in
                    // an input/textarea inside the card — otherwise the
                    // spacebar seeks/plays the video instead of inserting
                    // a space, and Enter jumps the playhead instead of
                    // inserting a newline / submitting.
                    if (isEditableTarget(e.target)) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onTimeClick(comment.timestamp);
                      if (onCommentSelect) {
                        onCommentSelect(comment.id);
                      }
                    }
                  } : undefined}
                  className={`group relative rounded-2xl p-3.5 transition-colors cursor-pointer ${
                    activeCommentId === comment.id ? 'bg-zinc-900 ring-1 ring-cyan-400/40' : 'bg-zinc-900/70 hover:bg-zinc-900'
                  }`}
                  title={comment.timestamp !== null ? `Jump to ${formatTime(comment.timestamp)} in the video` : "Select this comment"}
                  role="button"
                  tabIndex={0}
                  onMouseEnter={() => onCommentHover?.(comment)}
                  onMouseLeave={() => onCommentLeave?.()}
                >

                  <div className="flex gap-3">
                    {/* Avatar - Mobile: smaller, Desktop: normal */}
                    <div className="relative shrink-0">
                    <Avatar className="h-8 w-8 lg:h-9 lg:w-9">
                      <AvatarImage src={comment.user?.avatar} />
                      <AvatarFallback className="bg-muted text-foreground text-xs">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                        </svg>
                      </AvatarFallback>
                    </Avatar>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs font-semibold text-zinc-200">
                            {(comment as any).authorName || comment.user?.name || comment.user?.username || 'Unknown User'}
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true }).replace(/^about /, "")}
                          </span>
                          {comment.timestamp !== null && (
                            <div className="flex items-center gap-1.5 ml-auto">
                               <button
                                 type="button"
                                 onClick={(e) => { e.stopPropagation(); onTimeClick(comment.timestamp); }}
                                 className="rounded-lg bg-cyan-950/50 px-2 py-0.5 text-xs font-mono font-medium text-cyan-400 transition-colors hover:bg-cyan-900/80"
                              >
                                {(comment as any).inPoint != null && (comment as any).outPoint != null
                                  ? `${formatTimeShort((comment as any).inPoint)} → ${formatTimeShort((comment as any).outPoint)}`
                                  : formatTime(comment.timestamp)}
                               </button>
                              {(comment as any).annotations && (
                                 <PenTool className="h-3 w-3 text-yellow-400" aria-label="Has drawing annotation" />
                              )}
                              {comment.isResolved && (
                                <Check className="h-3 w-3 text-green-500" />
                              )}
                            </div>
                          )}
                        </div>
                        <MoreHorizontal className="h-4 w-4 shrink-0 text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>


                      {editingId === comment.id ? (
                        <div className="mb-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                          <Textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="min-h-[80px] text-sm"
                            data-testid={`textarea-edit-comment-${comment.id}`}
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              disabled={!editContent.trim() || updateCommentMutation.isPending}
                              onClick={(e) => { e.stopPropagation(); handleSaveEdit(comment); }}
                              data-testid={`button-save-edit-${comment.id}`}
                            >
                              <Check className="h-3 w-3 mr-1" /> Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={(e) => { e.stopPropagation(); setEditingId(null); setEditContent(""); }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2.5 mb-3 text-xs leading-relaxed text-zinc-300">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents300}
                          >
                            {comment.content}
                          </ReactMarkdown>
                        </div>
                      )}

                      {/* Reactions Display */}
                      <ReactionsDisplay 
                        commentId={comment.id}
                      />

                      {/* Action buttons - Mobile: smaller spacing, Desktop: normal */}
                       <div className="mt-3 flex items-center gap-4 text-xs text-zinc-400">
                        <button
                           className="flex items-center gap-1 transition-colors hover:text-zinc-200"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReplyingToId(replyingToId === comment.id ? null : comment.id);
                          }}
                        >
                          <Reply className="h-3.5 w-3.5" /> Reply
                        </button>

                        {/* Resolve button - only show for authenticated users */}
                        {user && (
                          <button
                            className={cn(
                              "flex items-center gap-1 transition-colors",
                              comment.isResolved
                                ? "text-emerald-400 hover:text-emerald-300"
                                : "hover:text-zinc-200"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleResolutionMutation.mutate({
                                commentId: comment.id,
                                isResolved: !comment.isResolved
                              });
                            }}
                            disabled={toggleResolutionMutation.isPending}
                          >
                            <Check className="h-3.5 w-3.5" /> {comment.isResolved ? "Unresolve" : "Resolve"}
                          </button>
                        )}

                        {canEditComment(comment) && editingId !== comment.id && (
                          <button
                            className="flex items-center gap-1 transition-colors hover:text-zinc-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(comment);
                            }}
                            data-testid={`button-edit-comment-${comment.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                        )}

                        {canDeleteComment(comment) && (
                          <button
                            className="flex items-center gap-1 transition-colors hover:text-red-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteComment(comment);
                            }}
                            disabled={deleteCommentMutation.isPending}
                            data-testid={`button-delete-comment-${comment.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        )}

                        {/* Reaction picker */}
                        <div className="inline-flex items-center ml-auto">
                          <ReactionPicker 
                            commentId={comment.id}
                          />
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Reply form - Mobile: reduced padding, Desktop: full padding */}
                  {replyingToId === comment.id && (
                    <div className="mt-3 pl-8 border-l-2 border-zinc-800 lg:pl-11">
                      <CommentForm
                        fileId={fileId}
                        parentId={comment.id}
                        onSuccess={() => setReplyingToId(null)}
                      />
                    </div>
                  )}

                  {/* Replies section - Mobile: reduced padding, Desktop: full padding */}
                  <div className="pl-8 lg:pl-11">
                    <RenderReplies comments={filteredComments || []} parentId={comment.id} depth={0} />
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          // Empty state - Mobile: compact padding, Desktop: spacious padding
          <div className="mx-1 flex flex-col items-center justify-center rounded-xl bg-white/[0.025] py-10 text-center lg:py-14">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-400/10">
              <MessageSquare className="h-5 w-5 text-sky-300" />
            </div>
            <p className="text-sm font-medium text-foreground/80">
              {filter !== "all" ? `No ${filter} comments` : "No comments yet"}
            </p>
            {filter === "all" && (
            <p className="mt-1 text-xs text-zinc-500">Start a frame-accurate review note below.</p>
            )}
          </div>
        )}
      </div>

      {/* Comment Input - Mobile: hidden, Desktop: visible flex footer */}
      <div className="hidden lg:block shrink-0">
        <CommentForm
          fileId={fileId}
          currentTime={currentTime}
          className="rounded-none border-0 pb-[calc(env(safe-area-inset-bottom,0px)+8px)]"
          pendingAnnotations={pendingAnnotations}
          onStartAnnotation={onStartAnnotation}
          onClearAnnotations={onClearAnnotations}
          inPoint={inPoint}
          outPoint={outPoint}
          onClearInOutPoints={onClearInOutPoints}
        />
      </div>
    </div>
  );
}
