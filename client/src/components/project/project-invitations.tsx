import { useProjectInvitations, useDeleteInvitation, useResendInvitation } from "@/hooks/use-invitations";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, Mail, Clock, RefreshCw } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { useState } from "react";

interface ProjectInvitationsProps {
  projectId: number;
}

export function ProjectInvitations({ projectId }: ProjectInvitationsProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const { data: invitations = [], isLoading, error } = useProjectInvitations(projectId);
  const deleteInvitationMutation = useDeleteInvitation();
  const resendInvitationMutation = useResendInvitation();
  
  const handleDeleteInvitation = async () => {
    if (pendingDeleteId) {
      await deleteInvitationMutation.mutateAsync(pendingDeleteId);
      setPendingDeleteId(null);
    }
  };
  
  const handleResendInvitation = async (invitationId: number) => {
    await resendInvitationMutation.mutateAsync(invitationId);
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

  if (invitations.length === 0) {
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
        {invitations.map((invitation: any) => (
          <div 
            key={invitation.id} 
            className="flex items-center justify-between p-3 border rounded-lg bg-white shadow-sm"
          >
            <div className="flex items-center space-x-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {invitation.email && invitation.email.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex flex-col">
                <div className="font-medium">{invitation.email}</div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Badge variant="outline" className="mr-2 px-1.5">
                    {invitation.role || "Viewer"}
                  </Badge>
                  
                  {/* Email delivery status with debug info */}
                  {invitation.emailSent === true ? (
                    <Badge variant="outline" className="px-1.5 mr-2 bg-green-50 text-green-700 border-green-200">
                      <Mail className="h-3 w-3 mr-1" />
                      Email sent
                    </Badge>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="px-1.5 mr-2 bg-amber-50 text-amber-700 border-amber-200 cursor-help">
                            <Mail className="h-3 w-3 mr-1" />
                            {typeof invitation.emailSent === 'undefined' ? 'Email status unknown' : 'Email not sent'}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">
                            {typeof invitation.emailSent === 'undefined' 
                              ? 'Email status could not be determined. Click the refresh button to update status.' 
                              : 'Click the refresh button to try sending the email again.'}
                          </p>
                          <p className="max-w-xs text-xs mt-1">Current status: {JSON.stringify({
                            emailSent: invitation.emailSent,
                            type: typeof invitation.emailSent
                          })}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  
                  <div className="flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    <span>Expires {invitation.expiresAt ? formatTimeAgo(new Date(invitation.expiresAt)) : "soon"}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center">
              <div className="text-sm text-muted-foreground mr-4 hidden md:block">
                <span>Invited by {invitation.creator?.name || "Unknown"}</span>
              </div>
              
              {/* Resend button - always show, with different tooltip */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleResendInvitation(invitation.id)}
                      className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 mr-1"
                      disabled={resendInvitationMutation.isPending}
                    >
                      {resendInvitationMutation.isPending && resendInvitationMutation.variables === invitation.id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-5 w-5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{invitation.emailSent ? "Send again" : "Resend invitation email"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <AlertDialog open={pendingDeleteId === invitation.id} onOpenChange={(open) => {
                if (!open) setPendingDeleteId(null);
              }}>
                <AlertDialogTrigger asChild>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => setPendingDeleteId(invitation.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Delete invitation</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </AlertDialogTrigger>
                
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete invitation?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the invitation sent to <span className="font-semibold">{invitation.email || "this user"}</span>. 
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