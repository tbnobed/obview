import { Link, useLocation } from "wouter";
import { Project, File } from "@shared/schema";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { Trash2, PlayCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDeleteProject } from "@/hooks/use-projects";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Extended Project type with latest video file
type ProjectWithVideo = Project & { latestVideoFile?: File };

interface ProjectCardProps {
  project: ProjectWithVideo;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const [_, navigate] = useLocation();
  const { user } = useAuth();
  const deleteProjectMutation = useDeleteProject();
  
  // Fetch video processing data for optimal scrubbing (when video file exists)
  const { data: videoProcessing } = useQuery({
    queryKey: ['/api/files', project.latestVideoFile?.id, 'processing'],
    queryFn: async () => {
      if (!project.latestVideoFile) return null;
      try {
        const result = await apiRequest('GET', `/api/files/${project.latestVideoFile.id}/processing`);
        return result;
      } catch (error) {
        // Processing not available yet - that's OK, use original file
        return null;
      }
    },
    enabled: !!project.latestVideoFile,
    retry: false,
    refetchOnWindowFocus: false,
    // Don't show query errors, processing is optional
    meta: { suppressErrorToast: true }
  });
  
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
        
        {/* Video Preview Section */}
        {project.latestVideoFile ? (
          <div 
            className="relative aspect-video bg-gray-800 rounded-t-none mx-4 mb-2 overflow-hidden"
            onMouseMove={(e) => {
              const video = e.currentTarget.querySelector('video') as HTMLVideoElement;
              if (!video || !isFinite(video.duration) || video.duration <= 0) return;
              
              const rect = e.currentTarget.getBoundingClientRect();
              if (rect.width === 0) return;
              
              const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const newTime = video.duration * pos;
              
              // Only set currentTime if the calculated value is valid
              if (isFinite(newTime) && newTime >= 0 && newTime <= video.duration) {
                video.currentTime = newTime;
              }
            }}
            onMouseLeave={(e) => {
              const video = e.currentTarget.querySelector('video') as HTMLVideoElement;
              if (!video) return;
              // Reset to 1 second preview when not hovering
              video.currentTime = Math.min(1, video.duration || 0);
            }}
            data-testid={`video-preview-container-${project.id}`}
          >
            {/* Wait for processing data, then use best video source */}
            {videoProcessing === undefined ? (
              // Loading state - show placeholder while processing query loads
              <div className="w-full h-full flex items-center justify-center bg-gray-800">
                <div className="text-center text-gray-400">
                  <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-xs">Loading preview...</p>
                </div>
              </div>
            ) : (
              // Use best available video source for interactive scrubbing
              <video
                className="w-full h-full object-cover"
                preload="metadata"
                muted
                data-testid={`video-preview-${project.id}`}
                onLoadedMetadata={(e) => {
                  const video = e.target as HTMLVideoElement;
                  video.currentTime = Math.min(1, video.duration || 0);
                  console.log(`🎬 [PROJECT CARD] ✅ Video loaded for project ${project.id}: ${project.latestVideoFile?.filename}`);
                }}
                onError={(e) => {
                  console.error(`🎬 [PROJECT CARD] ❌ Video error for project ${project.id}:`, e);
                }}
              >
                {/* Use scrub version for instant seeking if available */}
                {videoProcessing?.status === 'completed' && videoProcessing.scrubVersionPath ? (
                  <source src={`/api/files/${project.latestVideoFile.id}/scrub`} type="video/mp4" />
                ) : videoProcessing?.status === 'completed' && videoProcessing.qualities?.some((q: any) => q.resolution === '720p') ? (
                  /* Use 720p quality for better performance */
                  <source src={`/api/files/${project.latestVideoFile.id}/qualities/720p`} type="video/mp4" />
                ) : null}
                {/* Always include original as fallback */}
                <source src={`/api/files/${project.latestVideoFile.id}/content`} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            )}
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <PlayCircle className="h-12 w-12 text-white" />
            </div>
            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
              {project.latestVideoFile.filename}
            </div>
          </div>
        ) : (
          <div className="aspect-video bg-gray-100 dark:bg-gray-800 rounded-t-none mx-4 mb-2 flex items-center justify-center">
            <div className="text-center text-gray-400 dark:text-gray-500">
              <PlayCircle className="h-12 w-12 mx-auto mb-2" />
              <p className="text-sm">No video files</p>
            </div>
          </div>
        )}
        
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
