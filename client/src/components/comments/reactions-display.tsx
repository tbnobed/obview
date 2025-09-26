import { useCommentReactions, useAddReaction, useRemoveReaction } from "@/hooks/use-reactions";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

interface ReactionsDisplayProps {
  commentId: string;
}

export default function ReactionsDisplay({ commentId }: ReactionsDisplayProps) {
  const { user } = useAuth();
  const { data: reactions = [], isLoading } = useCommentReactions(commentId);
  const addReaction = useAddReaction(commentId);
  const removeReaction = useRemoveReaction(commentId);

  const handleReactionClick = async (reactionType: string, userReacted: boolean) => {
    try {
      if (userReacted) {
        await removeReaction.mutateAsync({ reactionType });
      } else {
        await addReaction.mutateAsync({ reactionType });
      }
    } catch (error) {
      console.error("Failed to toggle reaction:", error);
    }
  };

  if (isLoading || reactions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactions.map(({ reactionType, count, userReacted }) => (
        <button
          key={reactionType}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors",
            "border border-gray-200 dark:border-gray-700",
            userReacted
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700"
              : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          )}
          onClick={() => handleReactionClick(reactionType, userReacted || false)}
          disabled={addReaction.isPending || removeReaction.isPending}
        >
          <span>{reactionType}</span>
          <span className="text-[10px]">{count}</span>
        </button>
      ))}
    </div>
  );
}