import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Invitation {
  id: number;
  email: string;
  role: string;
  projectId: number;
  token: string;
  expiresAt: string;
  isAccepted: boolean;
  createdById: number;
  createdAt: string;
  creator?: {
    id: number;
    name: string;
    email: string;
    username: string;
  };
}

export function useProjectInvitations(projectId?: number) {
  const { toast } = useToast();
  
  const queryKey = projectId ? [`/api/projects/${projectId}/invitations`] : ["skip-query"];
  
  const query = useQuery<Invitation[]>({
    queryKey,
    enabled: !!projectId,
    retry: 1,
    staleTime: 30000, // 30 seconds
  });
  
  // Handle errors with a side effect
  React.useEffect(() => {
    if (query.error) {
      console.error("Error fetching invitations:", query.error);
      toast({
        title: "Error loading invitations",
        description: query.error instanceof Error 
          ? query.error.message 
          : "Failed to load project invitations",
        variant: "destructive",
      });
    }
  }, [query.error, toast]);
  
  return query;
}

export function useDeleteInvitation() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (invitationId: number) => {
      try {
        await apiRequest("DELETE", `/api/invite/${invitationId}`);
        return true;
      } catch (error) {
        console.error("Error deleting invitation:", error);
        throw error;
      }
    },
    onSuccess: (_data, invitationId, context) => {
      toast({
        title: "Invitation deleted",
        description: "The invitation has been successfully deleted.",
      });
      
      // Invalidate both project and project invitations queries
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete invitation",
        description: error.message || "An error occurred while deleting the invitation",
        variant: "destructive",
      });
    },
  });
}

export function useInvitationDetails(token?: string) {
  return useQuery<Invitation>({
    queryKey: token ? ["/api/invite", token] : ["skip-invite-query"],
    enabled: !!token,
  });
}

export function useAcceptInvitation() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (token: string) => {
      const response = await apiRequest("POST", `/api/invite/${token}/accept`);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Invitation accepted",
        description: "You have successfully joined the project.",
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invite"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to accept invitation",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}