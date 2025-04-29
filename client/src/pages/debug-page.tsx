import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { EmailTestForm } from '@/components/email-test';
import { useAuth } from '@/hooks/use-auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';

export default function DebugPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Check if user is not an admin or not authenticated
    if (!isLoading && (!user || user.role !== 'admin')) {
      setLocation('/');
    }
  }, [user, isLoading, setLocation]);

  // If still loading, show loading state
  if (isLoading) {
    return (
      <div className="container max-w-5xl py-8">
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  // If user is not admin, show error
  if (!user || user.role !== 'admin') {
    return (
      <div className="container max-w-5xl py-8">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You need administrator access to view this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-8">
      <h1 className="text-3xl font-bold mb-8 text-center">Debug Tools</h1>
      
      <div className="mb-12">
        <EmailTestForm />
      </div>
    </div>
  );
}