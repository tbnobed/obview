import { useLocation } from "wouter";
import { Project, File } from "@shared/schema";
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
import { Trash2, PlayCircle, FileVideo } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useDeleteProject } from "@/hooks/use-projects";
import { setDragPayload, clearDragPayload } from "@/lib/drag-drop";
import { Checkbox } from "@/components/ui/checkbox";
import OwnerChip from "@/components/projects/owner-chip";
import { getOwnerColor } from "@/lib/owner-color";

type ProjectWithVideo = Project & {
  latestVideoFile?: File;
  creatorUsername?: string | null;
  creatorName?: string | null;
  fileCount?: number;
};

interface ProjectRowProps {
  project: ProjectWithVideo;
  isSelected?: boolean;
  selectedIds?: number[];
  onToggleSelect?: (id: number, e?: React.MouseEvent) => void;
}

// Compact list-row variant of ProjectCard. Keeps drag-source +
// delete-confirmation behavior but drops the heavy scrub thumb so
// list view stays dense and fast on long folders.
export default function ProjectRow({ project, isSelected, selectedIds, onToggleSelect }: ProjectRowProps) {
  const [_, navigate] = useLocation();
  const { user } = useAuth();
  const deleteProjectMutation = useDeleteProject();

  const canDelete =
    user && (user.id === project.createdById || user.role === "admin");
  const isAdmin = user?.role === "admin";
  const isOwner = user?.id === project.createdById;
  const ownerLabel =
    project.creatorName || project.creatorUsername || `user #${project.createdById}`;
  const accentColor = isOwner ? "#026d55" : getOwnerColor(project.createdById);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typedName, setTypedName] = useState("");

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
        navigate("/projects");
      },
    });
  };

  const onDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    if (isSelected && selectedIds && selectedIds.length > 1) {
      setDragPayload(e, {
        type: "projects",
        ids: selectedIds,
        sourceFolderId: project.folderId ?? null,
      });
    } else {
      setDragPayload(e, {
        type: "project",
        id: project.id,
        sourceFolderId: project.folderId ?? null,
      });
    }
  };

  const onClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, [role='dialog'], a, input")) return;
    navigate(`/projects/${project.id}`);
  };

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-3 px-3 py-2.5 rounded-md border-l-4 border border-neutral-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-sm hover:border-primary-200 dark:hover:border-[#10a37f]/40 cursor-pointer transition-colors",
          isOwner && "ring-1 ring-[#026d55]/30 dark:ring-[#026d55]/40",
          isSelected && "ring-2 ring-primary dark:ring-[#10a37f]",
        )}
        style={{ borderLeftColor: accentColor }}
        draggable
        onDragStart={onDragStart}
        onDragEnd={clearDragPayload}
        onClick={onClick}
        data-testid={`project-row-${project.id}`}
      >
        {onToggleSelect && (
          <div
            className={cn(
              "shrink-0 transition-opacity",
              isSelected ? "opacity-100" : "opacity-50 group-hover:opacity-100"
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleSelect(project.id, e);
            }}
            onPointerDownCapture={(e) => e.stopPropagation()}
            data-testid={`project-row-select-${project.id}`}
          >
            <Checkbox
              checked={!!isSelected}
              onCheckedChange={() => onToggleSelect(project.id)}
              aria-label={isSelected ? "Deselect project" : "Select project"}
            />
          </div>
        )}
        <div className="h-10 w-14 shrink-0 rounded bg-neutral-100 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
          {project.customThumbnailPath ? (
            <img
              src={`/api/projects/${project.id}/thumbnail?v=${new Date(project.updatedAt).getTime()}`}
              alt=""
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : project.latestVideoFile ? (
            <PlayCircle className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
          ) : (
            <FileVideo className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100"
              title={project.name}
            >
              {project.name}
            </span>
          </div>
          {project.latestVideoFile?.filename && (
            <div
              className="truncate text-xs text-neutral-500 dark:text-neutral-400 mt-0.5"
              title={project.latestVideoFile.filename}
            >
              {project.latestVideoFile.filename}
            </div>
          )}
        </div>

        <div className="hidden md:block shrink-0">
          <OwnerChip
            ownerId={project.createdById}
            ownerName={ownerLabel}
            isYou={isOwner}
            size="sm"
            data-testid={`project-row-owner-chip-${project.id}`}
          />
        </div>

        {typeof project.fileCount === "number" && (
          <div className="hidden lg:block shrink-0 text-xs text-neutral-500 dark:text-neutral-400 w-20 text-right">
            {project.fileCount} file{project.fileCount === 1 ? "" : "s"}
          </div>
        )}

        <div className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400 w-28 text-right">
          {formatTimeAgo(new Date(project.updatedAt))}
        </div>

        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 shrink-0"
            onClick={openDeleteDialog}
            disabled={deleteProjectMutation.isPending}
            data-testid={`delete-project-row-button-${project.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) setTypedName("");
          setConfirmOpen(open);
        }}
      >
        <DialogContent
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerDownCapture={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              This moves <span className="font-semibold">{project.name}</span> to the admin trash. The
              project, its{" "}
              {typeof project.fileCount === "number" ? project.fileCount : "associated"} file
              {project.fileCount === 1 ? "" : "s"}, and all comments will be hidden but preserved on
              disk so an admin can restore them.
            </DialogDescription>
          </DialogHeader>

          <div className="text-xs space-y-1 rounded-md border bg-muted/40 p-3">
            <div>
              <span className="text-muted-foreground">Owner:</span>{" "}
              <span className="font-medium">{ownerLabel}</span>
            </div>
            {typeof project.fileCount === "number" && (
              <div>
                <span className="text-muted-foreground">Files:</span>{" "}
                <span className="font-medium">{project.fileCount}</span>
              </div>
            )}
            {isAdmin && !isOwner && (
              <div className="text-amber-600 dark:text-amber-400 pt-1">
                You are deleting a project owned by someone else.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`confirm-name-row-${project.id}`} className="text-xs">
              Type <span className="font-semibold">{project.name}</span> to confirm
            </Label>
            <Input
              id={`confirm-name-row-${project.id}`}
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={project.name}
              autoComplete="off"
              autoFocus
              data-testid={`delete-confirm-row-input-${project.id}`}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setConfirmOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={typedName.trim() !== project.name || deleteProjectMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                confirmDelete();
              }}
              data-testid={`delete-confirm-row-button-${project.id}`}
            >
              {deleteProjectMutation.isPending ? "Deleting…" : "Move to trash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
