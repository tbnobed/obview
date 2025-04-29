import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Get team members for a project
export function useTeamMembers(projectId: number) {
  return useQuery({
    queryKey: ["/api/projects", projectId, "members"],
    enabled: !!projectId,
  });
}

// Remove a team member from the project
export function useRemoveTeamMember() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ projectId, userId }: { projectId: number; userId: number }) => {
      const response = await apiRequest(
        "DELETE", 
        `/api/projects/${projectId}/users/${userId}`
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to remove team member");
      }
      
      return { projectId, userId };
    },
    onSuccess: ({ projectId }) => {
      // Invalidate team members query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "members"] });
      
      toast({
        title: "Team member removed",
        description: "The user has been removed from the project",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove team member",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Update a team member's role
export function useUpdateTeamMemberRole() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ 
      projectId, 
      userId, 
      role 
    }: { 
      projectId: number; 
      userId: number; 
      role: string 
    }) => {
      const response = await apiRequest(
        "PATCH", 
        `/api/projects/${projectId}/users/${userId}`,
        { role }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update team member role");
      }
      
      return { projectId, userId, role };
    },
    onSuccess: ({ projectId }) => {
      // Invalidate team members query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "members"] });
      
      toast({
        title: "Role updated",
        description: "The team member's role has been updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update role",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}