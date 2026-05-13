import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Lock,
  AlertCircle,
  Download,
  MessageSquare,
  FileVideo,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Send,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Image as ImageIcon,
  Music,
  File as FileIcon,
  PencilLine,
  Smile,
  X as XIcon,
  Pencil,
  Trash2,
  Reply,
  Check,
  Filter,
  Upload as UploadIcon,
  LogIn,
} from "lucide-react";

const APP_BASE = (import.meta.env.VITE_APP_BASE_URL as string | undefined)
  ?.trim().replace(/\/+$/, "") ?? "";

function signInHref(token: string): string {
  const returnTo = `/s/${token}${typeof window !== "undefined" ? window.location.search : ""}`;
  return `${APP_BASE}/auth?returnTo=${encodeURIComponent(returnTo)}`;
}
import { queryClient } from "@/lib/queryClient";
import {
  AnnotationCanvas,
  AnnotationOverlay,
  type Annotation,
} from "@/components/media/annotation-canvas";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import Logo from "@/components/ui/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TranscriptView from "@/components/media/transcript-view";
import AIInsightsView from "@/components/media/ai-insights-view";
import WatermarkOverlay from "@/components/media/watermark-overlay";
import SharePlayerControls from "@/components/media/share-player-controls";

type ShareInfo = {
  scopeType: "project" | "folder" | "file";
  scopeId: number;
  fileProjectId: number | null;
  fileFolderId: number | null;
  folderProjectId: number | null;
  name: string | null;
  scopeName: string;
  expired: boolean;
  requiresPassword: boolean;
  requiresEmail: boolean;
  allowDownloads: boolean;
  allowComments: boolean;
  allowUploads: boolean;
  watermarkEnabled?: boolean;
  watermarkText?: string | null;
  watermarkLabel?: string | null;
  unlocked: boolean;
  viewerAuthenticated?: boolean;
};

type ManifestFile = {
  id: number;
  filename: string;
  fileType: string;
  fileSize: number;
  version: number;
  createdAt: string;
  isAvailable: boolean;
};

type Manifest = {
  scopeType: "project" | "folder" | "file";
  name: string | null;
  allowDownloads: boolean;
  allowComments: boolean;
  allowUploads: boolean;
  watermarkEnabled?: boolean;
  watermarkText?: string | null;
  watermarkLabel?: string | null;
  projects: { id: number; name: string; files: ManifestFile[] }[];
};

type Comment = {
  id: string;
  content: string;
  authorName?: string | null;
  isPublic: boolean;
  timestamp: number | null;
  createdAt: string;
  parentId: string | null;
  user?: { name: string } | null;
  annotations?: string | null;
  isResolved?: boolean;
};

const COMMENT_TOKEN_KEY = (id: string) => `share-comment-token-${id}`;
function rememberCommentToken(id: string, token: string) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(COMMENT_TOKEN_KEY(id), token); } catch {}
}
function getCommentToken(id: string): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(COMMENT_TOKEN_KEY(id)); } catch { return null; }
}
function forgetCommentToken(id: string) {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(COMMENT_TOKEN_KEY(id)); } catch {}
}

function parseAnnotations(c: { annotations?: string | null } | null | undefined): Annotation[] | null {
  if (!c?.annotations) return null;
  try {
    const parsed = typeof c.annotations === "string" ? JSON.parse(c.annotations) : c.annotations;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as Annotation[];
  } catch {}
  return null;
}

function fmtBytes(n: number) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

function fmtTime(seconds: number | null) {
  if (seconds === null || seconds === undefined) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

type TimeFormat = "Frames" | "Standard" | "Timecode";

function formatTimecode(
  seconds: number,
  format: TimeFormat,
  fps: number = 30,
): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const totalFrames = Math.floor(seconds * fps);
  if (format === "Frames") {
    return totalFrames.toString();
  }
  const hh = Math.floor(seconds / 3600);
  const mm = Math.floor((seconds % 3600) / 60);
  const ss = Math.floor(seconds % 60);
  const ff = totalFrames % fps;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (format === "Standard") {
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
  }
  return `${pad(hh)}:${pad(mm)}:${pad(ss)};${pad(ff)}`;
}

function fileKind(t: string) {
  if (t === "video" || t?.startsWith("video/")) return "video";
  if (t === "audio" || t?.startsWith("audio/")) return "audio";
  if (t === "image" || t?.startsWith("image/")) return "image";
  return "other";
}

