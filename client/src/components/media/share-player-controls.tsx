// SharePlayerControls
//
// A self-contained controls bar that mirrors the authenticated MediaPlayer's
// chrome (play/pause, volume, SMPTE time, HD/720p toggle, fullscreen, scrub
// progress bar with comment markers and in/out range, sprite-based hover
// preview, comment-marker tooltips via portal). Built specifically for the
// public/multi share pages so they no longer have to fall back to the bare
// `<video controls>` browser UI.
//
// This is intentionally a separate component from MediaPlayer rather than a
// shared extraction: MediaPlayer is 2600+ lines tightly wired to the
// authenticated app (queries, mutations, dialogs, AI tabs, version compare,
// approval state, sprite metadata fetched via authed endpoints). Splitting
// the chrome out of it cleanly is a multi-day refactor and would risk
// regressions on the working authenticated player. This file just
// reimplements the same visual + interaction contract on top of an
// already-mounted media element.
//
// Visual classes match the authenticated player so the bars look identical.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SharedComment = {
  id: string;
  parentId?: string | null;
  timestamp?: number | null;
  inPoint?: number | null;
  outPoint?: number | null;
  authorName?: string | null;
  content?: string | null;
};

interface Props {
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  fileId: number;
  fileType: "video" | "audio";

  // Live media state lifted by the parent (the share pages already track
  // these so they can render the timecode + I/O markers elsewhere).
  duration: number;
  currentTime: number;
  isPaused: boolean;
  isMuted: boolean;

  // Optional: SMPTE timecode needs frame rate. Defaults to 30 if unknown.
  frameRate?: number;

  // Optional Frame.io-style range markers on the bar.
  inPoint?: number | null;
  outPoint?: number | null;

  // Optional comment markers + click handler. When omitted, no markers render.
  comments?: SharedComment[];
  activeCommentId?: string | null;
  onCommentClick?: (commentId: string) => void;

  // Optional HD/720p quality toggle (matches the authenticated `has720p` UX).
  has720p?: boolean;
  useOriginalQuality?: boolean;
  onToggleQuality?: () => void;

  // When the video is watermarked we fullscreen the container instead of
  // the bare <video> so the overlay stays painted on top.
  watermarkOn?: boolean;

  // Optional sprite/scrub preview source. Public share endpoints typically
  // don't expose the scrub MP4, so this is opt-in and silently skipped when
  // missing.
  scrubSrc?: string | null;

  // Local seek callback. Optional — falls back to mutating mediaRef directly.
  onSeek?: (timeSeconds: number) => void;

  // Hide the controls panel entirely (e.g. when the player is in an error
  // state). Keeps the parent's render tree simple.
  hidden?: boolean;
}

