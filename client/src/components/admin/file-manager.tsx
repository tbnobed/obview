import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, FileIcon, Video, Image, FileText, File, Eye, RefreshCw, HardDrive, FileCheck, AlertCircle } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FileDetails {
  filename: string;
  path: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
  isDirectory: boolean;
  metadata: {
    id: number;
    projectId: number;
    projectName: string;
    uploadedById: number;
    uploadedByName: string;
  } | null;
}

interface FileScanResult {
  message: string;
  stats: {
    totalDatabaseFiles: number;
    totalFileSystemFiles: number;
    missingFilesUpdated: number;
    existingFilesUpdated: number;
    errors: string[];
  };
}

export default function FileManager() {
  const [searchText, setSearchText] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [optimisticFiles, setOptimisticFiles] = useState<string[]>([]);
  const [showScanResults, setShowScanResults] = useState(false);
  const [scanResults, setScanResults] = useState<FileScanResult | null>(null);

  // Fetch uploaded files
  const { data: files, isLoading, error } = useQuery<FileDetails[]>({
    queryKey: ["/api/system/uploads"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
  // Reset optimistic files on successful query
  useEffect(() => {
    if (files) {
      setOptimisticFiles([]);
    }
  }, [files]);

  // Delete file mutation
  const deleteMutation = useMutation({
    mutationFn: async (filename: string) => {
      // Add to optimistic deletions immediately
      setOptimisticFiles(prev => [...prev, filename]);
      
      const response = await apiRequest("DELETE", `/api/system/uploads/${encodeURIComponent(filename)}`);
      
      // Handle response properly based on status code
      if (response.status >= 200 && response.status < 300) {
        try {
          // Only try to parse JSON if content exists
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            return await response.json();
          }
          // If no JSON or empty response, just return success
          return { success: true };
        } catch (jsonError) {
          console.log('Response was not JSON, but operation succeeded:', response.status);
          return { success: true };
        }
      }
      
      // Special case: 404 Not Found - handle gracefully
      if (response.status === 404) {
        console.log('File not found on server, but will update UI to remove it');
        // Return a special object to indicate file wasn't found but UI should update
        return { 
          success: true, 
          notFound: true,
          message: "File not found on server, but removed from the list" 
        };
      }
      
      // Handle other error responses
      let errorMessage = `Server error: ${response.status}`;
      try {
        const errorData = await response.text();
        if (errorData) {
          try {
            // Try to parse as JSON
            const jsonError = JSON.parse(errorData);
            errorMessage = jsonError.message || jsonError.error || errorMessage;
          } catch (e) {
            // If not JSON, use as plain text
            errorMessage = errorData;
          }
        }
      } catch (e) {
        // If we can't read the error, just use status
        console.error('Could not read error response:', e);
      }
      
      throw new Error(errorMessage);
    },
    onSuccess: (result: any, filename) => {
      // Update the cache instead of invalidating for a smoother experience
      queryClient.setQueryData<FileDetails[]>(["/api/system/uploads"], (oldData) => {
        if (!oldData) return [];
        return oldData.filter(file => file.filename !== filename);
      });
      
      // Show appropriate toast based on result
      if (result.notFound) {
        toast({
          title: "File Removed",
          description: "The file was not found on the server but has been removed from the list.",
        });
      } else {
        toast({
          title: "File Deleted",
          description: "The file was successfully deleted.",
        });
      }
    },
    onError: (error: Error, filename) => {
      // Remove from optimistic deletions if there was an error
      setOptimisticFiles(prev => prev.filter(name => name !== filename));
      
      toast({
        title: "Error",
        description: `Failed to delete file: ${error.message}`,
        variant: "destructive",
      });
    },
  });
  
  // File system scan mutation to check file availability
  const scanMutation = useMutation({
    mutationFn: async () => {
      try {
        // Using fetch directly to avoid issues with apiRequest and response handling
        const response = await fetch("/api/admin/scan-files", {
          method: "POST",
          credentials: "include"
        });
        
        console.log("Direct fetch response status:", response.status);
        
        // If we got an OK response, try to parse the JSON safely
        if (response.ok) {
          try {
            // First clone the response before trying to read it
            const clone = response.clone();
            
            // Try to get the result as JSON directly
            const jsonResult = await response.json();
            console.log("Successfully parsed response JSON:", jsonResult);
            return jsonResult;
          } catch (jsonError) {
            console.error("JSON parsing failed:", jsonError);
            
            // Fallback - we already consumed the response body in the failed json() call
            // so we can't read it again. Return a predefined fallback response.
            return {
              message: "File system scan completed with parsing error",
              stats: {
                totalDatabaseFiles: 0,
                totalFileSystemFiles: 0,
                missingFilesUpdated: 0,
                existingFilesUpdated: 0,
                errors: ["Failed to parse server response as JSON"]
              }
            };
          }
        } else {
          // Non-OK response
          console.error(`Server returned error status: ${response.status}`);
          return {
            message: `File system scan failed with status ${response.status}`,
            stats: {
              totalDatabaseFiles: 0,
              totalFileSystemFiles: 0,
              missingFilesUpdated: 0,
              existingFilesUpdated: 0,
              errors: [`Server returned status code ${response.status}`]
            }
          };
        }
      } catch (error) {
        // Network or other error
        console.error("Network or other error during scan:", error);
        
        return {
          message: "File system scan failed due to network error",
          stats: {
            totalDatabaseFiles: 0,
            totalFileSystemFiles: 0,
            missingFilesUpdated: 0,
            existingFilesUpdated: 0,
            errors: [`Network error: ${error instanceof Error ? error.message : String(error)}`]
          }
        };
      }
    },
    onSuccess: (data: FileScanResult) => {
      setScanResults(data);
      setShowScanResults(true);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/system/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/debug/files"] });
      
      toast({
        title: "File System Scan Complete",
        description: `Updated ${data.stats.missingFilesUpdated + data.stats.existingFilesUpdated} files in the database.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Scan Failed",
        description: `Error during file system scan: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Apply optimistic deletions and search text filter
  const filteredFiles = files
    ?.filter(file => !optimisticFiles.includes(file.filename)) // Remove files being deleted
    .filter(file => 
      !searchText || 
      file.filename.toLowerCase().includes(searchText.toLowerCase()) ||
      (file.metadata?.projectName &&
       file.metadata.projectName.toLowerCase().includes(searchText.toLowerCase()))
    );

  // Format file size for display
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Determine file icon based on filename
  const getFileIcon = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    
    if (ext === "mp4" || ext === "mov" || ext === "webm" || ext === "avi") {
      return <Video className="h-5 w-5 text-blue-500" />;
    } else if (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "gif" || ext === "webp") {
      return <Image className="h-5 w-5 text-green-500" />;
    } else if (ext === "pdf" || ext === "doc" || ext === "docx" || ext === "txt") {
      return <FileText className="h-5 w-5 text-orange-500" />;
    } else {
      return <File className="h-5 w-5 text-gray-500" />;
    }
  };

  // Handle file delete confirmation
  const handleDeleteFile = (filename: string) => {
    deleteMutation.mutate(filename);
  };

  // View file in new tab
  const handleViewFile = (file: FileDetails) => {
    // If the file is linked to a database record, use the API endpoint
    if (file.metadata?.id) {
      window.open(`/api/files/${file.metadata.id}/content`, '_blank');
    } else {
      // If no metadata/database record, we need a direct endpoint to view system uploads
      // Let's create a toast message about this
      toast({
        title: "File not viewable",
        description: "This file is in the uploads directory but not linked to any database record. It cannot be viewed directly.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
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

  // Handle scan files button click
  const handleScanFiles = () => {
    scanMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Uploaded Files Management</h2>
        <div className="flex gap-2">
          <Button 
            onClick={handleScanFiles}
            variant="outline"
            className="flex items-center gap-2"
            disabled={scanMutation.isPending}
          >
            {scanMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <HardDrive className="h-4 w-4" />
            )}
            {scanMutation.isPending ? 'Scanning...' : 'Scan File System'}
          </Button>
          <Input
            className="max-w-xs"
            placeholder="Search files..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </div>
      
      {/* Scan Results Dialog */}
      <Dialog open={showScanResults} onOpenChange={setShowScanResults}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <FileCheck className="h-5 w-5 mr-2 text-green-500" />
              File System Scan Results
            </DialogTitle>
            <DialogDescription>
              Results of the file system scan and database updates
            </DialogDescription>
          </DialogHeader>
          
          {scanResults && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border">
                  <h3 className="text-sm font-medium mb-2">Database Files</h3>
                  <p className="text-2xl font-bold">{scanResults.stats.totalDatabaseFiles}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border">
                  <h3 className="text-sm font-medium mb-2">Filesystem Files</h3>
                  <p className="text-2xl font-bold">{scanResults.stats.totalFileSystemFiles}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900">
                  <h3 className="text-sm font-medium mb-2 text-green-700 dark:text-green-400">Files Marked Available</h3>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{scanResults.stats.existingFilesUpdated}</p>
                </div>
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900">
                  <h3 className="text-sm font-medium mb-2 text-amber-700 dark:text-amber-400">Files Marked Unavailable</h3>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{scanResults.stats.missingFilesUpdated}</p>
                </div>
              </div>
              
              {scanResults.stats.errors.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium mb-2 flex items-center">
                    <AlertCircle className="h-4 w-4 text-red-500 mr-1" />
                    Errors ({scanResults.stats.errors.length})
                  </h3>
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3 text-sm text-red-800 dark:text-red-300 max-h-32 overflow-y-auto">
                    <ul className="list-disc pl-5 space-y-1">
                      {scanResults.stats.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={() => setShowScanResults(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {filteredFiles && filteredFiles.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFiles.map((file) => (
                  <TableRow key={file.filename}>
                    <TableCell className="font-medium flex items-center gap-2">
                      {getFileIcon(file.filename)}
                      <span className="truncate max-w-xs" title={file.filename}>
                        {file.filename}
                      </span>
                    </TableCell>
                    <TableCell>{formatFileSize(file.size)}</TableCell>
                    <TableCell>
                      {formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      {file.metadata?.projectName ? (
                        <span className="text-primary">{file.metadata.projectName}</span>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400">Unknown</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewFile(file)}
                          title="View file"
                          disabled={!file.metadata?.id}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the file "{file.filename}". This action cannot be undone.
                                {file.metadata?.projectId && (
                                  <p className="mt-2 text-amber-600 dark:text-amber-400">
                                    Warning: This file appears to be linked to a project. Deleting it might break 
                                    references in the application.
                                  </p>
                                )}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteFile(file.filename)}
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
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <FileIcon className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-200">No Files Found</h3>
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              {searchText
                ? "No files match your search criteria. Try a different search term."
                : "There are no files in the uploads directory."}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        <p>Total files: {filteredFiles?.length || 0}</p>
        <p className="mt-1">
          Note: Files shown here represent the actual files in the uploads directory. Some files may
          not be associated with any projects in the database.
        </p>
      </div>
    </div>
  );
}