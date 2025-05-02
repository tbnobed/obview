import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import AppLayout from "@/components/layout/app-layout";
import UserList from "@/components/admin/user-list";
import AdminInviteForm from "@/components/admin/admin-invite-form";
import ActivityLogList from "@/components/admin/activity-log-list";
import SystemSettings from "@/components/admin/system-settings";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import UserForm from "@/components/admin/user-form";
import { Plus, Users, FileText, Activity, Settings, ShieldAlert, Loader2 } from "lucide-react";

export default function AdminPage() {
  const { user } = useAuth();
  const [_, navigate] = useLocation();
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  
  useEffect(() => {
    document.title = "Admin Dashboard | Obviu.io";
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
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white bg-gradient-to-r from-primary-500 to-primary-700 dark:from-primary-400 dark:to-primary-600 bg-clip-text text-transparent">Admin Dashboard</h1>
            <p className="text-neutral-500 dark:text-gray-300">Manage users, projects, and system settings</p>
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
                  <p className="text-sm text-neutral-500 pt-2">
                    Send an invitation email to a new user.
                  </p>
                </DialogHeader>
                <div className="py-4">
                  <AdminInviteForm
                    onInviteSent={() => {
                      setInviteDialogOpen(false);
                      // Show success message using toast (already shown in component)
                    }}
                  />
                </div>
              </DialogContent>
            </Dialog>
            
            <Button onClick={() => navigate("/projects")}>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
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
              <CardHeader className="border-b dark:border-gray-800">
                <CardTitle className="text-primary-600 dark:text-primary-400">User Management</CardTitle>
                <CardDescription className="dark:text-gray-400">
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
              <CardHeader className="border-b dark:border-gray-800">
                <CardTitle className="text-primary-600 dark:text-primary-400">Project Management</CardTitle>
                <CardDescription className="dark:text-gray-400">
                  View and manage all projects across the system
                </CardDescription>
              </CardHeader>
              <CardContent>
                {projectsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : projects && projects.length > 0 ? (
                  <div>
                    <p className="text-sm text-neutral-500 mb-4">
                      This view shows all projects in the system. As an admin, you have access to all projects.
                    </p>
                    <div className="flex justify-between items-center mb-4">
                      <Button onClick={() => navigate("/projects")}>
                        Go to Projects Dashboard
                      </Button>
                    </div>
                    <div className="space-y-4 mt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {projects.map((project) => (
                          <Card key={project.id} className="overflow-hidden">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-lg font-semibold truncate">
                                {project.name}
                              </CardTitle>
                              <CardDescription className="text-xs">
                                Created on {new Date(project.createdAt).toLocaleDateString()}
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="pb-3">
                              <p className="text-sm line-clamp-2 h-10">{project.description || "No description provided"}</p>
                            </CardContent>
                            <div className="px-6 py-2 bg-neutral-50 flex justify-between">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => navigate(`/projects/${project.id}`)}
                              >
                                View Details
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-neutral-500 mb-4">No projects found in the system.</p>
                    <Button onClick={() => navigate("/projects/new")}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create New Project
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="activity">
            <Card>
              <CardHeader className="border-b dark:border-gray-800">
                <CardTitle className="text-primary-600 dark:text-primary-400">System Activity</CardTitle>
                <CardDescription className="dark:text-gray-400">
                  View system-wide activity and logs
                </CardDescription>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <ActivityLogList />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="settings">
            <Card>
              <CardHeader className="border-b dark:border-gray-800">
                <CardTitle className="text-primary-600 dark:text-primary-400">System Settings</CardTitle>
                <CardDescription className="dark:text-gray-400">
                  Configure system-wide settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SystemSettings />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