function formatSMPTE(time: number, frameRate: number): string {
  if (time == null || isNaN(time) || !isFinite(time)) return "00:00:00:00";
  const fps = frameRate && frameRate > 0 ? frameRate : 30;
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = Math.floor(time % 60);
  const frames = Math.min(
    Math.floor((time - Math.floor(time)) * fps),
    Math.max(0, Math.round(fps) - 1),
  );
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

export default function SharePlayerControls({
  mediaRef,
  containerRef,
  fileId,
  fileType,
  duration,
  currentTime,
  isPaused,
  isMuted,
  frameRate = 30,
  inPoint,
  outPoint,
  comments,
  activeCommentId,
  onCommentClick,
  has720p,
  useOriginalQuality,
  onToggleQuality,
  watermarkOn,
  scrubSrc,
  onSeek,
  hidden,
}: Props) {
  const [volume, setVolume] = useState(1);
  const [showScrubPreview, setShowScrubPreview] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const [scrubLeft, setScrubLeft] = useState(0);
  const [scrubTop, setScrubTop] = useState(0);
  const [hoveredComment, setHoveredComment] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const hideTooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  // Mirror the underlying element's volume into local state so the slider
  // reflects external mute toggles (M shortcut, watermark mini-bar).
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const sync = () => setVolume(el.muted ? 0 : el.volume);
    sync();
    el.addEventListener("volumechange", sync);
    return () => el.removeEventListener("volumechange", sync);
  }, [mediaRef, fileId]);

  useEffect(() => {
    return () => {
      if (hideTooltipTimeoutRef.current) clearTimeout(hideTooltipTimeoutRef.current);
    };
  }, []);

  const togglePlay = () => {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };
  const toggleMute = () => {
    const el = mediaRef.current;
    if (!el) return;
    el.muted = !el.muted;
  };
  const handleVolume = (v: number) => {
    const el = mediaRef.current;
    if (!el) return;
    el.volume = v;
    if (v === 0) el.muted = true;
    else if (el.muted) el.muted = false;
    setVolume(v);
  };
  const seekTo = (t: number) => {
    if (onSeek) {
      onSeek(t);
      return;
    }
    const el = mediaRef.current;
    if (el) el.currentTime = t;
  };
  const toggleFullscreen = () => {
    const target =
      watermarkOn || fileType === "audio"
        ? (containerRef.current as HTMLElement | null)
        : (mediaRef.current as HTMLElement | null) ?? (containerRef.current as HTMLElement | null);
    if (!target) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      target.requestFullscreen?.().catch(() => {});
    }
  };

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || duration <= 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t = duration * pos;
    if (e.buttons === 1) {
      // dragging
      seekTo(t);
      return;
    }
    if (fileType !== "video" || !scrubSrc) return;
    const previewWidth = 208;
    const previewHeight = 150;
    const desiredLeft = e.clientX - previewWidth / 2;
    const left = Math.max(8, Math.min(window.innerWidth - previewWidth - 8, desiredLeft));
    const top = rect.top - previewHeight - 12;
    setScrubTime(t);
    setScrubLeft(left);
    setScrubTop(top);
    setShowScrubPreview(true);
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = t;
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || duration <= 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(duration * pos);
  };

  const tsComments =
    comments?.filter(
      (c) => (c.parentId == null) && c.timestamp != null,
    ) ?? [];

  if (hidden) return null;

  return (
    <div
      className="bg-white dark:bg-black/90 backdrop-blur px-2 pt-1 pb-2 border-t border-neutral-200 dark:border-gray-800 lg:px-3 lg:pt-1.5 lg:pb-2"
      style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom, 0px))" }}
      data-testid="share-player-controls"
    >
      <div className="flex flex-col">
        {/* Controls row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button
              onClick={togglePlay}
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-neutral-600 hover:text-neutral-900 dark:text-gray-400 dark:hover:text-[#026d55] flex-shrink-0"
              title={isPaused ? "Play" : "Pause"}
              data-testid="button-play-pause"
            >
              {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </Button>

            <div className="hidden lg:flex items-center space-x-2">
              <button
                onClick={toggleMute}
                className="text-neutral-600 hover:text-neutral-900 dark:text-gray-400 dark:hover:text-[#026d55] transition-colors"
                title={isMuted ? "Unmute" : "Mute"}
                data-testid="button-mute"
              >
                {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolume(parseFloat(e.target.value))}
                className="w-20"
                aria-label="Volume"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
            <span
              className="font-mono text-xs text-neutral-600 dark:text-gray-400 lg:text-sm tabular-nums"
              data-testid="text-time-readout"
            >
              {formatSMPTE(currentTime, frameRate)} / {formatSMPTE(duration, frameRate)}
            </span>

            {fileType === "video" && has720p && onToggleQuality && (
              <Button
                onClick={onToggleQuality}
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 px-2 text-xs font-semibold tracking-wide",
                  useOriginalQuality
                    ? "text-primary dark:text-[#3ddcb0]"
                    : "text-neutral-600 hover:text-neutral-900 dark:text-gray-400 dark:hover:text-[#026d55]",
                )}
                title={
                  useOriginalQuality
                    ? "Playing full HD (original). Click to use 720p proxy."
                    : "Playing 720p proxy. Click to play full HD (original)."
                }
                data-testid="button-toggle-hd"
              >
                {useOriginalQuality ? "HD" : "720p"}
              </Button>
            )}

            {fileType === "video" && (
              <Button
                onClick={toggleFullscreen}
                variant="ghost"
                size="icon"
                className="text-neutral-600 hover:text-neutral-900 dark:text-gray-400 dark:hover:text-[#026d55]"
                title="Toggle fullscreen"
                data-testid="button-fullscreen"
              >
                <Maximize className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>

        {/* Progress bar + comment markers rail */}
        <div className="w-full flex flex-col gap-0 relative">
          <div
            className="relative py-1 cursor-pointer"
            style={{
              touchAction: "pan-x",
              WebkitTouchCallout: "none",
              WebkitUserSelect: "none",
              userSelect: "none",
            }}
            onClick={handleProgressClick}
            onMouseMove={handleProgressMouseMove}
            onMouseLeave={() => setShowScrubPreview(false)}
            data-testid="progress-bar-extended-area"
          >
            <div
              ref={progressRef}
              className="video-progress relative h-2 bg-neutral-200 dark:bg-gray-800 hover:bg-neutral-300 dark:hover:bg-gray-700 cursor-pointer rounded-full group"
              data-testid="progress-bar"
            >
              <div
                className="video-progress-fill absolute top-0 left-0 h-full bg-primary dark:bg-[#026d55] rounded-full"
                style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
              />
              {duration > 0 && inPoint != null && outPoint != null && outPoint > inPoint && (
                <div
                  className="absolute top-0 h-full bg-amber-400/40 border-l-2 border-r-2 border-amber-400 pointer-events-none"
                  style={{
                    left: `${(inPoint / duration) * 100}%`,
                    width: `${((outPoint - inPoint) / duration) * 100}%`,
                  }}
                  data-testid="in-out-range-overlay"
                />
              )}
              {duration > 0 && inPoint != null && (
                <div
                  className="absolute -top-1 h-4 w-0.5 bg-amber-400 pointer-events-none"
                  style={{ left: `${(inPoint / duration) * 100}%` }}
                  data-testid="in-point-marker"
                />
              )}
              {duration > 0 && outPoint != null && (
                <div
                  className="absolute -top-1 h-4 w-0.5 bg-amber-400 pointer-events-none"
                  style={{ left: `${(outPoint / duration) * 100}%` }}
                  data-testid="out-point-marker"
                />
              )}
              <div
                className="playhead absolute top-1/2 -translate-y-1/2 h-4 w-4 bg-primary dark:bg-[#026d55] rounded-full shadow-md -ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
              />
            </div>
          </div>

          {/* Comment markers rail — absolutely positioned over the progress
              bar so it consumes zero vertical layout space. Critical on short
              viewports (iPhone landscape) where the player column is height-
              constrained and any extra row below the progress bar would be
              clipped by the parent's overflow-hidden. */}
          <div className="pointer-events-none absolute left-0 right-0 -bottom-2 h-5 overflow-visible" aria-hidden="true">
            {duration > 0 &&
              tsComments.map((c) => {
                const ip = c.inPoint;
                const op = c.outPoint;
                if (ip == null || op == null || op <= ip) return null;
                const left = (ip / duration) * 100;
                const width = ((op - ip) / duration) * 100;
                const isActive = activeCommentId === c.id;
                return (
                  <div
                    key={`range-${c.id}`}
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 h-1.5 rounded-sm pointer-events-none",
                      isActive ? "bg-blue-500/70" : "bg-yellow-400/70",
                    )}
                    style={{ left: `${left}%`, width: `${Math.max(width, 0.3)}%` }}
                    data-testid={`comment-range-${c.id}`}
                  />
                );
              })}

            {duration > 0 &&
              tsComments.map((c) => {
                const t = c.timestamp ?? 0;
                const pos = duration > 0 ? (t / duration) * 100 : 0;
                if (pos < 0 || pos > 100) return null;
                const isActive = activeCommentId === c.id;
                const initial = (c.authorName?.charAt(0) || "A").toUpperCase();
                return (
                  <div
                    key={c.id}
                    className="absolute -top-1 z-10 pointer-events-auto cursor-pointer"
                    style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
                    onMouseEnter={(e) => {
                      if (hideTooltipTimeoutRef.current) {
                        clearTimeout(hideTooltipTimeoutRef.current);
                        hideTooltipTimeoutRef.current = null;
                      }
                      setHoveredComment(c.id);
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
                    }}
                    onMouseLeave={() => {
                      hideTooltipTimeoutRef.current = setTimeout(() => {
                        setHoveredComment(null);
                      }, 150);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCommentClick?.(c.id);
                    }}
                    data-testid={`comment-marker-${c.id}`}
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-black shadow-md border border-white",
                        isActive ? "bg-blue-500" : "bg-yellow-400",
                      )}
                    >
                      {initial}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Comment marker hover tooltip via portal (matches auth player) */}
      {hoveredComment && tsComments.length > 0 && typeof document !== "undefined"
        ? (() => {
            const c = tsComments.find((x) => x.id === hoveredComment);
            if (!c) return null;
            return createPortal(
              <div
                className="pointer-events-none fixed"
                style={{
                  left: tooltipPos.x,
                  top: tooltipPos.y,
                  transform: "translate(-50%, calc(-100% - 8px))",
                  zIndex: 2147483647,
                  maxWidth: "240px",
                }}
              >
                <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg p-3 shadow-xl border border-gray-600">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-xs font-medium">
                      {(c.authorName?.charAt(0) || "A").toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium text-xs">{c.authorName || "Anonymous"}</span>
                      <span className="text-yellow-400 text-xs font-mono">
                        {formatSMPTE(c.timestamp ?? 0, frameRate)}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed break-words">{c.content}</p>
                </div>
              </div>,
              document.body,
            );
          })()
        : null}

      {/* Sprite-based scrub preview portal (only when scrubSrc is supplied) */}
      {showScrubPreview && duration > 0 && fileType === "video" && scrubSrc && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed pointer-events-none"
              style={{ left: `${scrubLeft}px`, top: `${scrubTop}px`, zIndex: 2147483646 }}
              data-testid="scrub-preview-portal"
            >
              <div className="bg-black/90 rounded-lg p-2 shadow-2xl border border-gray-700">
                <video
                  ref={previewVideoRef}
                  className="rounded bg-gray-800 pointer-events-none block"
                  style={{ maxWidth: "192px", maxHeight: "256px", width: "auto", height: "auto" }}
                  src={scrubSrc}
                  muted
                  playsInline
                  data-testid="video-scrub-preview"
                />
                <div className="text-white text-lg text-center mt-1 font-mono font-bold drop-shadow-lg px-2 py-1">
                  {formatSMPTE(scrubTime, frameRate)}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
