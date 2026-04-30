import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import TranscriptView from "@/components/media/transcript-view";
import SynopsisView from "@/components/media/synopsis-view";
import {
  AlertCircle,
  Download,
  ChevronDown,
  ChevronUp,
  Send,
  Music,
  Image as ImageIcon,
  File as FileIcon,
  MessageSquareWarning,
  PencilLine,
  X as XIcon,
  Maximize2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Pencil,
  Trash2,
  Reply,
  Check,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AnnotationCanvas,
  AnnotationOverlay,
  type Annotation,
} from "@/components/media/annotation-canvas";
import Logo from "@/components/ui/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import WatermarkOverlay from "@/components/media/watermark-overlay";

type TimeFormat = "Frames" | "Standard" | "Timecode";

function formatTimecode(
  seconds: number,
  format: TimeFormat,
  fps: number = 30,
): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const totalFrames = Math.floor(seconds * fps);
  if (format === "Frames") return totalFrames.toString();
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

function fmtTime(seconds: number | null) {
  if (seconds === null || seconds === undefined) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function fmtBytes(bytes: number) {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

function fileKind(t: string) {
  if (t === "video" || t?.startsWith("video/")) return "video";
  if (t === "audio" || t?.startsWith("audio/")) return "audio";
  if (t === "image" || t?.startsWith("image/")) return "image";
  return "other";
}

interface SharedFile {
  id: number;
  filename: string;
  fileType: string;
  fileSize: number;
  projectName: string;
  createdAt: string;
}

interface PublicComment {
  id: string;
  authorName: string;
  authorEmail: string | null;
  content: string;
  timestamp: number | null;
  parentId: string | null;
  createdAt: string;
  creatorToken?: string;
  annotations?: string | null;
}

const PUB_COMMENT_TOKEN_KEY = (id: string) => `share-comment-token-${id}`;
function rememberPubCommentToken(id: string, token: string) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(PUB_COMMENT_TOKEN_KEY(id), token); } catch {}
}
function getPubCommentToken(id: string): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(PUB_COMMENT_TOKEN_KEY(id)); } catch { return null; }
}
function forgetPubCommentToken(id: string) {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(PUB_COMMENT_TOKEN_KEY(id)); } catch {}
}

function parsePublicAnnotations(
  c: { annotations?: string | null } | null | undefined,
): Annotation[] | null {
  if (!c?.annotations) return null;
  try {
    const parsed =
      typeof c.annotations === "string"
        ? JSON.parse(c.annotations)
        : c.annotations;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as Annotation[];
  } catch {}
  return null;
}

const requestChangesSchema = z.object({
  requesterName: z.string().min(1, "Name is required"),
  requesterEmail: z.string().email("Valid email is required"),
});