export default function MultiSharePage() {
  const params = useParams();
  const token = params.token as string;
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const infoQ = useQuery<ShareInfo>({
    queryKey: ["share-info", token],
    queryFn: async () => {
      const r = await fetch(`/api/public/share/${token}/info`);
      if (!r.ok) throw new Error("not_found");
      return r.json();
    },
    retry: false,
  });

  // If the visitor is signed in, send them to the authenticated app view
  // for the shared scope (project or file). Folder shares stay on this
  // multi-share page since there's no folder-specific authenticated route.
  useEffect(() => {
    if (authLoading || !user || !infoQ.data) return;
    const info = infoQ.data;
    if (info.expired) return;
    const search = new URLSearchParams(window.location.search);
    const presetFile = search.get("file");
    let path: string | null = null;
    if (info.scopeType === "project") {
      path = presetFile
        ? `/projects/${info.scopeId}?media=${presetFile}`
        : `/projects/${info.scopeId}`;
    } else if (info.scopeType === "file" && info.fileProjectId) {
      // Include the file's folder so the project page opens to the
      // subfolder where the media lives instead of the project root.
      path = info.fileFolderId
        ? `/projects/${info.fileProjectId}?folder=${info.fileFolderId}&media=${info.scopeId}`
        : `/projects/${info.fileProjectId}?media=${info.scopeId}`;
    } else if (info.scopeType === "folder") {
      // Project subfolder: land on the project page with the subfolder
      // pre-selected via ?folder=. Sidebar/global folder (no parent
      // project): land on the standalone /folders/:id page.
      path = info.folderProjectId
        ? `/projects/${info.folderProjectId}?folder=${info.scopeId}`
        : `/folders/${info.scopeId}`;
    }
    if (!path) return;
    // Cross-host redirect when the canonical app lives on a different
    // host than the short-link host (e.g. tbn.obviu.io vs t.obviu.io).
    // Wouter's setLocation only does in-app pushState, which leaves the
    // user on t.obviu.io where the authenticated app routes / API may
    // not be served. Empty VITE_APP_BASE_URL -> stay in-app.
    const appBase = (import.meta.env.VITE_APP_BASE_URL as string | undefined)
      ?.trim().replace(/\/+$/, "") ?? "";
    if (appBase && (typeof window === "undefined" || !window.location.origin.startsWith(appBase))) {
      window.location.replace(`${appBase}${path}`);
    } else {
      setLocation(path, { replace: true });
    }
  }, [authLoading, user, infoQ.data, setLocation]);

  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    if (infoQ.data?.unlocked) setUnlocked(true);
  }, [infoQ.data?.unlocked]);

  const manifestQ = useQuery<Manifest>({
    queryKey: ["share-manifest", token],
    queryFn: async () => {
      const r = await fetch(`/api/public/share/${token}/manifest`);
      if (!r.ok) throw new Error("locked");
      return r.json();
    },
    enabled:
      !!infoQ.data &&
      !infoQ.data.expired &&
      (unlocked ||
        (!infoQ.data.requiresPassword && !infoQ.data.requiresEmail)),
    retry: false,
  });

  const [activeFile, setActiveFile] = useState<ManifestFile | null>(null);

  useEffect(() => {
    if (!manifestQ.data) return;
    const params = new URLSearchParams(window.location.search);
    const fid = params.get("file");
    if (fid && !activeFile) {
      for (const p of manifestQ.data.projects) {
        const found = p.files.find((f) => String(f.id) === fid);
        if (found) {
          setActiveFile(found);
          break;
        }
      }
    }
  }, [manifestQ.data, activeFile]);

  if (infoQ.isLoading) {
    return (
      <CenteredShell>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </CenteredShell>
    );
  }
  if (infoQ.isError) {
    return (
      <CenteredShell>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This share link is invalid, expired, or revoked.
          </AlertDescription>
        </Alert>
      </CenteredShell>
    );
  }
  const info = infoQ.data!;
  if (info.expired) {
    return (
      <CenteredShell>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>This share link has expired.</AlertDescription>
        </Alert>
      </CenteredShell>
    );
  }

  if (!unlocked && (info.requiresPassword || info.requiresEmail)) {
    return (
      <UnlockGate
        token={token}
        info={info}
        onUnlocked={() => {
          setUnlocked(true);
          infoQ.refetch();
        }}
      />
    );
  }

  const heading =
    info.name ||
    info.scopeName ||
    (info.scopeType === "project"
      ? "Shared project"
      : info.scopeType === "folder"
        ? "Shared folder"
        : "Shared file");

  // Full-screen Frame.io-style layout when viewing a file
  if (activeFile) {
    return (
      <div className="w-screen flex flex-col bg-black text-gray-100 overflow-hidden" style={{ height: '100dvh' }}>
        {/* Slim top bar */}
        <header className="flex items-center justify-between px-3 py-2 border-b border-gray-800 shrink-0 landscape:hidden lg:landscape:flex">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveFile(null)}
              className="h-7 px-2 text-gray-300 hover:text-white hover:bg-gray-800"
              data-testid="button-back-to-files"
              aria-label="Back to files"
              title="Back to files"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-xs text-gray-400 truncate hidden sm:block">
              {heading}
            </div>
            <span className="text-gray-600 hidden sm:inline">/</span>
            <div
              className="text-sm font-medium truncate text-gray-100"
              data-testid="share-active-filename"
            >
              {activeFile.filename}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {info.allowDownloads && !info.watermarkEnabled && (
              <a
                className="inline-flex items-center text-xs bg-primary text-primary-foreground rounded-md px-3 py-1.5 hover:opacity-90"
                href={`/api/public/share/${token}/files/${activeFile.id}/download`}
                data-testid="button-download-shared-top"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" /> Download
              </a>
            )}
            {!authLoading && !user && (
              <a
                className="inline-flex items-center text-xs border border-gray-700 text-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-800"
                href={signInHref(token)}
                data-testid="link-sign-in-active"
              >
                <LogIn className="h-3.5 w-3.5 mr-1.5" /> Sign in
              </a>
            )}
            <ThemeToggle />
          </div>
        </header>

        {/* Body: player + side panel fill the rest */}
        <FileViewer
          token={token}
          file={activeFile}
          allowComments={info.allowComments}
          allowDownloads={info.allowDownloads}
          watermarkLabel={info.watermarkEnabled ? info.watermarkLabel : null}
          fullScreen
        />
      </div>
    );
  }

  // Standard list view
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#0a0d14] text-neutral-900 dark:text-gray-100">
      {/* App-style header */}
      <header className="bg-white dark:bg-gray-900 border-b border-neutral-200 dark:border-gray-800">
        <div className="container mx-auto flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3 min-w-0">
            <Logo size="sm" />
            <div className="hidden sm:block min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-gray-400">
                {info.scopeType === "project"
                  ? "Project share"
                  : info.scopeType === "folder"
                    ? "Folder share"
                    : "File share"}
              </div>
              <h1
                className="text-sm font-semibold truncate text-neutral-900 dark:text-gray-100"
                data-testid="share-heading"
              >
                {heading}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!authLoading && !user && (
              <a
                className="inline-flex items-center text-xs border border-neutral-300 dark:border-gray-700 text-neutral-700 dark:text-gray-200 rounded-md px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-gray-800"
                href={signInHref(token)}
                data-testid="link-sign-in-list"
              >
                <LogIn className="h-3.5 w-3.5 mr-1.5" /> Sign in
              </a>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {info.allowUploads && (
          <ReviewerUpload token={token} />
        )}
        <FileList
          manifest={manifestQ.data}
          loading={manifestQ.isLoading}
          onPick={setActiveFile}
          token={token}
        />
      </main>
    </div>
  );
}

function CenteredShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-[#0a0d14] p-4">
      <div className="max-w-md w-full">{children}</div>
    </div>
  );
}

