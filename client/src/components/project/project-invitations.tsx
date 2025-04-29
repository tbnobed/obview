import { useProjectInvitations, useDeleteInvitation } from "@/hooks/use-invitations";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, Mail, Clock } from "lucide-react";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { useState } from "react";

interface ProjectInvitationsProps {
  projectId: number;
}

export function ProjectInvitations({ projectId }: ProjectInvitationsProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const { data: invitations, isLoading, error } = useProjectInvitations(projectId);
  const deleteInvitationMutation = useDeleteInvitation();
  
  const handleDeleteInvitation = async () => {
    if (pendingDeleteId) {
      await deleteInvitationMutation.mutateAsync(pendingDeleteId);
      setPendingDeleteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        Error loading invitations
      </div>
    );
  }

  if (!invitations || invitations.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No pending invitations
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium mb-4">Pending Invitations</h3>
      
      <div className="space-y-3">
        {invitations.map((invitation) => (
          <div 
            key={invitation.id} 
            className="flex items-center justify-between p-3 border rounded-lg bg-white shadow-sm"
          >
            <div className="flex items-center space-x-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {invitation.email.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex flex-col">
                <div className="font-medium">{invitation.email}</div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Badge variant="outline" className="mr-2 px-1.5">
                    {invitation.role}
                  </Badge>
                  
                  <div className="flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    <span>Expires {formatTimeAgo(new Date(invitation.expiresAt))}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center">
              <div className="text-sm text-muted-foreground mr-4 hidden md:block">
                <span>Invited by {invitation.creator?.name || "Unknown"}</span>
              </div>
              
              <AlertDialog open={pendingDeleteId === invitation.id} onOpenChange={(open) => {
                if (!open) setPendingDeleteId(null);
              }}>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => setPendingDeleteId(invitation.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </AlertDialogTrigger>
                
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete invitation?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the invitation sent to <span className="font-semibold">{invitation.email}</span>. 
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleDeleteInvitation}
                      className="bg-red-500 hover:bg-red-600"
                    >
                      {deleteInvitationMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-2" />
                      )}
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}