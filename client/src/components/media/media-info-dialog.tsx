import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, AlertCircle, FileVideo, FileAudio, Image as ImageIcon, FileText } from "lucide-react";
import { formatFileSize } from "@/lib/utils/formatters";

interface MediaInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: number;
  filename: string;
}

interface MediaInfoResponse {
  file: {
    id: number;
    filename: string;
    fileType: string;
    fileSize: number;
    filePath: string;
    version: number;
    isLatestVersion: boolean;
    createdAt: string | Date;
  };
  diskSize: number | null;
  mtimeMs: number | null;
  onDisk: boolean;
  probe: any | null;
  probeError: string | null;
}

const formatBitrate = (bps: number | string | undefined | null): string => {
  if (bps === undefined || bps === null || bps === "") return "—";
  const n = typeof bps === "string" ? parseInt(bps, 10) : bps;
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} Mb/s`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} kb/s`;
  return `${n} b/s`;
};

const formatDurationSec = (sec: number | string | undefined | null): string => {
  if (sec === undefined || sec === null || sec === "") return "—";
  const s = typeof sec === "string" ? parseFloat(sec) : sec;
  if (!Number.isFinite(s) || s <= 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = (s % 60);
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(Math.floor(ss))}`;
  return `${pad(m)}:${ss.toFixed(2).padStart(5, "0")}`;
};

const parseFps = (rateStr: string | undefined): string => {
  if (!rateStr || typeof rateStr !== "string") return "—";
  if (rateStr.includes("/")) {
    const [a, b] = rateStr.split("/").map(Number);
    if (b && a) {
      const fps = a / b;
      return `${fps.toFixed(fps % 1 === 0 ? 0 : 3)} fps`;
    }
  }
  const n = parseFloat(rateStr);
  if (Number.isFinite(n) && n > 0) return `${n} fps`;
  return "—";
};

const parseAspect = (s: any): string => {
  if (!s) return "—";
  return String(s).replace(":", " : ");
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 py-1.5 text-sm border-b border-neutral-100 dark:border-gray-800 last:border-b-0">
      <div className="text-neutral-500 dark:text-gray-400">{label}</div>
      <div className="text-neutral-900 dark:text-gray-100 font-mono break-all">{value ?? "—"}</div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-gray-800 bg-neutral-50/60 dark:bg-gray-900/40 p-4">
      <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-neutral-700 dark:text-gray-200">
        {icon}
        <span>{title}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

export function MediaInfoBody({ fileId, enabled = true }: { fileId: number; enabled?: boolean }) {
  const { data, isLoading, error } = useQuery<MediaInfoResponse>({
    queryKey: ["/api/files", fileId, "mediainfo"],
    queryFn: async () => {
      const res = await fetch(`/api/files/${fileId}/mediainfo`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load media info (${res.status})`);
      return res.json();
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const probe = data?.probe;
  const format = probe?.format;
  const streams: any[] = Array.isArray(probe?.streams) ? probe.streams : [];
  const videoStreams = streams.filter((s) => s.codec_type === "video");
  const audioStreams = streams.filter((s) => s.codec_type === "audio");
  const subtitleStreams = streams.filter((s) => s.codec_type === "subtitle");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-neutral-500 dark:text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Reading media info…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>Couldn't load media info: {(error as Error).message}</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <Section title="General" icon={<FileText className="h-4 w-4" />}>
        <Row label="File name" value={data.file.filename} />
        <Row label="File type" value={data.file.fileType} />
        <Row label="Container" value={format?.format_long_name || format?.format_name || "—"} />
        <Row label="Size on disk" value={data.diskSize != null ? `${formatFileSize(data.diskSize)} (${data.diskSize.toLocaleString()} bytes)` : "—"} />
        <Row label="Recorded size" value={`${formatFileSize(data.file.fileSize)} (${data.file.fileSize.toLocaleString()} bytes)`} />
        <Row label="Duration" value={formatDurationSec(format?.duration)} />
        <Row label="Overall bit rate" value={formatBitrate(format?.bit_rate)} />
        <Row label="Streams" value={format?.nb_streams ?? streams.length} />
        <Row label="Version" value={`v${data.file.version}${data.file.isLatestVersion ? " (latest)" : ""}`} />
        <Row label="Uploaded" value={new Date(data.file.createdAt).toLocaleString()} />
        <Row label="On disk" value={data.onDisk ? "Yes" : "No"} />
        <Row label="Path" value={<span className="text-xs">{data.file.filePath}</span>} />
      </Section>

      {data.probeError && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>Couldn't probe the original file: {data.probeError}</div>
        </div>
      )}

      {videoStreams.map((s, idx) => (
        <Section
          key={`v-${s.index ?? idx}`}
          title={`Video${videoStreams.length > 1 ? ` #${idx + 1}` : ""}`}
          icon={s.codec_name?.toLowerCase().includes("png") || s.codec_name?.toLowerCase().includes("mjpeg") ? <ImageIcon className="h-4 w-4" /> : <FileVideo className="h-4 w-4" />}
        >
          <Row label="Codec" value={s.codec_long_name || s.codec_name} />
          <Row label="Profile" value={s.profile} />
          <Row label="Pixel format" value={s.pix_fmt} />
          <Row label="Resolution" value={s.width && s.height ? `${s.width} × ${s.height}` : "—"} />
          <Row label="Display aspect" value={parseAspect(s.display_aspect_ratio)} />
          <Row label="Sample aspect" value={parseAspect(s.sample_aspect_ratio)} />
          <Row label="Frame rate" value={parseFps(s.avg_frame_rate || s.r_frame_rate)} />
          <Row label="Bit rate" value={formatBitrate(s.bit_rate)} />
          <Row label="Bit depth" value={s.bits_per_raw_sample || "—"} />
          <Row label="Color space" value={s.color_space || "—"} />
          <Row label="Color range" value={s.color_range || "—"} />
          <Row label="Frames" value={s.nb_frames || "—"} />
          <Row label="Duration" value={formatDurationSec(s.duration)} />
        </Section>
      ))}

      {audioStreams.map((s, idx) => (
        <Section
          key={`a-${s.index ?? idx}`}
          title={`Audio${audioStreams.length > 1 ? ` #${idx + 1}` : ""}`}
          icon={<FileAudio className="h-4 w-4" />}
        >
          <Row label="Codec" value={s.codec_long_name || s.codec_name} />
          <Row label="Profile" value={s.profile} />
          <Row label="Channels" value={s.channels ? `${s.channels} (${s.channel_layout || "—"})` : "—"} />
          <Row label="Sample rate" value={s.sample_rate ? `${parseInt(s.sample_rate).toLocaleString()} Hz` : "—"} />
          <Row label="Bit rate" value={formatBitrate(s.bit_rate)} />
          <Row label="Bit depth" value={s.bits_per_raw_sample || s.bits_per_sample || "—"} />
          <Row label="Duration" value={formatDurationSec(s.duration)} />
          <Row label="Language" value={s.tags?.language || "—"} />
        </Section>
      ))}

      {subtitleStreams.map((s, idx) => (
        <Section key={`s-${s.index ?? idx}`} title={`Subtitle${subtitleStreams.length > 1 ? ` #${idx + 1}` : ""}`}>
          <Row label="Codec" value={s.codec_long_name || s.codec_name} />
          <Row label="Language" value={s.tags?.language || "—"} />
          <Row label="Title" value={s.tags?.title || "—"} />
        </Section>
      ))}
    </div>
  );
}

export default function MediaInfoDialog({ open, onOpenChange, fileId, filename }: MediaInfoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="truncate" title={filename}>{filename}</DialogTitle>
          <DialogDescription>
            Technical details for this media file.
          </DialogDescription>
        </DialogHeader>
        <MediaInfoBody fileId={fileId} enabled={open} />
      </DialogContent>
    </Dialog>
  );
}
