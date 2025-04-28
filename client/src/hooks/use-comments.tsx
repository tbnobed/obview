import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Hook to fetch all comments for a specific file
export const useComments = (fileId?: number) => {
  return useQuery({
    queryKey: ['/api/files', fileId, 'comments'],
    queryFn: ({ signal }) => apiRequest('GET', `/api/files/${fileId}/comments`, undefined, { signal }),
    enabled: !!fileId,
  });
};

// Hook to fetch all comments across all files in a project
export const useProjectComments = (projectId?: number) => {
  return useQuery({
    queryKey: ['/api/projects', projectId, 'comments'],
    queryFn: ({ signal }) => apiRequest('GET', `/api/projects/${projectId}/comments`, undefined, { signal }),
    enabled: !!projectId,
  });
};

// Hook to create a new comment on a file
export const useCreateComment = (fileId: number) => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: (data: { content: string; timestamp?: number | null; parentId?: number | null }) => {
      return apiRequest('POST', `/api/files/${fileId}/comments`, data);
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['/api/files', fileId, 'comments'] });
      toast({
        title: "Comment added",
        description: "Your comment has been added successfully"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add comment",
        description: error.message,
        variant: "destructive"
      });
    }
  });
};

// Hook to toggle comment resolution status
export const useToggleCommentResolution = (fileId: number) => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: ({ commentId, isResolved }: { commentId: number, isResolved: boolean }) => {
      return apiRequest('PATCH', `/api/comments/${commentId}`, { isResolved });
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['/api/files', fileId, 'comments'] });
      toast({
        title: "Comment updated",
        description: "Comment resolution status updated successfully"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update comment",
        description: error.message,
        variant: "destructive"
      });
    }
  });
};

// Hook to delete a comment
export const useDeleteComment = (fileId: number) => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: (commentId: number) => {
      return apiRequest('DELETE', `/api/comments/${commentId}`);
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['/api/files', fileId, 'comments'] });
      toast({
        title: "Comment deleted",
        description: "Comment has been deleted successfully"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete comment",
        description: error.message,
        variant: "destructive"
      });
    }
  });
};

// Hook to get file approvals
export const useApprovals = (fileId?: number) => {
  return useQuery({
    queryKey: ['/api/files', fileId, 'approvals'],
    queryFn: ({ signal }) => apiRequest('GET', `/api/files/${fileId}/approvals`, undefined, { signal }),
    enabled: !!fileId,
  });
};

// Hook to approve/request changes on a file
export const useApproveFile = (fileId: number) => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: (data: { status: string; feedback?: string }) => {
      return apiRequest('POST', `/api/files/${fileId}/approvals`, data);
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['/api/files', fileId, 'approvals'] });
      toast({
        title: "Review submitted",
        description: "Your feedback has been submitted successfully"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit review",
        description: error.message,
        variant: "destructive"
      });
    }
  });
};