import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useShareLink } from "@/hooks/use-share-link";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ShareIcon, CopyIcon, CheckIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ShareLinkButtonProps {
  fileId: number;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
}

export function ShareLinkButton({ fileId, variant = "outline", size = "sm" }: ShareLinkButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const { createShareLink } = useShareLink();
  const { toast } = useToast();

  const handleOpenDialog = async () => {
    setIsOpen(true);
    setCopied(false);
    
    try {
      const result = await createShareLink.mutateAsync(fileId);
      setShareUrl(result.shareUrl);
    } catch (error) {
      console.error("Error creating share link", error);
    }
  };

  const handleCopyLink = () => {
    if (!shareUrl) return;
    
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        setCopied(true);
        toast({
          title: "Link copied",
          description: "Share link copied to clipboard",
        });
        
        // Reset copied state after 2 seconds
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((error) => {
        console.error("Error copying link", error);
        toast({
          title: "Copy failed",
          description: "Could not copy link to clipboard",
          variant: "destructive",
        });
      });
  };

  return (
    <>
      <Button 
        variant={variant} 
        size={size}
        onClick={handleOpenDialog}
        className="gap-1 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-[#026d55]"
      >
        <ShareIcon className="h-4 w-4" />
        <span>Share</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share link</DialogTitle>
            <DialogDescription>
              Anyone with this link can view this content without authentication
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex items-center space-x-2 mt-4">
            <div className="grid flex-1 gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="w-full font-mono text-sm"
              />
            </div>
            <Button 
              type="button" 
              size="icon" 
              variant="secondary"
              onClick={handleCopyLink}
            >
              {copied ? (
                <CheckIcon className="h-4 w-4" />
              ) : (
                <CopyIcon className="h-4 w-4" />
              )}
            </Button>
          </div>
          
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}