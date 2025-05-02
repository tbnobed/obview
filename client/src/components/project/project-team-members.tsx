import { TeamMember, useTeamMembers, useRemoveTeamMember, useUpdateTeamMemberRole } from "@/hooks/use-team-members";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2, UserPlus, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
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
import { useState } from "react";

interface ProjectTeamMembersProps {
  projectId: number;
  onInviteClick: () => void;
}

export function ProjectTeamMembers({ projectId, onInviteClick }: ProjectTeamMembersProps) {
  const [pendingRemoveUserId, setPendingRemoveUserId] = useState<number | null>(null);
  const { user: currentUser } = useAuth();
  const { data: teamMembers = [], isLoading, error } = useTeamMembers(projectId);
  const removeTeamMemberMutation = useRemoveTeamMember();
  const updateRoleMutation = useUpdateTeamMemberRole();
  
  const handleRemoveTeamMember = () => {
    if (pendingRemoveUserId) {
      removeTeamMemberMutation.mutate({ 
        projectId, 
        userId: pendingRemoveUserId 
      }, {
        onSuccess: () => {
          setPendingRemoveUserId(null);
        }
      });
    }
  };
  
  const handleRoleChange = (userId: number, role: string) => {
    updateRoleMutation.mutate({ projectId, userId, role });
  };

  const isCurrentUser = (userId: number) => currentUser?.id === userId;
  const isProjectCreator = (member: any) => member.role === "admin";

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
        Error loading team members
      </div>
    );
  }

  if (teamMembers.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500 dark:text-gray-400 border dark:border-gray-800 rounded-md">
        <Users className="h-10 w-10 mx-auto mb-2 text-gray-400 dark:text-gray-500" />
        <p>No team members yet</p>
        <p className="text-sm mt-1 mb-4">Invite members to collaborate on this project</p>
        <Button 
          size="sm" 
          className="flex items-center mx-auto dark:bg-[#026d55] dark:text-white dark:hover:bg-[#025943]/90 hover-teal"
          onClick={onInviteClick}
        >
          <UserPlus className="h-4 w-4 mr-1.5" />
          Invite Members
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-md divide-y dark:border-gray-800 dark:divide-gray-800">
        {teamMembers.map((member: any) => (
          <div key={member.id} className="flex items-center justify-between p-3 hover-smooth-light dark:bg-[#0a0d14] dark:text-white hover-subtle-dark">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={`https://avatar.vercel.sh/${member.user?.name || member.user?.email}?size=64`} />
                <AvatarFallback>
                  {member.user?.name?.[0] || member.user?.email?.[0] || '?'}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium dark:text-white">
                  {member.user?.name || member.user?.email || 'Unknown User'}
                  {isCurrentUser(member.userId) && (
                    <Badge variant="outline" className="ml-2 text-xs">You</Badge>
                  )}
                  {isProjectCreator(member) && (
                    <Badge className="ml-2 text-xs">Owner</Badge>
                  )}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{member.user?.email}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Role Selector */}
              <Select
                value={member.role}
                disabled={isCurrentUser(member.userId) || isProjectCreator(member)}
                onValueChange={(value) => {
                  handleRoleChange(member.userId, value);
                }}
              >
                <SelectTrigger className="w-[110px]">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>

              {/* Remove User Button */}
              {!isCurrentUser(member.userId) && !isProjectCreator(member) && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="ghost"
                            className="text-gray-500 hover:text-red-600 hover:bg-red-50/40 dark:text-gray-400 dark:hover:text-red-500 dark:hover:bg-red-950/10 transition-colors duration-200"
                            onClick={() => setPendingRemoveUserId(member.userId)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove team member</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove {member.user?.name || member.user?.email} from this project? 
                              They will lose access to the project and all its contents.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setPendingRemoveUserId(null)}>
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={handleRemoveTeamMember}
                              className="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                            >
                              {removeTeamMemberMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : null}
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Remove from project</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}