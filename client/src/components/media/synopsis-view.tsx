import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCcw, Sparkles, AlertCircle, FileText } from "lucide-react";

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
}

interface Props {
  fileId: number;
  apiBase?: string;
  readOnly?: boolean;
  queryKey?: readonly unknown[];
}

export default function SynopsisView({ fileId, apiBase, readOnly = false, queryKey }: Props) {
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
      if (data.summaryStatus === "pending" || data.summaryStatus === "processing") return 4000;
      return false;
    },
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `${base}/summary/regenerate`);
    },
    onSuccess: () => {
      toast({
        title: "Generating synopsis",
        description: "The first run downloads the local model and may take a few minutes.",
      });
      queryClient.invalidateQueries({ queryKey: qKey });
    },
    onError: (err: Error) =>
      toast({
        title: "Failed to generate synopsis",
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
        A transcript is required before a synopsis can be generated.
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
        Waiting for transcription to finish before generating a synopsis…
      </div>
    );
  }

  const status = transcript.summaryStatus || "pending";
  const inProgress = status === "pending" || status === "processing" || regenerate.isPending;

  return (
    <div className="flex flex-col h-full min-h-0 flex-1 overflow-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-gray-800">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
          <Sparkles className="h-4 w-4 text-amber-500" />
          AI Synopsis
        </div>
        {!readOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => regenerate.mutate()}
            disabled={inProgress}
            title="Regenerate synopsis"
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

      <div className="px-4 py-4 flex-1">
        {status === "completed" && transcript.summary ? (
          <>
            <div className="text-sm text-neutral-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
              {transcript.summary}
            </div>
            {(transcript.summaryModel || transcript.summaryProcessedAt) && (
              <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-gray-800 text-xs text-neutral-500 dark:text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                {transcript.summaryModel && (
                  <span>Model: {transcript.summaryModel}</span>
                )}
                {transcript.summaryProcessedAt && (
                  <span>
                    Generated:{" "}
                    {new Date(transcript.summaryProcessedAt).toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </>
        ) : status === "processing" || status === "pending" ? (
          <div className="flex flex-col items-center justify-center text-sm text-neutral-500 dark:text-gray-400 py-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin mb-3 text-amber-500" />
            {status === "pending"
              ? "Synopsis queued — will run once the local model is loaded."
              : "Generating synopsis with local model…"}
            <div className="text-xs mt-2 opacity-70 max-w-xs">
              First run downloads ~770MB. Subsequent files run in seconds.
            </div>
          </div>
        ) : status === "failed" ? (
          <div className="text-sm text-red-600 dark:text-red-400">
            <div className="flex items-center gap-1.5 mb-1 font-medium">
              <AlertCircle className="h-4 w-4" />
              Synopsis failed
            </div>
            {transcript.summaryError && (
              <div className="text-xs opacity-80 break-words">
                {transcript.summaryError}
              </div>
            )}
            <div className="text-xs mt-2 opacity-70">
              Click Regenerate to try again.
            </div>
          </div>
        ) : (
          <div className="text-sm text-neutral-500 dark:text-gray-400 italic text-center py-6">
            No synopsis yet. Click Regenerate to create one.
          </div>
        )}
      </div>
    </div>
  );
}
