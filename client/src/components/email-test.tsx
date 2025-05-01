import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export function EmailTestForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const handleTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({
        title: 'Email Required',
        description: 'Please enter an email address to send the test to.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Send the test email request
      console.log(`Sending test email to ${email}`);
      
      const response = await apiRequest('POST', '/api/debug/send-test-email', { to: email });
      
      // Handle the response
      let data;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await response.json();
          console.log('Parsed JSON response:', data);
        } catch (jsonError) {
          console.error('Error parsing JSON response:', jsonError);
          data = { 
            success: false, 
            message: 'Server returned invalid JSON',
            error: jsonError instanceof Error ? jsonError.message : String(jsonError)
          };
        }
      } else {
        const textResponse = await response.text();
        console.log('Server returned non-JSON response:', textResponse);
        data = { 
          success: response.ok, 
          message: response.ok ? 'Email request processed (non-JSON response)' : 'Server error',
          responseText: textResponse,
          status: response.status
        };
      }
      
      // Update state and show toast
      setResult(data);
      
      if (response.ok) {
        toast({
          title: 'Test Email Processed',
          description: `Request to send email to ${email} was accepted. Check spam folder if not received.`,
        });
      } else {
        toast({
          title: 'Test Email Failed',
          description: (data && data.message) ? data.message : `Server error: ${response.status}`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error sending test email:', error);
      toast({
        title: 'Network Error',
        description: error instanceof Error ? error.message : 'Failed to connect to server',
        variant: 'destructive',
      });
      setResult({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: error?.constructor?.name || typeof error
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Email Testing Tool</CardTitle>
        <CardDescription>
          Send a test email to verify SendGrid is working correctly
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleTestEmail} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Test Email Address
            </label>
            <Input
              id="email"
              type="email"
              placeholder="Enter recipient email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              'Send Test Email'
            )}
          </Button>
        </form>

        {result && (
          <div className="mt-4 p-3 bg-muted rounded-md">
            <div className="text-sm font-medium">Results:</div>
            <pre className="text-xs overflow-auto mt-2">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        This tool is for development purposes only and should be removed in production.
      </CardFooter>
    </Card>
  );
}