import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Check,
  Download,
  Eye,
  FileAudio,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Layers,
  MoreHorizontal,
  Share2,
  Trash2,
} from "lucide-react";
import ShareLinksDialog from "@/components/sharing/share-links-dialog";
import { File as StorageFile } from "@shared/schema";
import { setDragPayload, clearDragPayload, peekDragPayload, getDragPayload } from "@/lib/drag-drop";
import { uploadService } from "@/lib/upload-service";
import { formatFileSize, formatTimeAgo } from "@/lib/utils/formatters";
import MediaInfoDialog from "./media-info-dialog";

interface MediaRowProps {
  file: StorageFile;
  onSelect: (fileId: number) => void;
  onMove?: (file: StorageFile) => void;
  versionCount?: number;
  // Sibling versions in the same filename group (including this one),
  // sorted ascending by version. Used to render per-version download
  // and unlink submenus.
  versions?: StorageFile[];
  approvalStatus?: "approved" | "changes_requested" | null;
  // Multi-select drag-and-drop (mirrors MediaCard).
  isSelected?: boolean;
  selectionActive?: boolean;
  selectedIds?: number[];
  onToggleSelect?: (fileId: number, event: React.MouseEvent) => void;
}

const formatDuration = (seconds: number | null) => {
  if (!seconds || seconds === 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

const iconFor = (fileType: string) => {
  switch (fileType) {
    case "video":
      return FileVideo;
    case "audio":
      return FileAudio;
    case "image":
      return ImageIcon;
    default:
      return FileText;
  }
};

// Compact list-row variant of MediaCard. Shares all the same actions
// (view, download, share, move, delete) and drag source so list view
// behaves the same as grid view, just denser.
export default function MediaRow({
  file,
  onSelect,
  onMove,
  versionCount = 1,
  versions,
  approvalStatus,
  isSelected = false,
  selectionActive = false,
  selectedIds,
  onToggleSelect,
}: MediaRowProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const Icon = iconFor(file.fileType);
  const duration = formatDuration((file as any).duration ?? null);
  const [mediaInfoOpen, setMediaInfoOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [isVersionDropTarget, setIsVersionDropTarget] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const dragDepthRef = useRef(0);

  const canEdit = !!onMove;
  const fileRef = useRef(file);
  fileRef.current = file;
  const versionCountRef = useRef(versionCount);
  versionCountRef.current = versionCount;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;

  const stackVersionMutation = useMutation({
    mutationFn: async ({ targetId, sourceFileId }: { targetId: number; sourceFileId: number }) => {
      return await apiRequest("POST", `/api/files/${targetId}/stack-version`, { sourceFileId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", file.projectId, "files"] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${file.projectId}/files`] });
      toast({ title: "Version stacked", description: `Added as v${(versionCount ?? 1) + 1} of ${file.filename}` });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't stack version", description: err?.message || "Try again.", variant: "destructive" });
    },
  });
  const stackVersionMutationRef = useRef(stackVersionMutation.mutate);
  stackVersionMutationRef.current = stackVersionMutation.mutate;

  const unstackMutation = useMutation({
    mutationFn: async (fileId: number) => {
      return await apiRequest("POST", `/api/files/${fileId}/unstack`);
    },
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", file.projectId, "files"] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${file.projectId}/files`] });
      toast({ title: "Version unlinked", description: `Now its own file: ${updated?.filename ?? ""}` });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't unlink version", description: err?.message || "Try again.", variant: "destructive" });
    },
  });

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;

    type DragKind = "os-file" | "internal" | "ignore";
    const classify = (e: DragEvent): DragKind => {
      const types = e.dataTransfer?.types;
      if (!types) return "ignore";
      let isInternal = false;
      for (let i = 0; i < types.length; i++) {
        if (types[i] === "application/x-obviu-dnd") { isInternal = true; break; }
      }
      if (isInternal) {
        const payload = peekDragPayload();
        if (!payload || payload.type !== "file") return "ignore";
        const f = fileRef.current;
        if (payload.sourceProjectId !== f.projectId) return "ignore";
        if (payload.id === f.id) return "ignore";
        return "internal";
      }
      return "os-file";
    };

    const onDragEnter = (e: DragEvent) => {
      if (!canEditRef.current || classify(e) === "ignore") return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setIsVersionDropTarget(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!canEditRef.current) return;
      const kind = classify(e);
      if (kind === "ignore") return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = kind === "os-file" ? "copy" : "move";
    };
    const onDragLeave = (e: DragEvent) => {
      if (!canEditRef.current || classify(e) === "ignore") return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsVersionDropTarget(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!canEditRef.current) return;
      const kind = classify(e);
      if (kind === "ignore") return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setIsVersionDropTarget(false);
      const f = fileRef.current;
      if (!f.projectId) return;

      if (kind === "os-file") {
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length === 0) return;
        if (files.length > 1) {
          toastRef.current({
            title: "Drop one file",
            description: "Stacking versions only supports one file at a time.",
            variant: "destructive",
          });
          return;
        }
        uploadService.uploadFile(files[0], f.projectId, f.filename, (f as any).folderId ?? null);
        toastRef.current({
          title: "Uploading new version",
          description: `${files[0].name} → v${(versionCountRef.current ?? 1) + 1} of ${f.filename}`,
        });
        return;
      }

      const payload = getDragPayload(e as unknown as React.DragEvent);
      const sourceFileId = payload?.type === "file" ? payload.id : null;
      if (!sourceFileId || sourceFileId === f.id) return;
      stackVersionMutationRef.current?.({ targetId: f.id, sourceFileId });
    };

    el.addEventListener("dragenter", onDragEnter);
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragenter", onDragEnter);
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, []);

  const deleteMutation = useMutation({
    mutationFn: (fileId: number) => apiRequest("DELETE", `/api/files/${fileId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", file.projectId, "files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", file.projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${file.projectId}/files`] });
      queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/folders"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/files", file.id, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/files", file.id, "processing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/files", file.id, "approvals"] });
      toast({ title: "File deleted", description: "The file has been successfully deleted." });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting file",
        description: error.message || "Failed to delete the file.",
        variant: "destructive",
      });
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, [role='menu'], [role='dialog'], a")) return;
    if (onToggleSelect) {
      const wantsToggle = e.shiftKey || e.metaKey || e.ctrlKey || selectionActive;
      if (wantsToggle) {
        e.preventDefault();
        e.stopPropagation();
        onToggleSelect(file.id, e);
        return;
      }
    }
    onSelect(file.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete "${file.filename}"? This action cannot be undone.`)) {
      deleteMutation.mutate(file.id);
    }
  };

  const downloadVersion = (fileId: number, name: string) => {
    const url = `/api/files/${fileId}/download`;
    const sep = url.includes("?") ? "&" : "?";
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = `${url}${sep}download=1&filename=${encodeURIComponent(name)}`;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast({ title: "Download started", description: `Downloading ${name}` });
  };

  const handleDownloadOriginal = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadVersion(file.id, file.filename);
  };

  const openShareDialog = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShareDialogOpen(true);
  };

  return (
    <>
      <div
        ref={rowRef}
        className={cn(
          "group relative flex items-center gap-3 px-3 py-2.5 rounded-md border border-border bg-card hover:bg-accent cursor-pointer transition-colors",
          isSelected && "ring-2 ring-primary border-transparent bg-primary/10",
          isVersionDropTarget && "ring-2 ring-primary border-transparent bg-primary/10",
        )}
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          if (isSelected && selectedIds && selectedIds.length > 1) {
            setDragPayload(e, { type: "files", ids: selectedIds, sourceProjectId: file.projectId });
          } else {
            setDragPayload(e, { type: "file", id: file.id, sourceProjectId: file.projectId });
          }
        }}
        onDragEnd={clearDragPayload}
        onClick={handleClick}
        data-testid={`media-row-${file.id}`}
      >
        {isVersionDropTarget && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-primary/85 text-primary-foreground text-sm font-semibold">
            Drop to add as v{(versionCount ?? 1) + 1} of {file.filename}
          </div>
        )}
        {onToggleSelect && (
          <button
            type="button"
            aria-label={isSelected ? "Deselect file" : "Select file"}
            aria-pressed={isSelected}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(file.id, e);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            draggable={false}
            className={cn(
              "h-5 w-5 shrink-0 rounded border flex items-center justify-center transition-all",
              isSelected
                ? "bg-primary border-primary text-primary-foreground opacity-100"
                : "border-muted-foreground/40 text-transparent opacity-0 group-hover:opacity-100",
            )}
            data-testid={`select-file-row-${file.id}`}
          >
            {isSelected && <Check className="h-3.5 w-3.5" />}
          </button>
        )}
        <div className="h-9 w-9 shrink-0 rounded bg-muted flex items-center justify-center">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="truncate text-sm font-medium text-card-foreground"
              title={file.filename}
            >
              {file.filename}
            </span>
            {versionCount > 1 && (
              <span className="inline-flex items-center gap-1 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0">
                <Layers className="h-3 w-3" />
                v{file.version}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span className="capitalize">{file.fileType}</span>
            {duration && (
              <>
                <span>·</span>
                <span className="font-mono">{duration}</span>
              </>
            )}
            <span>·</span>
            <span>{formatFileSize(file.fileSize)}</span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 shrink-0">
          {approvalStatus === "approved" && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400"
              data-testid={`approval-badge-row-${file.id}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Approved
            </span>
          )}
          {approvalStatus === "changes_requested" && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400"
              data-testid={`approval-badge-row-${file.id}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Changes
            </span>
          )}
        </div>

        <div className="shrink-0 text-xs text-muted-foreground w-28 text-right hidden sm:block">
          {formatTimeAgo(file.createdAt)}
        </div>

        <div className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setMediaInfoOpen(true);
                }}
              >
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </DropdownMenuItem>
              {versions && versions.length > 1 ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    {[...versions].sort((a, b) => b.version - a.version).map((v) => (
                      <DropdownMenuItem
                        key={v.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadVersion(v.id, file.filename);
                        }}
                      >
                        <span className="flex-1">v{v.version}{v.id === file.id ? " (latest)" : ""}</span>
                        <span className="ml-2 text-xs text-neutral-500">
                          {formatFileSize(v.fileSize)}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : (
                <DropdownMenuItem onClick={handleDownloadOriginal}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </DropdownMenuItem>
              )}
              {versions && versions.length > 1 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Layers className="h-4 w-4 mr-2" />
                    Unlink version
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    {[...versions].sort((a, b) => b.version - a.version).map((v) => (
                      <DropdownMenuItem
                        key={v.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          unstackMutation.mutate(v.id);
                        }}
                        disabled={unstackMutation.isPending}
                      >
                        <span className="flex-1">v{v.version}{v.id === file.id ? " (latest)" : ""}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuItem onClick={openShareDialog}>
                <Share2 className="h-4 w-4 mr-2" />
                Share Link
              </DropdownMenuItem>
              {onMove && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(file);
                  }}
                  data-testid={`move-file-row-${file.id}`}
                >
                  <FileVideo className="h-4 w-4 mr-2" />
                  Move to folder…
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <MediaInfoDialog
        open={mediaInfoOpen}
        onOpenChange={setMediaInfoOpen}
        fileId={file.id}
        filename={file.filename}
      />

      <span onClick={(e) => e.stopPropagation()}>
        <ShareLinksDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          scopeType="file"
          scopeId={file.id}
          scopeName={file.filename}
        />
      </span>
    </>
  );
}
