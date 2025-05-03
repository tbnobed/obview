import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { 
  Download, 
  Eye, 
  FileCheck, 
  FileX, 
  Search, 
  Trash2, 
  ScanSearch 
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatFileSize, formatTimeAgo } from "@/lib/utils/formatters";

interface ProjectFile {
  id: number;
  filename: string;
  fileType: string;
  fileSize: number;
  isAvailable: boolean;
  createdAt: string;
  uploadedById: number;
  version: number;
}

export function ProjectMediaManager({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  
  // Fetch all files for this project
  const { 
    data: files, 
    isLoading,
    refetch
  } = useQuery<ProjectFile[]>({
    queryKey: [`/api/projects/${projectId}/files`],
    enabled: !!projectId,
  });
  
  // Delete file mutation
  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: number) => {
      await apiRequest("DELETE", `/api/files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/files`] });
      toast({
        title: "File deleted",
        description: "The file has been successfully deleted from the project",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting file",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Scan filesystem mutation
  const scanFilesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/scan-files");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/files`] });
      setIsScanning(false);
      toast({
        title: "Scan complete",
        description: "File system scan has completed successfully",
      });
    },
    onError: (error: Error) => {
      setIsScanning(false);
      toast({
        title: "Error during scan",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Handle file deletion
  const handleDeleteFile = (fileId: number) => {
    deleteFileMutation.mutate(fileId);
  };
  
  // Handle file download
  const handleViewFile = (fileId: number) => {
    window.open(`/projects/${projectId}?media=${fileId}`, '_blank');
  };
  
  // Handle file download
  const handleDownloadFile = (fileId: number) => {
    window.open(`/api/files/${fileId}/download`, '_blank');
  };
  
  // Handle file system scan
  const handleScanFiles = () => {
    setIsScanning(true);
    scanFilesMutation.mutate();
  };
  
  // Filter files based on search term
  const filteredFiles = files?.filter(file => 
    file.filename && file.filename.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  return (
    <div>
      <h3 className="text-base font-medium mb-2 dark:text-gray-200">Media Files</h3>
      <p className="text-neutral-500 dark:text-gray-400 mb-4">
        Manage all media files assigned to this project
      </p>
      
      <div className="flex items-center justify-between mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search files..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleScanFiles}
          disabled={isScanning}
          className="ml-2 dark:bg-[#026d55] dark:text-white dark:border-[#026d55] dark:hover:bg-[#025943] dark:hover:border-[#025943]"
        >
          {isScanning ? (
            <>
              <ScanSearch className="mr-1.5 h-4 w-4 animate-pulse" />
              Scanning...
            </>
          ) : (
            <>
              <ScanSearch className="mr-1.5 h-4 w-4" />
              Scan Files
            </>
          )}
        </Button>
      </div>
      
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filteredFiles && filteredFiles.length > 0 ? (
        <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-[#0a0d14]">
                <TableHead className="w-[300px]">File Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFiles.map((file) => (
                <TableRow key={file.id}>
                  <TableCell className="font-medium">{file.filename || "Unnamed file"}</TableCell>
                  <TableCell>{file.fileType || "Unknown"}</TableCell>
                  <TableCell>{file.fileSize ? formatFileSize(file.fileSize) : "Unknown"}</TableCell>
                  <TableCell>
                    {file.isAvailable ? (
                      <Badge className="bg-green-600 flex items-center w-fit">
                        <FileCheck className="h-3 w-3 mr-1" />
                        Available
                      </Badge>
                    ) : (
                      <Badge className="bg-red-600 flex items-center w-fit">
                        <FileX className="h-3 w-3 mr-1" />
                        Unavailable
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{file.createdAt ? formatTimeAgo(new Date(file.createdAt)) : "Unknown"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleViewFile(file.id)}
                        className="h-8 w-8"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownloadFile(file.id)}
                        className="h-8 w-8"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete File</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{file.filename || 'this file'}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteFile(file.id)}
                              className="bg-red-600 hover:bg-red-700 text-white"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed rounded-md border-gray-200 dark:border-gray-800">
          <div className="text-muted-foreground mb-2">
            {searchTerm ? "No files match your search" : "No files available for this project"}
          </div>
          {searchTerm && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setSearchTerm("")}
              className="mt-2"
            >
              Clear Search
            </Button>
          )}
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Try clicking the "Scan Files" button to refresh the file list. Debug: Project ID {projectId}, Files count: {files?.length || 0}
          </div>
        </div>
      )}
    </div>
  );
}