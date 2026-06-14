import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { formatFileSize } from "@/lib/utils/formatters";
import { File as StorageFile } from "@shared/schema";

// Per-version download entry. Each version is a distinct file row with its own
// encoded qualities, so we fetch that version's processing data to expose its
// Original + every transcoded resolution (not just the latest version's). The
// query key matches getProcessingStatus, so React Query dedupes/caches it.
export function VersionDownloadSubmenu({
  version,
  onDownload,
  subContentClassName = "w-56",
}: {
  version: StorageFile;
  onDownload: (url: string, name: string) => void;
  subContentClassName?: string;
}) {
  const isVideo = version.fileType === "video";

  const { data: processing } = useQuery({
    queryKey: ["/api/files", version.id, "processing"],
    queryFn: ({ signal }) =>
      apiRequest("GET", `/api/files/${version.id}/processing`, undefined, { signal }),
    enabled: isVideo,
    retry: false,
    staleTime: 60_000,
  });

  const qualities: Array<{ resolution: string; path: string; size: number }> =
    (processing as any)?.qualities || [];
  const hasQualityVariants = isVideo && qualities.length > 0;
  const baseName = (version as any).originalFilename || version.filename;
  const label = `v${version.version}${version.isLatestVersion ? " (latest)" : ""}`;

  const buildQualityName = (resolution: string, sourcePath?: string) => {
    const base = baseName.replace(/\.[^.]+$/, "");
    const ext = sourcePath?.match(/\.[a-z0-9]+$/i)?.[0] ?? ".mp4";
    return `${base}_${resolution}${ext}`;
  };

  if (!hasQualityVariants) {
    return (
      <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          onDownload(`/api/files/${version.id}/download`, baseName);
        }}
      >
        <span className="flex-1">{label}</span>
        <span className="ml-2 text-xs text-neutral-500">{formatFileSize(version.fileSize)}</span>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex-1">{label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className={subContentClassName}>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onDownload(`/api/files/${version.id}/download`, baseName);
          }}
        >
          <span className="flex-1">Original</span>
          <span className="ml-2 text-xs text-neutral-500">{formatFileSize(version.fileSize)}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {qualities.map((q) => (
          <DropdownMenuItem
            key={q.resolution}
            onClick={(e) => {
              e.stopPropagation();
              onDownload(
                `/api/files/${version.id}/qualities/${encodeURIComponent(q.resolution)}`,
                buildQualityName(q.resolution, q.path),
              );
            }}
          >
            <span className="flex-1">{q.resolution}</span>
            {q.size ? (
              <span className="ml-2 text-xs text-neutral-500">{formatFileSize(q.size)}</span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
