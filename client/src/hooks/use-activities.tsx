import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Hook to get all activities for a specific project
export const useProjectActivities = (projectId?: number) => {
  return useQuery({
    queryKey: ['/api/projects', projectId, 'activities'],
    queryFn: ({ signal }) => apiRequest('GET', `/api/projects/${projectId}/activities`, undefined, { signal }),
    enabled: !!projectId
  });
};

// Hook to get all activities for a specific user
export const useUserActivities = (userId?: number) => {
  return useQuery({
    queryKey: ['/api/users', userId, 'activities'],
    queryFn: ({ signal }) => apiRequest('GET', `/api/users/${userId}/activities`, undefined, { signal }),
    enabled: !!userId
  });
};