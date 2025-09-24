import { useQuery, useMutation } from "@tanstack/react-query";
import { Folder } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export const useFolders = () => {
  return useQuery<Folder[]>({
    queryKey: ["/api/folders"],
    select: (data) => {
      // Sort folders by name alphabetically
      return [...data].sort((a, b) => a.name.localeCompare(b.name));
    }
  });
};

export const useFolder = (folderId: number, options = {}) => {
  return useQuery<Folder>({
    queryKey: [`/api/folders/${folderId}`],
    enabled: folderId > 0,
    ...options,
  });
};

export const useCreateFolder = () => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/folders", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Folder created",
        description: "Your new folder has been created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create folder",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

export const useUpdateFolder = (folderId: number) => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/folders/${folderId}`, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Folder updated",
        description: "Your folder has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      queryClient.invalidateQueries({ queryKey: [`/api/folders/${folderId}`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update folder",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

export const useDeleteFolder = () => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (folderId: number) => {
      await apiRequest("DELETE", `/api/folders/${folderId}`);
    },
    onSuccess: () => {
      toast({
        title: "Folder deleted",
        description: "Your folder has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] }); // Also refresh projects in case they were in this folder
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete folder",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

export const useFolderProjects = (folderId: number) => {
  return useQuery<any[]>({
    queryKey: [`/api/folders/${folderId}/projects`],
    enabled: folderId > 0,
  });
};