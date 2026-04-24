import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  X as XIcon,
} from "lucide-react";
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
import SynopsisView from "@/components/media/synopsis-view";
import WatermarkOverlay from "@/components/media/watermark-overlay";

type ShareInfo = {
  scopeType: "project" | "folder" | "file";
  name: string | null;
  scopeName: string;
  expired: boolean;
  requiresPassword: boolean;
  requiresEmail: boolean;
  allowDownloads: boolean;
  allowComments: boolean;
  watermarkEnabled?: boolean;
  watermarkText?: string | null;
  watermarkLabel?: string | null;
  unlocked: boolean;
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
};

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

  const infoQ = useQuery<ShareInfo>({
    queryKey: ["share-info", token],
    queryFn: async () => {
      const r = await fetch(`/api/public/share/${token}/info`);
      if (!r.ok) throw new Error("not_found");
      return r.json();
    },
    retry: false,
  });

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
      <div className="h-screen w-screen flex flex-col bg-black text-gray-100 overflow-hidden">
        {/* Slim top bar */}
        <header className="flex items-center justify-between px-3 py-2 border-b border-gray-800 shrink-0">
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
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
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
      <div className="relative aspect-video bg-neutral-100 dark:bg-gray-900 overflow-hidden">
        {kind === "video" ? (
          <>
            <video
              preload="metadata"
              muted
              className="w-full h-full object-cover bg-black"
              src={`/api/public/share/${token}/files/${file.id}/scrub`}
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
              <div className="bg-white/90 rounded-full p-3 shadow-lg">
                <Play className="h-5 w-5 text-gray-900 fill-gray-900" />
              </div>
            </div>
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
  const [content, setContent] = useState("");
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
  const [pendingAnnotations, setPendingAnnotations] = useState<Annotation[] | null>(null);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [mediaContainerSize, setMediaContainerSize] = useState({ width: 0, height: 0 });

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
  }, [file.id]);

  // Reset per-file transient state when switching files (FileViewer is reused)
  useEffect(() => {
    setActiveCommentId(null);
    setDisplayAnnotations(null);
    setPendingAnnotations(null);
    setIsAnnotating(false);
    setDuration(0);
    setCurrentTime(0);
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

  const post = useMutation({
    mutationFn: async () => {
      const el = mediaRef.current;
      const ts = el && (isVideo || isAudio) ? Math.floor(el.currentTime) : null;
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
    },
    onSuccess: () => {
      setContent("");
      setPendingAnnotations(null);
      setDisplayAnnotations(null);
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

  const mediaSrc = `/api/public/share/${token}/files/${file.id}/content`;
  const mediaSrc720 = `/api/public/share/${token}/files/${file.id}/qualities/720p`;

  return (
    <div
      className={cn(
        fullScreen
          ? "flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden bg-black"
          : "grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[calc(70vh+88px)] lg:min-h-[520px]",
      )}
    >
      {/* Player column */}
      <div
        className={cn(
          fullScreen
            ? "flex-1 min-h-0 min-w-0 flex flex-col bg-black"
            : "lg:col-span-2 flex flex-col gap-4 min-h-0",
        )}
      >
        <div
          ref={mediaContainerRef}
          className={cn(
            "relative",
            fullScreen
              ? "flex-1 min-h-0 w-full flex items-center justify-center bg-black"
              : "flex-1 min-h-0 rounded-lg overflow-hidden bg-black border border-neutral-200 dark:border-gray-800 shadow-sm flex items-center justify-center",
          )}
        >
          {isVideo && (
            <video
              ref={mediaRef as any}
              controls={!watermarkLabel}
              playsInline
              preload="metadata"
              controlsList={watermarkLabel ? undefined : "nodownload"}
              disablePictureInPicture={!!watermarkLabel}
              onContextMenu={watermarkLabel ? (e) => e.preventDefault() : undefined}
              onClick={
                watermarkLabel
                  ? () => {
                      const v = mediaRef.current as HTMLVideoElement | null;
                      if (!v) return;
                      if (v.paused) v.play().catch(() => {});
                      else v.pause();
                    }
                  : undefined
              }
              className="w-full h-full object-contain bg-black"
              data-testid="share-video-player"
            >
              <source src={mediaSrc720} type="video/mp4" />
              <source src={mediaSrc} type="video/mp4" />
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
          {watermarkLabel && (isVideo || isImage) && (
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

        {/* Comment markers rail + prev/next */}
        {(isVideo || isAudio) && (() => {
          const tsComments = (commentsQ.data || []).filter(
            (c) => !c.parentId && c.timestamp != null,
          );
          const sorted = [...tsComments].sort(
            (a, b) => (a.timestamp || 0) - (b.timestamp || 0),
          );
          const activeIdx = activeCommentId
            ? sorted.findIndex((c) => c.id === activeCommentId)
            : -1;
          const goPrev = () => {
            if (!sorted.length) return;
            if (activeIdx <= 0) jumpToCommentAt(sorted.length - 1, sorted);
            else jumpToCommentAt(activeIdx - 1, sorted);
          };
          const goNext = () => {
            if (!sorted.length) return;
            if (activeIdx === -1 || activeIdx >= sorted.length - 1)
              jumpToCommentAt(0, sorted);
            else jumpToCommentAt(activeIdx + 1, sorted);
          };
          return (
            <div
              className={cn(
                "shrink-0 flex items-center gap-2 px-3 py-2",
                fullScreen
                  ? "border-t border-gray-800 bg-black"
                  : "rounded-md bg-neutral-50 dark:bg-gray-900 border border-neutral-200 dark:border-gray-800",
              )}
              data-testid="share-marker-rail"
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-neutral-500 dark:text-gray-400"
                onClick={goPrev}
                disabled={sorted.length === 0}
                title="Previous comment (Shift+P)"
                data-testid="button-prev-comment"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <div
                className="relative flex-1 h-5 cursor-pointer"
                onClick={(e) => {
                  if (!duration) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  seekTo(duration * pos);
                }}
                data-testid="share-marker-track"
              >
                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-neutral-200 dark:bg-gray-800" />
                {duration > 0 && (
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-1 rounded-l-full bg-primary/60 dark:bg-[#026d55]/70"
                    style={{ left: 0, width: `${(currentTime / duration) * 100}%` }}
                  />
                )}
                {duration > 0 && sorted.map((c) => {
                  const pos = ((c.timestamp || 0) / duration) * 100;
                  const isActive = activeCommentId === c.id;
                  const initial =
                    (c.user?.name || c.authorName || "A").charAt(0).toUpperCase();
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-5 w-5 rounded-full border-2 border-white shadow flex items-center justify-center text-[10px] font-bold text-black transition-transform hover:scale-110",
                        isActive ? "bg-blue-500 text-white" : "bg-amber-400",
                      )}
                      style={{ left: `${pos}%` }}
                      title={`${c.user?.name || c.authorName || "Anonymous"}: ${c.content.slice(0, 80)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const idx = sorted.findIndex((x) => x.id === c.id);
                        jumpToCommentAt(idx, sorted);
                      }}
                      data-testid={`share-marker-${c.id}`}
                    >
                      {initial}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] font-mono text-neutral-500 dark:text-gray-400 tabular-nums">
                {sorted.length === 0
                  ? "0"
                  : activeIdx >= 0
                    ? `${activeIdx + 1}/${sorted.length}`
                    : `${sorted.length}`}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-neutral-500 dark:text-gray-400"
                onClick={goNext}
                disabled={sorted.length === 0}
                title="Next comment (Shift+N)"
                data-testid="button-next-comment"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          );
        })()}

        {/* Timecode bar — fullscreen + playable media only */}
        {fullScreen && (isVideo || isAudio) && (
          <div
            className="shrink-0 flex items-center justify-center gap-2 px-4 py-2 border-t border-gray-800 bg-black"
            data-testid="timecode-bar"
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md bg-gray-900/70 hover:bg-gray-800 border border-gray-700 px-3 py-1.5 font-mono text-sm text-gray-100"
                  data-testid="button-timecode-format"
                  aria-label="Time format"
                  title="Time format"
                >
                  <span data-testid="text-timecode">
                    {formatTimecode(currentTime, timeFormat)}
                  </span>
                  <ChevronDown className="h-3 w-3 text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-gray-900 border-gray-700 text-gray-100 min-w-[140px]"
              >
                <DropdownMenuLabel className="text-gray-400 text-xs font-normal">
                  Time Format
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-gray-800" />
                {(["Frames", "Standard", "Timecode"] as TimeFormat[]).map(
                  (fmt) => (
                    <DropdownMenuItem
                      key={fmt}
                      onClick={() => setTimeFormat(fmt)}
                      className={cn(
                        "cursor-pointer focus:bg-gray-800 focus:text-gray-100",
                        timeFormat === fmt && "text-primary",
                      )}
                      data-testid={`menu-timeformat-${fmt.toLowerCase()}`}
                    >
                      {fmt}
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
            ? "w-full lg:w-[360px] shrink-0 bg-white dark:bg-[#0f1218] border-t lg:border-t-0 lg:border-l border-neutral-200 dark:border-gray-800 overflow-hidden flex flex-col h-[40vh] lg:h-auto"
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
              allowed.add("synopsis");
            }
            return t && allowed.has(t) ? t : "comments";
          })()}
          className="flex-1 min-h-0 flex flex-col"
        >
          <div className="px-3 py-2.5 border-b border-neutral-200 dark:border-gray-800">
            <TabsList className="bg-neutral-100 dark:bg-gray-900">
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
                <TabsTrigger value="synopsis" className="text-xs px-3">
                  Synopsis
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent
            value="comments"
            className="flex-1 min-h-0 m-0 data-[state=active]:flex flex-col overflow-hidden"
          >
            {/* Comments list (scrolls) */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5">
              {commentsQ.isLoading && (
                <p className="px-4 py-6 text-xs text-neutral-500 dark:text-gray-400 text-center">
                  Loading comments...
                </p>
              )}
              {commentsQ.data?.map((c, index) => {
                const author = c.user?.name || c.authorName || "Anonymous";
                const isActive = activeCommentId === c.id;
                const hasAnno = !!parseAnnotations(c);
                return (
                  <div
                    key={c.id}
                    onClick={() => {
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
                                title="Jump to this moment"
                              >
                                {fmtTime(c.timestamp)}
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
                          </div>
                          <span className="text-xs font-medium text-neutral-500 dark:text-[hsl(var(--comments-muted))] shrink-0">
                            #{index + 1}
                          </span>
                        </div>
                        <div className="text-sm text-neutral-800 dark:text-[hsl(var(--comments-text))] whitespace-pre-wrap break-words leading-relaxed">
                          {c.content}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
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
                    className="w-full text-sm rounded-md border border-neutral-200 dark:border-gray-700 p-2 pr-10 min-h-[60px] bg-neutral-50 dark:bg-gray-800 text-neutral-900 dark:text-gray-100 placeholder:text-neutral-400 dark:placeholder:text-gray-500 resize-none"
                    placeholder={
                      isVideo || isAudio
                        ? `Add a comment at ${fmtTime(currentTime) || "0:00"}...`
                        : "Add a comment..."
                    }
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        content.trim() &&
                        !post.isPending
                      ) {
                        e.preventDefault();
                        post.mutate();
                      }
                    }}
                    data-testid="textarea-share-comment"
                  />
                  <Button
                    size="icon"
                    className="absolute bottom-2 right-2 h-7 w-7"
                    disabled={!content.trim() || post.isPending}
                    onClick={() => post.mutate()}
                    data-testid="button-post-share-comment"
                    title="Post"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {(isVideo || isAudio) && (
                  <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-[hsl(var(--comments-muted))]">
                    <span>Will be posted at {fmtTime(currentTime) || "00:00"}</span>
                    <span className="font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-[hsl(var(--comments-timestamp-bg))] text-amber-700 dark:text-[hsl(var(--comments-timestamp-fg))]">
                      {fmtTime(currentTime) || "00:00"}
                    </span>
                  </div>
                )}
                {isVideo && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        if (mediaRef.current && !mediaRef.current.paused) {
                          mediaRef.current.pause();
                        }
                        setDisplayAnnotations(null);
                        setIsAnnotating(true);
                      }}
                      data-testid="button-share-annotate"
                      title="Draw on the frame"
                    >
                      <PencilLine className="h-3.5 w-3.5 mr-1.5" />
                      {pendingAnnotations && pendingAnnotations.length
                        ? "Edit drawing"
                        : "Annotate"}
                    </Button>
                    {pendingAnnotations && pendingAnnotations.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-neutral-500 dark:text-gray-400"
                        onClick={() => {
                          setPendingAnnotations(null);
                          setDisplayAnnotations(null);
                        }}
                        title="Clear drawing"
                        data-testid="button-share-clear-annotation"
                      >
                        <XIcon className="h-3.5 w-3.5 mr-1" /> Clear
                      </Button>
                    )}
                    {pendingAnnotations && pendingAnnotations.length > 0 && (
                      <span className="text-[10px] text-neutral-500 dark:text-gray-400">
                        Drawing attached
                      </span>
                    )}
                  </div>
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
              value="synopsis"
              className="flex-1 min-h-0 m-0 data-[state=active]:flex flex-col overflow-hidden"
            >
              <SynopsisView
                fileId={file.id}
                apiBase={apiBase}
                readOnly
                queryKey={transcriptQueryKey}
              />
            </TabsContent>
          )}
        </Tabs>
      </aside>
    </div>
  );
}
