import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import * as React from "react";

interface Invitation {
  id: number;
  email: string;
  role: string;
  projectId: number;
  token: string;
  expiresAt: string;
  isAccepted: boolean;
  emailSent: boolean;
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
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      // Invalidate all invitations queries
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          typeof query.queryKey[0] === 'string' && 
          query.queryKey[0].includes('/invitations') 
      });
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
  const { toast } = useToast();
  
  const query = useQuery<Invitation>({
    queryKey: token ? ["/api/invite", token] : ["skip-invite-query"],
    enabled: !!token,
    retry: 1,
  });
  
  // Handle errors with a side effect
  React.useEffect(() => {
    if (query.error) {
      console.error("Error fetching invitation details:", query.error);
      toast({
        title: "Error loading invitation",
        description: query.error instanceof Error 
          ? query.error.message 
          : "Failed to load invitation details",
        variant: "destructive",
      });
    }
  }, [query.error, toast]);
  
  return query;
}

export function useAcceptInvitation() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (token: string) => {
      try {
        const response = await apiRequest("POST", `/api/invite/${token}/accept`);
        return response;
      } catch (error) {
        console.error("Error accepting invitation:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Invitation accepted",
        description: "You have successfully joined the project.",
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      // Invalidate all invitations queries
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          typeof query.queryKey[0] === 'string' && 
          (query.queryKey[0].includes('/invitations') || query.queryKey[0].includes('/invite'))
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to accept invitation",
        description: error.message || "An error occurred while accepting the invitation",
        variant: "destructive",
      });
    },
  });
}

export function useResendInvitation() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (invitationId: number) => {
      try {
        // Include the client's domain for constructing the invite URL
        const data = await apiRequest("POST", `/api/invite/${invitationId}/resend`, {
          clientDomain: window.location.origin
        });
        return data;
      } catch (error) {
        console.error("Error resending invitation:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("Resend invitation response:", data);
      
      if (data && data.emailSent) {
        toast({
          title: "Invitation email sent",
          description: "The invitation email has been successfully sent.",
        });
      } else {
        toast({
          title: "Email delivery issue",
          description: "The invitation was processed but there was an issue sending the email. The recipient may not receive it.",
          variant: "destructive",
        });
      }
      
      // Force refresh all project data
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      
      // Force refresh all invitations queries with a more specific pattern
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && 
            (key.includes('/invitations') || key.includes('/invite') || key.includes('/projects'));
        }
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to resend invitation",
        description: error.message || "An error occurred while resending the invitation",
        variant: "destructive",
      });
    },
  });
}