import { useProjectActivities } from "@/hooks/use-activities";
import { Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatTimeAgo } from "@/lib/utils/formatters";

export function ProjectActivityTab({ projectId }: { projectId: number }) {
  const { data: activities, isLoading, error } = useProjectActivities(projectId);
  
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="text-center py-8 text-neutral-500">
        Error loading activities. Please try again.
      </div>
    );
  }
  
  if (!activities || activities.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500">
        No activities found for this project.
      </div>
    );
  }

  // Helper to render readable action text
  const getActivityText = (activity: any) => {
    const actor = activity.user?.name || 'Someone';
    
    switch (activity.action) {
      case 'create':
        return `${actor} created a ${activity.entityType}`;
      case 'update':
        return `${actor} updated a ${activity.entityType}`;
      case 'delete':
        return `${actor} deleted a ${activity.entityType}`;
      case 'comment':
        return `${actor} commented on a file`;
      case 'resolve_comment':
        return `${actor} resolved a comment`;
      case 'unresolve_comment':
        return `${actor} reopened a comment`;
      case 'approve':
        return `${actor} approved a file`;
      case 'request_changes':
        return `${actor} requested changes on a file`;
      default:
        return `${actor} performed an action on ${activity.entityType}`;
    }
  };
  
  return (
    <div className="border rounded-lg bg-white">
      <div className="p-4 border-b">
        <h3 className="font-medium">Recent Activity</h3>
      </div>
      <div className="divide-y">
        {activities.map(activity => (
          <div key={activity.id} className="p-4 flex items-start gap-4">
            <Avatar className="mt-0.5">
              <AvatarFallback>
                {activity.user?.name ? activity.user.name.substring(0, 2).toUpperCase() : 'U'}
              </AvatarFallback>
              {activity.user?.avatarUrl && <AvatarImage src={activity.user.avatarUrl} />}
            </Avatar>
            
            <div className="flex-1">
              <p className="text-sm text-neutral-700">
                {getActivityText(activity)}
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                {formatTimeAgo(new Date(activity.createdAt))}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}