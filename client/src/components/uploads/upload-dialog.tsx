import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Upload, FileVideo, File as FileIcon, Image as ImageIcon, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadService } from "@/lib/upload-service";
import { useFolder } from "@/hooks/use-folders";

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  projectName: string;
  folderId: number | null;
}

// In-place upload dialog used by the project page so editors don't get
// shipped off to a separate route (which lost the subfolder context).
// The actual transfer is still handed off to `uploadService` so it keeps
// running if the user closes the dialog or navigates away.
export default function UploadDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  folderId,
}: UploadDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const customFilenameRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const { data: targetFolder } = useFolder(folderId ?? 0, { enabled: folderId != null });

  // Reset on close so reopening doesn't show the previous selection.
  useEffect(() => {
    if (!open) {
      setSelectedFiles([]);
      setIsDragging(false);
      if (customFilenameRef.current) customFilenameRef.current.value = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  const pickFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list);
    if (incoming.length === 0) return;
    setSelectedFiles((prev) => {
      // Dedupe by name+size so re-dropping the same selection doesn't double up.
      const seen = new Set(prev.map((f) => `${f.name}|${f.size}`));
      const next = [...prev, ...incoming.filter((f) => !seen.has(`${f.name}|${f.size}`))];
      if (customFilenameRef.current) {
        customFilenameRef.current.value = next.length === 1 ? next[0].name : "";
      }
      return next;
    });
  };

  const removeFile = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) pickFiles(e.target.files);
    e.target.value = "";
  };

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      pickFiles(e.dataTransfer.files);
    }
  }, []);

  const startUpload = () => {
    if (selectedFiles.length === 0) {
      toast({ title: "No files selected", description: "Please select at least one file to upload", variant: "destructive" });
      return;
    }
    // Custom filename only applies to a single-file upload.
    const customFilename =
      selectedFiles.length === 1 ? customFilenameRef.current?.value?.trim() || undefined : undefined;
    for (const f of selectedFiles) {
      uploadService.uploadFile(f, projectId, customFilename, folderId);
    }
    toast({
      title: selectedFiles.length === 1 ? "Upload started" : `${selectedFiles.length} uploads queued`,
      description:
        selectedFiles.length === 1
          ? "Your file is uploading in the background."
          : "Files upload two at a time in the background.",
    });
    onOpenChange(false);
  };

  const iconFor = (file: File, cls = "h-4 w-4") => {
    if (file.type.startsWith("video/")) return <FileVideo className={`${cls} text-primary shrink-0`} />;
    if (file.type.startsWith("image/")) return <ImageIcon className={`${cls} text-primary shrink-0`} />;
    return <FileIcon className={`${cls} text-primary shrink-0`} />;
  };

  const fmtSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const units = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload Media File</DialogTitle>
          <DialogDescription>
            {folderId != null ? (
              <>
                Uploading to <span className="font-medium">{projectName}</span>
                {" / "}
                <span className="font-medium">{targetFolder?.name ?? `folder #${folderId}`}</span>
              </>
            ) : (
              <>Uploading to <span className="font-medium">{projectName}</span> (project root)</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div
          className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors ${isDragging ? "border-primary bg-primary/5" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={onDragOver}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          data-testid="upload-dialog-dropzone"
        >
          <Upload className="h-12 w-12 text-muted-foreground" />
          <div className="mt-4 text-center">
            <p className="font-medium">{isDragging ? "Drop files here" : "Drag and drop or click to add files"}</p>
            <p className="text-sm text-muted-foreground mt-1">Supports video, image, and document files — select as many as you like</p>
          </div>
          <input
            type="file"
            multiple
            ref={fileInputRef}
            onChange={onInputChange}
            className="hidden"
            accept="video/*,image/*,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          />
        </div>

        {selectedFiles.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/70 p-2">
            {selectedFiles.map((f, i) => (
              <div key={`${f.name}|${f.size}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-950/60">
                {iconFor(f)}
                <span className="text-xs truncate flex-1 min-w-0" title={f.name}>{f.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">{fmtSize(f.size)}</span>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-muted-foreground"
                  onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                  title="Remove from list"
                  data-testid={`upload-dialog-remove-${i}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {selectedFiles.length === 1 && (
          <div className="space-y-2">
            <Label htmlFor="upload-dialog-filename">File Name (Optional)</Label>
            <Input
              id="upload-dialog-filename"
              ref={customFilenameRef}
              placeholder="Enter custom file name"
              defaultValue={selectedFiles[0]?.name || ""}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={startUpload} disabled={selectedFiles.length === 0} data-testid="upload-dialog-confirm">
            {selectedFiles.length > 1 ? `Upload ${selectedFiles.length} Files` : "Upload File"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
