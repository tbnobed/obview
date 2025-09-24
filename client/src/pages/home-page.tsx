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
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-teal-300">
              Welcome back, {user?.name}
            </h1>
            <p className="mt-1 text-neutral-500 dark:text-gray-400">
              Here's an overview of your recent projects and activities
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <Button 
              onClick={() => navigate("/projects/new")}
              className="flex items-center"
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
      </div>
    </AppLayout>
  );
}
