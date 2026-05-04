import { useLocation } from "wouter";
import { Project, File } from "@shared/schema";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { Trash2, PlayCircle } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useDeleteProject } from "@/hooks/use-projects";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { setDragPayload, clearDragPayload } from "@/lib/drag-drop";
import OwnerChip from "@/components/projects/owner-chip";
import { getOwnerColor } from "@/lib/owner-color";

// Extended Project type with latest video file + admin metadata returned
// by /api/projects (creator name/username + file count). These fields are
// optional so non-admin payloads still type-check.
type ProjectWithVideo = Project & {
  latestVideoFile?: File;
  creatorUsername?: string | null;
  creatorName?: string | null;
  fileCount?: number;
};

interface ProjectCardProps {
  project: ProjectWithVideo;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const [_, navigate] = useLocation();
  const { user } = useAuth();
  const deleteProjectMutation = useDeleteProject();
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);
  const scrubRafRef = useRef<number | null>(null);
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

  // Confirmation dialog state. Requires the user to type the exact project
  // name before the destructive action becomes available — guards against
  // the accidental "click delete on someone else's project" class of bug
  // that wiped projects 25/26/31 in production on 2026-04-30.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typedName, setTypedName] = useState("");
  const isAdmin = user?.role === "admin";
  const isOwner = user?.id === project.createdById;
  const ownerLabel = project.creatorName || project.creatorUsername || `user #${project.createdById}`;

  const openDeleteDialog = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTypedName("");
    setConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (typedName.trim() !== project.name) return;
    deleteProjectMutation.mutate(project.id, {
      onSuccess: () => {
        setConfirmOpen(false);
        navigate('/projects');
      },
    });
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

  // Whole-card drag. We attach drag handlers on the Card and navigate
  // programmatically on click. We deliberately do NOT wrap this in a
  // wouter <Link> — the anchor's native drag (text/uri-list) fights
  // with our custom drag MIME and the drop target ends up rejecting
  // the payload. dragstart suppresses the click that would otherwise
  // follow, so plain clicks still navigate as expected.
  const onDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    setDragPayload(e, {
      type: "project",
      id: project.id,
      sourceFolderId: project.folderId ?? null,
    });
  };
  const onCardClick = (e: React.MouseEvent) => {
    // Avoid navigating when the click bubbled from a button/dialog
    // inside the card.
    const target = e.target as HTMLElement;
    if (target.closest("button, [role='dialog'], a")) return;
    navigate(`/projects/${project.id}`);
  };

  // Visual ownership cue: cards you own get a colored left bar and a
  // subtle highlight; cards owned by someone else get that owner's
  // color so the dashboard reads as "your stuff vs. theirs" at a glance.
  const accentColor = isOwner ? "#026d55" : getOwnerColor(project.createdById);

  return (
    <>
      <Card
        className={cn(
          "cursor-pointer transition-shadow hover:shadow-md text-sm active:opacity-70 border-l-4 relative overflow-hidden",
          isOwner && "ring-1 ring-[#026d55]/30 dark:ring-[#026d55]/40"
        )}
        style={{ borderLeftColor: accentColor }}
        draggable
        onDragStart={onDragStart}
        onDragEnd={clearDragPayload}
        onClick={onCardClick}
        data-testid={`project-card-${project.id}`}
      >
        <CardHeader className="pb-1 px-3 pt-3">
          <div className="flex justify-between items-start gap-2">
            <CardTitle className="text-sm font-semibold line-clamp-1">{project.name}</CardTitle>
            {getStatusBadge(project.status)}
          </div>
          {/* Owner row: every card shows who owns it via a colored avatar
              chip. Yours show a "You" chip in the brand color so they
              pop against the rest of the grid. */}
          <div className="mt-1">
            <OwnerChip
              ownerId={project.createdById}
              ownerName={ownerLabel}
              isYou={isOwner}
              size="sm"
              data-testid={`project-owner-chip-${project.id}`}
            />
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
              const clientX = e.clientX;
              if (scrubRafRef.current != null) return;
              scrubRafRef.current = requestAnimationFrame(() => {
                scrubRafRef.current = null;
                const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                setScrubPosition((prev) => (Math.abs(prev - pos) < 0.005 ? prev : pos));
              });
            }}
            onMouseEnter={() => {
              setIsScrubbing(true);
              setScrubPosition(0);
            }}
            onMouseLeave={() => {
              if (scrubRafRef.current != null) {
                cancelAnimationFrame(scrubRafRef.current);
                scrubRafRef.current = null;
              }
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
              // Sprite-based scrubbing. The sprite's cell aspect may be
              // portrait (vertical/social video) while the card slot is
              // landscape, so we render the sprite into an inner element
              // sized to the cell's aspect ratio and letterbox it inside
              // the card — much better than stretching to fill.
              <div className="w-full h-full flex items-center justify-center bg-black overflow-hidden">
                <div
                  className="bg-center bg-no-repeat pointer-events-none max-w-full max-h-full"
                  data-testid={`sprite-preview-${project.id}`}
                  style={{
                    aspectRatio: `${spriteMetadata.thumbnailWidth || 16} / ${spriteMetadata.thumbnailHeight || 9}`,
                    width: (spriteMetadata.thumbnailWidth || 16) >= (spriteMetadata.thumbnailHeight || 9) ? '100%' : 'auto',
                    height: (spriteMetadata.thumbnailWidth || 16) >= (spriteMetadata.thumbnailHeight || 9) ? 'auto' : '100%',
                    backgroundImage: `url(/api/files/${project.latestVideoFile.id}/sprite)`,
                    backgroundSize: `${spriteMetadata.cols * 100}% ${spriteMetadata.rows * 100}%`,
                    backgroundPosition: (() => {
                      if (!isScrubbing) {
                        // Show first frame when not scrubbing
                        return `0% 0%`;
                      }

                      // Calculate which thumbnail to show based on scrub position
                      const thumbnailIndex = Math.min(
                        Math.floor(scrubPosition * spriteMetadata.thumbnailCount),
                        spriteMetadata.thumbnailCount - 1
                      );
                      const col = thumbnailIndex % spriteMetadata.cols;
                      const row = Math.floor(thumbnailIndex / spriteMetadata.cols);

                      // Calculate background position (CSS background-position works by moving the image)
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
              </div>
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
          {project.latestVideoFile && (
            <p className="text-neutral-600 dark:text-neutral-300 text-xs mb-2.5 line-clamp-1" title={project.latestVideoFile.filename}>
              {project.latestVideoFile.filename}
            </p>
          )}
          
          <div className="flex justify-between items-center text-xs text-neutral-500">
            <div>
              <svg className="inline-block h-3.5 w-3.5 mr-1 text-neutral-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              {formatTimeAgo(new Date(project.updatedAt))}
            </div>
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-1.5 text-destructive hover:bg-destructive/10"
                onClick={openDeleteDialog}
                disabled={deleteProjectMutation.isPending}
                data-testid={`delete-project-button-${project.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) setTypedName("");
          setConfirmOpen(open);
        }}
      >
        <DialogContent
          // Prevent the wrapping <Link> from receiving the click and
          // navigating to the project when the user interacts with the
          // dialog (the Dialog renders inside the Link in this card).
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onPointerDownCapture={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              This moves <span className="font-semibold">{project.name}</span> to the admin trash. The project,
              its {typeof project.fileCount === "number" ? project.fileCount : "associated"} file
              {project.fileCount === 1 ? "" : "s"}, and all comments will be hidden but preserved on disk so an admin can
              restore them. To permanently remove them, an admin must purge from the trash.
            </DialogDescription>
          </DialogHeader>

          <div className="text-xs space-y-1 rounded-md border bg-muted/40 p-3">
            <div><span className="text-muted-foreground">Owner:</span> <span className="font-medium">{ownerLabel}</span></div>
            {typeof project.fileCount === "number" && (
              <div><span className="text-muted-foreground">Files:</span> <span className="font-medium">{project.fileCount}</span></div>
            )}
            {isAdmin && !isOwner && (
              <div className="text-amber-600 dark:text-amber-400 pt-1">
                You are deleting a project owned by someone else.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`confirm-name-${project.id}`} className="text-xs">
              Type <span className="font-semibold">{project.name}</span> to confirm
            </Label>
            <Input
              id={`confirm-name-${project.id}`}
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={project.name}
              autoComplete="off"
              autoFocus
              data-testid={`delete-confirm-input-${project.id}`}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmOpen(false); }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={typedName.trim() !== project.name || deleteProjectMutation.isPending}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); confirmDelete(); }}
              data-testid={`delete-confirm-button-${project.id}`}
            >
              {deleteProjectMutation.isPending ? "Deleting…" : "Move to trash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
