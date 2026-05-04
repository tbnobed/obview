import { useState, useRef, useEffect, useCallback } from "react";
import { File as StorageFile } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Columns2, GripVertical, Play, Pause, RotateCcw, ChevronDown } from "lucide-react";

type CompareMode = "side-by-side" | "wipe";

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

  useEffect(() => {
    const ids = versions.map(v => v.id);
    if (!ids.includes(leftVersionId)) setLeftVersionId(versions[0]?.id ?? leftVersionId);
    if (!ids.includes(rightVersionId)) setRightVersionId(versions[versions.length - 1]?.id ?? rightVersionId);
  }, [versions]);

  const handleSelectLeft = (id: number) => {
    if (id === rightVersionId) return;
    setLeftVersionId(id);
  };
  const handleSelectRight = (id: number) => {
    if (id === leftVersionId) return;
    setRightVersionId(id);
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

  const syncVideos = useCallback(() => {
    if (!leftVideoRef.current || !rightVideoRef.current) return;
    const leftTime = leftVideoRef.current.currentTime;
    if (Math.abs(rightVideoRef.current.currentTime - leftTime) > 0.1) {
      rightVideoRef.current.currentTime = leftTime;
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
      rightVideo.play().catch(() => {});
      startRaf();
    };

    const handlePause = () => {
      setIsPlaying(false);
      rightVideo.pause();
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode !== 'wipe') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setWipePosition(p => Math.max(0, p - 2));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setWipePosition(p => Math.min(100, p + 2));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode]);

  const formatTime = (time: number) => {
    if (time == null || isNaN(time)) return "00:00:00:00";
    const fps = 30;
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

  const renderMedia = (fileId: number, ref: React.RefObject<HTMLVideoElement>, version: StorageFile | undefined) => {
    if (!version) return <div className="w-full h-full bg-gray-900 flex items-center justify-center text-gray-500">No version selected</div>;
    if (version.fileType === 'image') {
      return <img src={mediaUrl(fileId)} alt={version.filename} className="w-full h-full object-contain" />;
    }
    return (
      <video
        ref={ref}
        className="w-full h-full object-contain"
        preload="metadata"
        playsInline
        muted={false}
      >
        <source src={mediaUrl(fileId)} type="video/mp4" />
      </video>
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
          <span className="text-gray-500 text-xs">vs</span>
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

      <div className="flex-1 min-h-0 bg-black relative" ref={containerRef}>
        {mode === 'side-by-side' ? (
          <div className="flex w-full h-full">
            <div className="flex-1 relative border-r" style={{ borderColor: 'hsl(210, 15%, 25%)' }}>
              <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600/80 text-white">
                A — v{leftVersion?.version}
              </div>
              {renderMedia(leftVersionId, leftVideoRef, leftVersion)}
            </div>
            <div className="flex-1 relative">
              <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600/80 text-white">
                B — v{rightVersion?.version}
              </div>
              {renderMedia(rightVersionId, rightVideoRef, rightVersion)}
            </div>
          </div>
        ) : (
          <div className="relative w-full h-full overflow-hidden select-none">
            <div className="absolute inset-0">
              {renderMedia(rightVersionId, rightVideoRef, rightVersion)}
            </div>
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${wipePosition}%` }}
            >
              <div style={{ width: containerRef.current?.offsetWidth || '100%', height: '100%' }}>
                {renderMedia(leftVersionId, leftVideoRef, leftVersion)}
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

      {isVideo && (
        <div className="flex items-center gap-3 px-3 py-2 bg-black/90 border-t shrink-0" style={{ borderColor: 'hsl(210, 15%, 18%)' }}>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-gray-700" onClick={togglePlay}>
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:bg-gray-700 hover:text-white" onClick={restartBoth}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs font-mono text-gray-400 min-w-[45px]">{formatTime(currentTime)}</span>
          <input
            type="range" min={0} max={duration || 0} step={0.01} value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1 accent-white cursor-pointer"
          />
          <span className="text-xs font-mono text-gray-400 min-w-[45px]">{formatTime(duration)}</span>
        </div>
      )}
    </div>
  );
}
