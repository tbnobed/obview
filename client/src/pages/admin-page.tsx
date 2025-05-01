import { useState } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import AppLayout from "@/components/layout/app-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";
import { EmailDebug } from "@/components/admin/email-debug";

export default function AdminPage() {
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("email");

  if (isLoading) {
    return <div>Loading...</div>;
  }

  // Redirect if not logged in
  if (!user) {
    return <Redirect to="/auth?returnTo=/admin" />;
  }

  // Only allow admin users
  if (user.role !== "admin") {
    return (
      <AppLayout>
        <div className="container mx-auto py-10">
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You don't have permission to access the admin panel. This area is restricted to administrators only.
            </AlertDescription>
          </Alert>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="email">Email Configuration</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>
          
          <TabsContent value="email" className="mt-6">
            <EmailDebug />
          </TabsContent>
          
          <TabsContent value="users" className="mt-6">
            <Alert>
              <AlertTitle>Users Management</AlertTitle>
              <AlertDescription>
                User management features will be added in a future update.
              </AlertDescription>
            </Alert>
          </TabsContent>
          
          <TabsContent value="system" className="mt-6">
            <Alert>
              <AlertTitle>System Configuration</AlertTitle>
              <AlertDescription>
                System configuration features will be added in a future update.
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}