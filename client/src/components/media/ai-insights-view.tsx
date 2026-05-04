import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  RefreshCcw,
  Sparkles,
  ListOrdered,
  AlertCircle,
  FileText,
  Play,
} from "lucide-react";

interface Chapter {
  start: number;
  title: string;
  summary?: string;
}

interface Transcript {
  id: number;
  fileId: number;
  status: "pending" | "processing" | "completed" | "failed";
  text: string | null;
  summary: string | null;
  summaryStatus: "pending" | "processing" | "completed" | "failed" | null;
  summaryError: string | null;
  summaryModel: string | null;
  summaryProcessedAt: string | null;
  chapters: Chapter[] | null;
  chaptersStatus: "pending" | "processing" | "completed" | "failed" | null;
  chaptersError: string | null;
  chaptersModel: string | null;
  chaptersProcessedAt: string | null;
}

interface Props {
  fileId: number;
  apiBase?: string;
  readOnly?: boolean;
  queryKey?: readonly unknown[];
  onSeek?: (time: number) => void;
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function AIInsightsView({
  fileId,
  apiBase,
  readOnly = false,
  queryKey,
  onSeek,
}: Props) {
  const base = apiBase || `/api/files/${fileId}`;
  const qKey = queryKey || ["/api/files", fileId, "transcript"];
  const { toast } = useToast();

  const { data: transcript, isLoading } = useQuery<Transcript | null>({
    queryKey: qKey,
    queryFn: async () => {
      const res = await fetch(`${base}/transcript`, { credentials: "include" });
      if (res.status === 404) return null as any;
      if (!res.ok) throw new Error(`Failed to load transcript (${res.status})`);
      return res.json();
    },
    refetchInterval: (q) => {
      const data = q.state.data as Transcript | null | undefined;
      if (!data) return 5000;
      if (data.status === "pending" || data.status === "processing") return 4000;
      if (
        data.summaryStatus === "pending" ||
        data.summaryStatus === "processing" ||
        data.chaptersStatus === "pending" ||
        data.chaptersStatus === "processing"
      )
        return 4000;
      return false;
    },
  });

  const regenSummary = useMutation({
    mutationFn: () => apiRequest("POST", `${base}/summary/regenerate`),
    onSuccess: () => {
      toast({ title: "Generating synopsis", description: "This may take a moment." });
      queryClient.invalidateQueries({ queryKey: qKey });
    },
    onError: (err: Error) =>
      toast({ title: "Failed to generate synopsis", description: err.message, variant: "destructive" }),
  });

  const regenChapters = useMutation({
    mutationFn: () => apiRequest("POST", `${base}/chapters/regenerate`),
    onSuccess: () => {
      toast({ title: "Generating chapters", description: "Analyzing transcript for chapter markers." });
      queryClient.invalidateQueries({ queryKey: qKey });
    },
    onError: (err: Error) =>
      toast({ title: "Failed to generate chapters", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-neutral-500 dark:text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading…
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className="px-4 py-6 text-sm text-neutral-500 dark:text-gray-400 text-center">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
        A transcript is required before AI insights can be generated.
        <div className="text-xs mt-1 opacity-70">Open the Transcript tab to start one.</div>
      </div>
    );
  }

  if (transcript.status !== "completed") {
    return (
      <div className="px-4 py-6 text-sm text-neutral-500 dark:text-gray-400 text-center">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
        Waiting for transcription to finish…
      </div>
    );
  }

  const sumStatus = transcript.summaryStatus || "pending";
  const sumInProgress = sumStatus === "pending" || sumStatus === "processing" || regenSummary.isPending;
  const chapStatus = transcript.chaptersStatus || "pending";
  const chapInProgress = chapStatus === "pending" || chapStatus === "processing" || regenChapters.isPending;

  return (
    <div className="flex flex-col h-full min-h-0 flex-1 overflow-auto">
      {/* Synopsis section */}
      <div className="border-b border-neutral-200 dark:border-gray-800">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Synopsis
          </div>
          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => regenSummary.mutate()}
              disabled={sumInProgress}
              title="Regenerate synopsis"
            >
              {sumInProgress ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <RefreshCcw className="h-3.5 w-3.5 mr-1" />
              )}
              Regenerate
            </Button>
          )}
        </div>
        <div className="px-4 pb-4">
          {sumStatus === "completed" && transcript.summary ? (
            <div className="text-sm text-neutral-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
              {transcript.summary}
            </div>
          ) : sumStatus === "processing" || sumStatus === "pending" ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-gray-400 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
              {sumStatus === "pending" ? "Synopsis queued…" : "Generating synopsis…"}
            </div>
          ) : sumStatus === "failed" ? (
            <div className="text-sm text-red-600 dark:text-red-400">
              <div className="flex items-center gap-1.5 mb-1 font-medium">
                <AlertCircle className="h-4 w-4" />
                Synopsis failed
              </div>
              {transcript.summaryError && (
                <div className="text-xs opacity-80 break-words">{transcript.summaryError}</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-neutral-500 dark:text-gray-400 italic py-2">
              No synopsis yet.{!readOnly && " Click Regenerate to create one."}
            </div>
          )}
        </div>
      </div>

      {/* Chapters section */}
      <div>
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
            <ListOrdered className="h-4 w-4 text-blue-500" />
            Chapters
          </div>
          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => regenChapters.mutate()}
              disabled={chapInProgress}
              title="Regenerate chapters"
            >
              {chapInProgress ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <RefreshCcw className="h-3.5 w-3.5 mr-1" />
              )}
              Regenerate
            </Button>
          )}
        </div>
        <div className="px-4 pb-3">
          {chapStatus === "completed" && transcript.chapters?.length ? (
            <div className="space-y-0.5">
              {transcript.chapters.map((chapter, i) => (
                <button
                  key={i}
                  onClick={() => onSeek?.(chapter.start)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-gray-800/60 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex items-center gap-1.5 text-xs font-mono text-blue-600 dark:text-blue-400 mt-0.5 shrink-0">
                      <Play className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      {formatTimestamp(chapter.start)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-neutral-900 dark:text-white">
                        {chapter.title}
                      </div>
                      {chapter.summary && (
                        <div className="text-xs text-neutral-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                          {chapter.summary}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : chapStatus === "processing" || chapStatus === "pending" ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-gray-400 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              {chapStatus === "pending" ? "Chapters queued…" : "Generating chapters…"}
            </div>
          ) : chapStatus === "failed" ? (
            <div className="text-sm text-red-600 dark:text-red-400">
              <div className="flex items-center gap-1.5 mb-1 font-medium">
                <AlertCircle className="h-4 w-4" />
                Chapter generation failed
              </div>
              {transcript.chaptersError && (
                <div className="text-xs opacity-80 break-words">{transcript.chaptersError}</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-neutral-500 dark:text-gray-400 italic py-2">
              No chapters yet.{!readOnly && " Click Regenerate to create them."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
