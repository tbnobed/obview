import { useState, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Upload, FileVideo, File, Image as ImageIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import AppLayout from "@/components/layout/app-layout";
import { useProject } from "@/hooks/use-projects";
import { queryClient } from "@/lib/queryClient";
import { uploadService } from "@/lib/upload-service";

export default function FileUploadPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id);
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const customFilenameRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { data: project, isLoading: projectLoading } = useProject(projectId);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      
      // When a file is selected, set the filename field to match
      if (customFilenameRef.current) {
        customFilenameRef.current.value = file.name;
      }
    }
  };
  
  // Handle file drop
  const handleFileDrop = useCallback((file: File) => {
    setSelectedFile(file);
    
    // Update the filename field when a file is dropped
    if (customFilenameRef.current) {
      customFilenameRef.current.value = file.name;
    }
  }, []);
  
  // Drag and drop event handlers
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Set dropEffect to 'copy' to show a copy icon on drag
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    setIsDragging(true);
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileDrop(e.dataTransfer.files[0]);
      
      // Show message when file is dropped successfully
      toast({
        title: "File selected",
        description: `${e.dataTransfer.files[0].name} ready to upload`,
      });
    }
  }, [handleFileDrop, toast]);

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    // Get the custom filename if provided
    const customFilename = customFilenameRef.current?.value?.trim();
    
    // Use our uploadService to handle the upload
    // This will continue even if the user navigates away from this page
    uploadService.uploadFile(selectedFile, projectId, customFilename);
    
    // Show success toast
    toast({
      title: "Upload started",
      description: "Your file is being uploaded in the background. You can navigate away from this page.",
    });
    
    // Navigate back to the project page
    navigate(`/projects/${projectId}`);
  };

  const getFileTypeIcon = () => {
    if (!selectedFile) return <Upload className="h-12 w-12 text-muted-foreground" />;
    
    const fileType = selectedFile.type;
    if (fileType.startsWith("video/")) {
      return <FileVideo className="h-12 w-12 text-primary" />;
    } else if (fileType.startsWith("image/")) {
      return <ImageIcon className="h-12 w-12 text-primary" />;
    } else {
      return <File className="h-12 w-12 text-primary" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (projectLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[70vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="p-6">
          <Card className="w-full max-w-3xl mx-auto">
            <CardHeader>
              <CardTitle className="text-destructive">Project Not Found</CardTitle>
              <CardDescription>
                The project you're trying to upload to doesn't exist.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button onClick={() => navigate("/projects")}>
                Return to Projects
              </Button>
            </CardFooter>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6">
        <Card className="w-full max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle>Upload Media File</CardTitle>
            <CardDescription>
              Upload a media file to project: {project.name}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div 
              ref={dropZoneRef}
              className={`border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors ${isDragging ? 'border-primary bg-primary/5' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {getFileTypeIcon()}
              
              <div className="mt-4 text-center">
                {selectedFile ? (
                  <>
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">{isDragging ? 'Drop file here' : 'Drag and drop or click to upload'}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Supports video, image, and document files
                    </p>
                  </>
                )}
              </div>
              
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="video/*,image/*,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              />
            </div>
            
            {isUploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}
            
            <div className="space-y-3">
              <div>
                <Label htmlFor="filename">File Name (Optional)</Label>
                <Input
                  id="filename"
                  ref={customFilenameRef}
                  placeholder="Enter custom file name"
                  defaultValue={selectedFile?.name || ""}
                />
              </div>
            </div>
          </CardContent>
          
          <CardFooter className="flex justify-between">
            <Button 
              variant="outline"
              onClick={() => navigate(`/projects/${projectId}`)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            
            <Button 
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Upload File"
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </AppLayout>
  );
}