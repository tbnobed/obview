import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

export function EmailTestDialog() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [configData, setConfigData] = useState<any>(null);
  
  // Check configuration only
  const checkConfigMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/debug/send-test-email", { 
        to: "test@example.com", // Not used when checkOnly is true
        checkOnly: true 
      });
      return await res.json();
    },
    onSuccess: (data) => {
      setConfigData(data);
    },
    onError: (error: Error) => {
      toast({
        title: "Configuration check failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Send test email
  const sendTestMutation = useMutation({
    mutationFn: async (to: string) => {
      const res = await apiRequest("POST", "/api/debug/send-test-email", { 
        to,
        clientUrl: window.location.origin
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Test email sent",
        description: `SendGrid accepted the email request with status 202. Please check your inbox (${email}) for the email.`,
      });
      setConfigData(data);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send test email",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleCheckConfig = () => {
    checkConfigMutation.mutate();
  };

  const handleSendTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }
    sendTestMutation.mutate(email);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      // Check config when dialog opens
      handleCheckConfig();
    } else {
      // Reset state when dialog closes
      setEmail("");
      setConfigData(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="mr-2 h-4 w-4" />
          Test Email
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Test Email Configuration</DialogTitle>
          <DialogDescription>
            Check your SendGrid configuration and send a test email.
          </DialogDescription>
        </DialogHeader>

        {/* Configuration status */}
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <h4 className="font-medium">Configuration Status</h4>
            
            {checkConfigMutation.isPending ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Checking configuration...</span>
              </div>
            ) : configData ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="font-medium">API Key:</div>
                  <div>
                    {configData.apiKeyPresent ? (
                      <Badge variant="outline" className="bg-green-50">
                        <CheckCircle2 className="mr-1 h-3 w-3 text-green-500" />
                        Set ({configData.apiKeyLength} chars)
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-50">
                        <AlertCircle className="mr-1 h-3 w-3 text-red-500" />
                        Missing
                      </Badge>
                    )}
                  </div>
                  
                  <div className="font-medium">From Email:</div>
                  <div>{configData.fromEmail}</div>
                  
                  <div className="font-medium">Sandbox Mode:</div>
                  <div>
                    {configData.sandboxMode ? (
                      <Badge variant="outline" className="bg-yellow-50">
                        <AlertCircle className="mr-1 h-3 w-3 text-yellow-500" />
                        Enabled (emails won't send)
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-green-50">
                        <CheckCircle2 className="mr-1 h-3 w-3 text-green-500" />
                        Disabled
                      </Badge>
                    )}
                  </div>
                  
                  <div className="font-medium">Environment:</div>
                  <div>{configData.environment}</div>
                </div>
                
                {configData.success !== undefined && (
                  <Alert variant={configData.success ? "default" : "destructive"}>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>
                      {configData.success ? "Email Accepted" : "Email Failed"}
                    </AlertTitle>
                    <AlertDescription>
                      {configData.message}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Click "Check Configuration" to see current settings
              </div>
            )}
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleCheckConfig}
              disabled={checkConfigMutation.isPending}
            >
              {checkConfigMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Check Configuration
            </Button>
          </div>

          {/* Send test email form */}
          <form onSubmit={handleSendTest} className="space-y-3">
            <h4 className="font-medium">Send Test Email</h4>
            <div className="grid gap-2">
              <Label htmlFor="email">Recipient Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <DialogFooter>
              <Button 
                type="submit" 
                disabled={!email || sendTestMutation.isPending || !configData?.apiKeyPresent}
              >
                {sendTestMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Send Test Email
              </Button>
            </DialogFooter>
          </form>
          
          {/* Delivery Note */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Important Note</AlertTitle>
            <AlertDescription className="text-xs">
              Even with a successful API response (202), emails might not appear in inboxes due to:
              <ul className="list-disc pl-5 mt-1">
                <li>Email provider spam filters</li>
                <li>SendGrid delivery delays</li>
                <li>SendGrid account restrictions</li>
                <li>Receiving server filtering</li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  );
}