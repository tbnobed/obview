import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TestEmailPayload {
  to: string;
}

interface EmailConfigResponse {
  environment: Record<string, string>;
  urlConstruction: {
    determinedBaseUrl: string;
    sampleInviteUrl: string;
  };
  recentLogs: string;
}

export function EmailDebug() {
  const [email, setEmail] = useState("");
  const [configData, setConfigData] = useState<EmailConfigResponse | null>(null);

  const sendTestEmail = useMutation({
    mutationFn: async (data: TestEmailPayload) => {
      const res = await apiRequest(
        "GET", 
        `/api/debug/email-detailed?to=${encodeURIComponent(data.to)}`
      );
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Test email sent",
        description: `A test email has been sent to ${email}. Please check your inbox and spam folder.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send test email",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const fetchEmailConfig = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/debug/email-config");
      return await res.json() as EmailConfigResponse;
    },
    onSuccess: (data) => {
      setConfigData(data);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to fetch email configuration",
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
        description: "Please enter an email address to send the test email to.",
        variant: "destructive",
      });
      return;
    }
    
    sendTestEmail.mutate({ to: email });
  };

  return (
    <Tabs defaultValue="send">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="send">Send Test Email</TabsTrigger>
        <TabsTrigger value="config">Email Configuration</TabsTrigger>
      </TabsList>
      
      <TabsContent value="send">
        <Card>
          <CardHeader>
            <CardTitle>Send Test Email</CardTitle>
            <CardDescription>
              Send a test email to verify your email sending functionality.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <div className="grid w-full items-center gap-4">
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    placeholder="Enter recipient email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
            </form>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={() => setEmail("")}>
              Reset
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={sendTestEmail.isPending}
            >
              {sendTestEmail.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Test Email"
              )}
            </Button>
          </CardFooter>
        </Card>
      </TabsContent>
      
      <TabsContent value="config">
        <Card>
          <CardHeader>
            <CardTitle>Email Configuration</CardTitle>
            <CardDescription>
              View current email configuration and debug information.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {fetchEmailConfig.isPending ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : configData ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium">Environment Variables</h3>
                  <div className="rounded-md bg-secondary p-4 mt-2">
                    <pre className="text-sm overflow-auto max-h-32">
                      {Object.entries(configData.environment).map(([key, value]) => (
                        `${key}: ${value}\n`
                      ))}
                    </pre>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium">URL Construction</h3>
                  <div className="rounded-md bg-secondary p-4 mt-2">
                    <p className="mb-2"><strong>Base URL:</strong> {configData.urlConstruction.determinedBaseUrl}</p>
                    <p><strong>Sample Invite URL:</strong> {configData.urlConstruction.sampleInviteUrl}</p>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium">Recent Logs</h3>
                  <div className="rounded-md bg-secondary p-4 mt-2">
                    <pre className="text-sm overflow-auto max-h-64 whitespace-pre-wrap">
                      {configData.recentLogs}
                    </pre>
                  </div>
                </div>
              </div>
            ) : (
              <Alert>
                <AlertDescription>
                  Click the button below to fetch email configuration data.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter>
            <Button 
              onClick={() => fetchEmailConfig.mutate()} 
              disabled={fetchEmailConfig.isPending}
              className="w-full"
            >
              {fetchEmailConfig.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : configData ? (
                "Refresh Configuration"
              ) : (
                "Fetch Configuration"
              )}
            </Button>
          </CardFooter>
        </Card>
      </TabsContent>
    </Tabs>
  );
}