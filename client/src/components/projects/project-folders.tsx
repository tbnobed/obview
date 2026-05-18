import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
import { useToast } from "@/hooks/use-toast";
import { Folder as FolderIcon, FolderPlus, ChevronRight, Home, Trash2, Share2, FolderInput, Loader2 } from "lucide-react";
import ShareLinksDialog from "@/components/sharing/share-links-dialog";
import { cn } from "@/lib/utils";
import {
  getDragPayload,
  peekDragPayload,
  setDragPayload,
  clearDragPayload,
  type DragPayload,
} from "@/lib/drag-drop";
import {
  useMoveFileToFolder,
  useMoveFilesToFolder,
  useMoveProjectFolderUnderParent,
  useMoveProjectFolderToProject,
} from "@/hooks/use-drag-move";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Folder, File as StorageFile, Project } from "@shared/schema";

interface ProjectFoldersStripProps {
  projectId: number;
  currentFolderId: number | null;
  onSelectFolder: (id: number | null) => void;
  canEdit: boolean;
}

// IMPORTANT: the default React Query fetcher only reads queryKey[0], so a
// hierarchical key like ["/api/projects", id, "folders"] would silently
// hit "/api/projects" instead. Use the full URL as the single key segment.
function useProjectFolders(projectId: number) {
  return useQuery<Folder[]>({
    queryKey: [`/api/projects/${projectId}/folders`],
    enabled: !!projectId,
  });
}

