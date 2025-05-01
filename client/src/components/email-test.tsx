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
      const response = await apiRequest('POST', '/api/debug/send-test-email', { to: email });
      let data;
      
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('Error parsing JSON response:', jsonError);
        data = { success: false, message: 'Invalid response format from server' };
      }
      
      setResult(data);
      
      if (data && data.success) {
        toast({
          title: 'Test Email Sent',
          description: `Email was sent to ${email}. Check logs for details.`,
        });
      } else {
        toast({
          title: 'Test Email Failed',
          description: (data && data.message) ? data.message : 'Failed to send test email. Check logs for details.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error sending test email:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
      setResult({ error: error instanceof Error ? error.message : 'Unknown error' });
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