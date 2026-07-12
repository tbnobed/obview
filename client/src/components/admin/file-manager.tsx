import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, FileIcon, Video, Image as ImageIcon, FileText, File, Eye, RefreshCw, HardDrive, FileCheck, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, CheckCircle2, Loader2, Clock } from "lucide-react";
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

interface SpriteMeta {
  cols: number;
  rows: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
  thumbnailCount: number;
  duration: number;
}

/**
 * Hover-scrubbable video preview. Lazily fetches sprite metadata the
 * first time the row is hovered, then renders the sprite as a CSS
 * background sized to (cols x rows) tiles and shifts the position to
 * the tile under the cursor. Falls back to the static cropped
 * thumbnail when sprite metadata is unavailable.
 */
function ScrubbablePreview({ fileId }: { fileId: number }) {
  const [meta, setMeta] = useState<SpriteMeta | null>(null);
  const [failed, setFailed] = useState(false);
  const [idx, setIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  const loadMeta = () => {
    if (fetchedRef.current || failed) return;
    fetchedRef.current = true;
    fetch(`/api/files/${fileId}/sprite-metadata`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((m: SpriteMeta) => {
        if (m && m.cols > 0 && m.rows > 0 && m.thumbnailCount > 0) setMeta(m);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!meta || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(0.9999, (e.clientX - rect.left) / rect.width));
    setIdx(Math.floor(ratio * meta.thumbnailCount));
  };

  if (!meta) {
    // Either we haven't fetched yet, or sprite metadata isn't available.
    // Show the cropped first-frame thumbnail and prime the fetch on hover.
    return (
      <div
        ref={containerRef}
        className="w-full h-full"
        onMouseEnter={loadMeta}
      >
        <img
          src={`/api/files/${fileId}/thumbnail`}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      </div>
    );
  }

  const col = idx % meta.cols;
  const row = Math.floor(idx / meta.cols);
  // Position math: with backgroundSize cols*100% x rows*100%, valid
  // positions are 0..100% mapped across (cols-1) / (rows-1) steps.
  const xPct = meta.cols > 1 ? (col / (meta.cols - 1)) * 100 : 0;
  const yPct = meta.rows > 1 ? (row / (meta.rows - 1)) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="w-full h-full cursor-col-resize"
      onMouseMove={onMouseMove}
      onMouseLeave={() => setIdx(0)}
      style={{
        backgroundImage: `url(/api/files/${fileId}/sprite)`,
        backgroundSize: `${meta.cols * 100}% ${meta.rows * 100}%`,
        backgroundPosition: `${xPct}% ${yPct}%`,
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

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
    fileType?: string;
    originalFilename?: string;
    processingStatus?: string | null;
    processingError?: string | null;
  } | null;
}

type SortKey = "filename" | "size" | "createdAt" | "uploadedByName" | "projectName";
type SortDir = "asc" | "desc";

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
  const [showCleanupResults, setShowCleanupResults] = useState(false);
  const [cleanupResults, setCleanupResults] = useState<any>(null);
  const [showForceDeleteResults, setShowForceDeleteResults] = useState(false);
  const [forceDeleteResults, setForceDeleteResults] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [failedOnly, setFailedOnly] = useState(false);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "createdAt" || key === "size" ? "desc" : "asc");
    }
  };
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-50" /> :
    sortDir === "asc" ? <ArrowUp className="inline h-3 w-3 ml-1" /> :
    <ArrowDown className="inline h-3 w-3 ml-1" />;

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
      
      try {
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
      } catch (error) {
        // Direct catch of the fetch error or other network errors
        console.log('Error during file deletion:', error);
        
        // Check if error message contains "not found" or similar phrases
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (
          errorMessage.toLowerCase().includes('not found') || 
          errorMessage.toLowerCase().includes('no such file') ||
          errorMessage.toLowerCase().includes('enoent')
        ) {
          console.log('Error contains file not found indicators, handling gracefully');
          return { 
            success: true, 
            notFound: true,
            message: "File not found on server, but removed from the list" 
          };
        }
        
        // If it's not a "not found" error, rethrow
        throw error;
      }
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
  
  // Orphaned files cleanup mutation
  const cleanupMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/cleanup-orphaned-files");
    },
    onSuccess: (data) => {
      console.log("Cleanup completed:", data);
      setCleanupResults(data);
      setShowCleanupResults(true);
      
      // Refresh the file list
      queryClient.invalidateQueries({ queryKey: ["/api/system/uploads"] });
      
      toast({
        title: "Cleanup Complete",
        description: `Successfully removed ${data.results.totalFilesRemoved} orphaned files.`,
      });
    },
    onError: (error: Error) => {
      console.error("Cleanup error:", error);
      toast({
        title: "Cleanup Failed",
        description: `Failed to cleanup orphaned files: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  // Force delete unlinked files mutation
  const forceDeleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/force-delete-unlinked");
    },
    onSuccess: (data) => {
      console.log("Force delete completed:", data);
      setForceDeleteResults(data);
      setShowForceDeleteResults(true);
      
      // Refresh the file list
      queryClient.invalidateQueries({ queryKey: ["/api/system/uploads"] });
      
      toast({
        title: "Force Delete Complete",
        description: `Successfully removed ${data.results?.totalFilesRemoved || 0} unlinked files.`,
      });
    },
    onError: (error: Error) => {
      console.error("Force delete error:", error);
      toast({
        title: "Force Delete Failed",
        description: `Failed to delete unlinked files: ${error.message}`,
        variant: "destructive",
      });
    }
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

  // Apply optimistic deletions, search text filter, and sorting.
  const filteredFiles = useMemo(() => {
    if (!files) return undefined;
    const filtered = files
      .filter(file => !optimisticFiles.includes(file.filename))
      .filter(file => !failedOnly || file.metadata?.processingStatus === "failed")
      .filter(file =>
        !searchText ||
        file.filename.toLowerCase().includes(searchText.toLowerCase()) ||
        (file.metadata?.originalFilename &&
          file.metadata.originalFilename.toLowerCase().includes(searchText.toLowerCase())) ||
        (file.metadata?.projectName &&
          file.metadata.projectName.toLowerCase().includes(searchText.toLowerCase())) ||
        (file.metadata?.uploadedByName &&
          file.metadata.uploadedByName.toLowerCase().includes(searchText.toLowerCase()))
      );
    const dir = sortDir === "asc" ? 1 : -1;
    const get = (f: FileDetails): string | number => {
      switch (sortKey) {
        case "filename": return (f.metadata?.originalFilename || f.filename).toLowerCase();
        case "size": return f.size;
        case "createdAt": return new Date(f.createdAt).getTime();
        case "uploadedByName": return (f.metadata?.uploadedByName || "").toLowerCase();
        case "projectName": return (f.metadata?.projectName || "").toLowerCase();
      }
    };
    return [...filtered].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [files, optimisticFiles, searchText, sortKey, sortDir, failedOnly]);

  // Count of files whose transcode failed, for the filter toggle badge.
  const failedCount = useMemo(
    () =>
      files?.filter(
        f => !optimisticFiles.includes(f.filename) && f.metadata?.processingStatus === "failed"
      ).length ?? 0,
    [files, optimisticFiles]
  );

  // Drop selections that no longer exist (e.g. after delete or filter change).
  useEffect(() => {
    if (!filteredFiles) return;
    const visible = new Set(filteredFiles.map(f => f.filename));
    setSelected(prev => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach(name => {
        if (visible.has(name)) next.add(name);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [filteredFiles]);

  const allVisibleSelected = !!filteredFiles && filteredFiles.length > 0 &&
    filteredFiles.every(f => selected.has(f.filename));
  const someVisibleSelected = !!filteredFiles &&
    filteredFiles.some(f => selected.has(f.filename)) && !allVisibleSelected;

  const toggleAll = () => {
    if (!filteredFiles) return;
    setSelected(prev => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        filteredFiles.forEach(f => next.delete(f.filename));
        return next;
      }
      const next = new Set(prev);
      filteredFiles.forEach(f => next.add(f.filename));
      return next;
    });
  };
  const toggleOne = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async (filenames: string[]) => {
      setOptimisticFiles(prev => [...prev, ...filenames]);
      const res = await fetch("/api/system/uploads/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ filenames }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ succeeded: number; failed: number; results: { filename: string; ok: boolean; error?: string }[] }>;
    },
    onSuccess: (data, attempted) => {
      const okSet = new Set(data.results.filter(r => r.ok).map(r => r.filename));
      // Remove successes from the cached list so they vanish immediately;
      // failed rows must reappear so the user can retry them.
      queryClient.setQueryData<FileDetails[]>(["/api/system/uploads"], (old) =>
        old ? old.filter(f => !okSet.has(f.filename)) : []
      );
      // Drop the entire attempted batch from optimistic-hide — failures
      // need to be visible again, and successes are already gone from
      // cache above.
      setOptimisticFiles(prev => prev.filter(n => !attempted.includes(n)));
      // Clear successful rows from the selection; keep failed rows
      // selected so a retry click hits the same set.
      setSelected(prev => {
        const next = new Set(prev);
        okSet.forEach(n => next.delete(n));
        return next;
      });
      if (data.failed > 0) {
        toast({
          title: `Deleted ${data.succeeded}, failed ${data.failed}`,
          description: data.results.filter(r => !r.ok).slice(0, 3).map(r => `${r.filename}: ${r.error}`).join("; "),
          variant: "destructive",
        });
      } else {
        toast({ title: "Deleted", description: `Removed ${data.succeeded} file(s).` });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/system/uploads"] });
    },
    onError: (err: Error, filenames) => {
      setOptimisticFiles(prev => prev.filter(n => !filenames.includes(n)));
      toast({ title: "Bulk delete failed", description: err.message, variant: "destructive" });
    },
  });

  // Format file size for display
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Render a small badge for a file's transcode status. null status (images,
  // or files with no processing row) renders as a muted dash.
  const renderStatus = (status?: string | null, errorMessage?: string | null) => {
    if (!status) return <span className="text-gray-400 dark:text-gray-500">—</span>;
    const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";
    if (status === "failed") {
      return (
        <span
          className={`${base} bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400`}
          title={errorMessage || "Processing failed"}
          data-testid="status-failed"
        >
          <AlertTriangle className="h-3 w-3" /> Failed
        </span>
      );
    }
    if (status === "completed") {
      return (
        <span className={`${base} bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400`}>
          <CheckCircle2 className="h-3 w-3" /> Ready
        </span>
      );
    }
    if (status === "processing") {
      return (
        <span className={`${base} bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400`}>
          <Loader2 className="h-3 w-3 animate-spin" /> Processing
        </span>
      );
    }
    return (
      <span className={`${base} bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400`}>
        <Clock className="h-3 w-3" /> Pending
      </span>
    );
  };

  // Determine file icon based on filename
  const getFileIcon = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    
    if (ext === "mp4" || ext === "mov" || ext === "webm" || ext === "avi") {
      return <Video className="h-5 w-5 text-blue-500" />;
    } else if (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "gif" || ext === "webp") {
      return <ImageIcon className="h-5 w-5 text-green-500" />;
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
          
          <Button 
            onClick={() => cleanupMutation.mutate()}
            variant="outline"
            className="flex items-center gap-2 text-orange-600 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-600 dark:hover:bg-orange-900/20"
            disabled={cleanupMutation.isPending}
          >
            {cleanupMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {cleanupMutation.isPending ? 'Cleaning...' : 'Clean Orphaned Files'}
          </Button>
          
          <Button 
            onClick={() => forceDeleteMutation.mutate()}
            variant="outline"
            className="flex items-center gap-2 text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-600 dark:hover:bg-red-900/20"
            disabled={forceDeleteMutation.isPending}
          >
            {forceDeleteMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {forceDeleteMutation.isPending ? 'Deleting...' : 'Force Delete Unlinked'}
          </Button>
          <Button
            onClick={() => setFailedOnly(v => !v)}
            variant={failedOnly ? "default" : "outline"}
            className={`flex items-center gap-2 ${failedOnly ? "" : "text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-600 dark:hover:bg-red-900/20"}`}
            data-testid="filter-failed-only"
          >
            <AlertTriangle className="h-4 w-4" />
            {failedOnly ? "Showing failed" : "Failed only"}
            {failedCount > 0 && (
              <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                {failedCount}
              </span>
            )}
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

      {/* Cleanup Results Dialog */}
      <Dialog open={showCleanupResults} onOpenChange={setShowCleanupResults}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Trash2 className="h-5 w-5 mr-2 text-orange-500" />
              Orphaned Files Cleanup Results
            </DialogTitle>
            <DialogDescription>
              Results of the orphaned files cleanup operation
            </DialogDescription>
          </DialogHeader>
          
          {cleanupResults && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-900">
                  <h3 className="text-sm font-medium mb-2 text-orange-700 dark:text-orange-400">Orphaned Original Files</h3>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{cleanupResults.results.orphanedOriginals}</p>
                </div>
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900">
                  <h3 className="text-sm font-medium mb-2 text-blue-700 dark:text-blue-400">Orphaned Processed Dirs</h3>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{cleanupResults.results.orphanedProcessed}</p>
                </div>
              </div>
              
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900">
                <h3 className="text-sm font-medium mb-2 text-green-700 dark:text-green-400">Total Files Removed</h3>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{cleanupResults.results.totalFilesRemoved}</p>
              </div>
              
              {cleanupResults.results.errors.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium mb-2 flex items-center">
                    <AlertTriangle className="h-4 w-4 text-red-500 mr-1" />
                    Errors ({cleanupResults.results.errors.length})
                  </h3>
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg p-3 max-h-32 overflow-y-auto">
                    {cleanupResults.results.errors.map((error: string, index: number) => (
                      <div key={index} className="text-sm text-red-700 dark:text-red-400 mb-1">
                        {error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={() => setShowCleanupResults(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Delete Results Dialog */}
      <Dialog open={showForceDeleteResults} onOpenChange={setShowForceDeleteResults}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Trash2 className="h-5 w-5 mr-2 text-red-500" />
              Force Delete Results
            </DialogTitle>
            <DialogDescription>
              Results of the force deletion of unlinked files
            </DialogDescription>
          </DialogHeader>
          
          {forceDeleteResults && (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900">
                <h3 className="text-sm font-medium mb-2 text-red-700 dark:text-red-400">Files Permanently Deleted</h3>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{forceDeleteResults.results?.deletedFiles || 0}</p>
              </div>
              
              {forceDeleteResults.results?.errors?.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium mb-2 flex items-center">
                    <AlertTriangle className="h-4 w-4 text-red-500 mr-1" />
                    Errors ({forceDeleteResults.results?.errors?.length || 0})
                  </h3>
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg p-3 max-h-32 overflow-y-auto">
                    {forceDeleteResults.results?.errors?.map((error: string, index: number) => (
                      <div key={index} className="text-sm text-red-700 dark:text-red-400 mb-1">
                        {error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={() => setShowForceDeleteResults(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
          <div className="text-sm">
            <strong>{selected.size}</strong> file{selected.size === 1 ? "" : "s"} selected
            <Button
              variant="link"
              size="sm"
              className="ml-2 h-auto p-0"
              onClick={() => setSelected(new Set())}
              data-testid="bulk-clear-selection"
            >
              Clear
            </Button>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setBulkConfirmOpen(true)}
            disabled={bulkDeleteMutation.isPending}
            data-testid="bulk-delete-button"
          >
            {bulkDeleteMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Delete selected
          </Button>
        </div>
      )}

      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} file{selected.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected files from disk and marks any linked
              database records as unavailable. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                bulkDeleteMutation.mutate(Array.from(selected));
                setBulkConfirmOpen(false);
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="bulk-delete-confirm"
            >
              Delete {selected.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {filteredFiles && filteredFiles.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                      data-testid="bulk-select-all"
                    />
                  </TableHead>
                  <TableHead className="w-24">Preview</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("filename")}>
                    File<SortIcon k="filename" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("size")}>
                    Size<SortIcon k="size" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("createdAt")}>
                    Uploaded<SortIcon k="createdAt" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("uploadedByName")}>
                    Uploaded by<SortIcon k="uploadedByName" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("projectName")}>
                    Project<SortIcon k="projectName" />
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFiles.map((file) => {
                  const id = file.metadata?.id;
                  const ftype = file.metadata?.fileType;
                  const isSelected = selected.has(file.filename);
                  return (
                    <TableRow key={file.filename} data-state={isSelected ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleOne(file.filename)}
                          aria-label={`Select ${file.filename}`}
                          data-testid={`row-select-${file.filename}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div
                          className="h-12 w-20 rounded border bg-neutral-100 dark:bg-gray-800 overflow-hidden flex items-center justify-center"
                          data-testid={`thumb-${file.filename}`}
                        >
                          {id && ftype === "video" ? (
                            <ScrubbablePreview fileId={id} />
                          ) : id && ftype === "image" ? (
                            <img
                              src={`/api/files/${id}/content`}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            getFileIcon(file.filename)
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {getFileIcon(file.metadata?.originalFilename || file.filename)}
                          <span
                            className="truncate max-w-xs"
                            title={file.metadata?.originalFilename
                              ? `${file.metadata.originalFilename}\n(stored as ${file.filename})`
                              : file.filename}
                          >
                            {file.metadata?.originalFilename || file.filename}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{formatFileSize(file.size)}</TableCell>
                      <TableCell>
                        {formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        {file.metadata?.uploadedByName ? (
                          <span>{file.metadata.uploadedByName}</span>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {file.metadata?.projectName ? (
                          <span className="text-primary">{file.metadata.projectName}</span>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {renderStatus(file.metadata?.processingStatus, file.metadata?.processingError)}
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
                  );
                })}
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
              {failedOnly
                ? "No files failed to process."
                : searchText
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