import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Loader2 } from "lucide-react";

interface InviteFormProps {
  projectId: number;
  onInviteSent?: () => void;
}

export default function InviteForm({ projectId, onInviteSent }: InviteFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const inviteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/invite", {
        email,
        projectId,
        role,
      });
    },
    onSuccess: (response) => {
      // Log the complete response for debugging
      console.log("Invitation creation response:", response);
      
      // Check if the email was actually sent
      const emailSent = response?.emailSent;
      
      // Show appropriate toast based on email delivery status
      if (emailSent) {
        toast({
          title: "Invitation sent",
          description: `An invitation has been sent to ${email}`,
          variant: "default",
        });
      } else {
        toast({
          title: "Invitation created",
          description: `An invitation for ${email} was created, but there was an issue sending the email. The user can still join using the invitation link.`,
          variant: "destructive",
        });
      }

      // Clear the form
      setEmail("");
      
      // More aggressive cache invalidation to ensure UI is updated
      // Force refresh all project and invitation data
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] }); 
      
      // Invalidate all invitations queries with a specific pattern
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && 
            (key.includes('/invitations') || key.includes('/invite') || key.includes('/projects'));
        }
      });
      
      // Call the callback if provided
      if (onInviteSent) {
        onInviteSent();
      }
    },
    onError: (error: Error) => {
      // Show error toast
      toast({
        title: "Error sending invitation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }
    inviteMutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email Address</Label>
        <Input
          id="email"
          type="email"
          placeholder="colleague@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger id="role">
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {role === "viewer" && "Can view files and add comments"}
          {role === "editor" && "Can upload files and manage comments"}
          {role === "admin" && "Full control, including inviting team members"}
        </p>
      </div>
      
      <Button 
        type="submit" 
        className="w-full"
        disabled={inviteMutation.isPending}
      >
        {inviteMutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending invitation...
          </>
        ) : (
          <>
            {inviteMutation.isSuccess ? (
              <CheckCircle className="mr-2 h-4 w-4" />
            ) : null}
            Send Invitation
          </>
        )}
      </Button>
    </form>
  );
}