export default function PublicSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const viewOnly =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("viewOnly") === "true";
  const watermarkOn =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("watermark") === "true";

  const fileQ = useQuery<SharedFile>({
    queryKey: ["share-metadata", token],
    queryFn: async () => {
      const r = await fetch(`/api/share/${token}/metadata`);
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.message || "Shared file not found");
      }
      return r.json();
    },
    enabled: !!token,
    retry: false,
  });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Invalid share link.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (fileQ.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (fileQ.error || !fileQ.data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 space-y-3 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            <div className="font-medium">Share unavailable</div>
            <div className="text-sm text-muted-foreground">
              {(fileQ.error as Error)?.message || "This shared file is no longer available."}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <SingleFileViewer token={token} file={fileQ.data} />;
}

function SingleFileViewer({ token, file }: { token: string; file: SharedFile }) {
  const viewOnly =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("viewOnly") === "true";
  const watermarkOn =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("watermark") === "true";
  const { toast } = useToast();
  const kind = fileKind(file.fileType);
  const isVideo = kind === "video";
  const isAudio = kind === "audio";
  const isImage = kind === "image";

  const [name, setName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("share-reviewer-name") || "";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (name) localStorage.setItem("share-reviewer-name", name);
  }, [name]);
  const [content, setContent] = useState("");
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

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const mediaContainerRef = useRef<HTMLDivElement | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const jklIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jklSpeedRef = useRef<number>(1);
  const jklDirectionRef = useRef<"forward" | "backward" | null>(null);

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

  // When watermarked, intercept any attempt to fullscreen the bare <video>
  // (native button, double-click, etc.) and redirect fullscreen to the
  // container so the watermark overlay stays visible.
  useEffect(() => {
    if (!watermarkOn) return;
    const onFsChange = () => {
      const fs = document.fullscreenElement as HTMLElement | null;
      const video = mediaRef.current as HTMLVideoElement | null;
      const container = mediaContainerRef.current;
      if (fs && video && fs === video && container) {
        document.exitFullscreen()
          .then(() => container.requestFullscreen?.().catch(() => {}))
          .catch(() => {});
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange as any);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange as any);
    };
  }, [watermarkOn, file.id]);
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

  // Smooth time tracking via RAF while playing
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

  const handleSaveAnnotation = (annotations: Annotation[]) => {
    setPendingAnnotations(annotations.length ? annotations : null);
    setIsAnnotating(false);
    setTimeout(() => commentInputRef.current?.focus(), 0);
  };

  const jumpToCommentAt = (index: number, list: PublicComment[]) => {
    const c = list[index];
    if (!c) return;
    setActiveCommentId(c.id);
    setDisplayAnnotations(parsePublicAnnotations(c));
    if (c.timestamp != null) {
      const el = mediaRef.current;
      if (el) {
        el.currentTime = c.timestamp;
        setCurrentTime(c.timestamp);
        el.play?.().catch(() => {});
      }
    }
    document
      .querySelector(`[data-testid="share-comment-${c.id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  // Global keyboard shortcuts (matches authenticated player)
  useEffect(() => {
    if (!isVideo && !isAudio) return;
    const frameRate = 30;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.contentEditable === "true";
      if (isInTextInput) {
        if (e.code === "Tab" && target?.tagName === "TEXTAREA") {
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
              const target = watermarkOn
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
    document.addEventListener("keydown", handler, true);
    return () => {
      document.removeEventListener("keydown", handler, true);
      stopJKLShuttle();
    };
  }, [file.id, isVideo, isAudio]);

  const seekTo = (t: number) => {
    const el = mediaRef.current;
    if (el) {
      el.currentTime = t;
      setCurrentTime(t);
      el.play?.().catch(() => {});
    }
  };

  const commentsQ = useQuery<PublicComment[]>({
    queryKey: ["share-comments", token],
    queryFn: async () => {
      const r = await fetch(`/api/share/${token}/comments`);
      if (!r.ok) throw new Error("Failed to load comments");
      return r.json();
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

  const post = useMutation({
    mutationFn: async () => {
      const el = mediaRef.current;
      const ts = el && (isVideo || isAudio) ? Math.floor(el.currentTime) : null;
      const r = await fetch(`/api/share/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          authorName: name || "Anonymous",
          timestamp: ts,
          annotations:
            pendingAnnotations && pendingAnnotations.length
              ? JSON.stringify(pendingAnnotations)
              : undefined,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || "Failed");
      }
      return (await r.json().catch(() => null)) as
        | { id: string; creatorToken?: string }
        | null;
    },
    onSuccess: (data) => {
      if (data?.id && data.creatorToken) rememberPubCommentToken(data.id, data.creatorToken);
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

  const replyPost = useMutation({
    mutationFn: async ({ parentId, text }: { parentId: string; text: string }) => {
      const r = await fetch(`/api/share/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          authorName: name || "Anonymous",
          timestamp: null,
          parentId,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || "Failed");
      }
      return (await r.json().catch(() => null)) as
        | { id: string; creatorToken?: string }
        | null;
    },
    onSuccess: (data) => {
      if (data?.id && data.creatorToken) rememberPubCommentToken(data.id, data.creatorToken);
      setReplyingToId(null);
      setReplyContent("");
      commentsQ.refetch();
    },
    onError: (e: Error) =>
      toast({ title: "Could not reply", description: e.message, variant: "destructive" }),
  });

  const editPost = useMutation({
    mutationFn: async ({ commentId, text }: { commentId: string; text: string }) => {
      const ct = getPubCommentToken(commentId);
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
      const ct = getPubCommentToken(commentId);
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
      forgetPubCommentToken(commentId);
      commentsQ.refetch();
      toast({ title: "Comment deleted" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not delete", description: e.message, variant: "destructive" }),
  });

  const requestChangesForm = useForm<z.infer<typeof requestChangesSchema>>({
    resolver: zodResolver(requestChangesSchema),
    defaultValues: { requesterName: name || "", requesterEmail: "" },
  });
  const [rcOpen, setRcOpen] = useState(false);
  const requestChangesMutation = useMutation({
    mutationFn: (data: z.infer<typeof requestChangesSchema>) =>
      apiRequest("POST", `/api/share/${token}/request-changes`, data),
    onSuccess: () => {
      toast({ title: "Changes requested", description: "The owner will be notified." });
      requestChangesForm.reset({ requesterName: name || "", requesterEmail: "" });
      setRcOpen(false);
    },
    onError: (e: Error) =>
      toast({ title: "Could not submit", description: e.message, variant: "destructive" }),
  });

  const mediaSrc = `/public/share/${token}`;
  const mediaSrc720 = `/api/share/${token}/qualities/720p`;

  const heading = file.projectName || "Shared file";

  return (
    <div className="h-screen w-screen flex flex-col bg-black text-gray-100 overflow-hidden">
      {/* Slim top bar */}
      <header className="flex items-center justify-between px-3 py-2 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Logo className="h-6 w-auto" />
          <div className="text-xs text-gray-400 truncate hidden sm:block">{heading}</div>
          <span className="text-gray-600 hidden sm:inline">/</span>
          <div
            className="font-medium text-sm truncate text-gray-100"
            data-testid="text-share-filename"
          >
            {file.filename}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!viewOnly && (
          <Dialog open={rcOpen} onOpenChange={setRcOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs"
                data-testid="button-request-changes"
              >
                <MessageSquareWarning className="h-3.5 w-3.5 mr-1" />
                Request Changes
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request changes</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={requestChangesForm.handleSubmit((d) =>
                  requestChangesMutation.mutate(d),
                )}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="rc-name">Your name</Label>
                  <Input
                    id="rc-name"
                    {...requestChangesForm.register("requesterName")}
                    data-testid="input-rc-name"
                  />
                  {requestChangesForm.formState.errors.requesterName && (
                    <div className="text-xs text-destructive">
                      {requestChangesForm.formState.errors.requesterName.message}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rc-email">Your email</Label>
                  <Input
                    id="rc-email"
                    type="email"
                    {...requestChangesForm.register("requesterEmail")}
                    data-testid="input-rc-email"
                  />
                  {requestChangesForm.formState.errors.requesterEmail && (
                    <div className="text-xs text-destructive">
                      {requestChangesForm.formState.errors.requesterEmail.message}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={requestChangesMutation.isPending}
                    data-testid="button-submit-rc"
                  >
                    {requestChangesMutation.isPending ? "Sending…" : "Send request"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          )}
          {!watermarkOn && (
            <a
              className="inline-flex items-center text-xs h-7 px-2.5 rounded-md bg-primary text-primary-foreground hover:opacity-90"
              href={`/api/share/${token}/qualities/720p`}
              download={file.filename}
              data-testid="button-download-share"
            >
              <Download className="h-3.5 w-3.5 mr-1" /> Download
            </a>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* Body: player + sidebar */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden bg-black">
        {/* Player column */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-black">
          <div
            ref={mediaContainerRef}
            className="relative flex-1 min-h-0 w-full flex items-center justify-center bg-black"
          >
            {isVideo && (
              <video
                ref={mediaRef as any}
                controls={!watermarkOn}
                playsInline
                preload="metadata"
                controlsList={watermarkOn ? undefined : "nodownload"}
                disablePictureInPicture={watermarkOn}
                onContextMenu={watermarkOn ? (e) => e.preventDefault() : undefined}
                onClick={
                  watermarkOn
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
              <div className="w-full h-full p-12 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-primary/5 to-primary/20">
                <Music className="h-16 w-16 text-primary" />
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
                data-testid="share-image-preview"
              />
            )}
            {!isVideo && !isAudio && !isImage && (
              <div className="p-12 text-center text-gray-500">
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
            {watermarkOn && (isVideo || isImage) && (
              <WatermarkOverlay label={`${file.filename} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`} />
            )}
            {watermarkOn && isVideo && isPaused && (
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
            {watermarkOn && (isVideo || isImage) && (
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
          {!viewOnly && (isVideo || isAudio) && (() => {
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
                className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-gray-800 bg-black"
                data-testid="share-marker-rail"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-gray-400 hover:text-gray-100 hover:bg-gray-800"
                  onClick={goPrev}
                  disabled={sorted.length === 0}
                  title="Previous comment"
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
                  <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-gray-800" />
                  {duration > 0 && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-1 rounded-l-full bg-primary/70"
                      style={{ left: 0, width: `${(currentTime / duration) * 100}%` }}
                    />
                  )}
                  {duration > 0 && sorted.map((c) => {
                    const pos = ((c.timestamp || 0) / duration) * 100;
                    const isActive = activeCommentId === c.id;
                    const initial = (c.authorName || "A").charAt(0).toUpperCase();
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={cn(
                          "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-5 w-5 rounded-full border-2 border-white shadow flex items-center justify-center text-[10px] font-bold text-black transition-transform hover:scale-110",
                          isActive ? "bg-blue-500 text-white" : "bg-amber-400",
                        )}
                        style={{ left: `${pos}%` }}
                        title={`${c.authorName || "Anonymous"}: ${c.content.slice(0, 80)}`}
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
                <span className="text-[11px] font-mono text-gray-400 tabular-nums">
                  {sorted.length === 0
                    ? "0"
                    : activeIdx >= 0
                      ? `${activeIdx + 1}/${sorted.length}`
                      : `${sorted.length}`}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-gray-400 hover:text-gray-100 hover:bg-gray-800"
                  onClick={goNext}
                  disabled={sorted.length === 0}
                  title="Next comment"
                  data-testid="button-next-comment"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            );
          })()}

          {/* Timecode bar */}
          {(isVideo || isAudio) && (
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
                  {(["Frames", "Standard", "Timecode"] as TimeFormat[]).map((fmt) => (
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
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside
          className="w-full lg:w-[360px] shrink-0 flex flex-col bg-white dark:bg-[#0a0d12] border-t lg:border-t-0 lg:border-l border-neutral-200 dark:border-gray-800 min-h-0 overflow-hidden"
          data-testid="share-sidebar"
        >
          <Tabs
            defaultValue={viewOnly ? (isVideo || isAudio ? "transcript" : "synopsis") : "comments"}
            className="flex-1 min-h-0 flex flex-col"
          >
            <div className="px-3 py-2.5 border-b border-neutral-200 dark:border-gray-800">
              <TabsList className="bg-neutral-100 dark:bg-gray-900">
                {!viewOnly && (
                  <TabsTrigger
                    value="comments"
                    className="text-xs px-3"
                    data-testid="tab-comments"
                  >
                    Comments
                    {commentsQ.data && commentsQ.data.length > 0 && (
                      <span className="ml-1.5 text-[10px] opacity-70">
                        {commentsQ.data.length}
                      </span>
                    )}
                  </TabsTrigger>
                )}
                {(isVideo || isAudio) && (
                  <TabsTrigger
                    value="transcript"
                    className="text-xs px-3"
                    data-testid="tab-transcript"
                  >
                    Transcript
                  </TabsTrigger>
                )}
                {(isVideo || isAudio) && (
                  <TabsTrigger
                    value="synopsis"
                    className="text-xs px-3"
                    data-testid="tab-synopsis"
                  >
                    Synopsis
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {!viewOnly && (
            <TabsContent
              value="comments"
              className="data-[state=active]:flex flex-col flex-1 min-h-0 m-0 overflow-hidden"
            >
              <div
                className="flex-1 min-h-0 overflow-y-auto px-3 space-y-2"
                data-testid="share-comments-list"
              >
                {commentsQ.isLoading && (
                  <div className="text-sm text-neutral-500 px-1 py-2">Loading…</div>
                )}
                {commentsQ.data?.length === 0 && (
                  <div className="text-sm text-neutral-500 px-1 py-6 text-center">
                    No comments yet. Be the first to leave one.
                  </div>
                )}
                {(() => {
                  const all = commentsQ.data || [];
                  const topLevel = all.filter((c) => !c.parentId);
                  const repliesByParent = new Map<string, PublicComment[]>();
                  for (const c of all) {
                    if (c.parentId) {
                      const arr = repliesByParent.get(c.parentId) || [];
                      arr.push(c);
                      repliesByParent.set(c.parentId, arr);
                    }
                  }
                  const renderItem = (c: PublicComment, index: number, isReply: boolean) => {
                    const author = c.authorName || "Anonymous";
                    const isActive = activeCommentId === c.id;
                    const hasAnno = !!parsePublicAnnotations(c);
                    const isMine = !!getPubCommentToken(c.id);
                    const isEditing = editingId === c.id;
                    const isReplying = replyingToId === c.id;
                    const replies = repliesByParent.get(c.id) || [];
                    return (
                      <div key={c.id} className={isReply ? "ml-6" : undefined}>
                        <div
                          onClick={() => {
                            if (isEditing) return;
                            setActiveCommentId(c.id);
                            setDisplayAnnotations(parsePublicAnnotations(c));
                            if (c.timestamp != null) seekTo(c.timestamp);
                          }}
                          className={cn(
                            "rounded-lg border p-3 bg-white dark:bg-[hsl(var(--comments-card))] border-neutral-200 dark:border-[hsl(var(--comments-card-border))] cursor-pointer transition-colors",
                            isActive &&
                              "ring-2 ring-primary dark:ring-[#10a37f] border-primary dark:border-[#10a37f]",
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
                                        setDisplayAnnotations(parsePublicAnnotations(c));
                                        seekTo(c.timestamp!);
                                      }}
                                      className="text-xs font-mono px-2 py-1 rounded bg-amber-100 dark:bg-[hsl(var(--comments-timestamp-bg))] text-amber-700 dark:text-[hsl(var(--comments-timestamp-fg))] hover:opacity-80 transition-opacity"
                                      title="Jump to this moment"
                                      data-testid={`button-seek-${c.id}`}
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
                              {!isEditing && (
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
                        {isReplying && (
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
                                  replyPost.mutate({ parentId: c.id, text: replyContent.trim() })
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
              </div>

              {/* Sticky composer */}
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
            </TabsContent>
            )}

            {(isVideo || isAudio) && (
              <TabsContent
                value="transcript"
                className="data-[state=active]:flex flex-col flex-1 min-h-0 m-0 overflow-hidden"
              >
                <TranscriptView
                  fileId={file.id}
                  currentTime={currentTime}
                  onSeek={seekTo}
                  apiBase={`/api/share/${token}`}
                  readOnly
                  allowDownloads={!watermarkOn}
                  queryKey={["share-transcript", token, file.id]}
                />
              </TabsContent>
            )}

            {(isVideo || isAudio) && (
              <TabsContent
                value="synopsis"
                className="data-[state=active]:flex flex-col flex-1 min-h-0 m-0 overflow-hidden"
              >
                <SynopsisView
                  fileId={file.id}
                  apiBase={`/api/share/${token}`}
                  readOnly
                  queryKey={["share-transcript", token, file.id]}
                />
              </TabsContent>
            )}
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
