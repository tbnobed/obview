import { useQuery, useMutation } from "@tanstack/react-query";
import { Project } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export const useProjects = () => {
  return useQuery<Project[]>({
    queryKey: ["/api/projects"],
    select: (data) => {
      // Sort projects by updatedAt date (most recent first)
      return [...data].sort((a, b) => {
        // Convert dates to timestamps for comparison
        const dateA = new Date(a.updatedAt || a.createdAt).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt).getTime();
        return dateB - dateA; // Sort descending (newest first)
      });
    }
  });
};

export const useProject = (projectId: number, options = {}) => {
  return useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: projectId > 0,
    ...options,
  });
};

export const useCreateProject = () => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/projects", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Project created",
        description: "Your new project has been created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create project",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

export const useUpdateProject = (projectId: number) => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}`, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Project updated",
        description: "Your project has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update project",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

export const useDeleteProject = () => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (projectId: number) => {
      await apiRequest("DELETE", `/api/projects/${projectId}`);
    },
    onSuccess: () => {
      toast({
        title: "Project deleted",
        description: "Your project has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete project",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

export const useProjectUsers = (projectId: number) => {
  return useQuery<any[]>({
    queryKey: [`/api/projects/${projectId}/users`],
    enabled: projectId > 0,
  });
};

export const useAddUserToProject = (projectId: number) => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/users`, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "User added",
        description: "User has been added to the project successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/users`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add user",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

export const useRemoveUserFromProject = (projectId: number) => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("DELETE", `/api/projects/${projectId}/users/${userId}`);
    },
    onSuccess: () => {
      toast({
        title: "User removed",
        description: "User has been removed from the project successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/users`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove user",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
