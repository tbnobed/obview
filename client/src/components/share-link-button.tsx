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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ShareIcon, CopyIcon, CheckIcon, Mail, Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
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

  const handleSendEmail = async () => {
    if (!recipientEmail) {
      toast({
        title: "Email required",
        description: "Please enter a recipient email address",
        variant: "destructive",
      });
      return;
    }

    setIsSendingEmail(true);
    try {
      await apiRequest("POST", `/api/files/${fileId}/share/email`, {
        recipientEmail,
        message: emailMessage || undefined,
      });
      
      toast({
        title: "Email sent",
        description: `Share link sent to ${recipientEmail}`,
      });
      
      // Reset email form
      setRecipientEmail("");
      setEmailMessage("");
      setShowEmailForm(false);
    } catch (error) {
      console.error("Error sending email:", error);
      toast({
        title: "Failed to send email",
        description: "Could not send the share link via email",
        variant: "destructive",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <>
      <Button 
        variant={variant} 
        size={compact ? "sm" : size}
        onClick={handleOpenDialog}
        className={`flex items-center ${compact ? 'gap-0 p-1' : 'gap-2'} ${variant === 'outline' ? 'dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50 dark:hover:text-gray-400' : 'dark:bg-[#026d55] dark:hover:bg-[#025943] dark:text-white'} ${className || ''}`}
        data-variant-type={variant}
        title={compact ? "Share this file" : undefined}
      >
        <ShareIcon className={compact ? "h-3 w-3" : "h-4 w-4"} />
        {!compact && <span className="text-inherit">Share</span>}
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
            <Button 
              type="button" 
              size="icon" 
              variant="outline"
              onClick={() => setShowEmailForm(!showEmailForm)}
              className="dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50 dark:hover:text-[#026d55]"
              title="Send via email"
            >
              <Mail className="h-4 w-4" />
            </Button>
          </div>

          {/* Email form */}
          {showEmailForm && (
            <div className="mt-4 p-4 border rounded-lg dark:border-gray-700 dark:bg-gray-800/50">
              <div className="space-y-3">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-1 dark:text-gray-300">
                    Recipient Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter email address"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
                  />
                </div>
                <div>
                  <label htmlFor="message" className="block text-sm font-medium mb-1 dark:text-gray-300">
                    Message (optional)
                  </label>
                  <Textarea
                    id="message"
                    placeholder="Add a personal message..."
                    value={emailMessage}
                    onChange={(e) => setEmailMessage(e.target.value)}
                    className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
                    rows={3}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowEmailForm(false);
                      setRecipientEmail("");
                      setEmailMessage("");
                    }}
                    className="dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSendEmail}
                    disabled={!recipientEmail || isSendingEmail}
                    className="dark:bg-[#026d55] dark:hover:bg-[#025943]/90 dark:text-white"
                  >
                    {isSendingEmail ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Email
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
          
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