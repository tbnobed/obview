import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  RefreshCw,
  Cpu,
  HardDrive,
  Database,
  Server,
  Activity,
  Network,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

type Diag = any;

function YesNo({ value, yesLabel, noLabel }: { value: boolean; yesLabel?: string; noLabel?: string }) {
  return value ? (
    <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3 mr-1" /> {yesLabel ?? "yes"}
    </Badge>
  ) : (
    <Badge variant="outline" className="border-neutral-400/40 text-neutral-500">
      <XCircle className="h-3 w-3 mr-1" /> {noLabel ?? "no"}
    </Badge>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="text-neutral-500 dark:text-gray-400 shrink-0">{label}</span>
      <span className="font-mono text-right break-all text-neutral-900 dark:text-gray-100">{children}</span>
    </div>
  );
}

function Section({
  icon,
  title,
  status,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  status?: "ok" | "warn" | "err" | null;
  children: React.ReactNode;
}) {
  const dot =
    status === "ok"
      ? "bg-emerald-500"
      : status === "warn"
      ? "bg-amber-500"
      : status === "err"
      ? "bg-red-500"
      : "bg-neutral-300 dark:bg-gray-700";
  return (
    <Card>
      <CardHeader className="border-b dark:border-gray-800 flex flex-row items-center justify-between space-y-0 py-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

export default function DiagnosticsPanel() {
  const { toast } = useToast();
  const { data, isLoading, isFetching, error, refetch } = useQuery<Diag>({
    queryKey: ["/api/admin/diag"],
  });

  const copyJson = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      toast({ title: "Copied", description: "Diagnostics JSON copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Couldn't access the clipboard.", variant: "destructive" });
    }
  };

  const reload = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/diag"] });
    refetch();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center gap-3 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4" />
          Failed to load diagnostics: {(error as Error)?.message ?? "unknown error"}
          <Button size="sm" variant="outline" className="ml-auto" onClick={reload}>
            <RefreshCw className="h-3 w-3 mr-1" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const gpus = data.gpus;
  const ffmpeg = data.ffmpeg;
  const storage = data.storage;
  const spark = data.spark;
  const pg = data.postgres;

  const gpuStatus: "ok" | "warn" | "err" = gpus?.ok
    ? gpus.devices?.length > 0
      ? "ok"
      : "warn"
    : "err";

  const ffStatus: "ok" | "warn" | "err" = ffmpeg?.ok
    ? ffmpeg.encoders?.h264_nvenc
      ? "ok"
      : "warn"
    : "err";

  const storageStatus: "ok" | "warn" = storage?.exists ? "ok" : "warn";
  const pgStatus: "ok" | "err" = pg?.ok ? "ok" : "err";
  const sparkStatus: "ok" | "warn" | "err" = !spark?.configured
    ? "warn"
    : spark.tcp?.ok || spark.http?.ok
    ? "ok"
    : "err";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-neutral-500 dark:text-gray-400">
            Snapshot generated {new Date(data.generatedAt).toLocaleString()} ·{" "}
            <span className="font-mono">{data.durationMs}ms</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={copyJson}>
            <Copy className="h-3 w-3 mr-1" /> Copy JSON
          </Button>
          <Button size="sm" variant="outline" onClick={reload} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section icon={<Server className="h-4 w-4" />} title="Host" status="ok">
          <Row label="hostname">{data.os.hostname}</Row>
          <Row label="os">
            {data.os.type} {data.os.release}
          </Row>
          <Row label="arch">{data.os.arch}</Row>
          <Row label="cpu">
            {data.os.cpus}× {data.os.cpuModel}
          </Row>
          <Row label="memory">
            {data.os.freeMemHuman} free / {data.os.totalMemHuman}
          </Row>
          <Row label="loadavg">{data.os.loadavg.map((n: number) => n.toFixed(2)).join(" / ")}</Row>
          <Row label="uptime">{Math.round(data.os.uptimeSec / 3600)}h</Row>
          <Row label="node">{data.node.version}</Row>
          <Row label="process rss">{data.node.rssHuman}</Row>
        </Section>

        <Section icon={<Database className="h-4 w-4" />} title="Postgres" status={pgStatus}>
          {pg.ok ? (
            <>
              <Row label="version">{pg.version?.split(",")[0]}</Row>
              {pg.dbSize && <Row label="db size">{pg.dbSize}</Row>}
            </>
          ) : (
            <p className="text-sm text-red-600">{pg.error}</p>
          )}
        </Section>

        <Section icon={<Cpu className="h-4 w-4" />} title="GPUs (host)" status={gpuStatus}>
          {!gpus.ok ? (
            <p className="text-xs text-neutral-500">
              <code className="bg-neutral-100 dark:bg-gray-900 px-1 py-0.5 rounded">nvidia-smi</code>{" "}
              not available. Expected on the dev container; required on the Obviu host once T4 is
              passed through.
              <br />
              <span className="font-mono text-neutral-400">{gpus.error}</span>
            </p>
          ) : gpus.devices.length === 0 ? (
            <p className="text-xs text-neutral-500">nvidia-smi ran but reported zero devices.</p>
          ) : (
            <div className="space-y-3">
              {gpus.devices.map((g: any) => (
                <div key={g.index} className="border border-neutral-200 dark:border-gray-800 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">
                      [{g.index}] {g.name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      driver {g.driver}
                    </Badge>
                  </div>
                  <Row label="memory">
                    {g.memoryUsedMb} / {g.memoryTotalMb} MB
                  </Row>
                  <Row label="util">{g.utilizationPct}%</Row>
                  <Row label="temp">{g.temperatureC}°C</Row>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section icon={<Activity className="h-4 w-4" />} title="FFmpeg" status={ffStatus}>
          {!ffmpeg.ok ? (
            <p className="text-xs text-red-600">{ffmpeg.error}</p>
          ) : (
            <>
              <Row label="version">{ffmpeg.version}</Row>
              <div className="mt-3 mb-2 text-xs text-neutral-500 dark:text-gray-400">encoders</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(ffmpeg.encoders).map(([name, present]) => (
                  <YesNo key={name} value={!!present} yesLabel={name} noLabel={`${name} (missing)`} />
                ))}
              </div>
              <div className="mt-3 mb-2 text-xs text-neutral-500 dark:text-gray-400">hwaccels</div>
              <div className="flex flex-wrap gap-1">
                {ffmpeg.hwaccels.length === 0 ? (
                  <span className="text-xs text-neutral-400">none reported</span>
                ) : (
                  ffmpeg.hwaccels.map((h: string) => (
                    <Badge key={h} variant="secondary" className="text-xs font-mono">
                      {h}
                    </Badge>
                  ))
                )}
              </div>
            </>
          )}
        </Section>

        <Section icon={<HardDrive className="h-4 w-4" />} title="uploads/ storage" status={storageStatus}>
          <Row label="path">{storage.absUploadDir}</Row>
          <Row label="exists">
            <YesNo value={storage.exists} />
          </Row>
          {storage.entryCount != null && <Row label="entries">{storage.entryCount}</Row>}
          {storage.totalBytes != null && (
            <Row label="disk">
              {storage.freeBytesHuman} free / {storage.totalBytesHuman}
            </Row>
          )}
          {storage.fsType && <Row label="fs type">{storage.fsType}</Row>}
          {storage.mountSource && <Row label="source">{storage.mountSource}</Row>}
          {storage.mountPoint && <Row label="mount point">{storage.mountPoint}</Row>}
          {storage.mountOptions && (
            <Row label="options">
              <span className="text-xs">{storage.mountOptions}</span>
            </Row>
          )}
          <Row label="NFS">
            <YesNo value={storage.isNfs} />
          </Row>
          <Row label="RDMA">
            <YesNo value={storage.isRdma} />
          </Row>
        </Section>

        <Section icon={<Network className="h-4 w-4" />} title="DGX Spark" status={sparkStatus}>
          {!spark.configured ? (
            <p className="text-xs text-neutral-500">{spark.hint}</p>
          ) : (
            <>
              <Row label="host">
                {spark.host}:{spark.port}
              </Row>
              {spark.tcp && (
                <Row label="tcp">
                  {spark.tcp.ok ? (
                    <span className="text-emerald-600">connected ({spark.tcp.latencyMs}ms)</span>
                  ) : (
                    <span className="text-red-600">{spark.tcp.error}</span>
                  )}
                </Row>
              )}
              {spark.http && (
                <>
                  <Row label="http">
                    {spark.http.ok ? (
                      <span className="text-emerald-600">200 OK</span>
                    ) : (
                      <span className="text-red-600">
                        {spark.http.status ?? "fail"} {spark.http.error ?? ""}
                      </span>
                    )}
                  </Row>
                  {spark.http.body && (
                    <pre className="mt-2 text-[10px] bg-neutral-100 dark:bg-gray-900 rounded p-2 overflow-auto max-h-40">
                      {JSON.stringify(spark.http.body, null, 2)}
                    </pre>
                  )}
                </>
              )}
            </>
          )}
        </Section>
      </div>

      <Card>
        <CardHeader className="border-b dark:border-gray-800 py-3">
          <CardTitle className="text-sm font-semibold">Environment flags</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-x-8">
          <div>
            <div className="text-xs text-neutral-500 dark:text-gray-400 mb-2">config</div>
            {Object.entries(data.env.flags).map(([k, v]) => (
              <Row key={k} label={k}>
                {v ? String(v) : <span className="text-neutral-400">unset</span>}
              </Row>
            ))}
          </div>
          <div>
            <div className="text-xs text-neutral-500 dark:text-gray-400 mb-2">secrets present</div>
            {Object.entries(data.env.secretsPresent).map(([k, v]) => (
              <Row key={k} label={k}>
                <YesNo value={!!v} />
              </Row>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
