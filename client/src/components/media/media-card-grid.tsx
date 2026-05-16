import { useState, useRef, useEffect } from "react";
import { Play, FileVideo, FileAudio, Image as ImageIcon, FileText, MoreHorizontal, Clock, Eye, Download, Share2, Trash2, Layers, Check, X, ArrowDownAZ, ArrowDownUp } from "lucide-react";
import ShareLinksDialog from "@/components/sharing/share-links-dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatFileSize, formatTimeAgo } from "@/lib/utils/formatters";
import { File as StorageFile } from "@shared/schema";
import MediaInfoDialog from "./media-info-dialog";
import { setDragPayload, clearDragPayload, peekDragPayload, getDragPayload } from "@/lib/drag-drop";
import { uploadService } from "@/lib/upload-service";
import MediaRow from "./media-row";
import { useViewMode } from "@/hooks/use-view-mode";
import ViewModeToggle from "@/components/ui/view-mode-toggle";

interface MediaCardGridProps {
  files: StorageFile[];
  onSelectFile: (fileId: number) => void;
  projectId: number;
  onMoveFile?: (file: StorageFile) => void;
}

// Format duration from seconds to MM:SS or HH:MM:SS
const formatDuration = (seconds: number | null) => {
  if (!seconds || seconds === 0) return "00:00";
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
};

// Get file type icon
const getFileIcon = (fileType: string) => {
  switch (fileType) {
    case 'video':
      return FileVideo;
    case 'audio': 
      return FileAudio;
    case 'image':
      return ImageIcon;
    default:
      return FileText;
  }
};