export function ProjectFoldersStrip({
  projectId,
  currentFolderId,
  onSelectFolder,
  canEdit,
}: ProjectFoldersStripProps) {
  const { data: folders = [] } = useProjectFolders(projectId);
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  // Folder targeted by the Share dialog. We open ShareLinksDialog with
  // scopeType="folder" so the link only grants access to files inside
  // this subfolder, not the whole project.
  const [folderToShare, setFolderToShare] = useState<Folder | null>(null);
  // Folder targeted by the "Move to another project…" dialog. Lets users
  // relocate a whole subfolder subtree out of this project and into a
  // different one — server walks the descendants atomically.
  const [folderToMove, setFolderToMove] = useState<Folder | null>(null);
  // Tracks which drop target is currently being hovered so we can paint
  // a ring without re-rendering siblings. 'root' = breadcrumb, number =
  // a child folder tile.
  const [dragOver, setDragOver] = useState<number | "root" | null>(null);
  const moveFileToFolder = useMoveFileToFolder();
  const moveFilesToFolder = useMoveFilesToFolder();
  const moveFolderUnderParent = useMoveProjectFolderUnderParent();

  // Walk the parent chain of `folderId` and return true if `maybeAncestorId`
  // appears anywhere above it (including itself). Used to refuse drops that
  // would create a cycle before round-tripping to the server.
  const isAncestor = (maybeAncestorId: number, folderId: number): boolean => {
    let cursor: Folder | undefined = folders.find((f) => f.id === folderId);
    const seen = new Set<number>();
    while (cursor) {
      if (seen.has(cursor.id)) return false;
      seen.add(cursor.id);
      if (cursor.id === maybeAncestorId) return true;
      const pid = cursor.parentFolderId;
      cursor = pid == null ? undefined : folders.find((f) => f.id === pid);
    }
    return false;
  };

  // Accept drops of files (single or multi) AND of subfolders from this
  // same project. `targetFolderId` is the prospective new parent (null =
  // project root). The folder branch refuses self-drop, same-parent
  // (no-op), and descendant drops so the UI never offers a drop that
  // the server would reject.
  const acceptsDrop = (e: React.DragEvent, targetFolderId: number | null): boolean => {
    if (!canEdit) return false;
    const p = peekDragPayload(e);
    if (!p) return false;
    if (p.type === "file" && p.sourceProjectId === projectId) return true;
    if (p.type === "files" && p.sourceProjectId === projectId && p.ids.length > 0) return true;
    if (p.type === "folder" && p.sourceProjectId === projectId) {
      if (targetFolderId != null && p.id === targetFolderId) return false;
      if ((p.sourceParentFolderId ?? null) === targetFolderId) return false;
      if (targetFolderId != null && isAncestor(p.id, targetFolderId)) return false;
      return true;
    }
    return false;
  };
  const handleDrop = (e: React.DragEvent, targetFolderId: number | null) => {
    const p = getDragPayload(e);
    setDragOver(null);
    if (!p) return;
    if (p.type === "file" && p.sourceProjectId === projectId) {
      e.preventDefault();
      moveFileToFolder.mutate({ fileId: p.id, folderId: targetFolderId, projectId });
      return;
    }
    if (p.type === "files" && p.sourceProjectId === projectId && p.ids.length > 0) {
      e.preventDefault();
      moveFilesToFolder.mutate({ fileIds: p.ids, folderId: targetFolderId, projectId });
      return;
    }
    if (p.type === "folder" && p.sourceProjectId === projectId) {
      if (targetFolderId != null && p.id === targetFolderId) return;
      if ((p.sourceParentFolderId ?? null) === targetFolderId) return;
      if (targetFolderId != null && isAncestor(p.id, targetFolderId)) return;
      e.preventDefault();
      clearDragPayload();
      moveFolderUnderParent.mutate({
        folderId: p.id,
        parentFolderId: targetFolderId,
        projectId,
      });
      return;
    }
  };

  const deleteFolder = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/folders/${id}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/folders`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/files`] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "files"] });
      // If the user just deleted the folder they were inside (or one of
      // its ancestors), pop them back to the project root so they're
      // not stranded in a now-deleted folder.
      const deletedId = id;
      const isAncestorOfCurrent = (() => {
        if (currentFolderId == null) return false;
        let cur = folders.find((f) => f.id === currentFolderId);
        while (cur) {
          if (cur.id === deletedId) return true;
          const pid = cur.parentFolderId;
          cur = pid == null ? undefined : folders.find((f) => f.id === pid);
        }
        return false;
      })();
      if (isAncestorOfCurrent) onSelectFolder(null);
      setFolderToDelete(null);
      toast({ title: "Folder deleted", description: "Files were moved to the project root." });
    },
    onError: (e: any) =>
      toast({ title: "Could not delete folder", description: e?.message ?? "", variant: "destructive" }),
  });

  const childFolders = useMemo(
    () => folders.filter((f) => (f.parentFolderId ?? null) === currentFolderId),
    [folders, currentFolderId],
  );

  const breadcrumbs = useMemo(() => {
    const trail: Folder[] = [];
    let cur = currentFolderId == null ? null : folders.find((f) => f.id === currentFolderId);
    while (cur) {
      trail.unshift(cur);
      const parentId = cur.parentFolderId;
      cur = parentId == null ? null : folders.find((f) => f.id === parentId) ?? null;
    }
    return trail;
  }, [folders, currentFolderId]);

  const createFolder = useMutation({
    mutationFn: async (name: string) =>
      apiRequest("POST", `/api/projects/${projectId}/folders`, {
        name,
        parentFolderId: currentFolderId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/folders`] });
      setCreateOpen(false);
      setNewName("");
      toast({ title: "Folder created" });
    },
    onError: (e: any) =>
      toast({ title: "Could not create folder", description: e?.message ?? "", variant: "destructive" }),
  });

  return (
    <div className="px-6 pt-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 hover:text-foreground px-1.5 py-0.5 rounded transition-colors",
              dragOver === "root" && "ring-2 ring-primary bg-primary/15 text-foreground",
            )}
            onClick={() => onSelectFolder(null)}
            onDragOver={(e) => {
              if (!acceptsDrop(e, null)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOver !== "root") setDragOver("root");
            }}
            onDragLeave={() => setDragOver((d) => (d === "root" ? null : d))}
            onDrop={(e) => handleDrop(e, null)}
            data-testid="project-folders-root"
          >
            <Home className="h-3.5 w-3.5" /> Project root
          </button>
          {breadcrumbs.map((f) => (
            <span key={f.id} className="inline-flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
              <button
                type="button"
                className={cn(
                  "hover:text-foreground px-1.5 py-0.5 rounded transition-colors",
                  dragOver === f.id && "ring-2 ring-primary bg-primary/15 text-foreground",
                )}
                onClick={() => onSelectFolder(f.id)}
                onDragOver={(e) => {
                  if (!acceptsDrop(e, f.id)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOver !== f.id) setDragOver(f.id);
                }}
                onDragLeave={() => setDragOver((d) => (d === f.id ? null : d))}
                onDrop={(e) => handleDrop(e, f.id)}
                data-testid={`breadcrumb-folder-${f.id}`}
              >
                {f.name}
              </button>
            </span>
          ))}
        </div>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateOpen(true)}
            data-testid="create-subfolder-button"
          >
            <FolderPlus className="h-4 w-4 mr-1" /> New folder
          </Button>
        )}
      </div>

      {childFolders.length > 0 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {childFolders.map((f) => (
            <div
              key={f.id}
              className={cn(
                "group relative flex items-center gap-2 pl-3 pr-1 py-2 rounded-md border border-border bg-card hover:border-foreground/30 text-sm text-card-foreground transition-colors",
                dragOver === f.id && "ring-2 ring-primary border-transparent bg-primary/15",
                canEdit && "cursor-grab active:cursor-grabbing",
              )}
              draggable={canEdit}
              onDragStart={(e) => {
                if (!canEdit) return;
                e.stopPropagation();
                setDragPayload(e, {
                  type: "folder",
                  id: f.id,
                  sourceParentFolderId: f.parentFolderId ?? null,
                  isGlobal: !!f.isGlobal,
                  sourceProjectId: projectId,
                });
              }}
              onDragEnd={clearDragPayload}
              onDragOver={(e) => {
                if (!acceptsDrop(e, f.id)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOver !== f.id) setDragOver(f.id);
              }}
              onDragLeave={() => setDragOver((d) => (d === f.id ? null : d))}
              onDrop={(e) => handleDrop(e, f.id)}
              data-testid={`subfolder-droptarget-${f.id}`}
            >
              <button
                type="button"
                onClick={() => onSelectFolder(f.id)}
                className="flex items-center gap-2 flex-1 min-w-0 text-left"
                data-testid={`subfolder-${f.id}`}
              >
                <FolderIcon className="h-4 w-4 text-amber-400 shrink-0" />
                <span className="truncate">{f.name}</span>
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFolderToShare(f);
                  }}
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  aria-label={`Share folder ${f.name}`}
                  data-testid={`share-subfolder-${f.id}`}
                >
                  <Share2 className="h-4 w-4" />
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFolderToMove(f);
                  }}
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  aria-label={`Move folder ${f.name} to another project`}
                  data-testid={`move-subfolder-${f.id}`}
                  title="Move to another project"
                >
                  <FolderInput className="h-4 w-4" />
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFolderToDelete(f);
                  }}
                  className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  aria-label={`Delete folder ${f.name}`}
                  data-testid={`delete-subfolder-${f.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <ShareLinksDialog
        open={!!folderToShare}
        onOpenChange={(o) => { if (!o) setFolderToShare(null); }}
        scopeType="folder"
        scopeId={folderToShare?.id ?? 0}
        scopeName={folderToShare?.name}
      />

      <MoveFolderToProjectDialog
        folder={folderToMove}
        sourceProjectId={projectId}
        onClose={() => setFolderToMove(null)}
      />

      <AlertDialog
        open={!!folderToDelete}
        onOpenChange={(o) => { if (!o) setFolderToDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this folder?</AlertDialogTitle>
            <AlertDialogDescription>
              {folderToDelete ? (
                <>
                  <span className="font-semibold">{folderToDelete.name}</span> and all of its
                  subfolders will be removed. Any files inside will be moved back to the project
                  root — nothing is permanently deleted.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteFolder.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (folderToDelete) deleteFolder.mutate(folderToDelete.id);
              }}
              disabled={deleteFolder.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="confirm-delete-subfolder"
            >
              {deleteFolder.isPending ? "Deleting…" : "Delete folder"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setNewName(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              Create a folder inside {currentFolderId == null ? "the project root" : "the current folder"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-folder-name">Folder name</Label>
            <Input
              id="new-folder-name"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Cuts, Final, References"
              data-testid="new-folder-name-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!newName.trim() || createFolder.isPending}
              onClick={() => createFolder.mutate(newName.trim())}
              data-testid="create-folder-confirm"
            >
              {createFolder.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface MoveFileDialogProps {
  projectId: number;
  // Single-file mode (existing single-card "Move to folder…" entry point).
  file?: StorageFile | null;
  // Bulk mode (multi-select). When provided and non-empty, the dialog
  // moves every file in the list to the chosen folder. Takes precedence
  // over `file` when both are set.
  files?: StorageFile[] | null;
  onClose: () => void;
}

export function MoveFileDialog({ projectId, file, files, onClose }: MoveFileDialogProps) {
  const { data: folders = [] } = useProjectFolders(projectId);
  const { toast } = useToast();
  const [target, setTarget] = useState<number | null>(null);

  const bulkList = (files && files.length > 0) ? files : null;
  const isOpen = !!bulkList || !!file;
  const titleName = bulkList
    ? `${bulkList.length} file${bulkList.length === 1 ? "" : "s"}`
    : file?.filename ?? "";

  // For a single bulk source folder, disable the matching target option.
  // If files come from mixed folders, no single "current" folder exists,
  // so the disable check falls back to never matching.
  const sourceFolderId: number | null | undefined = bulkList
    ? (() => {
        const first = bulkList[0]?.folderId ?? null;
        const allSame = bulkList.every((f) => (f.folderId ?? null) === first);
        return allSame ? first : undefined;
      })()
    : (file?.folderId ?? null);

  const move = useMutation({
    mutationFn: async () => {
      if (bulkList) {
        const results = await Promise.allSettled(
          bulkList.map((f) =>
            apiRequest("PATCH", `/api/files/${f.id}/move`, { folderId: target }),
          ),
        );
        const failed = results.filter((r) => r.status === "rejected").length;
        return { total: bulkList.length, failed };
      }
      if (!file) return;
      await apiRequest("PATCH", `/api/files/${file.id}/move`, { folderId: target });
      return { total: 1, failed: 0 };
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/files`] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "files"] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/folders`] });
      const moved = (res?.total ?? 1) - (res?.failed ?? 0);
      if ((res?.failed ?? 0) === 0) {
        toast({ title: bulkList ? `Moved ${moved} file${moved === 1 ? "" : "s"}` : "File moved" });
      } else {
        toast({
          title: `Moved ${moved} of ${res.total} files`,
          description: `${res.failed} could not be moved.`,
          variant: "destructive",
        });
      }
      onClose();
    },
    onError: (e: any) =>
      toast({ title: "Move failed", description: e?.message ?? "", variant: "destructive" }),
  });

  // Build display path for each folder (e.g. "Cuts / Final")
  const labelFor = (f: Folder): string => {
    const parts: string[] = [f.name];
    let parent = f.parentFolderId;
    let safety = 0;
    while (parent != null && safety < 10) {
      const p = folders.find((x) => x.id === parent);
      if (!p) break;
      parts.unshift(p.name);
      parent = p.parentFolderId;
      safety += 1;
    }
    return parts.join(" / ");
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{bulkList ? "Move files" : "Move file"}</DialogTitle>
          <DialogDescription>
            Choose a destination folder for <span className="font-semibold">{titleName}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 max-h-72 overflow-auto">
          <button
            type="button"
            onClick={() => setTarget(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm border ${target === null ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted"}`}
            data-testid="move-target-root"
          >
            <Home className="h-4 w-4" /> Project root
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setTarget(f.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm border ${target === f.id ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted"}`}
              data-testid={`move-target-${f.id}`}
            >
              <FolderIcon className="h-4 w-4 text-amber-500" /> {labelFor(f)}
            </button>
          ))}
          {folders.length === 0 && (
            <p className="text-sm text-muted-foreground px-1">
              No subfolders yet. Create one with the “New folder” button first.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={move.isPending || (sourceFolderId !== undefined && sourceFolderId === target)}
            onClick={() => move.mutate()}
            data-testid="move-confirm-button"
          >
            {move.isPending ? "Moving…" : (bulkList ? `Move ${bulkList.length}` : "Move")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface MoveFolderToProjectDialogProps {
  folder: Folder | null;
  sourceProjectId: number;
  onClose: () => void;
}

// Project picker used by the "Move folder to another project" action on
// each subfolder tile. Lists every project the current user can see
// (the server filters /api/projects to that set already) minus the
// source project, since moving into itself is a no-op the server would
// reject anyway. Final edit-access check happens server-side, so a user
// who picks a project they can read but not write into still sees a
// clean error toast.
function MoveFolderToProjectDialog({ folder, sourceProjectId, onClose }: MoveFolderToProjectDialogProps) {
  const isOpen = !!folder;
  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: isOpen,
  });
  const [targetId, setTargetId] = useState<number | null>(null);
  const moveToProject = useMoveProjectFolderToProject();

  const candidates = useMemo(
    () =>
      projects
        .filter((p) => p.id !== sourceProjectId && !(p as any).deletedAt)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [projects, sourceProjectId],
  );

  const handleClose = () => {
    setTargetId(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move folder to another project</DialogTitle>
          <DialogDescription>
            {folder ? (
              <>
                Move <span className="font-semibold">{folder.name}</span> (and every subfolder
                and file inside it) into a different project. The folder will land at the root
                of the chosen project.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 max-h-72 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1 py-4">
              No other projects available.
            </p>
          ) : (
            candidates.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setTargetId(p.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm border ${targetId === p.id ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted"}`}
                data-testid={`move-folder-target-${p.id}`}
              >
                <FolderIcon className="h-4 w-4 text-amber-500" /> {p.name}
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={moveToProject.isPending}>
            Cancel
          </Button>
          <Button
            disabled={!folder || targetId == null || moveToProject.isPending}
            onClick={() => {
              if (!folder || targetId == null) return;
              moveToProject.mutate(
                {
                  folderId: folder.id,
                  targetProjectId: targetId,
                  sourceProjectId,
                },
                { onSuccess: () => handleClose() },
              );
            }}
            data-testid="move-folder-to-project-confirm"
          >
            {moveToProject.isPending ? "Moving…" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
