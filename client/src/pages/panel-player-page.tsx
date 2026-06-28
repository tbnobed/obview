// PanelPlayerPage
//
// A purpose-built, chrome-free media player for the Premiere UXP panel's
// embedded webview. Unlike the public review page (which carries a header,
// comments sidebar and filter tabs), this route renders ONLY the video and
// the scrubber with coloured comment markers — nothing else.
//
// URL: /panel-player/:token?file=<fileId>
//   - :token  — a public share-link token (minted/reused by the panel)
//   - file    — the file/version id to play
//
// Everything is served by the existing public share endpoints, so no auth is
// required inside the webview.

import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import SharePlayerControls from "@/components/media/share-player-controls";

type ApiComment = {
  id: string | number;
  parentId?: string | number | null;
  timestamp?: number | null;
  inPoint?: number | null;
  outPoint?: number | null;
  content?: string | null;
  authorName?: string | null;
  user?: { name?: string | null } | null;
};

type Marker = {
  id: string;
  parentId?: string | null;
  timestamp?: number | null;
  inPoint?: number | null;
  outPoint?: number | null;
  content?: string | null;
  authorName?: string | null;
};

export default function PanelPlayerPage() {
  const params = useParams();
  const token = (params.token as string) || "";
  const fileId = (() => {
    if (typeof window === "undefined") return 0;
    return parseInt(new URLSearchParams(window.location.search).get("file") || "0", 10);
  })();

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [fileType, setFileType] = useState<string>("");
  const [frameRate, setFrameRate] = useState<number>(30);
  const [scrubSrc, setScrubSrc] = useState<string | null>(null);
  const [comments, setComments] = useState<Marker[]>([]);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/public/share/${encodeURIComponent(token)}/files/${fileId}`;
  const mediaSrc = `${base}/content`;

  const isVideo = fileType.startsWith("video");
  const isAudio = fileType.startsWith("audio");

  // ----- Metadata + processing (frame rate, scrub preview source) -----
  useEffect(() => {
    let cancelled = false;
    // Reset per-file state so nothing stale carries over if the same component
    // instance is reused for a different file/version.
    setScrubSrc(null);
    setFrameRate(30);
    setError(null);
    setActiveCommentId(null);
    (async () => {
      try {
        const r = await fetch(`${base}/metadata`);
        if (!r.ok) throw new Error("This media could not be loaded.");
        const m = await r.json();
        if (!cancelled) setFileType(String(m.fileType || ""));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load media.");
      }
      try {
        const p = await fetch(`${base}/processing`);
        if (p.ok) {
          const pj = await p.json();
          if (!cancelled) {
            if (pj?.frameRate) setFrameRate(Number(pj.frameRate) || 30);
            if (pj?.scrubVersionPath) setScrubSrc(`${base}/scrub`);
          }
        }
      } catch {
        /* scrub/frameRate are optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base]);

  // ----- Comments (poll every 30s, like the panel) -----
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const normalize = (c: ApiComment): Marker => ({
      id: String(c.id),
      parentId: c.parentId == null ? null : String(c.parentId),
      timestamp: c.timestamp ?? null,
      inPoint: c.inPoint ?? null,
      outPoint: c.outPoint ?? null,
      content: c.content ?? null,
      authorName: c.authorName || c.user?.name || null,
    });
    const load = async () => {
      try {
        const r = await fetch(`${base}/comments`);
        if (r.ok) {
          const data = (await r.json()) as ApiComment[];
          if (!cancelled && Array.isArray(data)) setComments(data.map(normalize));
        }
      } catch {
        /* keep last good list */
      }
      if (!cancelled) timer = setTimeout(load, 30000);
    };
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [base]);

  // ----- Lift media element state (mirrors the share page wiring) -----
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
    const onPlay = () => {
      setIsPaused(false);
      start();
    };
    const onPause = () => {
      setIsPaused(true);
      stop();
    };
    const onVolume = () => setIsMuted(el.muted || el.volume === 0);
    el.addEventListener("play", onPlay);
    el.addEventListener("playing", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("seeked", stop);
    el.addEventListener("ended", onPause);
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
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("volumechange", onVolume);
    };
  }, [fileType]);

  // Drop the active marker once the playhead leaves its frame.
  useEffect(() => {
    if (!activeCommentId) return;
    const active = comments.find((c) => c.id === activeCommentId);
    if (!active || active.timestamp == null) return;
    if (Math.abs(currentTime - active.timestamp) > 0.05) setActiveCommentId(null);
  }, [currentTime, activeCommentId, comments]);

  const seekTo = (t: number) => {
    const el = mediaRef.current;
    if (!el) return;
    el.currentTime = t;
    setCurrentTime(t);
    el.play?.().catch(() => {});
  };

  const onCommentClick = (id: string) => {
    const c = comments.find((x) => x.id === id);
    if (!c) return;
    setActiveCommentId(id);
    if (c.timestamp != null) seekTo(c.timestamp);
  };

  if (error) {
    return (
      <div className="dark fixed inset-0 flex items-center justify-center bg-black text-gray-400 text-sm p-6 text-center">
        {error}
      </div>
    );
  }

  return (
    <div className="dark fixed inset-0 flex flex-col bg-black">
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 flex items-center justify-center bg-black"
      >
        {isVideo && (
          <video
            ref={mediaRef as any}
            controls={false}
            playsInline
            preload="metadata"
            controlsList="nodownload"
            disablePictureInPicture
            onClick={() => {
              const v = mediaRef.current as HTMLVideoElement | null;
              if (!v) return;
              if (v.paused) v.play().catch(() => {});
              else v.pause();
            }}
            className="w-full h-full object-contain bg-black cursor-pointer"
            data-testid="panel-video-player"
          >
            <source src={mediaSrc} type="video/mp4" />
          </video>
        )}
        {isAudio && (
          <audio ref={mediaRef as any} src={mediaSrc} className="w-full max-w-md" />
        )}
        {!isVideo && !isAudio && fileType && (
          <div className="text-gray-500 text-sm">No preview available for this file type.</div>
        )}
      </div>

      {(isVideo || isAudio) && (
        <SharePlayerControls
          mediaRef={mediaRef}
          containerRef={containerRef}
          fileId={fileId}
          fileType={isVideo ? "video" : "audio"}
          duration={duration}
          currentTime={currentTime}
          isPaused={isPaused}
          isMuted={isMuted}
          frameRate={frameRate}
          comments={comments}
          activeCommentId={activeCommentId}
          onCommentClick={onCommentClick}
          scrubSrc={scrubSrc}
          onSeek={seekTo}
        />
      )}
    </div>
  );
}