// Get processing status for file. Polls every 3s while a job is running so
// the badge flips from "Processing" to "Ready" without the user refreshing,
// and invalidates the parent file list on the pending→completed edge so
// duration / poster / hasScrubVersion show up immediately.
const getProcessingStatus = (fileId: number, projectId?: number) => {
  const queryClient = useQueryClient();
  const prevStatusRef = useRef<string | undefined>(undefined);
  const { data: processing } = useQuery({
    queryKey: ['/api/files', fileId, 'processing'],
    queryFn: ({ signal }) => apiRequest('GET', `/api/files/${fileId}/processing`, undefined, { signal }),
    enabled: !!fileId,
    staleTime: 5000,
    retry: false,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.status;
      return s === 'completed' || s === 'failed' ? false : 3000;
    },
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const status = (processing as any)?.status;
    if (
      projectId &&
      prevStatusRef.current &&
      prevStatusRef.current !== 'completed' &&
      status === 'completed'
    ) {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'files'] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/files`] });
    }
    prevStatusRef.current = status;
  }, [(processing as any)?.status, projectId, queryClient]);

  return processing;
};

interface MediaCardProps {
  file: StorageFile;
  onSelect: (fileId: number) => void;
  onMove?: (file: StorageFile) => void;
  versionCount?: number;
  // Sibling versions in the same filename group (including this one),
  // sorted ascending by version number. Used to render per-version
  // download and unlink submenus.
  versions?: StorageFile[];
  approvalStatus?: "approved" | "changes_requested" | null;
  // Multi-select drag-and-drop. When `isSelected`, the drag carries every
  // selected file id rather than just this one. Clicks with shift/cmd/ctrl
  // (or any click while another card is already selected) toggle selection
  // instead of opening the file.
  isSelected?: boolean;
  selectionActive?: boolean;
  selectedIds?: number[];
  onToggleSelect?: (fileId: number, event: React.MouseEvent) => void;
}

function MediaCard({
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
}: MediaCardProps) {
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);
  const [spriteMetadata, setSpriteMetadata] = useState<any>(null);
  const [spriteLoaded, setSpriteLoaded] = useState(false);
  const [isVersionDropTarget, setIsVersionDropTarget] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const dragDepthRef = useRef(0);
  const scrubRafRef = useRef<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Drag-and-drop a local OS file onto this card to stack it as a new
  // version of the existing file. Native DOM listeners (not React onDrop)
  // — synthetic events drop the `drop` event in some preview/iframe
  // contexts even when dragover fires. Stable refs hold the latest file
  // metadata so the listener-attach effect runs ONCE per mount and
  // doesn't get torn down on every render (which can race with an
  // in-flight drag).
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
    const el = cardRef.current;
    if (!el) return;

    // Classify the drag once per event. Two accepted kinds:
    //   "os-file"  — external OS file drag (upload as new version).
    //   "internal" — another media card from the SAME project, different
    //                id (re-stack as new version of this file).
    // Anything else (cross-project file drags, folder drags, etc.) is
    // ignored so the move-between-projects flow keeps working.
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
        if (!payload) return "ignore";
        if (payload.type !== "file") return "ignore";
        const f = fileRef.current;
        if (payload.sourceProjectId !== f.projectId) return "ignore";
        if (payload.id === f.id) return "ignore";
        return "internal";
      }
      return "os-file";
    };

    const onDragEnter = (e: DragEvent) => {
      if (!canEditRef.current) return;
      if (classify(e) === "ignore") return;
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
      if (!canEditRef.current) return;
      if (classify(e) === "ignore") return;
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

      // kind === "internal" — stack the dragged card as next version.
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
  
  // Delete file mutation
  const deleteMutation = useMutation({
    mutationFn: (fileId: number) => apiRequest('DELETE', `/api/files/${fileId}`),
    onSuccess: () => {
      // Invalidate and refetch all related queries
      queryClient.invalidateQueries({ queryKey: ['/api/projects', file.projectId, 'files'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', file.projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${file.projectId}/files`] });
      // Invalidate folder-scoped project lists (folder pages render
      // project cards with latestVideoFile + fileCount; without this the
      // card keeps showing the deleted file's thumbnail).
      queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('/api/folders'),
      });
      // Invalidate file-specific queries (comments, processing, etc.)
      queryClient.invalidateQueries({ queryKey: ['/api/files', file.id, 'comments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/files', file.id, 'processing'] });
      queryClient.invalidateQueries({ queryKey: ['/api/files', file.id, 'approvals'] });
      
      toast({
        title: "File deleted",
        description: "The file has been successfully deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting file",
        description: error.message || "Failed to delete the file. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete "${file.filename}"? This action cannot be undone.`)) {
      deleteMutation.mutate(file.id);
    }
  };

  const [mediaInfoOpen, setMediaInfoOpen] = useState(false);

  const handleViewDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMediaInfoOpen(true);
  };

  // Trigger a browser download via a hidden anchor. We deliberately do NOT
  // round-trip the bytes through fetch+blob: blob storage is capped well
  // below multi-GB and would silently fail or OOM the tab on large files
  // (the bug that broke 7 GB Original downloads). Instead we navigate to a
  // URL that responds with Content-Disposition: attachment so the browser
  // streams straight to disk. `download` attribute is a hint for the
  // filename; the server's Content-Disposition wins when both are present.
  const downloadUrlAs = async (url: string, downloadName: string) => {
    try {
      const sep = url.includes('?') ? '&' : '?';
      const downloadHref = `${url}${sep}download=1&filename=${encodeURIComponent(downloadName)}`;
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = downloadHref;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast({
        title: "Download started",
        description: `Downloading ${downloadName}`,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to start the download. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadOriginal = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Use /download (forces Content-Disposition: attachment) instead of
    // /content (inline media stream). For multi-GB originals the browser
    // must stream to disk, never buffer in memory.
    downloadUrlAs(`/api/files/${file.id}/download`, file.filename);
  };

  // Build a download filename like "myclip_720p.mp4" preserving the original
  // base name and the quality's container extension when possible.
  const buildQualityFilename = (resolution: string, sourcePath?: string) => {
    const base = file.filename.replace(/\.[^.]+$/, "");
    const ext = sourcePath?.match(/\.[a-z0-9]+$/i)?.[0] ?? ".mp4";
    return `${base}_${resolution}${ext}`;
  };

  const handleDownloadQuality = (e: React.MouseEvent, resolution: string, sourcePath?: string) => {
    e.stopPropagation();
    downloadUrlAs(
      `/api/files/${file.id}/qualities/${encodeURIComponent(resolution)}`,
      buildQualityFilename(resolution, sourcePath),
    );
  };

  // Per-file share-link manager — same UI/permissions as project/folder
  // shares (password, expiry, downloads, comments, email gate, watermark).
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const openShareDialog = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShareDialogOpen(true);
  };
  
  const processing = getProcessingStatus(file.id, file.projectId);
  
  // Load sprite metadata for video files
  useEffect(() => {
    if (file.fileType === 'video' && (processing as any)?.status === 'completed') {
      fetch(`/api/files/${file.id}/sprite-metadata`)
        .then(res => res.ok ? res.json() : null)
        .then(metadata => {
          if (metadata) {
            setSpriteMetadata(metadata);
            console.log(`🎬 [SPRITE] Loaded metadata for file ${file.id}:`, metadata);
          }
        })
        .catch(err => console.warn(`🎬 [SPRITE] Failed to load metadata for file ${file.id}:`, err));
    }
  }, [file.id, file.fileType, (processing as any)?.status]);
  
  // Load sprite for video files, direct content for image files
  const thumbnailSrc = file.fileType === 'video' 
    ? `/api/files/${file.id}/sprite` 
    : file.fileType === 'image' 
      ? `/api/files/${file.id}/content`
      : null;
  
  // Get duration from processing data
  const duration = (processing as any)?.originalDuration || null;
  
  const FileIcon = getFileIcon(file.fileType);
  
  // Selection-aware click: shift/cmd/ctrl always toggles; if another card
  // is already selected, plain click also toggles (Finder-style sticky
  // selection). Otherwise plain click opens the file.
  const handleCardClick = (e?: React.MouseEvent) => {
    if (e && onToggleSelect) {
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

  const handleThumbnailLoad = () => {
    setThumbnailLoaded(true);
    setThumbnailError(false);
  };

  const handleThumbnailError = () => {
    setThumbnailError(true);
    setThumbnailLoaded(false);
  };

  // Get status badge color and text
  const getStatusInfo = () => {
    if (!file.isAvailable) {
      return { color: "bg-red-500", text: "Unavailable" };
    }
    
    if (processing) {
      const status = (processing as any).status;
      
      // For video files, check if all processing components are truly ready
      if (file.fileType === 'video') {
        switch (status) {
          case 'pending':
            return { color: "bg-yellow-500", text: "Processing" };
          case 'processing':
            return { color: "bg-blue-500", text: "Processing" };
          case 'completed':
            // Only show "Ready" if we have qualities AND scrub version for videos
            const hasQualities = (processing as any).qualities && (processing as any).qualities.length > 0;
            const hasScrubVersion = (processing as any).scrubVersionPath || (processing as any).hasScrubVersion;
            
            if (hasQualities && hasScrubVersion) {
              return { color: "bg-green-500", text: "Ready" };
            } else {
              // Still processing some components
              return { color: "bg-blue-500", text: "Processing" };
            }
          case 'failed':
            return { color: "bg-red-500", text: "Failed" };
          default:
            return { color: "bg-gray-500", text: "Unknown" };
        }
      } else {
        // For non-video files, use simple status check
        switch (status) {
          case 'pending':
            return { color: "bg-yellow-500", text: "Processing" };
          case 'processing':
            return { color: "bg-blue-500", text: "Processing" };
          case 'completed':
            return { color: "bg-green-500", text: "Ready" };
          case 'failed':
            return { color: "bg-red-500", text: "Failed" };
          default:
            return { color: "bg-gray-500", text: "Unknown" };
        }
      }
    }
    
    // No processing data - for non-video files this means ready
    if (file.fileType !== 'video') {
      return { color: "bg-green-500", text: "Ready" };
    }
    
    // For video files without processing data, assume they are legacy processed files
    // New files will have processing records, old files without records are likely complete
    return { color: "bg-green-500", text: "Ready" };
  };

  const statusInfo = getStatusInfo();

  return (
    <Card 
      ref={cardRef}
      className={cn(
        "group relative cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] bg-card border-border hover:border-foreground/20 active:opacity-70",
        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background border-transparent",
        isVersionDropTarget && "ring-2 ring-primary ring-offset-2 ring-offset-background border-transparent shadow-lg",
      )}
      onClick={handleCardClick}
      draggable
      onDragStart={(e) => {
        // Carry source project id so drop targets can avoid no-op moves
        // and so the server can reject same-project drops cleanly. If this
        // card is part of an active selection, drag the whole set.
        e.stopPropagation();
        if (isSelected && selectedIds && selectedIds.length > 1) {
          setDragPayload(e, { type: "files", ids: selectedIds, sourceProjectId: file.projectId });
        } else {
          setDragPayload(e, { type: "file", id: file.id, sourceProjectId: file.projectId });
        }
      }}
      onDragEnd={clearDragPayload}
      data-testid={`media-card-${file.id}`}
    >
      {isVersionDropTarget && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center rounded-lg bg-primary/85 text-primary-foreground"
        >
          <Layers className="h-8 w-8 mb-2" />
          <div className="text-sm font-semibold">Drop to add as v{(versionCount ?? 1) + 1}</div>
          <div className="text-xs opacity-80 px-3 text-center mt-0.5 truncate max-w-full">
            of {file.filename}
          </div>
        </div>
      )}
      <CardContent className="p-0">
        {/* Thumbnail Container */}
        <div 
          className="relative aspect-video bg-muted rounded-t-lg overflow-hidden"
          style={{
            cursor: `url("data:image/svg+xml,%3csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M8 5v10l8-5-8-5z' fill='%23ffffff'/%3e%3c/svg%3e") 10 10, pointer`
          }}
          onMouseMove={(e) => {
            if (!spriteMetadata || file.fileType !== 'video') return;
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
            if (!spriteMetadata || file.fileType !== 'video') return;
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
          onClick={handleCardClick}
          data-testid={`video-preview-container-${file.id}`}
        >
          {(file.fileType === 'video' && thumbnailSrc && spriteMetadata) || (file.fileType === 'image' && thumbnailSrc) ? (
            <>
              {file.fileType === 'image' ? (
                /* Image file rendering */
                <>
                  <img
                    src={thumbnailSrc}
                    className="w-full h-full object-cover"
                    onLoad={handleThumbnailLoad}
                    onError={handleThumbnailError}
                    alt={file.filename}
                    data-testid={`image-preview-${file.id}`}
                  />
                  
                  {/* Fallback for failed image loading */}
                  {thumbnailError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted">
                      <FileIcon className="h-12 w-12 text-gray-500" />
                    </div>
                  )}
                </>
              ) : (
                /* Video file rendering with sprite logic */
                <>
                  {/* Hidden image to detect sprite loading */}
                  <img
                    src={thumbnailSrc}
                    className="hidden"
                    onLoad={() => {
                      console.log(`🎬 [SPRITE] ✅ Sprite loaded for file ${file.id}: ${file.filename}`);
                      setSpriteLoaded(true);
                      handleThumbnailLoad();
                    }}
                    onError={() => {
                      console.error(`🎬 [SPRITE] ❌ Sprite error for file ${file.id}`);
                      handleThumbnailError();
                    }}
                    alt=""
                  />
                  
                  {!thumbnailError && thumbnailLoaded ? (
                    // Letterbox the sprite cell inside the landscape card
                    // slot so portrait/vertical video keeps its true aspect
                    // instead of being squished to fill.
                    <div className="absolute inset-0 flex items-center justify-center bg-black">
                      <div
                        className="bg-center bg-no-repeat pointer-events-none max-w-full max-h-full"
                        data-testid={`sprite-preview-${file.id}`}
                        style={{
                          aspectRatio: `${spriteMetadata.thumbnailWidth || 16} / ${spriteMetadata.thumbnailHeight || 9}`,
                          width: (spriteMetadata.thumbnailWidth || 16) >= (spriteMetadata.thumbnailHeight || 9) ? '100%' : 'auto',
                          height: (spriteMetadata.thumbnailWidth || 16) >= (spriteMetadata.thumbnailHeight || 9) ? 'auto' : '100%',
                          backgroundImage: `url(${thumbnailSrc})`,
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

                            // Calculate background position (negative values to shift the sprite)
                            const xPercent = spriteMetadata.cols > 1 ? (col / (spriteMetadata.cols - 1)) * 100 : 0;
                            const yPercent = spriteMetadata.rows > 1 ? (row / (spriteMetadata.rows - 1)) * 100 : 0;

                            return `${xPercent}% ${yPercent}%`;
                          })()
                        }}
                      />
                    </div>
                  ) : null}
                  
                  {/* Fallback for failed thumbnail or while loading */}
                  {(!thumbnailLoaded || thumbnailError) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted">
                      <FileIcon className="h-12 w-12 text-gray-500" />
                    </div>
                  )}
                  
                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/20">
                    <div className="bg-white/90 rounded-full p-3 shadow-lg">
                      <Play className="h-6 w-6 text-gray-900 fill-gray-900" />
                    </div>
                  </div>

                  {/* Duration Badge */}
                  {duration && (
                    <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded font-mono">
                      {formatDuration(duration)}
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
                </>
              )}
            </>
          ) : (
            /* Non-video files */
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <FileIcon className="h-12 w-12 text-gray-500" />
              {file.fileType === 'audio' && duration && (
                <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded font-mono">
                  {formatDuration(duration)}
                </div>
              )}
            </div>
          )}

          {/* Status Badge + selection checkbox */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5">
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
                  "h-5 w-5 rounded border flex items-center justify-center transition-all",
                  isSelected
                    ? "bg-primary border-primary text-primary-foreground opacity-100"
                    : "bg-black/50 border-white/60 text-transparent opacity-0 group-hover:opacity-100",
                )}
                data-testid={`select-file-${file.id}`}
              >
                {isSelected && <Check className="h-3.5 w-3.5" />}
              </button>
            )}
            <div className={cn("w-3 h-3 rounded-full", statusInfo.color)}></div>
            {versionCount > 1 && (
              <div className="flex items-center gap-1 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                <Layers className="h-3 w-3" />
                v{file.version}
              </div>
            )}
          </div>

          {/* Actions Menu */}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleViewDetails}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                {(() => {
                  // For videos with completed processing, expose every encoded
                  // resolution alongside the original. For other file types
                  // (audio, image) there are no transcoded variants, so fall
                  // back to a single download item. When the file is part of
                  // a stack (versions.length > 1), nest each older version
                  // under its own submenu so the user can grab any version.
                  const qualities: Array<{ resolution: string; path: string; size: number }> =
                    (processing as any)?.qualities || [];
                  const hasQualityVariants =
                    file.fileType === "video" && qualities.length > 0;
                  const allVersions = (versions && versions.length > 1)
                    ? [...versions].sort((a, b) => b.version - a.version)
                    : null;

                  if (!hasQualityVariants && !allVersions) {
                    return (
                      <DropdownMenuItem onClick={handleDownloadOriginal}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                    );
                  }

                  const latestQualities = (
                    <>
                      <DropdownMenuItem onClick={handleDownloadOriginal}>
                        <span className="flex-1">Original</span>
                        <span className="ml-2 text-xs text-neutral-500">
                          {formatFileSize(file.fileSize)}
                        </span>
                      </DropdownMenuItem>
                      {hasQualityVariants && <DropdownMenuSeparator />}
                      {qualities.map((q) => (
                        <DropdownMenuItem
                          key={q.resolution}
                          onClick={(e) => handleDownloadQuality(e, q.resolution, q.path)}
                        >
                          <span className="flex-1">{q.resolution}</span>
                          {q.size ? (
                            <span className="ml-2 text-xs text-neutral-500">
                              {formatFileSize(q.size)}
                            </span>
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </>
                  );

                  return (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-56">
                        {allVersions ? (
                          <>
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <span className="flex-1">v{file.version} (latest)</span>
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent className="w-56">
                                {latestQualities}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuSeparator />
                            {allVersions.filter(v => v.id !== file.id).map((v) => (
                              <DropdownMenuItem
                                key={v.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadUrlAs(`/api/files/${v.id}/download`, file.filename);
                                }}
                              >
                                <span className="flex-1">v{v.version}</span>
                                <span className="ml-2 text-xs text-neutral-500">
                                  {formatFileSize(v.fileSize)}
                                </span>
                              </DropdownMenuItem>
                            ))}
                          </>
                        ) : (
                          latestQualities
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  );
                })()}
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
                    onClick={(e) => { e.stopPropagation(); onMove(file); }}
                    data-testid={`move-file-${file.id}`}
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

        {/* Card Footer */}
        <div className="p-4">
          {/* Filename */}
          <h3 className="font-medium text-card-foreground text-sm mb-1 truncate" title={file.filename}>
            {file.filename}
          </h3>
          
          {/* Metadata */}
          <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <span className="truncate">{formatFileSize(file.fileSize)}</span>
              <span>•</span>
              <span className="truncate">{formatTimeAgo(file.createdAt)}</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Approval status (file-level) — minimal dot pill */}
              {approvalStatus === "approved" && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400"
                  data-testid={`approval-badge-${file.id}`}
                  title="Approved"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Approved
                </span>
              )}
              {approvalStatus === "changes_requested" && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400"
                  data-testid={`approval-badge-${file.id}`}
                  title="Changes requested"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Changes
                </span>
              )}

              {/* Processing/availability — only surface non-ready states to keep things calm */}
              {statusInfo.text !== "Ready" && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-medium",
                    statusInfo.text === "Failed" || statusInfo.text === "Unavailable"
                      ? "text-red-400"
                      : "text-blue-400"
                  )}
                  title={statusInfo.text}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      statusInfo.text === "Failed" || statusInfo.text === "Unavailable"
                        ? "bg-red-400"
                        : "bg-blue-400 animate-pulse"
                    )}
                  />
                  {statusInfo.text}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>

      {/* MediaInfo-style technical details */}
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
    </Card>
  );
}

