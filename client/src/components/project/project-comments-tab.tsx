import { useProjectComments } from "@/hooks/use-comments";
import { Loader2, FileVideo } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatTimeAgo } from "@/lib/utils/formatters";

export function ProjectCommentsTab({ projectId }: { projectId: number }) {
  const { data: comments, isLoading, error } = useProjectComments(projectId);
  
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
        Error loading comments. Please try again.
      </div>
    );
  }
  
  if (!comments || comments.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500">
        No comments found for this project.
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {comments.map(comment => (
        <div key={comment.id} className="border rounded-lg p-4">
          <div className="flex items-start gap-4">
            <Avatar>
              <AvatarFallback>
                {comment.user?.name ? comment.user.name.substring(0, 2).toUpperCase() : 'U'}
              </AvatarFallback>
              {comment.user?.avatarUrl && <AvatarImage src={comment.user.avatarUrl} />}
            </Avatar>
            
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium">{comment.user?.name || 'Unknown User'}</div>
                <div className="text-sm text-neutral-500">{formatTimeAgo(new Date(comment.createdAt))}</div>
              </div>
              
              <div className="text-neutral-700">{comment.content}</div>
              
              <div className="mt-2 flex items-center text-sm">
                <div className="bg-neutral-100 px-2 py-1 rounded text-neutral-600 flex items-center">
                  <FileVideo className="h-3 w-3 mr-1" />
                  {comment.file?.filename || 'Unknown file'}
                </div>
                
                {comment.isResolved && (
                  <Badge className="ml-2 bg-green-100 text-green-800 hover:bg-green-100">Resolved</Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}