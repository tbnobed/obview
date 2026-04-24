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
import {
  AlertCircle,
  Download,
  ChevronDown,
  Send,
  Music,
  Image as ImageIcon,
  File as FileIcon,
  MessageSquareWarning,
} from "lucide-react";
import Logo from "@/components/ui/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

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
}

const requestChangesSchema = z.object({
  requesterName: z.string().min(1, "Name is required"),
  requesterEmail: z.string().email("Valid email is required"),
});

export default function PublicSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

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
  const [timeFormat, setTimeFormat] = useState<TimeFormat>("Standard");

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const jklIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jklSpeedRef = useRef<number>(1);
  const jklDirectionRef = useRef<"forward" | "backward" | null>(null);
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
    el.addEventListener("play", start);
    el.addEventListener("playing", start);
    el.addEventListener("pause", stop);
    el.addEventListener("seeked", stop);
    el.addEventListener("ended", stop);
    el.addEventListener("timeupdate", stop);
    if (!el.paused) start();
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("play", start);
      el.removeEventListener("playing", start);
      el.removeEventListener("pause", stop);
      el.removeEventListener("seeked", stop);
      el.removeEventListener("ended", stop);
      el.removeEventListener("timeupdate", stop);
    };
  }, [file.id]);

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
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            else (el as HTMLVideoElement).requestFullscreen?.().catch(() => {});
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
          stopJKLShuttle();
          const framesBack = e.shiftKey ? 10 : 1;
          const t = Math.max(0, el.currentTime - framesBack / frameRate);
          el.currentTime = t;
          setCurrentTime(t);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
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
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
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
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || "Failed");
      }
    },
    onSuccess: () => {
      setContent("");
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
          <a
            className="inline-flex items-center text-xs h-7 px-2.5 rounded-md bg-primary text-primary-foreground hover:opacity-90"
            href={`/api/share/${token}/qualities/720p`}
            download={file.filename}
            data-testid="button-download-share"
          >
            <Download className="h-3.5 w-3.5 mr-1" /> Download
          </a>
          <ThemeToggle />
        </div>
      </header>

      {/* Body: player + sidebar */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden bg-black">
        {/* Player column */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-black">
          <div className="flex-1 min-h-0 w-full flex items-center justify-center bg-black">
            {isVideo && (
              <video
                ref={mediaRef as any}
                controls
                playsInline
                preload="metadata"
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
          </div>

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
          <Tabs defaultValue="comments" className="flex-1 min-h-0 flex flex-col">
            <TabsList className="m-3 mb-0 grid grid-cols-1">
              <TabsTrigger value="comments" data-testid="tab-comments">
                Comments {commentsQ.data ? `(${commentsQ.data.length})` : ""}
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="comments"
              className="data-[state=active]:flex flex-col flex-1 min-h-0 mt-2"
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
                {commentsQ.data?.map((c, i) => {
                  const created = new Date(c.createdAt);
                  const dateStr = `${created.getMonth() + 1}/${created.getDate()}/${created.getFullYear()}`;
                  return (
                    <div
                      key={c.id}
                      className="rounded-lg border border-neutral-200 dark:border-[hsl(var(--comments-card-border))] bg-white dark:bg-[hsl(var(--comments-card-bg))] p-3"
                      data-testid={`comment-${c.id}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="h-7 w-7 rounded-full bg-neutral-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                          <svg
                            className="h-4 w-4 text-neutral-500 dark:text-gray-400"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-medium text-sm truncate text-neutral-900 dark:text-gray-100">
                                {c.authorName}
                              </span>
                              <span className="text-xs text-neutral-500 dark:text-[hsl(var(--comments-muted))]">
                                {dateStr}
                              </span>
                              {c.timestamp != null && (
                                <button
                                  onClick={() => seekTo(c.timestamp!)}
                                  className="text-xs font-mono px-2 py-1 rounded bg-amber-100 dark:bg-[hsl(var(--comments-timestamp-bg))] text-amber-700 dark:text-[hsl(var(--comments-timestamp-fg))] hover:opacity-80 transition-opacity"
                                  data-testid={`button-seek-${c.id}`}
                                >
                                  {fmtTime(c.timestamp)}
                                </button>
                              )}
                            </div>
                            <span className="text-xs text-neutral-400 dark:text-[hsl(var(--comments-muted))] shrink-0">
                              #{i + 1}
                            </span>
                          </div>
                          <div className="mt-1.5 text-sm text-neutral-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                            {c.content}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
              </div>
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
