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
  return useQuery<Invitation[]>({
    queryKey: projectId ? ["/api/projects", projectId, "invitations"] : ["skip-query"],
    enabled: !!projectId,
  });
}

export function useDeleteInvitation() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (invitationId: number) => {
      await apiRequest("DELETE", `/api/invite/${invitationId}`);
    },
    onSuccess: (_data, invitationId, context) => {
      toast({
        title: "Invitation deleted",
        description: "The invitation has been successfully deleted.",
      });
      
      // We need to invalidate project invitations queries
      // This will ensure that any component showing the list of invitations updates
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete invitation",
        description: error.message,
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