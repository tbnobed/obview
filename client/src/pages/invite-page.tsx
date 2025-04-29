import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function InvitePage() {
  const { token } = useParams();
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  
  const [status, setStatus] = useState<"loading" | "error" | "success" | "unauthorized">("loading");
  const [message, setMessage] = useState("");
  const [projectName, setProjectName] = useState("");
  const [inviterName, setInviterName] = useState("");

  useEffect(() => {
    // If user is not logged in, redirect to login page with return URL
    if (!authLoading && !user) {
      navigate(`/auth?returnTo=/invite/${token}`);
      return;
    }

    // If user is logged in, validate the token
    if (!authLoading && user) {
      const validateInvitation = async () => {
        try {
          // Fetch invitation details first
          const detailsResponse = await apiRequest("GET", `/api/invite/${token}`);
          
          if (!detailsResponse.ok) {
            const errorData = await detailsResponse.json();
            setStatus("error");
            setMessage(errorData.message || "Invalid invitation link.");
            return;
          }
          
          const invitationDetails = await detailsResponse.json();
          setProjectName(invitationDetails.project?.name || "Unknown Project");
          setInviterName(invitationDetails.creator?.name || "Someone");
          
          // If the email doesn't match
          if (user.email !== invitationDetails.email) {
            setStatus("unauthorized");
            setMessage(`This invitation was sent to ${invitationDetails.email}, but you're logged in with ${user.email}.`);
            return;
          }
          
          // If everything is okay, accept the invitation
          const acceptResponse = await apiRequest("POST", `/api/invite/${token}/accept`);
          
          if (!acceptResponse.ok) {
            const errorData = await acceptResponse.json();
            setStatus("error");
            setMessage(errorData.message || "Failed to accept invitation.");
            return;
          }
          
          // Success!
          setStatus("success");
          
        } catch (error) {
          console.error("Error processing invitation:", error);
          setStatus("error");
          setMessage("An unexpected error occurred. Please try again later.");
        }
      };
      
      validateInvitation();
    }
  }, [token, user, authLoading, navigate]);
  
  // If still loading auth or processing invitation
  if (status === "loading" || authLoading) {
    return (
      <div className="container flex items-center justify-center min-h-[80vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Processing Invitation</CardTitle>
            <CardDescription>Please wait while we verify your invitation</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center py-6">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // If there was an error
  if (status === "error") {
    return (
      <div className="container flex items-center justify-center min-h-[80vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Invitation Error</CardTitle>
            <CardDescription>We couldn't process your invitation</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button asChild>
              <Link href="/">Return to Dashboard</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  // If user is not authorized (wrong email)
  if (status === "unauthorized") {
    return (
      <div className="container flex items-center justify-center min-h-[80vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Wrong Account</CardTitle>
            <CardDescription>This invitation is for a different account</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Wrong Email Address</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="flex flex-col space-y-2 items-stretch">
            <Button variant="outline" asChild>
              <Link href="/auth">Switch Account</Link>
            </Button>
            <Button asChild>
              <Link href="/">Return to Dashboard</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  // If success
  return (
    <div className="container flex items-center justify-center min-h-[80vh]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Invitation Accepted</CardTitle>
          <CardDescription>You've successfully joined the project</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="bg-primary/10 border-primary">
            <CheckCircle className="h-4 w-4 text-primary" />
            <AlertTitle>Success!</AlertTitle>
            <AlertDescription>
              You have successfully joined <strong>{projectName}</strong> invited by {inviterName}.
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button asChild>
            <Link href="/">Go to My Projects</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}