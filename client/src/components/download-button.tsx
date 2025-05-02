import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { File as StorageFile } from "@shared/schema";

interface DownloadButtonProps {
  fileId: number;
  filename: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
  isAvailable?: boolean;
}

export function DownloadButton({ fileId, filename, variant = "outline", size = "sm", isAvailable = true }: DownloadButtonProps) {
  const { toast } = useToast();

  const handleDownload = async () => {
    try {
      if (isAvailable === false) {
        toast({
          title: "Download failed",
          description: "This file is no longer available on the server.",
          variant: "destructive",
        });
        return;
      }

      // Create a link and simulate a click to download the file
      const downloadUrl = `/api/files/${fileId}/download`;
      
      // First, check if the file is available by making a HEAD request
      const response = await fetch(downloadUrl, { method: 'HEAD' });
      
      if (!response.ok) {
        // File not found or other error
        toast({
          title: "Download failed",
          description: "The file could not be accessed. It may have been deleted from the server.",
          variant: "destructive",
        });
        return;
      }
      
      // If everything looks good, proceed with the download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', filename); // Browser will use server's content-disposition header
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Download started",
        description: `Downloading ${filename}`,
      });
    } catch (error) {
      console.error("Error downloading file", error);
      toast({
        title: "Download failed",
        description: "Could not download the file",
        variant: "destructive",
      });
    }
  };

  return (
    <Button 
      variant={variant} 
      size={size}
      onClick={handleDownload}
      className={`gap-1 ${variant === 'outline' ? 'dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50 dark:hover:text-[#026d55] hover-smooth-light' : 'dark:bg-[#026d55] dark:hover:bg-[#025943]/90 dark:text-white hover-teal'}`}
      disabled={isAvailable === false}
    >
      <Download className="h-4 w-4" />
      <span>Download</span>
    </Button>
  );
}