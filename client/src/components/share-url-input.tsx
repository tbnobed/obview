import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { getProjectShareUrl } from "@/lib/utils/url-utils";

/**
 * Component to display share URL with proper environment detection
 */
export function ShareUrlInput({ projectId }: { projectId: number }) {
  const [shareUrl, setShareUrl] = useState("");
  
  useEffect(() => {
    // Get the proper URL for the current environment
    setShareUrl(getProjectShareUrl(projectId));
  }, [projectId]);
  
  return (
    <Input 
      readOnly
      value={shareUrl}
      className="flex-1"
    />
  );
}