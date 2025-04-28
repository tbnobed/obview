import { useState, useRef } from "react";
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

export default function FileUploadPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id);
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { data: project, isLoading: projectLoading } = useProject(projectId);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

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

    // Create a FormData object to send the file
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          const newProgress = prev + Math.random() * 10;
          return newProgress > 95 ? 95 : newProgress;
        });
      }, 300);

      // Send the file to the server
      const response = await fetch(`/api/projects/${projectId}/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      clearInterval(progressInterval);

      if (response.ok) {
        setUploadProgress(100);
        const data = await response.json();
        
        toast({
          title: "Upload successful",
          description: "File has been uploaded successfully",
        });

        // Invalidate the files query to refresh the file list
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/files`] });
        
        // Navigate back to the project detail page after a short delay
        setTimeout(() => {
          navigate(`/projects/${projectId}`);
        }, 1000);
      } else {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to upload file");
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
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
              className="border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
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
                    <p className="font-medium">Drag and drop or click to upload</p>
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
                  placeholder="Enter custom file name"
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