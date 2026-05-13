import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { FileDown, FileVideo, FileText, Table } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExportMarkersButtonProps {
  fileId: number;
  filename: string;
  duration: number;
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "default" | "icon";
  compact?: boolean;
  className?: string;
  // When set, hits the public share endpoint instead of the auth endpoint
  // so unauthenticated reviewers on a share link can export markers too.
  shareToken?: string;
}

export function ExportMarkersButton({
  fileId,
  filename,
  duration,
  variant = "ghost",
  size = "icon",
  compact = false,
  className,
  shareToken,
}: ExportMarkersButtonProps) {
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleExport = async (format: "xml" | "edl" | "csv") => {
    setIsDownloading(true);
    try {
      const url = shareToken
        ? `/api/public/share/${shareToken}/files/${fileId}/export/${format}?duration=${duration}&fps=30`
        : `/api/files/${fileId}/export/${format}?duration=${duration}&fps=30`;
      const response = await fetch(url, { credentials: "include" });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: "Export failed" }));
        throw new Error(err.message);
      }

      const blob = await response.blob();
      const baseName = filename.replace(/\.[^.]+$/, "");
      const ext = format === "xml" ? "xml" : format === "edl" ? "edl" : "csv";
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${baseName}_markers.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      const labels: Record<string, string> = {
        xml: "FCP XML (Premiere / Resolve)",
        edl: "EDL (CMX 3600)",
        csv: "CSV Spreadsheet",
      };
      toast({ title: "Markers exported", description: labels[format] });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          disabled={isDownloading}
          className={className}
          title="Export markers"
        >
          <FileDown className={compact ? "h-4 w-4" : "h-5 w-5"} />
          {!compact && size !== "icon" && <span className="ml-1">Export</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Export Markers</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleExport("xml")}>
          <FileVideo className="h-4 w-4 mr-2" />
          <div>
            <div className="font-medium">FCP XML</div>
            <div className="text-xs text-muted-foreground">Premiere Pro &amp; DaVinci Resolve</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("edl")}>
          <FileText className="h-4 w-4 mr-2" />
          <div>
            <div className="font-medium">EDL</div>
            <div className="text-xs text-muted-foreground">CMX 3600 format</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleExport("csv")}>
          <Table className="h-4 w-4 mr-2" />
          <div>
            <div className="font-medium">CSV</div>
            <div className="text-xs text-muted-foreground">Spreadsheet with timecodes</div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
