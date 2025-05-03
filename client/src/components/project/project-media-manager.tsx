import React, { useState } from "react";
import { useMediaFiles } from "@/hooks/use-media";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Eye,
  FileVideo,
  Image as ImageIcon,
  FileText,
  File,
  Trash2,
  MoreVertical,
  Download,
  Pencil,
  Info,
  CheckCircle,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ProjectMediaManagerProps {
  projectId: number;
}

export function ProjectMediaManager({ projectId }: ProjectMediaManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState("");
  const [fileToDelete, setFileToDelete] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Fetch all files for this project
  const {
    data: files,
    isLoading,
    error,
  } = useMediaFiles(projectId);

  // Delete file mutation
  const deleteMutation = useMutation({
    mutationFn: async (fileId: number) => {
      await apiRequest("DELETE", `/api/files/${fileId}`);
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}/files`],
      });
      toast({
        title: "File deleted",
        description: "The file has been removed from this project",
      });
      setShowDeleteDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting file",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle file deletion
  const handleDeleteFile = (fileId: number) => {
    setFileToDelete(fileId);
    setShowDeleteDialog(true);
  };

  // Confirm deletion
  const confirmDelete = () => {
    if (fileToDelete !== null) {
      deleteMutation.mutate(fileToDelete);
    }
  };

  // Format file size for display
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Determine file icon based on file type
  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("video/") || fileType.includes("video")) {
      return <FileVideo className="h-5 w-5 text-blue-500" />;
    } else if (fileType.startsWith("image/") || fileType.includes("image")) {
      return <ImageIcon className="h-5 w-5 text-green-500" />;
    } else if (
      fileType.includes("pdf") ||
      fileType.includes("doc") ||
      fileType.includes("text")
    ) {
      return <FileText className="h-5 w-5 text-orange-500" />;
    } else {
      return <File className="h-5 w-5 text-gray-500" />;
    }
  };

  // Filter files based on search text
  const filteredFiles = files?.filter(
    (file) =>
      !searchText ||
      file.filename.toLowerCase().includes(searchText.toLowerCase())
  );

  // View file in a new tab
  const handleViewFile = (fileId: number) => {
    window.open(`/api/files/${fileId}/content`, "_blank");
  };

  // Download file
  const handleDownloadFile = (fileId: number, filename: string) => {
    const link = document.createElement("a");
    link.href = `/api/files/${fileId}/download`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        <CardContent className="p-4">
          <p className="text-red-600 dark:text-red-400">
            Error loading files: {(error as Error).message}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-medium mb-2 dark:text-gray-200">
          Project Media
        </h3>
        <Input
          className="max-w-xs"
          placeholder="Search files..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      {filteredFiles && filteredFiles.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFiles.map((file) => (
              <TableRow key={file.id}>
                <TableCell className="font-medium flex items-center gap-2">
                  {getFileIcon(file.fileType)}
                  <span className="truncate max-w-[250px]" title={file.filename}>
                    {file.filename}
                  </span>
                </TableCell>
                <TableCell>{formatFileSize(file.fileSize)}</TableCell>
                <TableCell>
                  {formatDistanceToNow(new Date(file.createdAt), {
                    addSuffix: true,
                  })}
                </TableCell>
                <TableCell>
                  {file.isAvailable ? (
                    <Badge variant="outline" className="bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800">
                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                      Available
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                      <AlertCircle className="h-3.5 w-3.5 mr-1" />
                      Unavailable
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      
                      <DropdownMenuItem 
                        onClick={() => handleViewFile(file.id)}
                        disabled={!file.isAvailable}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </DropdownMenuItem>
                      
                      <DropdownMenuItem 
                        onClick={() => handleDownloadFile(file.id, file.filename)}
                        disabled={!file.isAvailable}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                      
                      <DropdownMenuItem onClick={() => window.open(`/project/${projectId}`, "_blank")}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open in Project
                      </DropdownMenuItem>
                      
                      <DropdownMenuSeparator />
                      
                      <DropdownMenuItem 
                        onClick={() => handleDeleteFile(file.id)}
                        className="text-red-600 dark:text-red-400 focus:text-red-700 dark:focus:text-red-300"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Card className="bg-slate-50 dark:bg-slate-900/50 border">
          <CardContent className="p-6 text-center">
            <FileVideo className="h-10 w-10 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-600 dark:text-slate-400">
              {searchText
                ? "No files match your search"
                : "No media files uploaded to this project yet"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Deletion confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this file from the project. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}