type FileSortKey = "name" | "date" | "size";
type FileSortDir = "asc" | "desc";
const FILE_SORT_STORAGE_KEY = "obviu:media-files:sort-v1";

function readFileSort(): { key: FileSortKey; dir: FileSortDir } {
  try {
    const raw = localStorage.getItem(FILE_SORT_STORAGE_KEY);
    if (!raw) return { key: "date", dir: "desc" };
    const p = JSON.parse(raw);
    const key = (["name", "date", "size"] as FileSortKey[]).includes(p.key) ? p.key : "date";
    const dir = p.dir === "asc" ? "asc" : "desc";
    return { key, dir };
  } catch {
    return { key: "date", dir: "desc" };
  }
}

export default function MediaCardGrid({ files, onSelectFile, projectId, onMoveFile }: MediaCardGridProps) {
  const [viewMode, setViewMode] = useViewMode("media", "grid");
  const [sortState, setSortState] = useState<{ key: FileSortKey; dir: FileSortDir }>(readFileSort);
  useEffect(() => {
    try { localStorage.setItem(FILE_SORT_STORAGE_KEY, JSON.stringify(sortState)); } catch {}
  }, [sortState]);

  const latestFiles = (() => {
    const list = files.filter((f) => f.isLatestVersion);
    const dir = sortState.dir === "asc" ? 1 : -1;
    const get = (f: StorageFile): string | number => {
      switch (sortState.key) {
        case "name": return (f.filename || "").toLowerCase();
        case "size": return f.fileSize ?? 0;
        case "date": return new Date(f.createdAt as any).getTime();
      }
    };
    return [...list].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  })();

  const sortLabel = (() => {
    const base = sortState.key === "name" ? "Name" : sortState.key === "size" ? "Size" : "Date";
    const arrow = sortState.dir === "asc" ? "↑" : "↓";
    return `Sort: ${base} ${arrow}`;
  })();
  const pickSort = (key: FileSortKey) => setSortState((s) => ({
    key,
    // First click on a new key uses a sensible default direction;
    // clicking the active key flips direction.
    dir: s.key === key ? (s.dir === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc",
  }));

  // Multi-select state for drag-and-drop into subfolders. Selection is
  // local to this list; switching folders / projects re-mounts the parent
  // and resets it. After a move/refetch we drop ids that aren't visible
  // anymore so a plain click opens (instead of toggling) and the header
  // banner doesn't stick around in "selection mode".
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<number | null>(null);
  const visibleIdSet = new Set(latestFiles.map((f) => f.id));
  // Identity-based signature, NOT count — moves can replace IDs without
  // changing the list length (e.g. one in, one out from a sibling folder).
  const visibleIdSignature = latestFiles.map((f) => f.id).join(",");
  useEffect(() => {
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<number>();
      Array.from(prev).forEach((id) => {
        if (visibleIdSet.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
    setLastSelectedId((prev) => (prev != null && !visibleIdSet.has(prev) ? null : prev));
    // visibleIdSet is rebuilt from latestFiles on every render; the signature
    // is what actually decides when to re-prune.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIdSignature]);

  const orderedIds = latestFiles.map((f) => f.id);
  const onToggleSelect = (fileId: number, e: React.MouseEvent) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      // Shift+click = range select from lastSelectedId to fileId.
      if (e.shiftKey && lastSelectedId != null && lastSelectedId !== fileId) {
        const a = orderedIds.indexOf(lastSelectedId);
        const b = orderedIds.indexOf(fileId);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(orderedIds[i]);
          return next;
        }
      }
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
    setLastSelectedId(fileId);
  };
  const clearSelection = () => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  };
  const selectionActive = selectedIds.size > 0;
  const selectedIdArray = Array.from(selectedIds);

  // Esc clears the selection — same affordance Finder/Drive use.
  useEffect(() => {
    if (!selectionActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectionActive]);

  const versionsByGroup = new Map<string, StorageFile[]>();
  for (const f of files) {
    const key = `${f.projectId}::${f.filename}`;
    const list = versionsByGroup.get(key);
    if (list) list.push(f);
    else versionsByGroup.set(key, [f]);
  }
  versionsByGroup.forEach((list) => {
    list.sort((a: StorageFile, b: StorageFile) => a.version - b.version);
  });

  const { data: fileApprovals } = useQuery<Record<number, "approved" | "changes_requested" | null>>({
    queryKey: ['/api/projects', projectId, 'file-approvals'],
    queryFn: ({ signal }) =>
      apiRequest('GET', `/api/projects/${projectId}/file-approvals`, undefined, { signal }),
    enabled: !!projectId,
    staleTime: 10000,
  });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-1">Media Files</h2>
          <p className="text-muted-foreground text-sm">
            {selectionActive
              ? `${selectedIds.size} selected — drag onto a folder to move`
              : `${latestFiles.length} file${latestFiles.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectionActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              data-testid="clear-selection-button"
            >
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
          <ViewModeToggle
            value={viewMode}
            onChange={setViewMode}
            testIdPrefix="media-view"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-muted-foreground border-border hover:border-foreground/30"
                data-testid="media-sort-trigger"
              >
                <ArrowDownUp className="h-3.5 w-3.5 mr-1.5" />
                {sortLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => pickSort("name")} data-testid="media-sort-name">
                {sortState.key === "name" && <Check className="h-3.5 w-3.5 mr-1.5" />}
                <span className={sortState.key === "name" ? "" : "ml-5"}>Name</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => pickSort("date")} data-testid="media-sort-date">
                {sortState.key === "date" && <Check className="h-3.5 w-3.5 mr-1.5" />}
                <span className={sortState.key === "date" ? "" : "ml-5"}>Date</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => pickSort("size")} data-testid="media-sort-size">
                {sortState.key === "size" && <Check className="h-3.5 w-3.5 mr-1.5" />}
                <span className={sortState.key === "size" ? "" : "ml-5"}>Size</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setSortState((s) => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))}
                data-testid="media-sort-direction"
              >
                <ArrowDownAZ className="h-3.5 w-3.5 mr-1.5" />
                {sortState.dir === "asc" ? "Ascending" : "Descending"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {latestFiles.map((file) => (
            <MediaCard
              key={file.id}
              file={file}
              onSelect={onSelectFile}
              onMove={onMoveFile}
              versionCount={versionsByGroup.get(`${file.projectId}::${file.filename}`)?.length || 1}
              versions={versionsByGroup.get(`${file.projectId}::${file.filename}`)}
              approvalStatus={fileApprovals?.[file.id] ?? null}
              isSelected={selectedIds.has(file.id)}
              selectionActive={selectionActive}
              selectedIds={selectedIdArray}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {latestFiles.map((file) => (
            <MediaRow
              key={file.id}
              file={file}
              onSelect={onSelectFile}
              onMove={onMoveFile}
              versionCount={versionsByGroup.get(`${file.projectId}::${file.filename}`)?.length || 1}
              versions={versionsByGroup.get(`${file.projectId}::${file.filename}`)}
              approvalStatus={fileApprovals?.[file.id] ?? null}
              isSelected={selectedIds.has(file.id)}
              selectionActive={selectionActive}
              selectedIds={selectedIdArray}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}