function UnlockGate({
  token,
  info,
  onUnlocked,
}: {
  token: string;
  info: ShareInfo;
  onUnlocked: () => void;
}) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/public/share/${token}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          password: password || undefined,
          email: email || undefined,
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.message || "Could not unlock");
      }
    },
    onSuccess: onUnlocked,
    onError: (e: Error) =>
      toast({
        title: "Unlock failed",
        description: e.message,
        variant: "destructive",
      }),
  });
  return (
    <CenteredShell>
      <Card className="bg-white dark:bg-gray-900 border-neutral-200 dark:border-gray-800">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-center mb-2">
            <Logo size="md" />
          </div>
          <div className="flex items-center gap-2 justify-center">
            <Lock className="h-4 w-4 text-primary dark:text-[#10a37f]" />
            <h2 className="text-base font-semibold">Reviewer access</h2>
          </div>
          <p className="text-sm text-center text-neutral-500 dark:text-gray-400">
            {info.name || info.scopeName}
          </p>
          {info.requiresEmail && (
            <div className="space-y-1">
              <Label htmlFor="g-email">Your email</Label>
              <Input
                id="g-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
          )}
          {info.requiresPassword && (
            <div className="space-y-1">
              <Label htmlFor="g-pw">Password</Label>
              <Input
                id="g-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          <Button
            className="w-full"
            disabled={m.isPending}
            onClick={() => m.mutate()}
            data-testid="button-unlock-share"
          >
            {m.isPending ? "Unlocking..." : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </CenteredShell>
  );
}

function ReviewerUpload({ token }: { token: string }) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentName, setCurrentName] = useState<string | null>(null);

  const upload = (file: File) => {
    setUploading(true);
    setProgress(0);
    setCurrentName(file.name);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/public/share/${token}/upload`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploading(false);
      setProgress(0);
      setCurrentName(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        toast({ title: "Upload complete", description: file.name });
        queryClient.invalidateQueries({ queryKey: ["share-manifest", token] });
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText).message || msg; } catch {}
        toast({ title: "Upload failed", description: msg, variant: "destructive" });
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      setProgress(0);
      setCurrentName(null);
      toast({ title: "Upload failed", description: "Network error", variant: "destructive" });
    };
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) upload(f);
  };

  return (
    <Card className="bg-white dark:bg-gray-900 border-neutral-200 dark:border-gray-800">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-primary/10 dark:bg-[#10a37f]/10 flex items-center justify-center text-primary dark:text-[#10a37f]">
            <UploadIcon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Upload a file to this project</div>
            <div className="text-xs text-muted-foreground">
              {uploading
                ? `Uploading ${currentName ?? ""} — ${progress}%`
                : "Pick a file from your computer. The project owner will see it appear in their library."}
            </div>
            {uploading && (
              <div className="mt-2 h-1.5 w-full rounded bg-neutral-200 dark:bg-gray-800 overflow-hidden">
                <div
                  className="h-full bg-primary dark:bg-[#10a37f] transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={onPick}
            data-testid="input-share-upload"
          />
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            data-testid="button-share-upload"
          >
            {uploading ? "Uploading…" : "Choose file"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FileList({
  manifest,
  loading,
  onPick,
  token,
}: {
  manifest?: Manifest;
  loading: boolean;
  onPick: (f: ManifestFile) => void;
  token: string;
}) {
  if (loading || !manifest) {
    return (
      <p className="text-sm text-neutral-500 dark:text-gray-400">
        Loading files...
      </p>
    );
  }
  if (manifest.projects.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-gray-400">
        No files in this share.
      </p>
    );
  }
  return (
    <div className="space-y-8">
      {manifest.projects.map((p) => (
        <section key={p.id} data-testid={`share-project-${p.id}`}>
          <h2 className="text-sm font-semibold mb-3 text-neutral-700 dark:text-gray-200 uppercase tracking-wider">
            {p.name}
            <span className="ml-2 text-xs font-normal normal-case text-neutral-400 dark:text-gray-500">
              {p.files.length} file{p.files.length === 1 ? "" : "s"}
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {p.files.map((f) => (
              <FileCard
                key={f.id}
                file={f}
                token={token}
                onClick={() => onPick(f)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FileCard({
  file,
  token,
  onClick,
}: {
  file: ManifestFile;
  token: string;
  onClick: () => void;
}) {
  const kind = fileKind(file.fileType);
  // Sprite-based hover scrubbing for video cards. Mirrors the auth-side
  // MediaCard: load /sprite-metadata once, then on mousemove pick the
  // matching tile from the sprite sheet via background-position. Avoids
  // shipping a `<video>` per card (10+ HD videos preloading metadata
  // would tank the share page on first paint).
  const [spriteMetadata, setSpriteMetadata] = useState<any>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);
  const scrubRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (kind !== "video") return;
    let cancelled = false;
    fetch(`/api/public/share/${token}/files/${file.id}/sprite-metadata`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => { if (!cancelled && m) setSpriteMetadata(m); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [file.id, kind, token]);

  const spriteSrc = `/api/public/share/${token}/files/${file.id}/sprite`;
  return (
    <button
      onClick={onClick}
      disabled={!file.isAvailable}
      className={cn(
        "group text-left rounded-lg overflow-hidden transition-all duration-200",
        "bg-white dark:bg-[#1a1f26] border border-neutral-200 dark:border-gray-700",
        "hover:shadow-lg hover:border-primary/40 dark:hover:border-gray-600",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
      data-testid={`share-file-${file.id}`}
    >
      <div
        className="relative aspect-video bg-neutral-100 dark:bg-gray-900 overflow-hidden"
        onMouseEnter={() => {
          if (kind !== "video" || !spriteMetadata) return;
          setIsScrubbing(true);
          setScrubPosition(0);
        }}
        onMouseMove={(e) => {
          if (kind !== "video" || !spriteMetadata) return;
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
        onMouseLeave={() => {
          if (scrubRafRef.current != null) {
            cancelAnimationFrame(scrubRafRef.current);
            scrubRafRef.current = null;
          }
          setIsScrubbing(false);
          setScrubPosition(0);
        }}
      >
        {kind === "video" ? (
          <>
            {spriteMetadata ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <div
                  className="bg-center bg-no-repeat pointer-events-none max-w-full max-h-full"
                  style={{
                    aspectRatio: `${spriteMetadata.thumbnailWidth || 16} / ${spriteMetadata.thumbnailHeight || 9}`,
                    width: (spriteMetadata.thumbnailWidth || 16) >= (spriteMetadata.thumbnailHeight || 9) ? "100%" : "auto",
                    height: (spriteMetadata.thumbnailWidth || 16) >= (spriteMetadata.thumbnailHeight || 9) ? "auto" : "100%",
                    backgroundImage: `url(${spriteSrc})`,
                    backgroundSize: `${spriteMetadata.cols * 100}% ${spriteMetadata.rows * 100}%`,
                    backgroundPosition: (() => {
                      if (!isScrubbing) return "0% 0%";
                      const idx = Math.floor(scrubPosition * (spriteMetadata.thumbnailCount - 1));
                      const col = idx % spriteMetadata.cols;
                      const row = Math.floor(idx / spriteMetadata.cols);
                      const xPercent = spriteMetadata.cols > 1 ? (col / (spriteMetadata.cols - 1)) * 100 : 0;
                      const yPercent = spriteMetadata.rows > 1 ? (row / (spriteMetadata.rows - 1)) * 100 : 0;
                      return `${xPercent}% ${yPercent}%`;
                    })(),
                  }}
                />
              </div>
            ) : (
              // Sprite not ready yet (still encoding / legacy file): fall
              // back to the scrub mp4's first frame so the card isn't blank.
              <video
                preload="metadata"
                muted
                className="w-full h-full object-cover bg-black"
                src={`/api/public/share/${token}/files/${file.id}/scrub`}
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 pointer-events-none">
              <div className="bg-white/90 rounded-full p-3 shadow-lg">
                <Play className="h-5 w-5 text-gray-900 fill-gray-900" />
              </div>
            </div>
            {isScrubbing && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50 pointer-events-none">
                <div className="h-full bg-primary dark:bg-[#10a37f]" style={{ width: `${scrubPosition * 100}%` }} />
              </div>
            )}
          </>
        ) : kind === "image" ? (
          <img
            src={`/api/public/share/${token}/files/${file.id}/content`}
            alt={file.filename}
            className="w-full h-full object-cover"
          />
        ) : kind === "audio" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/30 dark:from-[#10a37f]/10 dark:to-[#10a37f]/30">
            <Music className="h-10 w-10 text-primary dark:text-[#10a37f]" />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-gray-800">
            <FileIcon className="h-10 w-10 text-neutral-400 dark:text-gray-500" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/60 text-white font-medium">
            {kind}
          </span>
        </div>
      </div>
      <div className="p-3">
        <div
          className="text-sm font-medium truncate text-neutral-900 dark:text-gray-100"
          title={file.filename}
        >
          {file.filename}
        </div>
        <div className="text-xs text-neutral-500 dark:text-gray-400 mt-0.5">
          v{file.version} · {fmtBytes(file.fileSize)}
        </div>
      </div>
    </button>
  );
}

function FileViewer({
  token,
  file,
  allowComments,
  allowDownloads,
  watermarkLabel,
  fullScreen = false,
}: {
  token: string;
  file: ManifestFile;
  allowComments: boolean;
  allowDownloads: boolean;
  watermarkLabel?: string | null;
  fullScreen?: boolean;
}) {
  const kind = fileKind(file.fileType);
  const isVideo = kind === "video";
  const isAudio = kind === "audio";
  const isImage = kind === "image";

  const commentsQ = useQuery<Comment[]>({
    queryKey: ["share-comments", token, file.id],
    queryFn: async () => {
      const r = await fetch(
        `/api/public/share/${token}/files/${file.id}/comments`,
      );
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });

  const [name, setName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("share-reviewer-name") || "";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (name) localStorage.setItem("share-reviewer-name", name);
  }, [name]);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const pendingActionRef = useRef<(() => void) | null>(null);
  const requireName = (action: () => void) => {
    if (name.trim()) { action(); return; }
    pendingActionRef.current = action;
    setNameDraft("");
    setNameDialogOpen(true);
  };
  const [content, setContent] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [videoAspect, setVideoAspect] = useState<number | null>(null);
  const [useOriginalQuality, setUseOriginalQuality] = useState(false);
  const pendingSeekRef = useRef<{ t: number; play: boolean } | null>(null);
  const processingQ = useQuery<any>({
    queryKey: ["/api/public/share", token, "files", file?.id, "processing"],
    queryFn: async () => {
      if (!file?.id) return null;
      const r = await fetch(`/api/public/share/${token}/files/${file.id}/processing`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!file?.id && file?.fileType === "video",
  });
  const has720p = !!(processingQ.data?.status === "completed" && processingQ.data?.qualities?.some((q: any) => q.resolution === "720p"));
  const { toast } = useToast();

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const mediaContainerRef = useRef<HTMLDivElement | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const jklIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jklSpeedRef = useRef<number>(1);
  const jklDirectionRef = useRef<"forward" | "backward" | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [timeFormat, setTimeFormat] = useState<TimeFormat>("Standard");
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [displayAnnotations, setDisplayAnnotations] = useState<Annotation[] | null>(null);
  // Hover scrub preview over the comment marker rail. Native HTML5
  // <video controls> can't render a hover thumbnail, so we surface the
  // preview on the auxiliary marker rail instead — it sits right under
  // the player and doubles as a seek control.
  const [scrubPreview, setScrubPreview] = useState<{ time: number; left: number; top: number } | null>(null);
  const [pendingAnnotations, setPendingAnnotations] = useState<Annotation[] | null>(null);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [mediaContainerSize, setMediaContainerSize] = useState({ width: 0, height: 0 });
  // Frame.io-style in/out range. Both null = single-point comment at current
  // playhead; both set = range comment posted with inPoint/outPoint columns.
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);

  useEffect(() => {
    const el = mediaContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setMediaContainerSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setMediaContainerSize({ width: rect.width, height: rect.height });
    return () => ro.disconnect();
  }, [file.id]);
  const stopJKLShuttle = () => {
    if (jklIntervalRef.current) {
      clearInterval(jklIntervalRef.current);
      jklIntervalRef.current = null;
    }
    jklSpeedRef.current = 1;
    jklDirectionRef.current = null;
    const el = mediaRef.current;
    if (el) el.playbackRate = 1;
  };
  const seekTo = (t: number) => {
    const el = mediaRef.current;
    if (el) {
      el.currentTime = t;
      setCurrentTime(t);
      el.play?.().catch(() => {});
    }
  };

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    let raf = 0;
    const tick = () => {
      setCurrentTime(el.currentTime || 0);
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      setCurrentTime(el.currentTime || 0);
    };
    const onMeta = () => {
      if (Number.isFinite(el.duration)) setDuration(el.duration);
      const v = el as HTMLVideoElement;
      if (v.videoWidth && v.videoHeight) setVideoAspect(v.videoWidth / v.videoHeight);
      const pending = pendingSeekRef.current;
      if (pending && Number.isFinite(el.duration)) {
        pendingSeekRef.current = null;
        try { el.currentTime = Math.min(pending.t, el.duration - 0.05); } catch {}
        if (pending.play) el.play().catch(() => {});
      }
    };
    const onPlay = () => { setIsPaused(false); start(); };
    const onPause = () => { setIsPaused(true); stop(); };
    const onVolume = () => { setIsMuted(el.muted || el.volume === 0); };
    el.addEventListener("play", onPlay);
    el.addEventListener("playing", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("seeked", stop);
    el.addEventListener("ended", onPause);
    el.addEventListener("timeupdate", stop);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("volumechange", onVolume);
    onMeta();
    onVolume();
    setIsPaused(el.paused);
    if (!el.paused) start();
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("playing", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("seeked", stop);
      el.removeEventListener("ended", onPause);
      el.removeEventListener("timeupdate", stop);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("volumechange", onVolume);
    };
  }, [file.id, useOriginalQuality, has720p]);

  // Reset per-file transient state when switching files (FileViewer is reused)
  useEffect(() => {
    setActiveCommentId(null);
    setDisplayAnnotations(null);
    setPendingAnnotations(null);
    setIsAnnotating(false);
    setDuration(0);
    setCurrentTime(0);
    setInPoint(null);
    setOutPoint(null);
  }, [file.id]);

  // Drop activeCommentId if the comment no longer exists after refetch
  useEffect(() => {
    if (!activeCommentId) return;
    const list = commentsQ.data || [];
    if (!list.some((c) => c.id === activeCommentId)) {
      setActiveCommentId(null);
      setDisplayAnnotations(null);
    }
  }, [commentsQ.data, activeCommentId]);

  // Hide annotations as soon as the playhead leaves the comment's exact frame
  useEffect(() => {
    if (!activeCommentId) return;
    const active = (commentsQ.data || []).find((c) => c.id === activeCommentId);
    if (!active || active.timestamp == null) return;
    if (Math.abs(currentTime - active.timestamp) > 0.05) {
      setActiveCommentId(null);
      setDisplayAnnotations(null);
    }
  }, [currentTime, activeCommentId, commentsQ.data]);

  const handleSaveAnnotation = (annotations: Annotation[]) => {
    setPendingAnnotations(annotations.length ? annotations : null);
    setIsAnnotating(false);
    setTimeout(() => commentInputRef.current?.focus(), 0);
  };

  const jumpToCommentAt = (index: number, list: Comment[]) => {
    const c = list[index];
    if (!c) return;
    setActiveCommentId(c.id);
    setDisplayAnnotations(parseAnnotations(c));
    if (c.timestamp != null) seekTo(c.timestamp);
    document
      .querySelector(`[data-testid="share-comment-${c.id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  useEffect(() => {
    if (!isVideo && !isAudio) return;
    const frameRate = 30;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.contentEditable === "true";

      if (isInTextInput) {
        if (
          e.code === "Tab" &&
          (target instanceof HTMLTextAreaElement ||
            target?.tagName === "TEXTAREA")
        ) {
          e.preventDefault();
          (target as HTMLElement).blur();
          (mediaRef.current as HTMLElement | null)?.focus?.();
        }
        return;
      }

      const el = mediaRef.current;
      if (!el) return;
      const duration = el.duration || 0;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          stopJKLShuttle();
          if (el.paused) el.play().catch(() => {});
          else el.pause();
          break;
        case "KeyC":
          e.preventDefault();
          commentInputRef.current?.focus();
          break;
        case "KeyM":
          e.preventDefault();
          el.muted = !el.muted;
          break;
        case "KeyI":
          e.preventDefault();
          setInPoint(el.currentTime);
          toast({ title: `In point: ${fmtTime(el.currentTime) || "0:00"}`, description: "Press O to set the out point" });
          break;
        case "KeyO":
          e.preventDefault();
          setOutPoint(el.currentTime);
          toast({
            title: `Out point: ${fmtTime(el.currentTime) || "0:00"}`,
            description: inPoint !== null
              ? `Range: ${fmtTime(inPoint)} → ${fmtTime(el.currentTime)}`
              : "Set an in point with I first",
          });
          break;
        case "KeyF":
          if (isVideo) {
            e.preventDefault();
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => {});
            } else {
              const target = watermarkLabel
                ? (mediaContainerRef.current as HTMLElement | null)
                : (el as HTMLVideoElement);
              target?.requestFullscreen?.().catch(() => {});
            }
          }
          break;
        case "KeyK":
          e.preventDefault();
          stopJKLShuttle();
          el.pause();
          break;
        case "Escape":
          if (document.fullscreenElement) {
            e.preventDefault();
            document.exitFullscreen().catch(() => {});
          }
          break;
        case "ArrowLeft": {
          e.preventDefault();
          e.stopImmediatePropagation();
          stopJKLShuttle();
          const framesBack = e.shiftKey ? 10 : 1;
          const t = Math.max(0, el.currentTime - framesBack / frameRate);
          el.currentTime = t;
          setCurrentTime(t);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          e.stopImmediatePropagation();
          stopJKLShuttle();
          const framesFwd = e.shiftKey ? 10 : 1;
          const t = Math.min(
            duration || el.currentTime + framesFwd / frameRate,
            el.currentTime + framesFwd / frameRate,
          );
          el.currentTime = t;
          setCurrentTime(t);
          break;
        }
        case "KeyJ": {
          e.preventDefault();
          if (jklIntervalRef.current) {
            clearInterval(jklIntervalRef.current);
            jklIntervalRef.current = null;
          }
          if (jklDirectionRef.current === "backward") {
            jklSpeedRef.current = Math.min(jklSpeedRef.current * 2, 8);
          } else {
            if (!el.paused) {
              el.pause();
              el.playbackRate = 1;
            }
            jklSpeedRef.current = 1;
            jklDirectionRef.current = "backward";
          }
          jklIntervalRef.current = setInterval(() => {
            const m = mediaRef.current;
            if (!m) return;
            const t = Math.max(0, m.currentTime - jklSpeedRef.current * 0.1);
            m.currentTime = t;
            setCurrentTime(t);
            if (t === 0) stopJKLShuttle();
          }, 100);
          break;
        }
        case "KeyL": {
          e.preventDefault();
          if (jklIntervalRef.current) {
            clearInterval(jklIntervalRef.current);
            jklIntervalRef.current = null;
          }
          if (jklDirectionRef.current === "forward") {
            jklSpeedRef.current = Math.min(jklSpeedRef.current * 2, 8);
          } else {
            jklSpeedRef.current = 1;
            jklDirectionRef.current = "forward";
          }
          el.playbackRate = jklSpeedRef.current;
          if (el.paused) el.play().catch(() => {});
          break;
        }
        case "Home":
          e.preventDefault();
          stopJKLShuttle();
          el.currentTime = 0;
          setCurrentTime(0);
          break;
        case "End":
          e.preventDefault();
          stopJKLShuttle();
          if (duration) {
            el.currentTime = duration;
            setCurrentTime(duration);
          }
          break;
      }
    };
    document.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown, true);
      stopJKLShuttle();
    };
  }, [file.id, isVideo, isAudio]);

  const apiBase = `/api/public/share/${token}/files/${file.id}`;
  const transcriptQueryKey = ["share-transcript", token, file.id] as const;
  const supportsTranscript = isVideo || isAudio;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [commentFilter, setCommentFilter] = useState<"all" | "unresolved" | "resolved">("all");

  const post = useMutation({
    mutationFn: async () => {
      const el = mediaRef.current;
      const playhead = el && (isVideo || isAudio) ? Math.floor(el.currentTime) : null;
      const hasRange =
        (isVideo || isAudio) &&
        inPoint !== null &&
        outPoint !== null &&
        outPoint > inPoint;
      const ts = hasRange ? Math.floor(inPoint as number) : playhead;
      const r = await fetch(
        `/api/public/share/${token}/files/${file.id}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            content,
            displayName: name || "Anonymous",
            timestamp: ts,
            inPoint: hasRange ? Math.floor(inPoint as number) : undefined,
            outPoint: hasRange ? Math.floor(outPoint as number) : undefined,
            annotations:
              pendingAnnotations && pendingAnnotations.length
                ? JSON.stringify(pendingAnnotations)
                : undefined,
          }),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || "Failed");
      }
      return (await r.json().catch(() => null)) as
        | { id: string; creatorToken?: string }
        | null;
    },
    onSuccess: (data) => {
      if (data?.id && data.creatorToken) rememberCommentToken(data.id, data.creatorToken);
      setContent("");
      setPendingAnnotations(null);
      setDisplayAnnotations(null);
      setInPoint(null);
      setOutPoint(null);
      commentsQ.refetch();
      toast({ title: "Comment posted" });
    },
    onError: (e: Error) =>
      toast({
        title: "Could not post",
        description: e.message,
        variant: "destructive",
      }),
  });

  const replyPost = useMutation({
    mutationFn: async ({ parentId, text }: { parentId: string; text: string }) => {
      const r = await fetch(
        `/api/public/share/${token}/files/${file.id}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            content: text,
            displayName: name || "Anonymous",
            timestamp: null,
            parentId,
          }),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || "Failed");
      }
      return (await r.json().catch(() => null)) as
        | { id: string; creatorToken?: string }
        | null;
    },
    onSuccess: (data) => {
      if (data?.id && data.creatorToken) rememberCommentToken(data.id, data.creatorToken);
      setReplyingToId(null);
      setReplyContent("");
      commentsQ.refetch();
    },
    onError: (e: Error) =>
      toast({ title: "Could not reply", description: e.message, variant: "destructive" }),
  });

  const editPost = useMutation({
    mutationFn: async ({ commentId, text }: { commentId: string; text: string }) => {
      const ct = getCommentToken(commentId);
      if (!ct) throw new Error("You can only edit your own comments");
      const r = await fetch(`/api/public-comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorToken: ct, content: text }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || "Failed");
      }
    },
    onSuccess: () => {
      setEditingId(null);
      setEditContent("");
      commentsQ.refetch();
      toast({ title: "Comment updated" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not edit", description: e.message, variant: "destructive" }),
  });

  const deletePost = useMutation({
    mutationFn: async (commentId: string) => {
      const ct = getCommentToken(commentId);
      if (!ct) throw new Error("You can only delete your own comments");
      const r = await fetch(`/api/public-comments/${commentId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorToken: ct }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || "Failed");
      }
      return commentId;
    },
    onSuccess: (commentId) => {
      forgetCommentToken(commentId);
      commentsQ.refetch();
      toast({ title: "Comment deleted" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not delete", description: e.message, variant: "destructive" }),
  });

  const mediaSrc = `/api/public/share/${token}/files/${file.id}/content`;
  const mediaSrc720 = `/api/public/share/${token}/files/${file.id}/qualities/720p`;

  return (
    <div
      className={cn(
        fullScreen
          ? "flex-1 min-h-0 flex flex-col landscape:flex-row lg:flex-row overflow-hidden bg-black"
          : "grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[calc(70vh+88px)] lg:min-h-[520px]",
      )}
    >
      {/* Player column */}
      <div
        className={cn(
          fullScreen
            ? "shrink-0 min-w-0 flex flex-col bg-black max-h-[60dvh] landscape:max-h-none lg:max-h-none landscape:flex-1 landscape:min-h-0 landscape:justify-center landscape:shrink lg:flex-1 lg:min-h-0 lg:justify-center lg:shrink"
            : "lg:col-span-2 flex flex-col gap-4 min-h-0",
        )}
      >
        <div
          ref={mediaContainerRef}
          className={cn(
            "relative",
            fullScreen
              ? "w-full mx-auto flex items-center justify-center bg-black flex-1 min-h-0"
              : "rounded-lg overflow-hidden bg-black border border-neutral-200 dark:border-gray-800 shadow-sm flex items-center justify-center mx-auto",
          )}
          style={
            // In landscape (and desktop) the column is height-constrained and
            // also has SharePlayerControls below — using aspectRatio with
            // maxHeight:100% lets the video eat the full column height and
            // pushes the controls (and the comment-marker rail) off-screen.
            // Drop the aspectRatio in those modes; flex-1 + object-contain on
            // the <video> preserves the picture without dominating the column.
            videoAspect && !fullScreen
              ? { aspectRatio: videoAspect, maxHeight: "100%", maxWidth: "100%" }
              : undefined
          }
        >
          {isVideo && (
            <video
              key={`${useOriginalQuality ? "hd" : "720p"}-${has720p ? 1 : 0}`}
              ref={mediaRef as any}
              controls={false}
              playsInline
              preload="metadata"
              controlsList="nodownload"
              disablePictureInPicture
              onContextMenu={watermarkLabel ? (e) => e.preventDefault() : undefined}
              onClick={() => {
                const v = mediaRef.current as HTMLVideoElement | null;
                if (!v) return;
                if (v.paused) v.play().catch(() => {});
                else v.pause();
              }}
              className="w-full h-full object-contain bg-black cursor-pointer"
              data-testid="share-video-player"
            >
              {useOriginalQuality || !has720p ? (
                <source src={mediaSrc} type="video/mp4" />
              ) : (
                <>
                  <source src={mediaSrc720} type="video/mp4" />
                  <source src={mediaSrc} type="video/mp4" />
                </>
              )}
            </video>
          )}
          {isAudio && (
            <div className="w-full h-full p-12 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-primary/5 to-primary/20 dark:from-[#10a37f]/5 dark:to-[#10a37f]/20">
              <Music className="h-16 w-16 text-primary dark:text-[#10a37f]" />
              <audio
                ref={mediaRef as any}
                src={mediaSrc}
                controls
                className="w-full max-w-md"
              />
            </div>
          )}
          {isImage && (
            <img
              src={mediaSrc}
              alt={file.filename}
              className="max-w-full max-h-full object-contain"
            />
          )}
          {!isVideo && !isAudio && !isImage && (
            <div className="p-12 text-center text-neutral-400 dark:text-gray-500">
              <FileIcon className="h-12 w-12 mx-auto mb-2" />
              No preview available for this file type.
            </div>
          )}
          {isVideo && isAnnotating && mediaContainerSize.width > 0 && (
            <AnnotationCanvas
              onSave={handleSaveAnnotation}
              onCancel={() => setIsAnnotating(false)}
              initialAnnotations={pendingAnnotations || []}
              containerWidth={mediaContainerSize.width}
              containerHeight={mediaContainerSize.height}
            />
          )}
          {isVideo && !isAnnotating && displayAnnotations && displayAnnotations.length > 0 && mediaContainerSize.width > 0 && (
            <AnnotationOverlay
              annotations={displayAnnotations}
              containerWidth={mediaContainerSize.width}
              containerHeight={mediaContainerSize.height}
            />
          )}
          {isVideo && !isAnnotating && !displayAnnotations && pendingAnnotations && pendingAnnotations.length > 0 && mediaContainerSize.width > 0 && (
            <AnnotationOverlay
              annotations={pendingAnnotations}
              containerWidth={mediaContainerSize.width}
              containerHeight={mediaContainerSize.height}
            />
          )}
          {watermarkLabel && (isVideo || isImage) && (
            <WatermarkOverlay label={watermarkLabel} />
          )}
          {watermarkLabel && isVideo && isPaused && (
            <button
              type="button"
              onClick={() => mediaRef.current?.play().catch(() => {})}
              className="absolute inset-0 z-10 flex items-center justify-center bg-black/20"
              aria-label="Play"
              data-testid="button-play-overlay"
            >
              <span className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-black/60 text-white">
                <Play className="h-8 w-8 translate-x-0.5" fill="currentColor" />
              </span>
            </button>
          )}
          {false && watermarkLabel && (isVideo || isImage) && (
            <div
              className="absolute bottom-0 left-0 right-0 z-10 flex items-center gap-2 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent"
              data-testid="watermark-controls"
            >
              {isVideo && (
                <button
                  type="button"
                  onClick={() => {
                    const v = mediaRef.current as HTMLVideoElement | null;
                    if (!v) return;
                    if (v.paused) v.play().catch(() => {});
                    else v.pause();
                  }}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md text-white hover:bg-white/10"
                  aria-label={isPaused ? "Play" : "Pause"}
                  data-testid="button-watermark-playpause"
                >
                  {isPaused ? <Play className="h-4 w-4" fill="currentColor" /> : <Pause className="h-4 w-4" fill="currentColor" />}
                </button>
              )}
              {isVideo && (
                <button
                  type="button"
                  onClick={() => {
                    const v = mediaRef.current as HTMLVideoElement | null;
                    if (!v) return;
                    v.muted = !v.muted;
                  }}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md text-white hover:bg-white/10"
                  aria-label={isMuted ? "Unmute" : "Mute"}
                  data-testid="button-watermark-mute"
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
              )}
              {isVideo && (
                <span className="text-xs text-white/80 tabular-nums select-none">
                  {fmtTime(currentTime) || "00:00"} / {fmtTime(duration) || "00:00"}
                </span>
              )}
              <div className="ml-auto" />
              <button
                type="button"
                onClick={() => {
                  const target = mediaContainerRef.current as HTMLElement | null;
                  if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {});
                  } else {
                    target?.requestFullscreen?.().catch(() => {});
                  }
                }}
                className="inline-flex items-center justify-center h-8 w-8 rounded-md text-white hover:bg-white/10"
                title="Fullscreen (F)"
                aria-label="Toggle fullscreen"
                data-testid="button-fullscreen-watermarked"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Custom player controls — matches the authenticated MediaPlayer */}
        {(isVideo || isAudio) && (
          <SharePlayerControls
            mediaRef={mediaRef}
            containerRef={mediaContainerRef}
            fileId={file.id}
            fileType={isVideo ? "video" : "audio"}
            filename={file.filename}
            shareToken={token}
            duration={duration}
            currentTime={currentTime}
            isPaused={isPaused}
            isMuted={isMuted}
            inPoint={inPoint}
            outPoint={outPoint}
            comments={(commentsQ.data || []).map((c) => ({
              id: c.id,
              parentId: c.parentId ?? null,
              timestamp: c.timestamp ?? null,
              inPoint: (c as any).inPoint ?? null,
              outPoint: (c as any).outPoint ?? null,
              authorName: (c.user?.name || c.authorName) ?? null,
              content: c.content ?? null,
            }))}
            activeCommentId={activeCommentId}
            onCommentClick={(id) => {
              const tsComments = (commentsQ.data || []).filter(
                (c) => !c.parentId && c.timestamp != null,
              );
              const sorted = [...tsComments].sort(
                (a, b) => (a.timestamp || 0) - (b.timestamp || 0),
              );
              const idx = sorted.findIndex((x) => x.id === id);
              if (idx >= 0) jumpToCommentAt(idx, sorted);
            }}
            watermarkOn={!!watermarkLabel}
            onSeek={(t) => seekTo(t)}
            scrubSrc={`/api/public/share/${token}/files/${file.id}/scrub`}
            has720p={has720p}
            useOriginalQuality={useOriginalQuality}
            onToggleQuality={() => {
              const el = mediaRef.current;
              pendingSeekRef.current = {
                t: el?.currentTime ?? 0,
                play: !!(el && !el.paused),
              };
              setUseOriginalQuality((v) => !v);
            }}
          />
        )}


        {/* File meta bar — only in non-fullscreen mode (fullscreen has top bar) */}
        {!fullScreen && (
          <div className="flex items-center justify-between rounded-lg bg-white dark:bg-gray-900 border border-neutral-200 dark:border-gray-800 px-4 py-3 shrink-0">
            <div className="min-w-0">
              <div className="font-medium truncate text-neutral-900 dark:text-gray-100">
                {file.filename}
              </div>
              <div className="text-xs text-neutral-500 dark:text-gray-400 mt-0.5">
                v{file.version} · {fmtBytes(file.fileSize)}
              </div>
            </div>
            {allowDownloads && !watermarkLabel && (
              <a
                className="inline-flex items-center text-sm bg-primary text-primary-foreground rounded-md px-3 py-2 hover:opacity-90"
                href={`/api/public/share/${token}/files/${file.id}/download`}
                data-testid="button-download-shared"
              >
                <Download className="h-4 w-4 mr-1.5" /> Download
              </a>
            )}
          </div>
        )}
      </div>

      {/* Right side panel: Comments / Transcript / Synopsis */}
      <aside
        className={cn(
          fullScreen
            ? "w-full landscape:w-[44%] landscape:max-w-[360px] lg:w-[360px] flex-1 landscape:flex-none landscape:shrink-0 lg:flex-none lg:shrink-0 bg-white dark:bg-[#0f1218] border-t landscape:border-t-0 landscape:border-l lg:border-t-0 lg:border-l border-neutral-200 dark:border-gray-800 overflow-hidden flex flex-col min-h-0 landscape:h-auto lg:h-auto"
            : "rounded-lg bg-white dark:bg-[#0f1218] border border-neutral-200 dark:border-gray-800 overflow-hidden flex flex-col h-[calc(70vh+88px)] min-h-[520px]",
        )}
      >
        <Tabs
          defaultValue={(() => {
            if (typeof window === "undefined") return "comments";
            const t = new URLSearchParams(window.location.search).get("tab");
            const allowed = new Set<string>(["comments"]);
            if (supportsTranscript) {
              allowed.add("transcript");
              allowed.add("ai");
            }
            return t && allowed.has(t) ? t : "comments";
          })()}
          className="flex-1 min-h-0 flex flex-col"
        >
          <div className="px-2 py-1 border-b border-neutral-200 dark:border-gray-800 landscape:hidden lg:landscape:block">
            <TabsList className="h-7 bg-transparent p-0 gap-1">
              <TabsTrigger value="comments" className="text-xs px-3">
                Comments
                {commentsQ.data && commentsQ.data.length > 0 && (
                  <span className="ml-1.5 text-[10px] opacity-70">
                    {commentsQ.data.length}
                  </span>
                )}
              </TabsTrigger>
              {supportsTranscript && (
                <TabsTrigger value="transcript" className="text-xs px-3">
                  Transcript
                </TabsTrigger>
              )}
              {supportsTranscript && (
                <TabsTrigger value="ai" className="text-xs px-3">
                  AI
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent
            value="comments"
            className="flex-1 min-h-0 m-0 data-[state=active]:flex flex-col overflow-hidden"
          >
            <div className="hidden sm:flex items-center gap-1 px-3 py-1.5 border-b border-neutral-200 dark:border-gray-800 shrink-0">
              <Filter className="h-3.5 w-3.5 mr-1 text-neutral-400 dark:text-gray-500" />
              {(["all", "unresolved", "resolved"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setCommentFilter(f)}
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full transition-colors capitalize",
                    commentFilter === f
                      ? "bg-primary/20 text-primary dark:bg-[#10a37f]/20 dark:text-[#10a37f]"
                      : "text-neutral-500 dark:text-gray-400 hover:text-neutral-700 dark:hover:text-gray-200"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            {/* Comments list (scrolls) */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5">
              {commentsQ.isLoading && (
                <p className="px-4 py-6 text-xs text-neutral-500 dark:text-gray-400 text-center">
                  Loading comments...
                </p>
              )}
              {(() => {
                const all = (commentsQ.data || []).filter((c) => {
                  if (commentFilter === "unresolved") return !c.isResolved;
                  if (commentFilter === "resolved") return c.isResolved;
                  return true;
                });
                const topLevel = all.filter((c) => !c.parentId);
                if (topLevel.length === 0 && commentFilter !== "all" && commentsQ.data && commentsQ.data.length > 0) {
                  return (
                    <p className="px-4 py-6 text-xs text-neutral-500 dark:text-gray-400 text-center">
                      No {commentFilter} comments
                    </p>
                  );
                }
                const repliesByParent = new Map<string, Comment[]>();
                for (const c of all) {
                  if (c.parentId) {
                    const arr = repliesByParent.get(c.parentId) || [];
                    arr.push(c);
                    repliesByParent.set(c.parentId, arr);
                  }
                }
                const renderItem = (c: Comment, index: number, isReply: boolean) => {
                  const author = c.user?.name || c.authorName || "Anonymous";
                  const isActive = activeCommentId === c.id;
                  const hasAnno = !!parseAnnotations(c);
                  const isMine = !!getCommentToken(c.id);
                  const isEditing = editingId === c.id;
                  const isReplying = replyingToId === c.id;
                  const replies = repliesByParent.get(c.id) || [];
                  return (
                    <div key={c.id} className={isReply ? "ml-6" : undefined}>
                      <div
                        onClick={() => {
                          if (isEditing) return;
                          setActiveCommentId(c.id);
                          setDisplayAnnotations(parseAnnotations(c));
                          if (c.timestamp != null) seekTo(c.timestamp);
                        }}
                        className={cn(
                          "rounded-lg border p-3 bg-white dark:bg-[hsl(var(--comments-card))] border-neutral-200 dark:border-[hsl(var(--comments-card-border))] cursor-pointer transition-colors",
                          isActive && "ring-2 ring-primary dark:ring-[#10a37f] border-primary dark:border-[#10a37f]",
                        )}
                        data-testid={`share-comment-${c.id}`}
                      >
                        <div className="flex gap-3">
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className="bg-gray-600 text-white text-xs">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                              </svg>
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-neutral-900 dark:text-[hsl(var(--comments-text))]">
                                  {author}
                                </span>
                                <span className="text-xs text-neutral-500 dark:text-[hsl(var(--comments-muted))]">
                                  {new Date(c.createdAt).toLocaleDateString()}
                                </span>
                                {c.timestamp != null && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveCommentId(c.id);
                                      setDisplayAnnotations(parseAnnotations(c));
                                      seekTo(c.timestamp!);
                                    }}
                                    className="text-xs font-mono px-2 py-1 rounded bg-amber-100 dark:bg-[hsl(var(--comments-timestamp-bg))] text-amber-700 dark:text-[hsl(var(--comments-timestamp-fg))] hover:opacity-80 transition-opacity"
                                    title={(c as any).inPoint != null && (c as any).outPoint != null ? `Range ${fmtTime((c as any).inPoint)} → ${fmtTime((c as any).outPoint)}` : "Jump to this moment"}
                                  >
                                    {(c as any).inPoint != null && (c as any).outPoint != null
                                      ? `${fmtTime((c as any).inPoint)} → ${fmtTime((c as any).outPoint)}`
                                      : fmtTime(c.timestamp)}
                                  </button>
                                )}
                                {hasAnno && (
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-gray-800 text-neutral-600 dark:text-gray-300"
                                    title="Has annotation"
                                  >
                                    <PencilLine className="h-3 w-3" /> Drawing
                                  </span>
                                )}
                                {c.isResolved && (
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                                    title="Resolved"
                                    data-testid={`badge-resolved-${c.id}`}
                                  >
                                    <Check className="h-3 w-3" /> Resolved
                                  </span>
                                )}
                              </div>
                              {!isReply && (
                                <span className="text-xs font-medium text-neutral-500 dark:text-[hsl(var(--comments-muted))] shrink-0">
                                  #{index + 1}
                                </span>
                              )}
                            </div>
                            {isEditing ? (
                              <div onClick={(e) => e.stopPropagation()} className="space-y-2">
                                <textarea
                                  className="w-full text-sm rounded-md border border-neutral-200 dark:border-gray-700 p-2 min-h-[60px] bg-neutral-50 dark:bg-gray-800 text-neutral-900 dark:text-gray-100 resize-none"
                                  value={editContent}
                                  onChange={(e) => setEditContent(e.target.value)}
                                  data-testid={`textarea-edit-${c.id}`}
                                />
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={!editContent.trim() || editPost.isPending}
                                    onClick={() =>
                                      editPost.mutate({ commentId: c.id, text: editContent.trim() })
                                    }
                                    data-testid={`button-save-edit-${c.id}`}
                                  >
                                    <Check className="h-3 w-3 mr-1" /> Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs"
                                    onClick={() => { setEditingId(null); setEditContent(""); }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-neutral-800 dark:text-[hsl(var(--comments-text))] whitespace-pre-wrap break-words leading-relaxed">
                                {c.content}
                              </div>
                            )}
                            {!isEditing && allowComments && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2 flex items-center gap-3 text-[11px] text-neutral-500 dark:text-gray-400"
                              >
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 hover:text-neutral-800 dark:hover:text-gray-200"
                                  onClick={() => {
                                    setReplyingToId(isReplying ? null : c.id);
                                    setReplyContent("");
                                  }}
                                  data-testid={`button-reply-${c.id}`}
                                >
                                  <Reply className="h-3 w-3" /> Reply
                                </button>
                                {isMine && (
                                  <>
                                    <button
                                      type="button"
                                      className="inline-flex items-center gap-1 hover:text-neutral-800 dark:hover:text-gray-200"
                                      onClick={() => {
                                        setEditingId(c.id);
                                        setEditContent(c.content);
                                      }}
                                      data-testid={`button-edit-${c.id}`}
                                    >
                                      <Pencil className="h-3 w-3" /> Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="inline-flex items-center gap-1 text-red-500 hover:text-red-600"
                                      onClick={() => {
                                        if (window.confirm("Delete this comment?")) {
                                          deletePost.mutate(c.id);
                                        }
                                      }}
                                      data-testid={`button-delete-${c.id}`}
                                    >
                                      <Trash2 className="h-3 w-3" /> Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {isReplying && allowComments && (
                        <div className="ml-6 mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            className="w-full text-sm rounded-md border border-neutral-200 dark:border-gray-700 p-2 min-h-[50px] bg-neutral-50 dark:bg-gray-800 text-neutral-900 dark:text-gray-100 resize-none"
                            placeholder={`Reply to ${author}...`}
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            data-testid={`textarea-reply-${c.id}`}
                            autoFocus
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              disabled={!replyContent.trim() || replyPost.isPending}
                              onClick={() =>
                                requireName(() => replyPost.mutate({ parentId: c.id, text: replyContent.trim() }))
                              }
                              data-testid={`button-post-reply-${c.id}`}
                            >
                              <Send className="h-3 w-3 mr-1" /> Reply
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => { setReplyingToId(null); setReplyContent(""); }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                      {replies.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {replies.map((r) => renderItem(r, 0, true))}
                        </div>
                      )}
                    </div>
                  );
                };
                return topLevel.map((c, i) => renderItem(c, i, false));
              })()}
              {commentsQ.data && commentsQ.data.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MessageSquare className="h-10 w-10 mb-3 text-neutral-300 dark:text-[hsl(var(--comments-muted))]" />
                  <p className="text-sm text-neutral-500 dark:text-[hsl(var(--comments-muted))]">No comments yet</p>
                  <p className="text-xs text-neutral-400 dark:text-[hsl(var(--comments-muted))]">Be the first to comment!</p>
                </div>
              )}
            </div>

            {/* Sticky comment input at bottom (matches main app) */}
            {!allowComments ? (
              <div className="border-t border-neutral-200 dark:border-[hsl(var(--comments-card-border))] p-3 shrink-0">
                <Alert>
                  <AlertDescription>
                    Comments are disabled for this share link.
                  </AlertDescription>
                </Alert>
              </div>
            ) : (
              <div className="border-t border-neutral-200 dark:border-[hsl(var(--comments-card-border))] p-3 space-y-2 shrink-0 bg-white dark:bg-[#0f1218]">
                <Input
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-neutral-50 dark:bg-gray-800 border-neutral-200 dark:border-gray-700 h-8 text-sm"
                  data-testid="input-share-author"
                />
                <div className="relative">
                  <textarea
                    ref={commentInputRef}
                    className="w-full text-sm rounded-md border border-neutral-200 dark:border-gray-700 p-2 pb-9 min-h-[64px] bg-neutral-50 dark:bg-gray-800 text-neutral-900 dark:text-gray-100 placeholder:text-neutral-400 dark:placeholder:text-gray-500 resize-none"
                    placeholder={
                      isVideo || isAudio
                        ? `Add a comment at ${fmtTime(currentTime) || "0:00"}...`
                        : "Add a comment..."
                    }
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onFocus={() => {
                      const el = mediaRef.current;
                      if (el && !el.paused) el.pause();
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        content.trim() &&
                        !post.isPending
                      ) {
                        e.preventDefault();
                        requireName(() => post.mutate());
                      }
                    }}
                    data-testid="textarea-share-comment"
                  />
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
                    <div className="flex items-center gap-0.5 pointer-events-auto">
                      {isVideo && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-neutral-500 hover:text-neutral-900 dark:text-gray-400 dark:hover:text-white"
                          onClick={() => {
                            if (mediaRef.current && !mediaRef.current.paused) mediaRef.current.pause();
                            setDisplayAnnotations(null);
                            setIsAnnotating(true);
                          }}
                          title={pendingAnnotations && pendingAnnotations.length ? "Edit drawing" : "Annotate frame"}
                          data-testid="button-share-annotate"
                        >
                          <PencilLine className="h-4 w-4" />
                        </Button>
                      )}
                      <div className="relative">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-neutral-500 hover:text-neutral-900 dark:text-gray-400 dark:hover:text-white"
                          onClick={() => setShowEmoji((v) => !v)}
                          title="Add emoji"
                          data-testid="button-share-emoji"
                        >
                          <Smile className="h-4 w-4" />
                        </Button>
                        {showEmoji && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowEmoji(false)} />
                            <div className="absolute z-50 bottom-9 left-0 bg-white dark:bg-gray-900 border border-neutral-200 dark:border-gray-700 rounded-md shadow-lg p-2 grid grid-cols-8 gap-1 w-[256px]">
                              {["👍","❤️","😂","🔥","🎉","👏","😮","😢","✅","❌","🙏","💯","🚀","👀","💡","⚠️","🤔","😍","😅","😎","🙌","💪","✨","⭐"].map((e) => (
                                <button
                                  key={e}
                                  type="button"
                                  className="text-lg hover:bg-neutral-100 dark:hover:bg-gray-800 rounded p-1"
                                  onClick={() => {
                                    const ta = commentInputRef.current;
                                    const start = ta?.selectionStart ?? content.length;
                                    const end = ta?.selectionEnd ?? content.length;
                                    setContent(content.slice(0, start) + e + content.slice(end));
                                    setShowEmoji(false);
                                    setTimeout(() => {
                                      ta?.focus();
                                      const pos = start + e.length;
                                      ta?.setSelectionRange(pos, pos);
                                    }, 0);
                                  }}
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                      {pendingAnnotations && pendingAnnotations.length > 0 && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-neutral-500 hover:text-red-600 dark:text-gray-400"
                          onClick={() => { setPendingAnnotations(null); setDisplayAnnotations(null); }}
                          title="Clear drawing"
                          data-testid="button-share-clear-annotation"
                        >
                          <XIcon className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <Button
                      size="icon"
                      className="h-7 w-7 pointer-events-auto"
                      disabled={!content.trim() || post.isPending}
                      onClick={() => requireName(() => post.mutate())}
                      data-testid="button-post-share-comment"
                      title="Post"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {(isVideo || isAudio) && (() => {
                  const hasRange = inPoint !== null && outPoint !== null && outPoint > inPoint;
                  return (
                    <div className="hidden sm:flex items-center justify-between text-[11px] text-neutral-500 dark:text-[hsl(var(--comments-muted))]">
                      {hasRange ? (
                        <>
                          <span className="inline-flex items-center gap-1">
                            <span>Range</span>
                            <button
                              type="button"
                              onClick={() => { setInPoint(null); setOutPoint(null); }}
                              className="ml-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
                              title="Clear range"
                              data-testid="button-share-clear-in-out"
                            >
                              ×
                            </button>
                          </span>
                          <span className="font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-[hsl(var(--comments-timestamp-bg))] text-amber-700 dark:text-[hsl(var(--comments-timestamp-fg))]">
                            {fmtTime(inPoint!)} → {fmtTime(outPoint!)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span>Will be posted at {fmtTime(currentTime) || "00:00"} · I/O for range</span>
                          <span className="font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-[hsl(var(--comments-timestamp-bg))] text-amber-700 dark:text-[hsl(var(--comments-timestamp-fg))]">
                            {fmtTime(currentTime) || "00:00"}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })()}
                {isVideo && pendingAnnotations && pendingAnnotations.length > 0 && (
                  <span className="text-[10px] text-neutral-500 dark:text-gray-400">Drawing attached</span>
                )}
              </div>
            )}
          </TabsContent>

          {supportsTranscript && (
            <TabsContent
              value="transcript"
              className="flex-1 min-h-0 m-0 data-[state=active]:flex flex-col overflow-hidden"
            >
              <TranscriptView
                fileId={file.id}
                currentTime={currentTime}
                onSeek={seekTo}
                apiBase={apiBase}
                readOnly
                allowDownloads={allowDownloads && !watermarkLabel}
                queryKey={transcriptQueryKey}
              />
            </TabsContent>
          )}

          {supportsTranscript && (
            <TabsContent
              value="ai"
              className="flex-1 min-h-0 m-0 data-[state=active]:flex flex-col overflow-hidden"
            >
              <AIInsightsView
                fileId={file.id}
                apiBase={apiBase}
                readOnly
                queryKey={transcriptQueryKey}
                onSeek={(time: number) => {
                  const mediaEl = document.querySelector<HTMLVideoElement | HTMLAudioElement>("video, audio");
                  if (mediaEl) mediaEl.currentTime = time;
                }}
              />
            </TabsContent>
          )}
        </Tabs>
      </aside>
      {/* (Legacy scrub-preview portal removed — SharePlayerControls now
          owns the hover preview via its scrubSrc prop.) */}
      <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>What's your name?</DialogTitle>
            <DialogDescription>
              We'll attach it to your comments so the team knows who left them.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Your name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nameDraft.trim()) {
                e.preventDefault();
                const v = nameDraft.trim();
                setName(v);
                setNameDialogOpen(false);
                const fn = pendingActionRef.current;
                pendingActionRef.current = null;
                if (fn) setTimeout(fn, 0);
              }
            }}
            data-testid="input-name-prompt"
          />
          <DialogFooter>
            <Button
              type="button"
              disabled={!nameDraft.trim()}
              onClick={() => {
                const v = nameDraft.trim();
                if (!v) return;
                setName(v);
                setNameDialogOpen(false);
                const fn = pendingActionRef.current;
                pendingActionRef.current = null;
                if (fn) setTimeout(fn, 0);
              }}
              data-testid="button-name-prompt-save"
            >
              Save & post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
