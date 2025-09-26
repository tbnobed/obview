import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Smile } from "lucide-react";
import { useAddReaction, useRemoveReaction, useCommentReactions } from "@/hooks/use-reactions";

interface ReactionPickerProps {
  commentId: string;
  userReactions?: string[];
  onReactionToggle?: () => void;
}

const REACTION_OPTIONS = ["👍", "❤️", "👏", "🎉", "😮", "😢", "😡"];

export default function ReactionPicker({ 
  commentId, 
  userReactions = [], 
  onReactionToggle 
}: ReactionPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const addReaction = useAddReaction(commentId);
  const removeReaction = useRemoveReaction(commentId);
  
  // Always call the hook but use userReactions prop if provided
  const { data: reactions = [] } = useCommentReactions(commentId);
  const actualUserReactions = userReactions.length > 0 ? userReactions : reactions.filter(r => r.userReacted).map(r => r.reactionType);

  const handleReactionClick = async (reactionType: string) => {
    try {
      if (actualUserReactions.includes(reactionType)) {
        // Remove reaction
        await removeReaction.mutateAsync({ reactionType });
      } else {
        // Add reaction
        await addReaction.mutateAsync({ reactionType });
      }
      onReactionToggle?.();
      setShowPicker(false);
    } catch (error) {
      console.error("Failed to toggle reaction:", error);
    }
  };

  return (
    <div className="relative">
      <Button 
        variant="link" 
        className="text-[10px] p-0 h-auto text-gray-300 hover:text-yellow-500 transition-colors"
        onClick={() => setShowPicker(!showPicker)}
        disabled={addReaction.isPending || removeReaction.isPending}
      >
        <Smile className="h-3 w-3" />
      </Button>
      
      {showPicker && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-2 z-[100]">
          <div className="flex gap-1">
            {REACTION_OPTIONS.map((reaction) => (
              <button
                key={reaction}
                className={cn(
                  "text-lg p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
                  actualUserReactions.includes(reaction) && "bg-blue-100 dark:bg-blue-900/30"
                )}
                onClick={() => handleReactionClick(reaction)}
                disabled={addReaction.isPending || removeReaction.isPending}
              >
                {reaction}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Overlay to close picker when clicking outside */}
      {showPicker && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowPicker(false)} 
        />
      )}
    </div>
  );
}