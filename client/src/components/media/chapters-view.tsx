import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCcw, ListOrdered, AlertCircle, FileText, Play } from "lucide-react";

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
  segments: Array<{ start: number; end: number; text: string }> | null;
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

export default function ChaptersView({
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
      if (
        data.chaptersStatus === "pending" ||
        data.chaptersStatus === "processing"
      )
        return 4000;
      return false;
    },
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `${base}/chapters/regenerate`);
    },
    onSuccess: () => {
      toast({
        title: "Generating chapters",
        description:
          "The AI is analyzing the transcript to create chapter markers.",
      });
      queryClient.invalidateQueries({ queryKey: qKey });
    },
    onError: (err: Error) =>
      toast({
        title: "Failed to generate chapters",
        description: err.message,
        variant: "destructive",
      }),
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
        A transcript is required before chapters can be generated.
        <div className="text-xs mt-1 opacity-70">
          Open the Transcript tab to start one.
        </div>
      </div>
    );
  }

  if (transcript.status !== "completed") {
    return (
      <div className="px-4 py-6 text-sm text-neutral-500 dark:text-gray-400 text-center">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
        Waiting for transcription to finish before generating chapters…
      </div>
    );
  }

  const status = transcript.chaptersStatus || "pending";
  const inProgress =
    status === "pending" || status === "processing" || regenerate.isPending;

  return (
    <div className="flex flex-col h-full min-h-0 flex-1 overflow-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-gray-800">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
          <ListOrdered className="h-4 w-4 text-blue-500" />
          AI Chapters
        </div>
        {!readOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => regenerate.mutate()}
            disabled={inProgress}
            title="Regenerate chapters"
          >
            {inProgress ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5 mr-1" />
            )}
            Regenerate
          </Button>
        )}
      </div>

      <div className="px-4 py-2 flex-1">
        {status === "completed" && transcript.chapters?.length ? (
          <>
            <div className="space-y-1">
              {transcript.chapters.map((chapter, i) => (
                <button
                  key={i}
                  onClick={() => onSeek?.(chapter.start)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-gray-800/60 transition-colors group"
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
            {(transcript.chaptersModel || transcript.chaptersProcessedAt) && (
              <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-gray-800 text-xs text-neutral-500 dark:text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                {transcript.chaptersModel && (
                  <span>Model: {transcript.chaptersModel}</span>
                )}
                {transcript.chaptersProcessedAt && (
                  <span>
                    Generated:{" "}
                    {new Date(
                      transcript.chaptersProcessedAt
                    ).toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </>
        ) : status === "processing" || status === "pending" ? (
          <div className="flex flex-col items-center justify-center text-sm text-neutral-500 dark:text-gray-400 py-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin mb-3 text-blue-500" />
            {status === "pending"
              ? "Chapters queued — will run once the local model is loaded."
              : "Analyzing transcript to generate chapters…"}
            <div className="text-xs mt-2 opacity-70 max-w-xs">
              The AI identifies topic shifts and scene changes to create
              navigable chapter markers.
            </div>
          </div>
        ) : status === "failed" ? (
          <div className="text-sm text-red-600 dark:text-red-400 py-4">
            <div className="flex items-center gap-1.5 mb-1 font-medium">
              <AlertCircle className="h-4 w-4" />
              Chapter generation failed
            </div>
            {transcript.chaptersError && (
              <div className="text-xs opacity-80 break-words">
                {transcript.chaptersError}
              </div>
            )}
            <div className="text-xs mt-2 opacity-70">
              Click Regenerate to try again.
            </div>
          </div>
        ) : (
          <div className="text-sm text-neutral-500 dark:text-gray-400 italic text-center py-6">
            No chapters yet. Click Regenerate to create them.
          </div>
        )}
      </div>
    </div>
  );
}
