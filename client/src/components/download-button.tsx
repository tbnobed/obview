import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DownloadButtonProps {
  fileId: number;
  filename: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
}

export function DownloadButton({ fileId, filename, variant = "outline", size = "sm" }: DownloadButtonProps) {
  const { toast } = useToast();

  const handleDownload = () => {
    try {
      // Create a link and simulate a click to download the file
      const downloadUrl = `/api/files/${fileId}/download`;
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
      className={`gap-1 ${variant === 'outline' ? 'dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-[#026d55]' : 'dark:bg-[#026d55] dark:hover:bg-[#025943] dark:text-white'}`}
    >
      <Download className="h-4 w-4" />
      <span>Download</span>
    </Button>
  );
}