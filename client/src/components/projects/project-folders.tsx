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
import { Folder as FolderIcon, FolderPlus, ChevronRight, Home } from "lucide-react";
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
        <div className="flex items-center gap-1 text-sm text-gray-300 flex-wrap">
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-white"
            onClick={() => onSelectFolder(null)}
            data-testid="project-folders-root"
          >
            <Home className="h-3.5 w-3.5" /> Project root
          </button>
          {breadcrumbs.map((f) => (
            <span key={f.id} className="inline-flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
              <button
                type="button"
                className="hover:text-white"
                onClick={() => onSelectFolder(f.id)}
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
            <button
              key={f.id}
              type="button"
              onClick={() => onSelectFolder(f.id)}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-gray-700 bg-[#1a1f26] hover:border-gray-500 text-left text-sm text-gray-200"
              data-testid={`subfolder-${f.id}`}
            >
              <FolderIcon className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </div>
      )}

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
