import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { File as StorageFile } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Columns2, GripVertical, Play, Pause, RotateCcw, ChevronDown, Loader2, AlertTriangle, ArrowLeftRight, MessageSquare, Volume2 } from "lucide-react";

type CompareMode = "side-by-side" | "wipe";
type MediaStatus = "loading" | "ready" | "error";

interface VersionCompareProps {
  versions: StorageFile[];
  onClose: () => void;
  projectId: number;
}

export default function VersionCompare({ versions, onClose, projectId }: VersionCompareProps) {
  const [mode, setMode] = useState<CompareMode>("wipe");
  const [leftVersionId, setLeftVersionId] = useState<number>(versions.length >= 2 ? versions[versions.length - 2].id : versions[0].id);
  const [rightVersionId, setRightVersionId] = useState<number>(versions[versions.length - 1].id);
  const [wipePosition, setWipePosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showLeftPicker, setShowLeftPicker] = useState(false);
  const [showRightPicker, setShowRightPicker] = useState(false);

  const leftVideoRef = useRef<HTMLVideoElement>(null);
  const rightVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const leftPickerRef = useRef<HTMLDivElement>(null);
  const rightPickerRef = useRef<HTMLDivElement>(null);
  const savedTimeRef = useRef(0);
  const savedPlayingRef = useRef(false);

  const leftVersion = versions.find(v => v.id === leftVersionId);
  const rightVersion = versions.find(v => v.id === rightVersionId);

  const isVideo = leftVersion?.fileType === 'video' || rightVersion?.fileType === 'video';

  const [leftStatus, setLeftStatus] = useState<MediaStatus>('loading');
  const [rightStatus, setRightStatus] = useState<MediaStatus>('loading');
  const [containerWidth, setContainerWidth] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [audioSide, setAudioSide] = useState<'A' | 'B'>('A');

  // Real frame rate per version (stored on videoProcessing). The compare UI
  // previously hardcoded 30fps, making the timecode readout and frame-stepping
  // wrong for 24/25/60fps clips. A (left) is the master, so its fps drives the
  // controls; we also surface a mismatch warning when B differs.
  const leftProcessing = useQuery<any>({
    queryKey: ['/api/files', leftVersionId, 'processing'],
    queryFn: () => apiRequest('GET', `/api/files/${leftVersionId}/processing`),
    enabled: leftVersion?.fileType === 'video',
    staleTime: 60_000,
    retry: false,
  });
  const rightProcessing = useQuery<any>({
    queryKey: ['/api/files', rightVersionId, 'processing'],
    queryFn: () => apiRequest('GET', `/api/files/${rightVersionId}/processing`),
    enabled: rightVersion?.fileType === 'video',
    staleTime: 60_000,
    retry: false,
  });
  const toFps = (d: any) => { const n = Number(d?.frameRate); return n > 0 ? n : 30; };
  const fps = toFps(leftProcessing.data);
  const rightFps = toFps(rightProcessing.data);
  const fpsMismatch = isVideo && Math.round(fps) !== Math.round(rightFps);

  // Read-only comments for both versions, shown as scrub-bar markers + a side
  // panel. A and B are color-coded (blue / emerald) to match the version labels.
  const leftComments = useQuery<any[]>({
    queryKey: ['/api/files', leftVersionId, 'comments'],
    queryFn: () => apiRequest('GET', `/api/files/${leftVersionId}/comments`),
    enabled: isVideo,
    staleTime: 30_000,
  });
  const rightComments = useQuery<any[]>({
    queryKey: ['/api/files', rightVersionId, 'comments'],
    queryFn: () => apiRequest('GET', `/api/files/${rightVersionId}/comments`),
    enabled: isVideo,
    staleTime: 30_000,
  });
  const toMarkers = (arr: any[] | undefined, side: 'A' | 'B') =>
    (arr || []).filter(c => c.timestamp != null).map(c => ({ ...c, side }));
  const allComments = [
    ...toMarkers(leftComments.data, 'A'),
    ...toMarkers(rightComments.data, 'B'),
  ].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  useEffect(() => {
    const ids = versions.map(v => v.id);
    if (!ids.includes(leftVersionId)) setLeftVersionId(versions[0]?.id ?? leftVersionId);
    if (!ids.includes(rightVersionId)) setRightVersionId(versions[versions.length - 1]?.id ?? rightVersionId);
  }, [versions]);

  // Reset the per-pane load state whenever the selected version changes so the
  // spinner shows again while the newly-keyed <video> fetches its source.
  useEffect(() => { setLeftStatus('loading'); }, [leftVersionId]);
  useEffect(() => { setRightStatus('loading'); }, [rightVersionId]);

  // Track the real container width (ResizeObserver) instead of reading
  // containerRef.offsetWidth during render — the latter is stale on first paint
  // and after resize, which made the wipe overlay misalign with the background.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  const handleSelectLeft = (id: number) => {
    if (id === rightVersionId) return;
    setLeftVersionId(id);
  };
  const handleSelectRight = (id: number) => {
    if (id === leftVersionId) return;
    setRightVersionId(id);
  };
  const swapVersions = () => {
    setLeftVersionId(rightVersionId);
    setRightVersionId(leftVersionId);
  };

  useEffect(() => {
    savedTimeRef.current = currentTime;
    savedPlayingRef.current = isPlaying;
  }, [mode]);

  useEffect(() => {
    const leftVideo = leftVideoRef.current;
    const rightVideo = rightVideoRef.current;
    if (!leftVideo || !rightVideo) return;

    leftVideo.currentTime = savedTimeRef.current;
    rightVideo.currentTime = savedTimeRef.current;

    if (savedPlayingRef.current) {
      leftVideo.play().catch(() => {});
      rightVideo.play().catch(() => {});
    }
  }, [mode]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (leftPickerRef.current && !leftPickerRef.current.contains(e.target as Node)) {
        setShowLeftPicker(false);
      }
      if (rightPickerRef.current && !rightPickerRef.current.contains(e.target as Node)) {
        setShowRightPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // A (left) is the master clock. Rather than hard-snapping B's currentTime on
  // every tiny drift (which caused visible stutter), nudge B's playbackRate to
  // converge smoothly and only hard-seek on a large gap (after a seek or stall).
  // When A is the audible side these nudges are inaudible; if B is selected for
  // audio (audioSide === 'B') its small rate nudges can be faintly audible.
  const syncVideos = useCallback(() => {
    const lv = leftVideoRef.current;
    const rv = rightVideoRef.current;
    if (!lv || !rv) return;
    const drift = rv.currentTime - lv.currentTime;
    if (Math.abs(drift) > 0.3) {
      rv.currentTime = lv.currentTime;
      rv.playbackRate = lv.playbackRate;
    } else if (!lv.paused && Math.abs(drift) > 0.04) {
      rv.playbackRate = lv.playbackRate * (drift > 0 ? 0.96 : 1.04);
    } else {
      rv.playbackRate = lv.playbackRate;
    }
  }, []);

  useEffect(() => {
    const leftVideo = leftVideoRef.current;
    const rightVideo = rightVideoRef.current;
    if (!leftVideo || !rightVideo) return;

    let raf = 0;
    const tick = () => {
      setCurrentTime(leftVideo.currentTime);
      syncVideos();
      raf = requestAnimationFrame(tick);
    };
    const startRaf = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const stopRaf = () => {
      cancelAnimationFrame(raf);
      setCurrentTime(leftVideo.currentTime);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(leftVideo.currentTime);
      syncVideos();
    };

    const handleDurationChange = () => {
      setDuration(Math.max(leftVideo.duration || 0, rightVideo.duration || 0));
    };

    const handlePlay = () => {
      setIsPlaying(true);
      rightVideo.currentTime = leftVideo.currentTime;
      rightVideo.playbackRate = leftVideo.playbackRate;
      rightVideo.play().catch(() => {});
      startRaf();
    };

    const handlePause = () => {
      setIsPlaying(false);
      rightVideo.pause();
      rightVideo.playbackRate = leftVideo.playbackRate;
      stopRaf();
    };

    leftVideo.addEventListener('timeupdate', handleTimeUpdate);
    leftVideo.addEventListener('durationchange', handleDurationChange);
    leftVideo.addEventListener('play', handlePlay);
    leftVideo.addEventListener('playing', handlePlay);
    leftVideo.addEventListener('pause', handlePause);
    leftVideo.addEventListener('seeked', stopRaf);
    leftVideo.addEventListener('ended', handlePause);
    rightVideo.addEventListener('durationchange', handleDurationChange);

    if (!leftVideo.paused) startRaf();

    return () => {
      cancelAnimationFrame(raf);
      leftVideo.removeEventListener('timeupdate', handleTimeUpdate);
      leftVideo.removeEventListener('durationchange', handleDurationChange);
      leftVideo.removeEventListener('play', handlePlay);
      leftVideo.removeEventListener('playing', handlePlay);
      leftVideo.removeEventListener('pause', handlePause);
      leftVideo.removeEventListener('seeked', stopRaf);
      leftVideo.removeEventListener('ended', handlePause);
      rightVideo.removeEventListener('durationchange', handleDurationChange);
    };
  }, [leftVersionId, rightVersionId, mode, syncVideos]);

  const togglePlay = () => {
    const leftVideo = leftVideoRef.current;
    const rightVideo = rightVideoRef.current;
    if (!leftVideo || !rightVideo) return;

    if (isPlaying) {
      leftVideo.pause();
      rightVideo.pause();
    } else {
      rightVideo.currentTime = leftVideo.currentTime;
      leftVideo.play().catch(() => {});
      rightVideo.play().catch(() => {});
    }
  };

  const restartBoth = () => {
    const leftVideo = leftVideoRef.current;
    const rightVideo = rightVideoRef.current;
    if (!leftVideo || !rightVideo) return;
    leftVideo.currentTime = 0;
    rightVideo.currentTime = 0;
    setCurrentTime(0);
  };

  const seekTo = (t: number) => {
    const lv = leftVideoRef.current;
    const rv = rightVideoRef.current;
    const dur = Math.max(lv?.duration || 0, rv?.duration || 0, duration);
    const clamped = Math.max(0, Math.min(dur || t, t));
    if (lv) lv.currentTime = clamped;
    if (rv) rv.currentTime = clamped;
    setCurrentTime(clamped);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (leftVideoRef.current) leftVideoRef.current.currentTime = time;
    if (rightVideoRef.current) rightVideoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleWipeMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setWipePosition(pct);
  }, []);

  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    handleWipeMove(clientX);
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => handleWipeMove(e.clientX);
    const handleMouseUp = () => setIsDragging(false);
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      handleWipeMove(e.touches[0].clientX);
    };
    const handleTouchEnd = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, handleWipeMove]);

  useEffect(() => {
    const FPS = fps;
    const seekBoth = (t: number) => {
      const lv = leftVideoRef.current;
      const rv = rightVideoRef.current;
      const dur = Math.max(lv?.duration || 0, rv?.duration || 0, duration);
      const clamped = Math.max(0, Math.min(dur || t, t));
      if (lv) lv.currentTime = clamped;
      if (rv) rv.currentTime = clamped;
      setCurrentTime(clamped);
    };
    const stepFrames = (frames: number) => {
      const lv = leftVideoRef.current;
      if (!lv) return;
      if (!lv.paused) {
        lv.pause();
        rightVideoRef.current?.pause();
      }
      seekBoth(lv.currentTime + frames / FPS);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.contentEditable === 'true'
      ) return;

      switch (e.code) {
        case 'Space':
        case 'KeyK': {
          e.preventDefault();
          const lv = leftVideoRef.current;
          const rv = rightVideoRef.current;
          if (!lv || !rv) break;
          if (lv.paused) {
            rv.currentTime = lv.currentTime;
            lv.play().catch(() => {});
            rv.play().catch(() => {});
          } else {
            lv.pause();
            rv.pause();
          }
          break;
        }
        case 'KeyJ':
          e.preventDefault();
          seekBoth((leftVideoRef.current?.currentTime ?? 0) - (e.shiftKey ? 10 : 5));
          break;
        case 'KeyL':
          e.preventDefault();
          seekBoth((leftVideoRef.current?.currentTime ?? 0) + (e.shiftKey ? 10 : 5));
          break;
        case 'KeyM': {
          e.preventDefault();
          setAudioSide(s => (s === 'A' ? 'B' : 'A'));
          break;
        }
        case 'Home':
          e.preventDefault();
          seekBoth(0);
          break;
        case 'End':
          e.preventDefault();
          seekBoth(duration || 0);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (mode === 'wipe' && !e.shiftKey) {
            setWipePosition(p => Math.max(0, p - 2));
          } else {
            stepFrames(e.shiftKey ? -10 : -1);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (mode === 'wipe' && !e.shiftKey) {
            setWipePosition(p => Math.min(100, p + 2));
          } else {
            stepFrames(e.shiftKey ? 10 : 1);
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, duration, fps]);

  const formatTime = (time: number) => {
    if (time == null || isNaN(time)) return "00:00:00:00";
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    const frames = Math.min(
      Math.floor((time - Math.floor(time)) * fps),
      Math.max(0, Math.round(fps) - 1)
    );
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
  };

  const mediaUrl = (fileId: number) => `/api/files/${fileId}/content`;

  const VersionPicker = ({ selectedId, onSelect, otherSelectedId, label, side, show, setShow, pickerRef }: { 
    selectedId: number; onSelect: (id: number) => void; otherSelectedId: number; label: string; side: 'left' | 'right';
    show: boolean; setShow: (v: boolean) => void; pickerRef: React.RefObject<HTMLDivElement>;
  }) => {
    const selected = versions.find(v => v.id === selectedId);
    return (
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShow(!show)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            side === 'left' 
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30' 
              : 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30'
          }`}
        >
          <span>{label}: v{selected?.version || '?'}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
        {show && (
          <div className="absolute top-full mt-1 z-50 rounded-md border shadow-lg py-1 min-w-[180px]"
            style={{ backgroundColor: 'hsl(210, 20%, 12%)', borderColor: 'hsl(210, 15%, 18%)' }}>
            {versions.map(v => {
              const isOther = v.id === otherSelectedId;
              return (
                <button
                  key={v.id}
                  onClick={() => { if (!isOther) { onSelect(v.id); setShow(false); } }}
                  disabled={isOther}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                    isOther
                      ? 'text-gray-600 cursor-not-allowed'
                      : v.id === selectedId
                        ? 'text-white bg-gray-700/50'
                        : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <span>Version {v.version}{v.isLatestVersion ? ' (latest)' : ''}{isOther ? ` (${side === 'left' ? 'B' : 'A'})` : ''}</span>
                  <span className="text-gray-500 text-[10px]">{new Date(v.createdAt).toLocaleDateString()}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderMedia = (fileId: number, ref: React.RefObject<HTMLVideoElement>, version: StorageFile | undefined, side: 'left' | 'right') => {
    if (!version) return <div className="w-full h-full bg-gray-900 flex items-center justify-center text-gray-500">No version selected</div>;
    const status = side === 'left' ? leftStatus : rightStatus;
    const setStatus = side === 'left' ? setLeftStatus : setRightStatus;

    const overlay = (
      <>
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
            <Loader2 className="h-6 w-6 text-white/80 animate-spin" />
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-gray-300 px-4 text-center pointer-events-none">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
            <span className="text-xs">Couldn't load v{version.version}. It may still be processing.</span>
          </div>
        )}
      </>
    );

    if (version.fileType === 'image') {
      return (
        <div className="w-full h-full relative">
          <img
            key={fileId}
            src={mediaUrl(fileId)}
            alt={version.filename}
            className="w-full h-full object-contain"
            onLoad={() => setStatus('ready')}
            onError={() => setStatus('error')}
          />
          {overlay}
        </div>
      );
    }
    // key={fileId} forces a full remount when the selected version changes —
    // browsers won't reload a <video> just because a child <source>'s src
    // changes, which is why switching A/B previously showed a stale/blank pane.
    // Exactly one pane is audible at a time (audioSide); the other is muted so
    // both tracks don't echo each other (offset by sync drift + any encoding
    // latency difference between versions).
    return (
      <div className="w-full h-full relative">
        <video
          key={fileId}
          ref={ref}
          className="w-full h-full object-contain"
          preload="metadata"
          playsInline
          muted={side === 'left' ? audioSide !== 'A' : audioSide !== 'B'}
          onLoadedData={() => setStatus('ready')}
          onCanPlay={() => setStatus('ready')}
          onError={() => setStatus('error')}
        >
          <source src={mediaUrl(fileId)} type="video/mp4" />
        </video>
        {overlay}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <DialogHeader className="sr-only">
        <DialogTitle>Compare Versions</DialogTitle>
        <DialogDescription>Side-by-side or wipe comparison of file versions</DialogDescription>
      </DialogHeader>

      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{ borderColor: 'hsl(210, 15%, 18%)' }}>
        <div className="flex items-center gap-2">
          <VersionPicker selectedId={leftVersionId} onSelect={handleSelectLeft} otherSelectedId={rightVersionId} label="A" side="left"
            show={showLeftPicker} setShow={setShowLeftPicker} pickerRef={leftPickerRef as React.RefObject<HTMLDivElement>} />
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-gray-400 hover:bg-gray-700 hover:text-white"
            onClick={swapVersions}
            title="Swap A and B"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </Button>
          <VersionPicker selectedId={rightVersionId} onSelect={handleSelectRight} otherSelectedId={leftVersionId} label="B" side="right"
            show={showRightPicker} setShow={setShowRightPicker} pickerRef={rightPickerRef as React.RefObject<HTMLDivElement>} />
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="sm"
            className={`h-7 px-2 text-xs ${mode === 'wipe' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
            onClick={() => setMode('wipe')}
          >
            <GripVertical className="h-3.5 w-3.5 mr-1" /> Wipe
          </Button>
          <Button
            variant="ghost" size="sm"
            className={`h-7 px-2 text-xs ${mode === 'side-by-side' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
            onClick={() => setMode('side-by-side')}
          >
            <Columns2 className="h-3.5 w-3.5 mr-1" /> Side by Side
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-400" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
      <div className="flex-1 min-h-0 bg-black relative" ref={containerRef}>
        {mode === 'side-by-side' ? (
          <div className="flex w-full h-full">
            <div className="flex-1 relative border-r" style={{ borderColor: 'hsl(210, 15%, 25%)' }}>
              <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600/80 text-white">
                A — v{leftVersion?.version}
              </div>
              {renderMedia(leftVersionId, leftVideoRef, leftVersion, 'left')}
            </div>
            <div className="flex-1 relative">
              <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600/80 text-white">
                B — v{rightVersion?.version}
              </div>
              {renderMedia(rightVersionId, rightVideoRef, rightVersion, 'right')}
            </div>
          </div>
        ) : (
          <div className="relative w-full h-full overflow-hidden select-none">
            <div className="absolute inset-0">
              {renderMedia(rightVersionId, rightVideoRef, rightVersion, 'right')}
            </div>
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${wipePosition}%` }}
            >
              <div style={{ width: containerWidth || '100%', height: '100%' }}>
                {renderMedia(leftVersionId, leftVideoRef, leftVersion, 'left')}
              </div>
            </div>

            <div
              className="absolute top-0 bottom-0 z-20 cursor-col-resize"
              style={{ left: `${wipePosition}%`, transform: 'translateX(-50%)', width: '32px' }}
              onMouseDown={startDrag}
              onTouchStart={startDrag}
              role="slider"
              aria-label="Wipe position"
              aria-valuenow={Math.round(wipePosition)}
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={0}
            >
              <div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-full bg-white/80 shadow-lg" />
              <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white/90 shadow-lg flex items-center justify-center">
                <GripVertical className="h-4 w-4 text-gray-800" />
              </div>
            </div>

            <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600/80 text-white pointer-events-none">
              A — v{leftVersion?.version}
            </div>
            <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600/80 text-white pointer-events-none">
              B — v{rightVersion?.version}
            </div>
          </div>
        )}
      </div>
        {showComments && isVideo && (
          <aside className="w-72 shrink-0 border-l overflow-y-auto" style={{ borderColor: 'hsl(210, 15%, 18%)', backgroundColor: 'hsl(210, 20%, 10%)' }}>
            <div className="px-3 py-2 text-xs font-semibold text-gray-300 border-b sticky top-0 z-10" style={{ borderColor: 'hsl(210, 15%, 18%)', backgroundColor: 'hsl(210, 20%, 10%)' }}>
              Comments ({allComments.length})
            </div>
            {allComments.length === 0 ? (
              <div className="p-4 text-xs text-gray-500">No timestamped comments on either version.</div>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'hsl(210, 15%, 18%)' }}>
                {allComments.map(c => (
                  <li key={`${c.side}-${c.id}`}>
                    <button
                      onClick={() => { setActiveCommentId(c.id); seekTo(c.timestamp || 0); }}
                      className={`w-full text-left px-3 py-2 hover:bg-white/5 transition-colors ${activeCommentId === c.id ? 'bg-white/10' : ''}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${c.side === 'A' ? 'bg-blue-600/80 text-white' : 'bg-emerald-600/80 text-white'}`}>{c.side}</span>
                        <span className="text-[11px] text-gray-300 truncate">{c.authorName || c.user?.name || 'Anonymous'}</span>
                        <span className="ml-auto text-[10px] font-mono text-gray-500 shrink-0">{formatTime(c.timestamp || 0)}</span>
                      </div>
                      <div className="text-xs text-gray-400 line-clamp-2">{c.content}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>

      {isVideo && (
        <div className="flex items-center gap-3 px-3 py-2 bg-black/90 border-t shrink-0" style={{ borderColor: 'hsl(210, 15%, 18%)' }}>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-gray-700" onClick={togglePlay}>
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:bg-gray-700 hover:text-white" onClick={restartBoth}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="sm"
            className="h-7 px-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white"
            onClick={() => setAudioSide(s => (s === 'A' ? 'B' : 'A'))}
            title="Switch which version plays audio (M)"
          >
            <Volume2 className="h-3.5 w-3.5 mr-1" />
            <span className={`font-bold ${audioSide === 'A' ? 'text-blue-400' : 'text-emerald-400'}`}>{audioSide}</span>
          </Button>
          <span className="text-xs font-mono text-gray-400 min-w-[45px]">{formatTime(currentTime)}</span>
          {fpsMismatch && (
            <span
              className="flex items-center gap-1 text-[10px] text-amber-400 whitespace-nowrap"
              title={`A is ${Math.round(fps)}fps, B is ${Math.round(rightFps)}fps — frame-stepping and timecode use A`}
            >
              <AlertTriangle className="h-3 w-3" /> {Math.round(fps)}/{Math.round(rightFps)}fps
            </span>
          )}
          <div className="flex-1 relative flex items-center">
            <input
              type="range" min={0} max={duration || 0} step={0.01} value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 accent-white cursor-pointer relative z-10"
            />
            {duration > 0 && allComments.map(c => {
              const pct = Math.max(0, Math.min(100, ((c.timestamp || 0) / duration) * 100));
              return (
                <button
                  key={`m-${c.side}-${c.id}`}
                  onClick={() => { setActiveCommentId(c.id); seekTo(c.timestamp || 0); }}
                  title={`${c.side} · ${formatTime(c.timestamp || 0)} · ${c.content}`}
                  className={`absolute -top-1 w-2 h-2 rounded-full border border-white/70 -translate-x-1/2 z-20 ${c.side === 'A' ? 'bg-blue-500' : 'bg-emerald-500'} ${activeCommentId === c.id ? 'ring-2 ring-white' : ''}`}
                  style={{ left: `${pct}%` }}
                />
              );
            })}
          </div>
          <span className="text-xs font-mono text-gray-400 min-w-[45px]">{formatTime(duration)}</span>
          <Button
            variant="ghost" size="sm"
            className={`h-7 px-2 text-xs ${showComments ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
            onClick={() => setShowComments(s => !s)}
            title="Toggle comments"
          >
            <MessageSquare className="h-3.5 w-3.5 mr-1" /> {allComments.length}
          </Button>
        </div>
      )}
    </div>
  );
}
