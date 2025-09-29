import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Loader2, 
  Trash2, 
  Send, 
  Calendar,
  User,
  Building,
  Globe,
  CheckCircle,
  XCircle,
  Mail,
  MailX,
  Filter
} from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAllInvitations, useDeleteInvitation, useResendInvitation } from "@/hooks/use-invitations";
import { formatDistanceToNow } from "date-fns";

export function PendingInvitations() {
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  
  const { data: invitations = [], isLoading, error } = useAllInvitations();
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

  // Filter invitations
  const filteredInvitations = invitations.filter((invitation) => {
    const matchesSearch = invitation.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invitation.creator?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invitation.project?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === "all" || 
                         (filterStatus === "sent" && invitation.emailSent) ||
                         (filterStatus === "pending" && !invitation.emailSent) ||
                         (filterStatus === "expired" && new Date(invitation.expiresAt) < new Date());
                         
    const matchesType = filterType === "all" ||
                       (filterType === "system" && invitation.isSystemInvite) ||
                       (filterType === "project" && !invitation.isSystemInvite);
                       
    return matchesSearch && matchesStatus && matchesType && !invitation.isAccepted;
  });

  // Get summary stats
  const totalInvitations = invitations.filter(inv => !inv.isAccepted).length;
  const sentInvitations = invitations.filter(inv => !inv.isAccepted && inv.emailSent).length;
  const pendingEmailInvitations = invitations.filter(inv => !inv.isAccepted && !inv.emailSent).length;
  const expiredInvitations = invitations.filter(inv => !inv.isAccepted && new Date(inv.expiresAt) < new Date()).length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Pending Invitations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-500">
            <XCircle className="h-5 w-5" />
            Error Loading Invitations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-500 dark:text-red-400">
            Failed to load invitations. Please refresh to try again.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Pending Invitations
        </CardTitle>
        
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalInvitations}</div>
            <div className="text-sm text-blue-600 dark:text-blue-400">Total Pending</div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{sentInvitations}</div>
            <div className="text-sm text-green-600 dark:text-green-400">Email Sent</div>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{pendingEmailInvitations}</div>
            <div className="text-sm text-yellow-600 dark:text-yellow-400">Email Pending</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{expiredInvitations}</div>
            <div className="text-sm text-red-600 dark:text-red-400">Expired</div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <Input
            placeholder="Search by email, name, or project..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="sm:max-w-sm"
          />
          
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="sm:w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="sent">Email Sent</SelectItem>
              <SelectItem value="pending">Email Pending</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="sm:w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="system">System-wide</SelectItem>
              <SelectItem value="project">Project-specific</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filteredInvitations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground dark:text-gray-400">
            {searchTerm || filterStatus !== "all" || filterType !== "all" 
              ? "No invitations match your filters"
              : "No pending invitations"
            }
          </div>
        ) : (
          <div className="space-y-3">
            {filteredInvitations.map((invitation) => {
              const isExpired = new Date(invitation.expiresAt) < new Date();
              const inviteAge = formatDistanceToNow(new Date(invitation.createdAt), { addSuffix: true });
              
              return (
                <div 
                  key={invitation.id} 
                  className={`flex items-center justify-between p-4 border rounded-lg bg-white dark:bg-[#0f1218] dark:border-gray-800 shadow-sm hover-smooth-light dark:hover-subtle-dark ${isExpired ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10' : ''}`}
                >
                  <div className="flex items-center space-x-4 flex-1">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className={`text-white ${isExpired ? 'bg-red-500' : 'bg-primary'}`}>
                        {invitation.email.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex flex-col flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {invitation.email}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mt-1">
                        <Badge variant="outline" className="px-2 py-1">
                          {invitation.role}
                        </Badge>
                        
                        {invitation.isSystemInvite ? (
                          <div className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            <span>System-wide</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Building className="h-3 w-3" />
                            <span>{invitation.project?.name || 'Unknown Project'}</span>
                          </div>
                        )}
                        
                        {invitation.emailSent ? (
                          <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <CheckCircle className="h-3 w-3" />
                            <span>Email sent</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                            <MailX className="h-3 w-3" />
                            <span>Email pending</span>
                          </div>
                        )}
                        
                        {isExpired && (
                          <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                            <XCircle className="h-3 w-3" />
                            <span>Expired</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        <div className="flex items-center gap-4">
                          <span>Invited by {invitation.creator?.name || 'Unknown'} {inviteAge}</span>
                          <span>Expires {formatDistanceToNow(new Date(invitation.expiresAt), { addSuffix: true })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResendInvitation(invitation.id)}
                      disabled={resendInvitationMutation.isPending}
                      data-testid={`button-resend-${invitation.id}`}
                    >
                      {resendInvitationMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Resend
                    </Button>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPendingDeleteId(invitation.id)}
                          data-testid={`button-delete-${invitation.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Invitation</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete the invitation for {invitation.email}? 
                            This action cannot be undone and they won't be able to join using their current link.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => setPendingDeleteId(null)}>
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={handleDeleteInvitation}
                            disabled={deleteInvitationMutation.isPending}
                            className="bg-red-600 hover:bg-red-700"
                            data-testid={`button-confirm-delete-${invitation.id}`}
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
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}