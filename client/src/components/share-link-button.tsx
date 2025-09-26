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
import { Checkbox } from "@/components/ui/checkbox";
import { ShareIcon, CopyIcon, CheckIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ShareLinkButtonProps {
  fileId: number;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
  compact?: boolean;
  className?: string;
}

export function ShareLinkButton({ fileId, variant = "outline", size = "sm", compact = false, className }: ShareLinkButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const { createShareLink } = useShareLink();
  const { toast } = useToast();

  const generateShareUrl = async () => {
    try {
      const result = await createShareLink.mutateAsync(fileId);
      let url = result.shareUrl;
      if (viewOnly) {
        url += "?viewOnly=true";
      }
      setShareUrl(url);
    } catch (error) {
      console.error("Error creating share link", error);
    }
  };

  const handleOpenDialog = async () => {
    setIsOpen(true);
    setCopied(false);
    await generateShareUrl();
  };

  const handleViewOnlyChange = async (checked: boolean) => {
    setViewOnly(checked);
    setCopied(false);
    // Regenerate URL with new viewOnly setting
    try {
      const result = await createShareLink.mutateAsync(fileId);
      let url = result.shareUrl;
      if (checked) {
        url += "?viewOnly=true";
      }
      setShareUrl(url);
    } catch (error) {
      console.error("Error updating share link", error);
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
        size={compact ? "sm" : size}
        onClick={handleOpenDialog}
        className={`${compact ? 'gap-0 p-1' : 'gap-1'} ${variant === 'outline' ? 'dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50 dark:hover:text-[#026d55] hover-smooth-light' : 'dark:bg-[#026d55] dark:hover:bg-[#025943]/90 dark:text-white hover-teal'} ${className || ''}`}
        data-variant-type={variant}
        title={compact ? "Share this file" : undefined}
      >
        <ShareIcon className={compact ? "h-3 w-3" : "h-4 w-4"} />
        {!compact && <span>Share</span>}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md dark:bg-gray-900 dark:border-gray-800">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Share link</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Anyone with this link can view this content without authentication
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex items-center space-x-2 mt-4 mb-3">
            <Checkbox 
              id="viewOnly" 
              checked={viewOnly}
              onCheckedChange={handleViewOnlyChange}
              data-testid="checkbox-view-only"
            />
            <label 
              htmlFor="viewOnly" 
              className="text-sm font-medium text-gray-900 dark:text-gray-300 cursor-pointer"
            >
              View only (hide comments)
            </label>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="grid flex-1 gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="w-full font-mono text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
              />
            </div>
            <Button 
              type="button" 
              size="icon" 
              variant="secondary"
              onClick={handleCopyLink}
              className="dark:bg-[#026d55] dark:hover:bg-[#025943]/90 dark:text-white hover-teal"
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
              className="dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50 dark:hover:text-[#026d55] hover-smooth-light"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}