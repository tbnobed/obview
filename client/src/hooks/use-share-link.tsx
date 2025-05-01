import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function useShareLink() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createShareLinkMutation = useMutation({
    mutationFn: async (fileId: number) => {
      return await apiRequest("POST", `/api/files/${fileId}/share`);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      return data.shareUrl;
    },
    onError: (error: Error) => {
      toast({
        title: "Error creating share link",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    createShareLink: createShareLinkMutation,
  };
}