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
import { Folder as FolderIcon, FolderPlus, ChevronRight, Home, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDragPayload, peekDragPayload } from "@/lib/drag-drop";
import { useMoveFileToFolder } from "@/hooks/use-drag-move";
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
import type { Folder, File as StorageFile } from "@shared/schema";

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
  // Tracks which drop target is currently being hovered so we can paint
  // a ring without re-rendering siblings. 'root' = breadcrumb, number =
  // a child folder tile.
  const [dragOver, setDragOver] = useState<number | "root" | null>(null);
  const moveFileToFolder = useMoveFileToFolder();

  // Only accept our own file drags; ignore project/folder drags and OS files.
  const acceptsFileDrop = (e: React.DragEvent): boolean => {
    if (!canEdit) return false;
    const p = peekDragPayload(e);
    return !!p && p.type === "file" && p.sourceProjectId === projectId;
  };
  const handleFileDrop = (e: React.DragEvent, targetFolderId: number | null) => {
    const p = getDragPayload(e);
    setDragOver(null);
    if (!p || p.type !== "file" || p.sourceProjectId !== projectId) return;
    e.preventDefault();
    moveFileToFolder.mutate({ fileId: p.id, folderId: targetFolderId, projectId });
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
              if (!acceptsFileDrop(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOver !== "root") setDragOver("root");
            }}
            onDragLeave={() => setDragOver((d) => (d === "root" ? null : d))}
            onDrop={(e) => handleFileDrop(e, null)}
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
                  if (!acceptsFileDrop(e)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOver !== f.id) setDragOver(f.id);
                }}
                onDragLeave={() => setDragOver((d) => (d === f.id ? null : d))}
                onDrop={(e) => handleFileDrop(e, f.id)}
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
              )}
              onDragOver={(e) => {
                if (!acceptsFileDrop(e)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOver !== f.id) setDragOver(f.id);
              }}
              onDragLeave={() => setDragOver((d) => (d === f.id ? null : d))}
              onDrop={(e) => handleFileDrop(e, f.id)}
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
  file: StorageFile | null;
  onClose: () => void;
}

export function MoveFileDialog({ projectId, file, onClose }: MoveFileDialogProps) {
  const { data: folders = [] } = useProjectFolders(projectId);
  const { toast } = useToast();
  const [target, setTarget] = useState<number | null>(null);

  const move = useMutation({
    mutationFn: async () => {
      if (!file) return;
      return apiRequest("PATCH", `/api/files/${file.id}/move`, { folderId: target });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/files`] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "files"] });
      toast({ title: "File moved" });
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
    <Dialog open={!!file} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move file</DialogTitle>
          <DialogDescription>
            Choose a destination folder for <span className="font-semibold">{file?.filename}</span>.
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
            disabled={move.isPending || (file?.folderId ?? null) === target}
            onClick={() => move.mutate()}
            data-testid="move-confirm-button"
          >
            {move.isPending ? "Moving…" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
