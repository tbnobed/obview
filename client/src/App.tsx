import { useEffect } from "react";
import { Switch, Route } from "wouter";
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
import NewProjectPage from "@/pages/new-project-page";
import FileUploadPage from "@/pages/file-upload-page";
import AdminPage from "@/pages/admin-page";
import SettingsPage from "@/pages/settings-page";
import InvitePage from "@/pages/invite-page";
import ResetPasswordPage from "@/pages/reset-password-page";
import DebugPage from "@/pages/debug-page";
import AboutPage from "@/pages/about-page";
import PrivacyPage from "@/pages/privacy-page";
import TermsPage from "@/pages/terms-page";
import ContactPage from "@/pages/contact-page";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={HomePage} />
      <ProtectedRoute path="/projects" component={ProjectsPage} />
      <ProtectedRoute path="/projects/new" component={NewProjectPage} />
      <ProtectedRoute path="/projects/:id/upload" component={FileUploadPage} />
      <ProtectedRoute path="/projects/:id" component={ProjectPage} />
      <ProtectedRoute path="/project/:id" component={ProjectPage} /> {/* Keep this for backward compatibility */}
      <ProtectedRoute path="/admin" component={AdminPage} />
      <ProtectedRoute path="/settings" component={SettingsPage} />
      <ProtectedRoute path="/debug" component={DebugPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/invite/:token" component={InvitePage} />
      <Route path="/reset-password/:token/:userId" component={ResetPasswordPage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/contact" component={ContactPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem={true} storageKey="obviu-theme">
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
