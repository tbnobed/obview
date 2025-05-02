import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import AppLayout from "@/components/layout/app-layout";
import { useProjects } from "@/hooks/use-projects";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, FileVideo } from "lucide-react";
import ProjectCard from "@/components/projects/project-card";

export default function HomePage() {
  const { user } = useAuth();
  const [_, navigate] = useLocation();
  const { data: projects, isLoading } = useProjects();

  useEffect(() => {
    document.title = "Dashboard | Obviu.io";
  }, []);

  const recentProjects = projects?.slice(0, 4) || [];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Welcome back, {user?.name}
            </h1>
            <p className="mt-1 text-neutral-500 dark:text-gray-400">
              Here's an overview of your recent projects and activities
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <Button 
              onClick={() => navigate("/projects/new")}
              className="flex items-center dark:bg-[#026d55] dark:hover:bg-[#025943] dark:text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </div>
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">Recent Projects</h2>
            <Button 
              variant="link" 
              onClick={() => navigate("/projects")}
              className="dark:text-[#026d55] dark:hover:text-[#025943]"
            >
              View all projects
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : recentProjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {recentProjects.map(project => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <Card className="bg-white/50 border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="h-12 w-12 rounded-full bg-primary-50 flex items-center justify-center mb-4">
                  <FileVideo className="h-6 w-6 text-primary-500" />
                </div>
                <h3 className="text-lg font-medium text-neutral-900 mb-2">No projects yet</h3>
                <p className="text-neutral-500 text-center mb-6 max-w-sm">
                  Create your first project to start uploading and reviewing media files.
                </p>
                <Button 
                  onClick={() => navigate("/projects/new")}
                  className="flex items-center"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Project
                </Button>
              </CardContent>
            </Card>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Common tasks and quick links
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Button 
                variant="outline" 
                className="h-auto py-4 flex flex-col items-center justify-center text-center gap-2 dark:border-[#026d55] dark:text-white dark:hover:bg-[#026d55]/10" 
                onClick={() => navigate("/projects/new")}
              >
                <div className="h-10 w-10 rounded-full bg-primary-50 dark:bg-[#026d55]/20 flex items-center justify-center">
                  <Plus className="h-5 w-5 text-primary-500 dark:text-[#026d55]" />
                </div>
                <div>
                  <div className="font-medium">New Project</div>
                  <div className="text-xs text-neutral-500 dark:text-gray-400">Create a new project container</div>
                </div>
              </Button>
              
              <Button 
                variant="outline" 
                className="h-auto py-4 flex flex-col items-center justify-center text-center gap-2 dark:border-[#026d55] dark:text-white dark:hover:bg-[#026d55]/10" 
                onClick={() => navigate("/projects")}
              >
                <div className="h-10 w-10 rounded-full bg-primary-50 dark:bg-[#026d55]/20 flex items-center justify-center">
                  <svg className="h-5 w-5 text-primary-500 dark:text-[#026d55]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium">All Projects</div>
                  <div className="text-xs text-neutral-500 dark:text-gray-400">View and manage projects</div>
                </div>
              </Button>
              
              {user?.role === "admin" && (
                <Button 
                  variant="outline" 
                  className="h-auto py-4 flex flex-col items-center justify-center text-center gap-2 dark:border-[#026d55] dark:text-white dark:hover:bg-[#026d55]/10" 
                  onClick={() => navigate("/admin")}
                >
                  <div className="h-10 w-10 rounded-full bg-primary-50 dark:bg-[#026d55]/20 flex items-center justify-center">
                    <svg className="h-5 w-5 text-primary-500 dark:text-[#026d55]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium">Admin Panel</div>
                    <div className="text-xs text-neutral-500 dark:text-gray-400">Manage users and settings</div>
                  </div>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
              <CardDescription>
                Tips to help you make the most of Obviu.io
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="bg-primary-50 text-primary-600 rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <h3 className="font-medium text-neutral-900">Create a project</h3>
                  <p className="text-sm text-neutral-500">
                    Start by creating a project to organize your media files
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-primary-50 text-primary-600 rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <h3 className="font-medium text-neutral-900">Upload media</h3>
                  <p className="text-sm text-neutral-500">
                    Upload video, audio or image files to your project
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-primary-50 text-primary-600 rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <h3 className="font-medium text-neutral-900">Invite team members</h3>
                  <p className="text-sm text-neutral-500">
                    Collaborate by inviting others to review and comment
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-primary-50 text-primary-600 rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                  4
                </div>
                <div>
                  <h3 className="font-medium text-neutral-900">Review and approve</h3>
                  <p className="text-sm text-neutral-500">
                    Add comments at specific timestamps and approve or request changes
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
