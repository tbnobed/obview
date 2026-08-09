import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  RefreshCcw,
  AlertCircle,
  AlertTriangle,
  Info,
  ShieldCheck,
  MonitorX,
  Snowflake,
  Mic,
  SpellCheck,
} from "lucide-react";

interface QcFinding {
  type: string;
  severity: "info" | "warning" | "error";
  start: number;
  end?: number | null;
  detail: string;
  confidence?: number | null;
}

interface QcReport {
  id: number;
  fileId: number;
  status: "pending" | "processing" | "completed" | "failed";
  findings: QcFinding[] | null;
  detectors: Record<string, { status: string; error?: string | null }> | null;
  errorMessage: string | null;
  processedAt: string | null;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const TYPE_META: Record<string, { label: string; icon: typeof Info }> = {
  black_frame: { label: "Black frame", icon: MonitorX },
  freeze_frame: { label: "Frozen frames", icon: Snowflake },
  audio_event: { label: "Audio event", icon: Mic },
  ocr_spelling: { label: "On-screen text", icon: SpellCheck },
};

const DETECTOR_LABELS: Record<string, string> = {
  frames: "Black/frozen frames",
  audioEvents: "Audio events",
  ocr: "On-screen text",
};

function severityClasses(sev: QcFinding["severity"]): string {
  switch (sev) {
    case "error":
      return "text-red-600 dark:text-red-400";
    case "warning":
      return "text-amber-600 dark:text-amber-400";
    default:
      return "text-blue-600 dark:text-blue-400";
  }
}

interface Props {
  fileId: number;
  onSeek: (time: number) => void;
  readOnly?: boolean;
}

export default function QcView({ fileId, onSeek, readOnly = false }: Props) {
  const { toast } = useToast();
  const queryKey = ["/api/files", fileId, "qc"] as const;

  const { data: report, isLoading } = useQuery<QcReport | null>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/files/${fileId}/qc`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`QC fetch failed: ${res.status}`);
      return res.json();
    },
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      return st === "pending" || st === "processing" ? 5000 : false;
    },
  });

  const regenerate = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/files/${fileId}/qc/regenerate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "QC analysis started" });
    },
    onError: (e: any) =>
      toast({ title: "Could not start QC", description: e?.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading QC report…
      </div>
    );
  }

  const inFlight = report?.status === "pending" || report?.status === "processing";
  const findings = report?.findings ?? [];

  return (
    <div className="space-y-3 p-1" data-testid="qc-view">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4" />
          QC Report
          {report?.processedAt && (
            <span className="text-xs text-muted-foreground font-normal">
              {new Date(report.processedAt).toLocaleString()}
            </span>
          )}
        </div>
        {!readOnly && (
          <Button
            size="sm"
            variant="outline"
            disabled={inFlight || regenerate.isPending}
            onClick={() => regenerate.mutate()}
            data-testid="qc-regenerate"
          >
            {inFlight ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5 mr-1" />
            )}
            {inFlight ? "Analyzing…" : "Re-run"}
          </Button>
        )}
      </div>

      {!report && (
        <div className="text-sm text-muted-foreground py-6 text-center">
          No QC report yet. It runs automatically after transcription
          {readOnly ? "." : ", or start one with Re-run."}
        </div>
      )}

      {report?.status === "failed" && (
        <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{report.errorMessage || "QC analysis failed"}</span>
        </div>
      )}

      {report?.detectors && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(report.detectors).map(([key, d]) => (
            <span
              key={key}
              title={d.error || undefined}
              className={`text-[11px] px-1.5 py-0.5 rounded border ${
                d.status === "completed"
                  ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                  : d.status === "failed"
                    ? "border-red-500/40 text-red-600 dark:text-red-400"
                    : "border-muted-foreground/30 text-muted-foreground"
              }`}
            >
              {DETECTOR_LABELS[key] ?? key}: {d.status}
            </span>
          ))}
        </div>
      )}

      {report && report.status === "completed" && findings.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 py-4">
          <ShieldCheck className="h-4 w-4" /> No issues found.
        </div>
      )}

      {findings.length > 0 && (
        <div className="space-y-1">
          {findings.map((f, i) => {
            const meta = TYPE_META[f.type] ?? { label: f.type, icon: Info };
            const Icon = meta.icon;
            const SevIcon =
              f.severity === "error" ? AlertCircle : f.severity === "warning" ? AlertTriangle : Info;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSeek(f.start)}
                className="w-full flex items-start gap-2 text-left text-sm rounded px-2 py-1.5 hover:bg-muted/60 transition-colors"
                data-testid={`qc-finding-${i}`}
              >
                <SevIcon className={`h-4 w-4 mt-0.5 shrink-0 ${severityClasses(f.severity)}`} />
                <span className="font-mono text-xs text-muted-foreground mt-0.5 shrink-0 w-14">
                  {formatTime(f.start)}
                  {f.end != null && f.end > f.start ? `–${formatTime(f.end)}` : ""}
                </span>
                <span className="min-w-0">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground mr-1.5">
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                  {f.detail}
                  {typeof f.confidence === "number" && (
                    <span className="text-xs text-muted-foreground ml-1">
                      ({Math.round(f.confidence * 100)}%)
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
