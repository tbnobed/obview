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

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import SharePlayerControls from "@/components/media/share-player-controls";
import { AnnotationOverlay, type Annotation } from "@/components/media/annotation-canvas";

type ApiComment = {
  id: string | number;
  parentId?: string | number | null;
  timestamp?: number | null;
  inPoint?: number | null;
  outPoint?: number | null;
  content?: string | null;
  authorName?: string | null;
  annotations?: string | Annotation[] | null;
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
  annotations?: string | Annotation[] | null;
};

// Comments store drawings as a JSON string of normalized (0-1) shapes; parse
// defensively so a malformed blob can't take down the player.
function parseAnnotations(c: Marker | undefined): Annotation[] | null {
  if (!c?.annotations) return null;
  try {
    const parsed =
      typeof c.annotations === "string" ? JSON.parse(c.annotations) : c.annotations;
    return Array.isArray(parsed) && parsed.length ? (parsed as Annotation[]) : null;
  } catch {
    return null;
  }
}

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
  // Video's intrinsic aspect ratio. We aspect-lock the media box to this so the
  // annotation overlay maps onto the actual (non-letterboxed) video rect —
  // otherwise object-contain letterboxes the video inside the box and the
  // overlay stretches drawings into the black bars (mirrors media-player.tsx).
  const [videoAspect, setVideoAspect] = useState<number | null>(null);
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
    setVideoAspect(null);
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
      annotations: c.annotations ?? null,
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
      const v = el as HTMLVideoElement;
      if (v.videoWidth && v.videoHeight) setVideoAspect(v.videoWidth / v.videoHeight);
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

  // Track the media container size so the drawing overlay canvas scales with
  // the panel (mirrors the share page's ResizeObserver wiring).
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fileType]);

  // Drawing attached to the active (clicked) comment, shown at its exact
  // frame and cleared alongside activeCommentId when the playhead moves.
  const activeAnnotations = useMemo(
    () => parseAnnotations(comments.find((c) => c.id === activeCommentId)),
    [comments, activeCommentId],
  );

  // Let the UXP panel activate a comment from its own list: via the webview
  // message bridge when available, or a hash change (#comment=<id>&n=<nonce>)
  // as the no-bridge fallback. Seeks to the frame and PAUSES so the drawing
  // stays visible (playing would clear it as soon as the playhead moved).
  useEffect(() => {
    const activateById = (raw: string | null | undefined) => {
      if (!raw) return;
      const c = comments.find((x) => x.id === String(raw));
      if (!c) return;
      setActiveCommentId(c.id);
      const t = c.timestamp ?? c.inPoint;
      if (t != null) {
        const el = mediaRef.current;
        if (el) {
          el.pause?.();
          el.currentTime = t;
          setCurrentTime(t);
        }
      }
    };
    const onMessage = (e: MessageEvent) => {
      const d = e?.data as { type?: string; id?: string | number } | null;
      if (d && typeof d === "object" && d.type === "obviu-show-comment") {
        activateById(d.id != null ? String(d.id) : null);
      }
    };
    const onHash = () => {
      const m = /(?:^|[#&])comment=([^&]+)/.exec(window.location.hash || "");
      if (m) activateById(decodeURIComponent(m[1]));
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("hashchange", onHash);
    };
  }, [comments]);

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
      <div className="relative flex-1 min-h-0 flex flex-col items-center justify-center bg-black">
        {isVideo && (
          // Aspect-locked media box: matches the video's intrinsic ratio so the
          // annotation overlay (sized to this box) maps 1:1 onto the video with
          // no letterboxing gap. Without this the overlay stretches drawings
          // into the black bars.
          <div
            ref={containerRef}
            className="relative w-full"
            style={
              videoAspect
                ? { aspectRatio: String(videoAspect), maxHeight: "100%", maxWidth: "100%", flex: "0 1 auto" }
                : { height: "100%" }
            }
          >
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
              className="absolute inset-0 w-full h-full object-contain bg-black cursor-pointer"
              data-testid="panel-video-player"
            >
              <source src={mediaSrc} type="video/mp4" />
            </video>
            {activeAnnotations && containerSize.width > 0 && (
              <AnnotationOverlay
                annotations={activeAnnotations}
                containerWidth={containerSize.width}
                containerHeight={containerSize.height}
              />
            )}
          </div>
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
