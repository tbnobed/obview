import { useState } from "react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Download,
  Eye,
  FileAudio,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Layers,
  MessageSquare,
  MoreHorizontal,
  Share2,
  Trash2,
  Copy,
  Check,
} from "lucide-react";
import { File as StorageFile } from "@shared/schema";
import { setDragPayload, clearDragPayload } from "@/lib/drag-drop";
import { formatFileSize, formatTimeAgo } from "@/lib/utils/formatters";
import MediaInfoDialog from "./media-info-dialog";

interface MediaRowProps {
  file: StorageFile;
  onSelect: (fileId: number) => void;
  onMove?: (file: StorageFile) => void;
  versionCount?: number;
  approvalStatus?: "approved" | "changes_requested" | null;
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
  approvalStatus,
}: MediaRowProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const Icon = iconFor(file.fileType);
  const duration = formatDuration((file as any).duration ?? null);
  const [mediaInfoOpen, setMediaInfoOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareTokenLoading, setShareTokenLoading] = useState(false);
  const [copiedVariant, setCopiedVariant] = useState<"viewOnly" | "comments" | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (fileId: number) => apiRequest("DELETE", `/api/files/${fileId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", file.projectId, "files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", file.projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${file.projectId}/files`] });
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
    onSelect(file.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete "${file.filename}"? This action cannot be undone.`)) {
      deleteMutation.mutate(file.id);
    }
  };

  const handleDownloadOriginal = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `/api/files/${file.id}/download`;
    const sep = url.includes("?") ? "&" : "?";
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = `${url}${sep}download=1&filename=${encodeURIComponent(file.filename)}`;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast({ title: "Download started", description: `Downloading ${file.filename}` });
  };

  // Token + URL handling mirrors media-card-grid.tsx. Keep both call
  // sites in lock-step: server returns the raw token (older builds
  // returned a shareUrl we have to parse), URLs use the configured
  // short-link domain, view-only is signalled with `?viewOnly=true`.
  const ensureShareToken = async (): Promise<string | null> => {
    if (shareToken) return shareToken;
    setShareTokenLoading(true);
    try {
      const res: any = await apiRequest("POST", `/api/files/${file.id}/share`);
      const data = await res.json();
      let token: string | null = typeof data?.token === "string" ? data.token : null;
      if (!token && typeof data?.shareUrl === "string") {
        const m = data.shareUrl.match(/\/(?:share\/)?([^/?#]+)\/?$/);
        token = m?.[1] ?? null;
      }
      if (!token) throw new Error("Failed to obtain share token");
      setShareToken(token);
      return token;
    } finally {
      setShareTokenLoading(false);
    }
  };

  const buildShareUrl = (token: string, variant?: "viewOnly" | "comments") => {
    const configured = (import.meta.env.VITE_SHORT_LINK_BASE_URL as string | undefined)
      ?.trim()
      .replace(/\/+$/, "");
    const base = configured && configured.length > 0 ? configured : window.location.origin;
    return variant === "viewOnly" ? `${base}/${token}?viewOnly=true` : `${base}/${token}`;
  };

  const openShareDialog = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setCopiedVariant(null);
    setShareDialogOpen(true);
    try {
      await ensureShareToken();
    } catch {
      toast({
        title: "Could not create share link",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const copyShareUrl = async (variant: "viewOnly" | "comments") => {
    try {
      const token = await ensureShareToken();
      if (!token) throw new Error("No token");
      const url = buildShareUrl(token, variant);
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedVariant(variant);
      setTimeout(() => setCopiedVariant(null), 1500);
      toast({
        title: variant === "viewOnly" ? "View-only link copied" : "Comment link copied",
        description:
          variant === "viewOnly"
            ? "Recipients can watch but won't see or post comments."
            : "Recipients can view and add comments without an account.",
      });
    } catch {
      toast({
        title: "Failed to copy link",
        description: "Could not copy the share link. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-3 px-3 py-2.5 rounded-md border border-gray-800 bg-gray-900 hover:bg-gray-800/60 cursor-pointer transition-colors",
        )}
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          setDragPayload(e, { type: "file", id: file.id, sourceProjectId: file.projectId });
        }}
        onDragEnd={clearDragPayload}
        onClick={handleClick}
        data-testid={`media-row-${file.id}`}
      >
        <div className="h-9 w-9 shrink-0 rounded bg-gray-800 flex items-center justify-center">
          <Icon className="h-4 w-4 text-gray-400" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="truncate text-sm font-medium text-white"
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
          <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
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

        <div className="shrink-0 text-xs text-gray-400 w-28 text-right hidden sm:block">
          {formatTimeAgo(file.createdAt)}
        </div>

        <div className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-gray-300 hover:bg-gray-700"
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
              <DropdownMenuItem onClick={handleDownloadOriginal}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </DropdownMenuItem>
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

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Share "{file.filename}"</DialogTitle>
            <DialogDescription>
              Anyone with the link can open this file without an account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <button
              type="button"
              onClick={() => copyShareUrl("viewOnly")}
              disabled={shareTokenLoading}
              className="w-full flex items-start gap-3 p-3 rounded-lg border border-neutral-200 dark:border-gray-700 hover:border-primary-400 dark:hover:border-[#026d55] hover:bg-neutral-50 dark:hover:bg-gray-800/60 text-left transition-colors disabled:opacity-50"
            >
              <div className="mt-0.5 h-9 w-9 rounded-md bg-neutral-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                <Eye className="h-4 w-4 text-neutral-600 dark:text-gray-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">View only</div>
                <div className="text-xs text-neutral-500 dark:text-gray-400">
                  Recipients can watch the file but can't see or post comments.
                </div>
              </div>
              {copiedVariant === "viewOnly" ? (
                <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-2" />
              ) : (
                <Copy className="h-4 w-4 text-neutral-400 shrink-0 mt-2" />
              )}
            </button>
            <button
              type="button"
              onClick={() => copyShareUrl("comments")}
              disabled={shareTokenLoading}
              className="w-full flex items-start gap-3 p-3 rounded-lg border border-neutral-200 dark:border-gray-700 hover:border-primary-400 dark:hover:border-[#026d55] hover:bg-neutral-50 dark:hover:bg-gray-800/60 text-left transition-colors disabled:opacity-50"
            >
              <div className="mt-0.5 h-9 w-9 rounded-md bg-neutral-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                <MessageSquare className="h-4 w-4 text-neutral-600 dark:text-gray-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">Comments enabled</div>
                <div className="text-xs text-neutral-500 dark:text-gray-400">
                  Recipients can view and add comments (no account needed).
                </div>
              </div>
              {copiedVariant === "comments" ? (
                <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-2" />
              ) : (
                <Copy className="h-4 w-4 text-neutral-400 shrink-0 mt-2" />
              )}
            </button>
          </div>
          {shareToken && (
            <Input
              readOnly
              value={buildShareUrl(shareToken)}
              className="font-mono text-xs"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
