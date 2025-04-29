import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface TeamMember {
  id: number;
  projectId: number;
  userId: number;
  role: string;
  createdAt: string;
  user: {
    id: number;
    username: string;
    email: string;
    name: string;
    role: string;
    createdAt: string;
  };
}

// Hook to fetch team members for a specific project
export function useTeamMembers(projectId: number) {
  return useQuery<TeamMember[]>({
    queryKey: ["/api/projects", projectId, "users"],
    queryFn: async () => {
      console.log("Fetching team members for project", projectId);
      const response = await fetch(`/api/projects/${projectId}/users`, {
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch team members");
      }
      
      const data = await response.json();
      console.log("Team members response:", data);
      return data;
    },
    enabled: !!projectId,
  });
}

// Hook to remove a team member from a project
export function useRemoveTeamMember() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ projectId, userId }: { projectId: number; userId: number }) => {
      const response = await apiRequest(
        "DELETE", 
        `/api/projects/${projectId}/users/${userId}`
      );
      return response.ok;
    },
    onSuccess: (_, variables) => {
      // Invalidate team members query to refresh the list
      queryClient.invalidateQueries({ 
        queryKey: ["/api/projects", variables.projectId, "users"] 
      });
      
      toast({
        title: "Member removed",
        description: "Team member has been removed from the project"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove member",
        description: error.message,
        variant: "destructive"
      });
    }
  });
}

// Hook to update a team member's role
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
        throw new Error("Failed to update role");
      }
      
      return await response.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate team members query to refresh the list
      queryClient.invalidateQueries({ 
        queryKey: ["/api/projects", variables.projectId, "users"] 
      });
      
      toast({
        title: "Role updated",
        description: `Member role has been updated to ${variables.role}`
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update role",
        description: error.message,
        variant: "destructive"
      });
    }
  });
}