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
import { Upload, FileVideo, File as FileIcon, Image as ImageIcon } from "lucide-react";
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { data: targetFolder } = useFolder(folderId ?? 0, { enabled: folderId != null });

  // Reset on close so reopening doesn't show the previous selection.
  useEffect(() => {
    if (!open) {
      setSelectedFile(null);
      setIsDragging(false);
      if (customFilenameRef.current) customFilenameRef.current.value = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  const pickFile = (file: File) => {
    setSelectedFile(file);
    if (customFilenameRef.current) customFilenameRef.current.value = file.name;
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) pickFile(e.target.files[0]);
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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      pickFile(e.dataTransfer.files[0]);
    }
  }, []);

  const startUpload = () => {
    if (!selectedFile) {
      toast({ title: "No file selected", description: "Please select a file to upload", variant: "destructive" });
      return;
    }
    const customFilename = customFilenameRef.current?.value?.trim() || undefined;
    uploadService.uploadFile(selectedFile, projectId, customFilename, folderId);
    toast({
      title: "Upload started",
      description: "Your file is uploading in the background.",
    });
    onOpenChange(false);
  };

  const fileIcon = () => {
    if (!selectedFile) return <Upload className="h-12 w-12 text-muted-foreground" />;
    if (selectedFile.type.startsWith("video/")) return <FileVideo className="h-12 w-12 text-primary" />;
    if (selectedFile.type.startsWith("image/")) return <ImageIcon className="h-12 w-12 text-primary" />;
    return <FileIcon className="h-12 w-12 text-primary" />;
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
          {fileIcon()}
          <div className="mt-4 text-center">
            {selectedFile ? (
              <>
                <p className="font-medium break-all">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground mt-1">{fmtSize(selectedFile.size)}</p>
              </>
            ) : (
              <>
                <p className="font-medium">{isDragging ? "Drop file here" : "Drag and drop or click to upload"}</p>
                <p className="text-sm text-muted-foreground mt-1">Supports video, image, and document files</p>
              </>
            )}
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={onInputChange}
            className="hidden"
            accept="video/*,image/*,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="upload-dialog-filename">File Name (Optional)</Label>
          <Input
            id="upload-dialog-filename"
            ref={customFilenameRef}
            placeholder="Enter custom file name"
            defaultValue={selectedFile?.name || ""}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={startUpload} disabled={!selectedFile} data-testid="upload-dialog-confirm">
            Upload File
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
