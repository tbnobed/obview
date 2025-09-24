import { Link, useLocation } from "wouter";
import { Project, File } from "@shared/schema";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { Trash2, PlayCircle } from "lucide-react";
import { useState, useEffect } from "react";
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
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);
  const [spriteMetadata, setSpriteMetadata] = useState<any>(null);
  const [spriteLoaded, setSpriteLoaded] = useState(false);
  
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
  
  // Load sprite metadata for video files
  useEffect(() => {
    if (project.latestVideoFile && videoProcessing?.status === 'completed') {
      fetch(`/api/files/${project.latestVideoFile.id}/sprite-metadata`)
        .then(res => res.ok ? res.json() : null)
        .then(metadata => {
          if (metadata) {
            setSpriteMetadata(metadata);
            console.log(`🎬 [PROJECT-SPRITE] Loaded metadata for file ${project.latestVideoFile?.id}:`, metadata);
          }
        })
        .catch(err => console.warn(`🎬 [PROJECT-SPRITE] Failed to load metadata for file ${project.latestVideoFile?.id}:`, err));
    }
  }, [project.latestVideoFile?.id, videoProcessing?.status]);
  
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
      <Card className="cursor-pointer transition-shadow hover:shadow-md text-sm">
        <CardHeader className="pb-1 px-3 pt-3">
          <div className="flex justify-between items-start">
            <CardTitle className="text-sm font-semibold line-clamp-1">{project.name}</CardTitle>
            {getStatusBadge(project.status)}
          </div>
        </CardHeader>
        
        {/* Video Preview Section */}
        {project.latestVideoFile ? (
          <div 
            className="relative aspect-video bg-gray-800 rounded-t-none mx-2.5 mb-1 overflow-hidden group"
            style={{
              cursor: `url("data:image/svg+xml,%3csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M8 5v10l8-5-8-5z' fill='%23ffffff'/%3e%3c/svg%3e") 10 10, pointer`
            }}
            onMouseMove={(e) => {
              if (!spriteMetadata || !project.latestVideoFile) return;
              
              const rect = e.currentTarget.getBoundingClientRect();
              if (rect.width === 0) return;
              
              const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              setScrubPosition(pos);
              
              console.log(`🎬 [PROJECT-SPRITE-SCRUB] Position: ${(pos * 100).toFixed(1)}%`);
            }}
            onMouseEnter={() => {
              if (!spriteMetadata || !project.latestVideoFile) return;
              
              console.log('🎬 [PROJECT-SPRITE-SCRUB] Mouse entered - activating sprite scrub mode');
              setIsScrubbing(true);
              setScrubPosition(0);
            }}
            onMouseLeave={() => {
              console.log('🎬 [PROJECT-SPRITE-SCRUB] Mouse left - deactivating sprite scrub mode');
              setIsScrubbing(false);
              setScrubPosition(0);
            }}
            data-testid={`video-preview-container-${project.id}`}
          >
            {/* Wait for processing and sprite data */}
            {videoProcessing === undefined ? (
              // Loading state - show placeholder while processing query loads
              <div className="w-full h-full flex items-center justify-center bg-gray-800">
                <div className="text-center text-gray-400">
                  <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-xs">Loading preview...</p>
                </div>
              </div>
            ) : spriteMetadata ? (
              // Use sprite-based scrubbing
              <div
                className="w-full h-full bg-center bg-no-repeat bg-cover pointer-events-none"
                data-testid={`sprite-preview-${project.id}`}
                style={{
                  backgroundImage: `url(/api/files/${project.latestVideoFile.id}/sprite)`,
                  backgroundSize: `${spriteMetadata.cols * 100}% ${spriteMetadata.rows * 100}%`,
                  backgroundPosition: (() => {
                    if (!isScrubbing) {
                      // Show first frame when not scrubbing
                      return `0% 0%`;
                    }
                    
                    // Calculate which thumbnail to show based on scrub position
                    const thumbnailIndex = Math.floor(scrubPosition * (spriteMetadata.thumbnailCount - 1));
                    const col = thumbnailIndex % spriteMetadata.cols;
                    const row = Math.floor(thumbnailIndex / spriteMetadata.cols);
                    
                    // Calculate background position
                    const xPercent = spriteMetadata.cols > 1 ? (col / (spriteMetadata.cols - 1)) * 100 : 0;
                    const yPercent = spriteMetadata.rows > 1 ? (row / (spriteMetadata.rows - 1)) * 100 : 0;
                    
                    return `${xPercent}% ${yPercent}%`;
                  })()
                }}
                onLoad={() => {
                  console.log(`🎬 [PROJECT-SPRITE] ✅ Sprite loaded for project ${project.id}: ${project.latestVideoFile?.filename}`);
                  setSpriteLoaded(true);
                }}
                onError={() => {
                  console.error(`🎬 [PROJECT-SPRITE] ❌ Sprite error for project ${project.id}`);
                }}
              />
            ) : (
              // Fallback for no sprite data - show static thumbnail
              <div className="w-full h-full flex items-center justify-center bg-gray-800">
                <div className="text-center text-gray-400">
                  <PlayCircle className="h-8 w-8 mx-auto mb-1.5" />
                  <p className="text-xs">Processing...</p>
                </div>
              </div>
            )}
            {/* Scrub Progress Bar */}
            {isScrubbing && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                <div 
                  className="h-full bg-blue-500 transition-all duration-75"
                  style={{ width: `${scrubPosition * 100}%` }}
                />
                {/* Position indicator */}
                <div 
                  className="absolute top-0 w-0.5 h-1 bg-white transform -translate-x-0.5"
                  style={{ left: `${scrubPosition * 100}%` }}
                />
              </div>
            )}
            
            {/* Play Icon Overlay */}
            <div className={`absolute inset-0 bg-black/20 flex items-center justify-center transition-opacity ${
              isScrubbing ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
            }`}>
              <PlayCircle className="h-8 w-8 text-white" />
            </div>
            <div className={`absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 py-0.5 rounded transition-opacity ${
              isScrubbing ? 'opacity-50' : 'opacity-100'
            }`}>
              {project.latestVideoFile.filename}
            </div>
          </div>
        ) : (
          <div className="aspect-video bg-gray-100 dark:bg-gray-800 rounded-t-none mx-2.5 mb-1 flex items-center justify-center">
            <div className="text-center text-gray-400 dark:text-gray-500">
              <PlayCircle className="h-8 w-8 mx-auto mb-1.5" />
              <p className="text-xs">No video files</p>
            </div>
          </div>
        )}
        
        <CardContent className="px-3 py-2.5">
          <p className={cn(
            "text-neutral-600 text-xs mb-2.5",
            project.description ? "line-clamp-2" : "italic text-neutral-400"
          )}>
            {project.description || "No description provided"}
          </p>
          
          <div className="flex justify-between items-center text-xs text-neutral-500">
            <div>
              <svg className="inline-block h-3.5 w-3.5 mr-1 text-neutral-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              {formatTimeAgo(new Date(project.updatedAt))}
            </div>
            
            <div>
              <svg className="inline-block h-3.5 w-3.5 mr-1 text-neutral-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
              </svg>
              ID: {project.id}
            </div>
          </div>
        </CardContent>
        <CardFooter className="pt-1 px-3 pb-2.5 border-t">
          <div className="w-full flex justify-between items-center">
            <span className="text-xs text-neutral-500">
              Click to view project
            </span>
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-1.5 text-destructive hover:bg-destructive/10"
                onClick={handleDeleteProject}
                disabled={deleteProjectMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}
