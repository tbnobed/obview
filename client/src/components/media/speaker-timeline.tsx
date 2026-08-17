import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";

// Persisted show/hide preference for the speaker strip (all files, all sessions).
const HIDDEN_KEY = "speaker_timeline_hidden";
function readHiddenPref(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string | null;
}

interface TranscriptLite {
  status: string;
  segments: TranscriptSegment[] | null;
}

/** "SPEAKER_00" -> "Speaker 1". Non-standard labels pass through. */
function formatSpeakerLabel(raw: string): string {
  const m = /^SPEAKER_(\d+)$/i.exec(raw);
  if (m) return `Speaker ${parseInt(m[1], 10) + 1}`;
  return raw;
}

// Solid-block palette matching the transcript view's badge colors
// (same hues, bg variants), cycled per distinct speaker.
const SPEAKER_BLOCK_COLORS = [
  "bg-blue-500 dark:bg-blue-400",
  "bg-emerald-500 dark:bg-emerald-400",
  "bg-purple-500 dark:bg-purple-400",
  "bg-amber-500 dark:bg-amber-400",
  "bg-rose-500 dark:bg-rose-400",
  "bg-cyan-500 dark:bg-cyan-400",
];
const SPEAKER_TEXT_COLORS = [
  "text-blue-600 dark:text-blue-400",
  "text-emerald-600 dark:text-emerald-400",
  "text-purple-600 dark:text-purple-400",
  "text-amber-600 dark:text-amber-400",
  "text-rose-600 dark:text-rose-400",
  "text-cyan-600 dark:text-cyan-400",
];

/** Merge a speaker's consecutive segments when the gap between them is tiny,
 * so the strip renders solid talk-blocks instead of confetti. */
function mergeBlocks(segs: TranscriptSegment[], maxGap = 0.75): Array<{ start: number; end: number }> {
  const blocks: Array<{ start: number; end: number }> = [];
  for (const s of segs) {
    const last = blocks[blocks.length - 1];
    if (last && s.start - last.end <= maxGap) {
      last.end = Math.max(last.end, s.end);
    } else {
      blocks.push({ start: s.start, end: s.end });
    }
  }
  return blocks;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  fileId: number;
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  /** Override the API base (e.g. share pages). Defaults to /api/files/:id */
  apiBase?: string;
  /** Override the react-query key so share pages don't collide with the app cache. */
  queryKey?: readonly unknown[];
}

/**
 * Clickable per-speaker strip rendered under the playback controls.
 * One row per detected speaker; colored blocks mark when they talk.
 * Clicking a block seeks to its start; clicking row background seeks
 * proportionally. Renders nothing until a diarized transcript exists.
 */
export default function SpeakerTimeline({
  fileId,
  duration,
  currentTime,
  onSeek,
  apiBase,
  queryKey,
}: Props) {
  const base = apiBase || `/api/files/${fileId}`;
  const qKey = queryKey || ["/api/files", fileId, "transcript"];

  // Shares the react-query cache entry with TranscriptView (same key), so
  // opening the transcript tab and this strip cost one request total.
  const { data: transcript } = useQuery<TranscriptLite | null>({
    queryKey: qKey,
    queryFn: async () => {
      const res = await fetch(`${base}/transcript`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Failed to load transcript (${res.status})`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const speakerRows = useMemo(() => {
    const segments = transcript?.segments || [];
    const bySpeaker = new Map<string, TranscriptSegment[]>();
    for (const s of segments) {
      if (!s.speaker) continue;
      const list = bySpeaker.get(s.speaker) || [];
      list.push(s);
      bySpeaker.set(s.speaker, list);
    }
    return Array.from(bySpeaker.entries()).map(([speaker, segs], idx) => ({
      speaker,
      label: formatSpeakerLabel(speaker),
      colorIdx: idx % SPEAKER_BLOCK_COLORS.length,
      blocks: mergeBlocks(segs),
    }));
  }, [transcript?.segments]);

  const [hidden, setHidden] = useState<boolean>(readHiddenPref);
  const toggleHidden = () => {
    setHidden((h) => {
      const next = !h;
      try {
        localStorage.setItem(HIDDEN_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  if (!duration || duration <= 0 || speakerRows.length === 0) return null;

  if (hidden) {
    return (
      <div className="mt-1 select-none" data-testid="speaker-timeline-collapsed">
        <button
          onClick={toggleHidden}
          className="flex items-center gap-1.5 rounded-md border border-neutral-200 dark:border-gray-700 bg-neutral-100 dark:bg-gray-800 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
          title="Show speaker view"
          data-testid="button-show-speakers"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Speakers ({speakerRows.length})
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1 space-y-0.5 select-none" data-testid="speaker-timeline">
      <div className="flex items-center">
        <button
          onClick={toggleHidden}
          className="flex items-center gap-1.5 rounded-md border border-neutral-200 dark:border-gray-700 bg-neutral-100 dark:bg-gray-800 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
          title="Hide speaker view"
          data-testid="button-hide-speakers"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          Speakers
        </button>
      </div>
      {speakerRows.map((row) => (
        <div key={row.speaker} className="flex items-center gap-2 group/speaker">
          <span
            className={`w-16 shrink-0 text-[10px] font-medium leading-none truncate text-right ${SPEAKER_TEXT_COLORS[row.colorIdx]}`}
            title={row.label}
          >
            {row.label}
          </span>
          <div
            className="relative h-2.5 flex-1 rounded-sm bg-neutral-200/60 dark:bg-gray-800/80 cursor-pointer overflow-hidden hover:bg-neutral-300/60 dark:hover:bg-gray-700/80 transition-colors"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pos = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
              onSeek(pos * duration);
            }}
            data-testid={`speaker-row-${row.colorIdx}`}
          >
            {row.blocks.map((b, i) => {
              const left = (b.start / duration) * 100;
              const width = Math.max(((b.end - b.start) / duration) * 100, 0.3);
              return (
                <div
                  key={i}
                  className={`absolute top-0 h-full rounded-[1px] ${SPEAKER_BLOCK_COLORS[row.colorIdx]} opacity-80 hover:opacity-100`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${row.label} · ${formatTime(b.start)} – ${formatTime(b.end)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeek(b.start);
                  }}
                />
              );
            })}
            {/* playhead line */}
            <div
              className="absolute top-0 h-full w-px bg-white/80 dark:bg-white/60 pointer-events-none"
              style={{ left: `${Math.min((currentTime / duration) * 100, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
