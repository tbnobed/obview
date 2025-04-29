import { Component, useEffect, useState } from "react";
import { Switch, Route, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "next-themes";
import HomePage from "@/pages/home-page";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import { ProtectedRoute } from "@/lib/protected-route";
import ProjectPage from "@/pages/project-page";
import ProjectsPage from "@/pages/projects-page";
import FileUploadPage from "@/pages/file-upload-page";
import AdminPage from "@/pages/admin-page";
import SettingsPage from "@/pages/settings-page";
import InvitePage from "@/pages/invite-page";
import DebugPage from "@/pages/debug-page";

// Simple debug page component
function Debug() {
  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Debug Page</h1>
      <p>If you can see this page, the application is working properly.</p>
      <nav>
        <ul>
          <li><Link href="/">Home</Link></li>
          <li><Link href="/auth">Login</Link></li>
        </ul>
      </nav>
    </div>
  );
}

// Error boundary component
class ErrorBoundary extends Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '20px', 
          fontFamily: 'system-ui, sans-serif',
          maxWidth: '800px',
          margin: '0 auto'
        }}>
          <h1 style={{ color: '#e11d48' }}>Something went wrong</h1>
          <p>An error occurred while rendering the application.</p>
          <div style={{ 
            background: '#f1f5f9', 
            padding: '15px', 
            borderRadius: '4px',
            marginTop: '15px',
            marginBottom: '15px',
            overflowX: 'auto'
          }}>
            <pre>{this.state.error?.message}</pre>
            <pre>{this.state.error?.stack}</pre>
          </div>
          <button 
            onClick={() => window.location.href = '/debug-simple'}
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              marginRight: '10px'
            }}
          >
            Go to Debug Page
          </button>
          <button 
            onClick={() => window.location.reload()}
            style={{
              background: '#10b981',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function Router() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/debug-simple" component={Debug} />
        <ProtectedRoute path="/" component={HomePage} />
        <ProtectedRoute path="/projects" component={ProjectsPage} />
        <ProtectedRoute path="/projects/:id" component={ProjectPage} />
        <ProtectedRoute path="/projects/:id/upload" component={FileUploadPage} />
        <ProtectedRoute path="/project/:id" component={ProjectPage} /> {/* Keep this for backward compatibility */}
        <ProtectedRoute path="/projects/new" component={ProjectsPage} />
        <ProtectedRoute path="/admin" component={AdminPage} />
        <ProtectedRoute path="/settings" component={SettingsPage} />
        <ProtectedRoute path="/debug" component={DebugPage} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/invite/:token" component={InvitePage} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

// Loading indicator
function LoadingSpinner() {
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center',
      minHeight: '100vh'
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '4px solid rgba(0, 0, 0, 0.1)',
        borderRadius: '50%',
        borderTop: '4px solid #3b82f6',
        animation: 'spin 1s linear infinite'
      }}></div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function App() {
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    // Set a timeout to show the app after a brief loading period
    // This helps ensure the DOM is fully ready
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="light">
          <AuthProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
