import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import AppLayout from "@/components/layout/app-layout";
import UserList from "@/components/admin/user-list";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import UserForm from "@/components/admin/user-form";
import { Plus, Users, FileText, Activity, Settings, ShieldAlert, Loader2 } from "lucide-react";

export default function AdminPage() {
  const { user } = useAuth();
  const [_, navigate] = useLocation();
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  
  useEffect(() => {
    document.title = "Admin Dashboard | MediaReview.io";
  }, []);

  // Redirect if user is not an admin
  useEffect(() => {
    if (user && user.role !== "admin") {
      navigate("/");
    }
  }, [user, navigate]);

  if (!user || user.role !== "admin") {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold text-neutral-900 mb-2">Access Denied</h2>
            <p className="text-neutral-600 mb-6">You don't have permission to access this page.</p>
            <Button onClick={() => navigate("/")}>Go Home</Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Get basic stats
  const { data: users, isLoading: usersLoading } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const { data: projects, isLoading: projectsLoading } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Admin Dashboard</h1>
            <p className="text-neutral-500">Manage users, projects, and system settings</p>
          </div>
          
          <div className="flex gap-3">
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Invite User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite New User</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <p className="text-sm text-neutral-500">
                    Send an invitation email to a new user.
                  </p>
                  {/* User invitation form would go here */}
                  <p className="text-amber-600 text-sm">
                    Email functionality is not fully implemented in this demo
                  </p>
                </div>
              </DialogContent>
            </Dialog>
            
            <Dialog open={createUserDialogOpen} onOpenChange={setCreateUserDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New User</DialogTitle>
                </DialogHeader>
                <UserForm onSuccess={() => setCreateUserDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-neutral-500" />
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
              ) : (
                <div className="text-2xl font-bold">{users?.length || 0}</div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
              <FileText className="h-4 w-4 text-neutral-500" />
            </CardHeader>
            <CardContent>
              {projectsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
              ) : (
                <div className="text-2xl font-bold">{projects?.length || 0}</div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Reviews</CardTitle>
              <Activity className="h-4 w-4 text-neutral-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {projects?.filter(p => p.status === "in_review").length || 0}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">System Status</CardTitle>
              <Settings className="h-4 w-4 text-neutral-500" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <div className="h-2 w-2 rounded-full bg-green-500 mr-2"></div>
                <span className="text-sm font-medium">All Systems Operational</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="users">
          <TabsList className="mb-6">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="activity">Activity Log</TabsTrigger>
            <TabsTrigger value="settings">System Settings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                  View and manage user accounts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UserList />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="projects">
            <Card>
              <CardHeader>
                <CardTitle>Project Management</CardTitle>
                <CardDescription>
                  View and manage all projects across the system
                </CardDescription>
              </CardHeader>
              <CardContent>
                {projectsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-neutral-500 mb-4">
                      This view shows all projects in the system. As an admin, you have access to all projects.
                    </p>
                    <Button onClick={() => navigate("/projects")}>
                      Go to Projects Dashboard
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>System Activity</CardTitle>
                <CardDescription>
                  View system-wide activity and logs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-6 text-neutral-500">
                  <p>Activity log functionality would be shown here</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>System Settings</CardTitle>
                <CardDescription>
                  Configure system-wide settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-6 text-neutral-500">
                  <p>System settings would be shown here</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
