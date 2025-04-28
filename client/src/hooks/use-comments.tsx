import { useQuery, useMutation } from "@tanstack/react-query";
import { Comment } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Get all comments for a file
export const useComments = (fileId?: number) => {
  return useQuery<(Comment & { user?: any })[]>({
    queryKey: [`/api/files/${fileId}/comments`],
    enabled: !!fileId,
  });
};

// Create a new comment
export const useCreateComment = (fileId: number) => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/files/${fileId}/comments`, {
        ...data,
        fileId,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Comment added",
        description: "Your comment has been added successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/files/${fileId}/comments`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Toggle comment resolved status
export const useToggleCommentResolution = (fileId: number) => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ commentId, isResolved }: { commentId: number, isResolved: boolean }) => {
      const res = await apiRequest("PATCH", `/api/comments/${commentId}`, {
        isResolved,
      });
      return await res.json();
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.isResolved ? "Comment resolved" : "Comment unresolved",
        description: variables.isResolved 
          ? "The comment has been marked as resolved" 
          : "The comment has been marked as unresolved",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/files/${fileId}/comments`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Delete a comment
export const useDeleteComment = (fileId: number) => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (commentId: number) => {
      await apiRequest("DELETE", `/api/comments/${commentId}`);
    },
    onSuccess: () => {
      toast({
        title: "Comment deleted",
        description: "The comment has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/files/${fileId}/comments`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Get approvals for a file
export const useApprovals = (fileId?: number) => {
  return useQuery<any[]>({
    queryKey: [`/api/files/${fileId}/approvals`],
    enabled: !!fileId,
  });
};

// Submit an approval for a file
export const useApproveFile = (fileId: number) => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: { status: string, feedback?: string }) => {
      const res = await apiRequest("POST", `/api/files/${fileId}/approvals`, data);
      return await res.json();
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.status === "approved" ? "File approved" : "Changes requested",
        description: variables.status === "approved" 
          ? "You have approved this file" 
          : "You have requested changes to this file",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/files/${fileId}/approvals`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit approval",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
