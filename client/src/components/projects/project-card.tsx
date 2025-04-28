import { Link, useLocation } from "wouter";
import { Project } from "@shared/schema";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDeleteProject } from "@/hooks/use-projects";

interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const [_, navigate] = useLocation();
  const { user } = useAuth();
  const deleteProjectMutation = useDeleteProject();
  
  // Check if user can delete this project (project creator or admin)
  const canDelete = user && (
    user.id === project.createdById ||
    user.role === "admin"
  );
  
  // Handle delete project
  const handleDeleteProject = (e: React.MouseEvent) => {
    e.preventDefault(); // Stop event propagation to prevent navigation
    e.stopPropagation();
    
    if (window.confirm(`Are you sure you want to delete the project "${project.name}"? This action cannot be undone and will remove all files and comments associated with this project.`)) {
      deleteProjectMutation.mutate(project.id, {
        onSuccess: () => {
          navigate('/projects');
        }
      });
    }
  };
  
  // Determine status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-600">Approved</Badge>;
      case 'in_review':
        return <Badge className="bg-blue-600">In Review</Badge>;
      case 'in_progress':
      default:
        return <Badge className="bg-yellow-600">In Progress</Badge>;
    }
  };

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="cursor-pointer transition-shadow hover:shadow-md">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg font-semibold line-clamp-1">{project.name}</CardTitle>
            {getStatusBadge(project.status)}
          </div>
        </CardHeader>
        <CardContent>
          <p className={cn(
            "text-neutral-600 text-sm mb-4",
            project.description ? "line-clamp-2" : "italic text-neutral-400"
          )}>
            {project.description || "No description provided"}
          </p>
          
          <div className="flex justify-between items-center text-xs text-neutral-500">
            <div>
              <svg className="inline-block h-4 w-4 mr-1 text-neutral-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              {formatTimeAgo(new Date(project.updatedAt))}
            </div>
            
            <div>
              <svg className="inline-block h-4 w-4 mr-1 text-neutral-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
              </svg>
              ID: {project.id}
            </div>
          </div>
        </CardContent>
        <CardFooter className="pt-2 border-t">
          <div className="w-full flex justify-between items-center">
            <span className="text-xs text-neutral-500">
              Click to view project
            </span>
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-destructive hover:bg-destructive/10"
                onClick={handleDeleteProject}
                disabled={deleteProjectMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}
