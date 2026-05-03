import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  RefreshCcw,
  Download,
  FileText,
  AlertCircle,
  Search,
  ChevronDown,
} from "lucide-react";

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface Transcript {
  id: number;
  fileId: number;
  status: "pending" | "processing" | "completed" | "failed";
  language: string | null;
  modelName: string | null;
  segments: TranscriptSegment[] | null;
  text: string | null;
  errorMessage: string | null;
  processedAt: string | null;
  summary: string | null;
  summaryStatus: "pending" | "processing" | "completed" | "failed" | null;
  summaryError: string | null;
  summaryModel: string | null;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  fileId: number;
  currentTime: number;
  onSeek: (time: number) => void;
  apiBase?: string;
  readOnly?: boolean;
  allowDownloads?: boolean;
  queryKey?: readonly unknown[];
}

export default function TranscriptView({
  fileId,
  currentTime,
  onSeek,
  apiBase,
  readOnly = false,
  allowDownloads = true,
  queryKey,
}: Props) {
  const base = apiBase || `/api/files/${fileId}`;
  const qKey = queryKey || ["/api/files", fileId, "transcript"];
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const { data: transcript, isLoading, error, refetch } = useQuery<Transcript>({
    queryKey: qKey,
    queryFn: async () => {
      const res = await fetch(`${base}/transcript`, {
        credentials: "include",
      });
      if (res.status === 404) return null as any;
      if (!res.ok) throw new Error(`Failed to load transcript (${res.status})`);
      return res.json();
    },
    refetchInterval: (q) => {
      const data = q.state.data as Transcript | null | undefined;
      if (!data) return 5000;
      if (data.status === "pending" || data.status === "processing") return 4000;
      if (data.summaryStatus === "pending" || data.summaryStatus === "processing") return 4000;
      return false;
    },
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `${base}/transcript/regenerate`);
    },
    onSuccess: () => {
      toast({
        title: "Transcription started",
        description: "This may take a moment depending on the length of the file.",
      });
      queryClient.invalidateQueries({ queryKey: qKey });
    },
    onError: (err: Error) =>
      toast({
        title: "Failed to start transcription",
        description: err.message,
        variant: "destructive",
      }),
  });

  const segments = transcript?.segments || [];
  const filteredSegments = useMemo(() => {
    if (!search.trim()) return segments;
    const q = search.toLowerCase();
    return segments.filter((s) => s.text.toLowerCase().includes(q));
  }, [segments, search]);

  const activeIndex = useMemo(() => {
    if (!segments.length) return -1;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (currentTime >= segments[i].start) return i;
    }
    return -1;
  }, [segments, currentTime]);

  // Auto-scroll active line into view
  useEffect(() => {
    if (!autoScroll || activeIndex < 0 || search) return;
    const el = activeRef.current;
    if (el && containerRef.current) {
      const cRect = containerRef.current.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      if (eRect.top < cRect.top || eRect.bottom > cRect.bottom) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeIndex, autoScroll, search]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-neutral-500 dark:text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading transcript…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Couldn't load transcript: {(error as Error).message}</span>
      </div>
    );
  }

  // No transcript yet
  if (!transcript) {
    return (
      <div className="p-6 text-center">
        <FileText className="h-10 w-10 mx-auto text-neutral-400 mb-3" />
        <h4 className="font-medium text-neutral-900 dark:text-white">No transcript yet</h4>
        <p className="text-sm text-neutral-500 dark:text-gray-400 mt-1 mb-4">
          {readOnly
            ? "The owner hasn't generated a transcript for this file yet."
            : "Generate a transcript for this file to see it here."}
        </p>
        {!readOnly && (
          <Button onClick={() => regenerate.mutate()} disabled={regenerate.isPending}>
            {regenerate.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4 mr-2" />
            )}
            Generate transcript
          </Button>
        )}
      </div>
    );
  }

  if (transcript.status === "pending" || transcript.status === "processing") {
    return (
      <div className="p-6 text-center">
        <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary mb-3" />
        <h4 className="font-medium text-neutral-900 dark:text-white">
          Transcribing…
        </h4>
        <p className="text-sm text-neutral-500 dark:text-gray-400 mt-1">
          {transcript.modelName?.startsWith("spark")
            ? `Running on Spark (${transcript.modelName.replace(/^spark:?/, "") || "whisper"}).`
            : `Using ${transcript.modelName || "whisper"} model.`}{" "}
          This page will update automatically.
        </p>
      </div>
    );
  }

  if (transcript.status === "failed") {
    return (
      <div className="p-6">
        <div className="flex items-start gap-2 mb-4 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Transcription failed</div>
            <div className="text-xs mt-1 break-words">
              {transcript.errorMessage || "Unknown error"}
            </div>
          </div>
        </div>
        {!readOnly && (
          <Button onClick={() => regenerate.mutate()} disabled={regenerate.isPending}>
            {regenerate.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4 mr-2" />
            )}
            Try again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 flex-1">
      <div className="px-4 py-2 border-b border-neutral-200 dark:border-gray-800 flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
          <Input
            placeholder="Search transcript…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-8 text-sm"
          />
        </div>
        {allowDownloads && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 px-2">
                <Download className="h-4 w-4 mr-1" />
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a href={`${base}/transcript.txt`} download>
                  Download .txt
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`${base}/transcript.srt`} download>
                  Download .srt
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`${base}/transcript.vtt`} download>
                  Download .vtt
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending}
            title="Regenerate transcript"
          >
            {regenerate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto px-2 py-2">
        {filteredSegments.length === 0 ? (
          <div className="text-center text-sm text-neutral-500 dark:text-gray-400 py-6">
            {search ? "No matches" : "Transcript is empty"}
          </div>
        ) : (
          <ol className="space-y-1">
            {filteredSegments.map((seg) => {
              const realIdx = segments.indexOf(seg);
              const isActive = realIdx === activeIndex;
              return (
                <li key={`${seg.start}-${realIdx}`}>
                  <button
                    ref={isActive ? activeRef : undefined}
                    onClick={() => {
                      setAutoScroll(true);
                      onSeek(seg.start);
                    }}
                    className={`w-full text-left flex gap-3 px-2 py-1.5 rounded text-sm transition-colors ${
                      isActive
                        ? "bg-primary/10 text-neutral-900 dark:text-white"
                        : "hover:bg-neutral-100 dark:hover:bg-gray-800 text-neutral-700 dark:text-gray-300"
                    }`}
                  >
                    <span
                      className={`shrink-0 font-mono text-xs tabular-nums pt-0.5 ${
                        isActive
                          ? "text-primary"
                          : "text-neutral-400 dark:text-gray-500"
                      }`}
                    >
                      {formatTime(seg.start)}
                    </span>
                    <span className="flex-1 leading-snug">{seg.text}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="px-4 py-1.5 border-t border-neutral-200 dark:border-gray-800 flex items-center justify-between text-xs text-neutral-500 dark:text-gray-400">
        <span>
          {segments.length} segment{segments.length === 1 ? "" : "s"}
          {transcript.language ? ` · ${transcript.language.toUpperCase()}` : ""}
          {transcript.modelName ? ` · ${transcript.modelName}` : ""}
        </span>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="h-3 w-3"
          />
          Auto-scroll
        </label>
      </div>
    </div>
  );
}

