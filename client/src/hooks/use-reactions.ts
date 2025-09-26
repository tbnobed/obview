import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getVisitorToken } from "@/lib/utils/visitor-token";

export interface CommentReaction {
  reactionType: string;
  count: number;
  userReacted: boolean;
}

export interface CommentReactionWithUsers {
  reactionType: string;
  count: number;
  userReacted: boolean;
  users: { name: string; isCurrentUser: boolean }[];
}

export function useCommentReactions(commentId: string) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['/api/comments', commentId, 'reactions'],
    queryFn: async (): Promise<CommentReaction[]> => {
      const headers: Record<string, string> = {};
      
      // Add visitor token for anonymous users
      if (!user) {
        headers['X-Visitor-Token'] = getVisitorToken();
      }
      
      const response = await fetch(`/api/comments/${commentId}/reactions`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch reactions: ${response.statusText}`);
      }
      
      return await response.json();
    },
  });
}

export function useAddReaction(commentId: string) {
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ reactionType }: { reactionType: string }) => {
      const payload: any = { reactionType };
      
      // Use visitor token for anonymous users, no token for authenticated users
      if (!user) {
        payload.visitorToken = getVisitorToken();
      }
      
      return await apiRequest("POST", `/api/comments/${commentId}/reactions`, payload);
    },
    onSuccess: () => {
      // Invalidate reactions for this comment
      queryClient.invalidateQueries({ queryKey: ['/api/comments', commentId, 'reactions'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add reaction",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useRemoveReaction(commentId: string) {
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ reactionType }: { reactionType: string }) => {
      const payload: any = { reactionType };
      
      // Use visitor token for anonymous users, no token for authenticated users
      if (!user) {
        payload.visitorToken = getVisitorToken();
      }
      
      return await apiRequest("DELETE", `/api/comments/${commentId}/reactions`, payload);
    },
    onSuccess: () => {
      // Invalidate reactions for this comment
      queryClient.invalidateQueries({ queryKey: ['/api/comments', commentId, 'reactions'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove reaction",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useCommentReactionsWithUsers(commentId: string) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['/api/comments', commentId, 'reactions', 'with-users'],
    queryFn: async (): Promise<CommentReactionWithUsers[]> => {
      const headers: Record<string, string> = {};
      
      // Add visitor token for anonymous users
      if (!user) {
        headers['X-Visitor-Token'] = getVisitorToken();
      }
      
      const response = await fetch(`/api/comments/${commentId}/reactions?includeUsers=true`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch reactions with users: ${response.statusText}`);
      }
      
      return await response.json();
    },
  });
}