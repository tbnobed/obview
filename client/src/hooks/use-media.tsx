import { useQuery, useMutation } from "@tanstack/react-query";
import { File } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Get all files for a project
export const useMediaFiles = (projectId?: number) => {
  return useQuery<File[]>({
    queryKey: [`/api/projects/${projectId}/files`],
    enabled: !!projectId,
  });
};

// Get a specific file by ID
export const useMediaFile = (fileId?: number) => {
  return useQuery<File>({
    queryKey: fileId ? [`/api/files/${fileId}`] : ['file', 'disabled'],
    queryFn: ({ signal }) => apiRequest('GET', `/api/files/${fileId}`, undefined, { signal }),
    enabled: !!fileId,
  });
};

// Upload a new file to a project
export const useFileUpload = (projectId: number) => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (formData: FormData) => {
      // For file uploads, we need to use the native fetch API
      // as our apiRequest doesn't support FormData
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || res.statusText);
      }
      
      const responseText = await res.text();
      return responseText ? JSON.parse(responseText) : null;
    },
    onSuccess: () => {
      toast({
        title: "File uploaded",
        description: "Your file has been uploaded successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/files`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
    },
  });
};

// Delete a file
export const useDeleteFile = (projectId: number) => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (fileId: number) => {
      await apiRequest("DELETE", `/api/files/${fileId}`);
    },
    onSuccess: () => {
      // Comprehensive cache invalidation to ensure UI updates immediately
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'files'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/files`] });
      
      toast({
        title: "File deleted",
        description: "The file has been deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete file",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
