import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/use-projects";
import ProjectCard from "@/components/projects/project-card";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Search, FileVideo, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ProjectForm from "@/components/projects/project-form";
import { Badge } from "@/components/ui/badge";

export default function ProjectsPage() {
  const [_, navigate] = useLocation();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  
  const { data: projects, isLoading, error } = useProjects();

  useEffect(() => {
    document.title = "Projects | Obviu.io";
  }, []);

  // Filter projects by search term and status
  const filteredProjects = projects?.filter(project => {
    const matchesSearch = searchTerm === "" || 
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (project.description?.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === null || project.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const isEditor = user?.role === "admin" || user?.role === "editor";

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Projects</h1>
            <p className="text-neutral-500 mt-1">
              Manage your media review projects
            </p>
          </div>
          
          {isEditor && (
            <Button onClick={() => navigate("/projects/new")}>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              placeholder="Search projects..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button 
              variant={statusFilter === null ? "default" : "outline"} 
              size="sm"
              onClick={() => setStatusFilter(null)}
            >
              All
            </Button>
            <Button 
              variant={statusFilter === "in_progress" ? "default" : "outline"} 
              size="sm"
              onClick={() => setStatusFilter("in_progress")}
            >
              In Progress
            </Button>
            <Button 
              variant={statusFilter === "in_review" ? "default" : "outline"} 
              size="sm"
              onClick={() => setStatusFilter("in_review")}
            >
              In Review
            </Button>
            <Button 
              variant={statusFilter === "approved" ? "default" : "outline"} 
              size="sm"
              onClick={() => setStatusFilter("approved")}
            >
              Approved
            </Button>
          </div>
        </div>

        {/* Project list */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-600 p-4 rounded-md">
            Error loading projects: {error.message}
          </div>
        ) : filteredProjects && filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProjects.map(project => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 bg-white rounded-lg shadow">
            <div className="h-16 w-16 rounded-full bg-primary-50 flex items-center justify-center mb-4">
              <FileVideo className="h-8 w-8 text-primary-400" />
            </div>
            {searchTerm || statusFilter ? (
              <>
                <h3 className="text-lg font-medium text-neutral-900 mb-2">No matching projects found</h3>
                <p className="text-neutral-500 text-center mb-6 max-w-md">
                  Try adjusting your search or filters to find what you're looking for
                </p>
                <Button variant="outline" onClick={() => {
                  setSearchTerm("");
                  setStatusFilter(null);
                }}>
                  Clear Filters
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium text-neutral-900 mb-2">No projects yet</h3>
                <p className="text-neutral-500 text-center mb-6 max-w-md">
                  Create your first project to start reviewing media files
                </p>
                {isEditor && (
                  <Button onClick={() => navigate("/projects/new")}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Project
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
