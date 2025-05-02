import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, CheckCircle, Mail } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function InvitePage() {
  const { token } = useParams();
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  
  const [status, setStatus] = useState<"loading" | "error" | "success" | "unauthorized" | "login_required">("loading");
  const [message, setMessage] = useState("");
  const [projectName, setProjectName] = useState("");
  const [inviterName, setInviterName] = useState("");
  const [invitationEmail, setInvitationEmail] = useState("");
  const [invitationRole, setInvitationRole] = useState("viewer");
  const [debug, setDebug] = useState<string[]>([]);

  useEffect(() => {
    const addDebug = (msg: string) => {
      setDebug(prev => [...prev, `${new Date().toISOString().split('T')[1].split('.')[0]} - ${msg}`]);
      console.log(msg);
    };

    const checkInvitation = async () => {
      try {
        addDebug(`Processing invitation with token: ${token}`);
        addDebug(`Auth state: ${authLoading ? 'loading' : (user ? 'logged in' : 'not logged in')}`);
        
        // First, fetch invitation details to check if it's valid
        addDebug("Fetching invitation details from API");
        const detailsResponse = await fetch(`/api/invite/${token}`, {
          method: "GET",
          headers: {},
          credentials: "include"
        });
        
        addDebug(`API response status: ${detailsResponse.status} ${detailsResponse.statusText}`);
        
        if (!detailsResponse.ok) {
          let errorMessage = "Invalid invitation link.";
          try {
            const errorData = await detailsResponse.json();
            errorMessage = errorData.message || errorMessage;
          } catch (jsonError) {
            addDebug(`Error parsing error response: ${jsonError}`);
            // If parsing fails, use the status text
            errorMessage = detailsResponse.statusText || errorMessage;
          }
          
          addDebug(`Error from API: ${errorMessage}`);
          setStatus("error");
          setMessage(errorMessage);
          return;
        }
        
        // Successfully got invitation details
        let invitationDetails;
        try {
          invitationDetails = await detailsResponse.json();
          addDebug(`Invitation details: ${JSON.stringify(invitationDetails, null, 2)}`);
        } catch (jsonError) {
          addDebug(`Error parsing invitation details: ${jsonError}`);
          setStatus("error");
          setMessage("Could not parse invitation details");
          return;
        }
        
        // Set UI state from invitation details
        setProjectName(invitationDetails.project?.name || "Unknown Project");
        setInviterName(invitationDetails.creator?.name || "Someone");
        setInvitationEmail(invitationDetails.email || "");
        setInvitationRole(invitationDetails.role || "viewer");
        
        addDebug(`Project: ${invitationDetails.project?.name}, Inviter: ${invitationDetails.creator?.name}, Role: ${invitationDetails.role || "viewer"}`);
        
        // If user is not logged in, show login prompt
        if (!user && !authLoading) {
          addDebug("User not logged in, showing login prompt");
          setStatus("login_required");
          return;
        }
        
        // If user is logged in but the email doesn't match
        if (user && user.email !== invitationDetails.email) {
          addDebug(`Email mismatch: invitation for ${invitationDetails.email}, user logged in as ${user.email}`);
          setStatus("unauthorized");
          setMessage(`This invitation was sent to ${invitationDetails.email}, but you're logged in with ${user.email}.`);
          return;
        }
        
        // If user is logged in and the email matches, accept the invitation
        if (user && user.email === invitationDetails.email) {
          addDebug(`Email match, accepting invitation`);
          try {
            const acceptResponse = await apiRequest("POST", `/api/invite/${token}/accept`);
            addDebug(`Accept response: ${JSON.stringify(acceptResponse)}`);
            
            // Success!
            setStatus("success");
          } catch (acceptError) {
            addDebug(`Error accepting invitation: ${acceptError}`);
            setStatus("error");
            setMessage(acceptError instanceof Error ? acceptError.message : "Failed to accept invitation.");
          }
        }
      } catch (error) {
        addDebug(`Unhandled error: ${error}`);
        console.error("Error processing invitation:", error);
        setStatus("error");
        setMessage("An unexpected error occurred. Please try again later.");
      }
    };
    
    // Only run if we have a token and auth state is loaded
    if (token && !authLoading) {
      checkInvitation();
    } else if (!token) {
      setStatus("error");
      setMessage("Invalid invitation link - no token provided");
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
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
            
            {/* Debug information - only in development */}
            {debug.length > 0 && process.env.NODE_ENV !== 'production' && (
              <div className="mt-4 p-3 bg-gray-100 rounded text-xs font-mono text-gray-800 max-h-40 overflow-auto">
                <h4 className="font-semibold mb-1">Debug Information:</h4>
                {debug.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap mb-1">{line}</div>
                ))}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try Again
            </Button>
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
  
  // If login is required
  if (status === "login_required") {
    // We already have invitationRole as state
    return (
      <div className="container flex items-center justify-center min-h-[80vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Project Invitation</CardTitle>
            <CardDescription>You've been invited to join {projectName}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <Alert className="bg-blue-50 border-blue-200">
                <Mail className="h-4 w-4 text-blue-500" />
                <AlertTitle>Invitation Details</AlertTitle>
                <AlertDescription>
                  <p className="mb-2">You've been invited by <strong>{inviterName}</strong> to join the project <strong>{projectName}</strong>.</p>
                  <p>This invitation was sent to <strong>{invitationEmail}</strong>. You need to sign in with this email address to accept the invitation.</p>
                </AlertDescription>
              </Alert>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-2 items-stretch">
            <Button asChild>
              <Link href={`/auth?returnTo=/invite/${token}`}>Sign in to Accept</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/auth?email=${encodeURIComponent(invitationEmail)}&role=${invitationRole}&returnTo=/invite/${token}`}>Sign up</Link>
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