import { useQuery } from "@tanstack/react-query";
import { ActivityLog } from "@shared/schema";

// Hook to fetch all activities for a project
export const useProjectActivities = (projectId?: number) => {
  return useQuery<(ActivityLog & { user?: any })[]>({
    queryKey: [`/api/projects/${projectId}/activities`],
    enabled: !!projectId,
  });
};

// Hook to fetch all activities for a user
export const useUserActivities = (userId?: number) => {
  return useQuery<ActivityLog[]>({
    queryKey: [`/api/users/${userId}/activities`],
    enabled: !!userId,
  });
};