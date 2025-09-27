import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Paperclip, Image, Smile, Send, Clock } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface CommentFormProps {
  fileId: number;
  parentId?: string;
  currentTime?: number;
  onSuccess?: () => void;
  className?: string;
}

export default function CommentForm({ 
  fileId, 
  parentId, 
  currentTime, 
  onSuccess,
  className
}: CommentFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [includeTimestamp, setIncludeTimestamp] = useState(currentTime !== undefined && !parentId);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  
  // Format time (seconds to MM:SS)
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // Close emoji picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to auto to get accurate scrollHeight
      textareaRef.current.style.height = 'auto';
      // Set height to scrollHeight with some maximum limits
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = window.innerWidth >= 1024 ? 200 : 120; // 200px desktop, 120px mobile
      textareaRef.current.style.height = Math.min(scrollHeight, maxHeight) + 'px';
      
      // Enable scrolling if content exceeds max height
      if (scrollHeight > maxHeight) {
        textareaRef.current.style.overflowY = 'auto';
      } else {
        textareaRef.current.style.overflowY = 'hidden';
      }
    }
  }, [content]);

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: async (commentContent: string) => {
      const commentData = {
        content: commentContent,
        fileId,
        parentId: parentId || null,
        timestamp: includeTimestamp && currentTime !== undefined ? Math.floor(currentTime) : null,
      };
      
      console.log("Submitting comment:", commentData);
      return apiRequest("POST", `/api/files/${fileId}/comments`, commentData);
    },
    onSuccess: (data) => {
      setContent("");
      if (textareaRef.current) {
        textareaRef.current.value = "";
      }
      
      toast({
        title: "Comment added",
        description: "Your comment has been added successfully",
      });
      console.log("Comment added successfully:", data);
      // Invalidate the array-format query key we're using in useComments
      queryClient.invalidateQueries({ queryKey: ['/api/files', fileId, 'comments'] });
      // Also invalidate project comments to update the project page
      queryClient.invalidateQueries({ queryKey: ['/api/projects', null, 'comments'] });
      if (onSuccess) onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Emojis organized by category for the emoji picker
  const [activeEmojiCategory, setActiveEmojiCategory] = useState<string>("quickAccess");
  
  // Define a more comprehensive set of emoji categories
  const emojiCategories = {
    quickAccess: [
      "👍", "👎", "❤️", "😊", "😂", "😍", "🙂", "😉", "🤔", "👏", "🔥", "✅",
      "❌", "⭐", "🎉", "👀", "💯", "🙏"
    ],
    smileys: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", 
      "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙"
    ],
    people: [
      "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👋", "🖐️", 
      "👏", "🙌", "👐", "🤲", "🙏", "🤝", "💪", "👊", "✊", "🤜"
    ],
    objects: [
      "💻", "📱", "💾", "💿", "📷", "🎥", "🔍", "🔑", "📁", "📝",
      "📊", "📈", "📉", "📋", "🎬", "🎮", "🎯", "🎲", "🎭", "🎨"
    ],
    nature: [
      "🌱", "🌲", "🌳", "🌴", "🌵", "🌷", "🌸", "🌹", "🌺", "🌻",
      "🍀", "🌿", "☘️", "🍃", "🍂", "🍁", "🌾", "🌞", "🌝", "🌚"
    ],
    symbols: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "✝️", "☪️", "🕉️", "☸️", "✡️", "🔯", "⚠️", "✅", "❌", "⭕"
    ]
  };
  
  // Category labels for UI
  const categoryLabels: Record<string, string> = {
    quickAccess: "Quick Access",
    smileys: "Smileys",
    people: "People",
    objects: "Objects",
    nature: "Nature",
    symbols: "Symbols"
  };
  
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    try {
      setIsUploading(true);
      
      const file = files[0];
      const isImage = file.type.startsWith('image/');
      
      // Create FormData for upload
      const formData = new FormData();
      formData.append('file', file);
      
      // Upload file to server - this endpoint expects the file upload for a project
      // but we're using it in the comment context, so we're using the file's associated projectId
      let projectId: number;
      
      try {
        // First try to get the project ID from the file information
        const currentFile = await fetch(`/api/files/${fileId}`, {
          method: 'GET',
          credentials: 'include'
        });
        
        if (currentFile.ok) {
          const fileData = await currentFile.json();
          projectId = fileData.projectId;
        } else {
          // If we can't get the file, try to get the project directly from the file's parent project
          const fileProjects = await fetch(`/api/files/${fileId}/project`, {
            method: 'GET',
            credentials: 'include'
          });
          
          if (fileProjects.ok) {
            const projectData = await fileProjects.json();
            projectId = projectData.id;
          } else {
            // Fallback
            throw new Error('Failed to get project information for this file');
          }
        }
      } catch (error) {
        console.error('Error getting project ID:', error);
        throw new Error('Failed to determine which project this file belongs to');
      }
      
      // Now use the correct project ID for the upload
      const response = await fetch(`/api/projects/${projectId}/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload file');
      }
      
      const uploadedFile = await response.json();
      
      // Add file reference to comment
      const currentContent = textareaRef.current?.value || "";
      // Create simple reference without extra new lines to avoid nesting issues
      const fileRef = isImage 
        ? `![${file.name}](/api/files/${uploadedFile.id}/content)` 
        : `[${file.name}](/api/files/${uploadedFile.id}/content)`;
      
      // Update textarea with file reference
      if (textareaRef.current) {
        // Get current caret position
        const start = textareaRef.current.selectionStart || 0;
        const end = textareaRef.current.selectionEnd || 0;
        
        // Insert file reference at cursor position
        // Add a space before if we're not at the beginning and there's no space before the cursor
        const needsSpaceBefore = start > 0 && currentContent.charAt(start - 1) !== ' ' && currentContent.charAt(start - 1) !== '\n';
        // Add a space after if we're not at the end and there's no space after the cursor
        const needsSpaceAfter = end < currentContent.length && currentContent.charAt(end) !== ' ' && currentContent.charAt(end) !== '\n';
        
        const newValue = currentContent.substring(0, start) + 
                        (needsSpaceBefore ? ' ' : '') + 
                        fileRef + 
                        (needsSpaceAfter ? ' ' : '') + 
                        currentContent.substring(end);
        
        // Set textarea value and update state
        textareaRef.current.value = newValue;
        setContent(newValue);
        
        // Focus the textarea and position cursor after insertion
        textareaRef.current.focus();
        // Calculate new cursor position accounting for added spaces
        const spacesBefore = needsSpaceBefore ? 1 : 0;
        const newPosition = start + spacesBefore + fileRef.length;
        textareaRef.current.setSelectionRange(newPosition, newPosition);
      }
      
      toast({
        title: `${isImage ? 'Image' : 'File'} uploaded`,
        description: `${file.name} has been uploaded and added to your comment.`,
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (!user) return null;

  const userInitial = user.name.charAt(0).toUpperCase();

  const handleSubmit = () => {
    const trimmedContent = content.trim();
    if (trimmedContent !== "" && !createCommentMutation.isPending) {
      createCommentMutation.mutate(trimmedContent);
    }
  };

  return (
    <div 
      className={cn("w-full p-2 lg:p-3", className)} 
      style={{
        backgroundColor: 'hsl(210, 20%, 12%)'
      }}
      data-comment-form
    >
      {/* Form content - Mobile: compact spacing, Desktop: normal spacing */}
      <div className="flex items-start gap-2 w-full lg:gap-3">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
            // Prevent spacebar from triggering video controls
            if (e.key === ' ' || e.key === 'k') {
              e.stopPropagation();
            }
          }}
          placeholder={
            parentId 
              ? "Write a reply..." 
              : includeTimestamp && currentTime !== undefined
                ? `Add a comment at ${formatTime(currentTime)}...`
                : "Leave your comment..."
          }
          className="flex-1 bg-transparent text-white placeholder-gray-400 text-sm resize-none border-none outline-none min-h-[2rem] leading-relaxed lg:min-h-[2.5rem]"
          style={{ 
            fontFamily: 'inherit',
            resize: 'none'
          }}
          data-testid="textarea-comment"
          required
        />
        
        {/* Submit button - Mobile: smaller padding, Desktop: normal padding */}
        <button
          type="submit"
          disabled={content.trim() === "" || createCommentMutation.isPending}
          className="flex-shrink-0 p-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors lg:p-2"
          data-testid="button-submit-comment"
          onClick={handleSubmit}
        >
          {createCommentMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 text-white animate-spin lg:h-4 lg:w-4" />
          ) : (
            <Send className="h-3.5 w-3.5 text-white lg:h-4 lg:w-4" />
          )}
        </button>
      </div>
      
      {/* Timestamp indicator and tools - Mobile: compact spacing, Desktop: normal spacing */}
      {!parentId && currentTime !== undefined && (
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-600 lg:mt-3 lg:pt-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 lg:gap-2">
            <Clock className="h-3 w-3" />
            <span>Will be posted at {includeTimestamp ? formatTime(currentTime) : 'current time'}</span>
          </div>
          
          <div className="flex items-center gap-0.5 lg:gap-1">
            {/* Tools - Mobile: tighter spacing, Desktop: normal spacing */}
            <div className="flex space-x-0.5 lg:space-x-1">
              {/* Paperclip button - Mobile: smaller, Desktop: normal */}
              <Button 
                type="button" 
                size="icon" 
                variant="ghost" 
                className="h-6 w-6 rounded text-gray-400 hover:text-white hover:bg-gray-700 lg:h-7 lg:w-7"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <Loader2 className="h-3 w-3 animate-spin lg:h-3.5 lg:w-3.5" />
                ) : (
                  <Paperclip className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
                )}
              </Button>
              
              {/* File input (hidden) */}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.txt"
              />
              
              {/* Image button - Mobile: smaller, Desktop: normal */}
              <Button 
                type="button" 
                size="icon" 
                variant="ghost" 
                className="h-6 w-6 rounded text-gray-400 hover:text-white hover:bg-gray-700 lg:h-7 lg:w-7"
                onClick={() => {
                  if (isUploading) return;
                  const imageInput = document.createElement('input');
                  imageInput.type = 'file';
                  imageInput.accept = 'image/*';
                  imageInput.onchange = (e) => {
                    if (e && e.target) {
                      handleFileSelect(e as unknown as React.ChangeEvent<HTMLInputElement>);
                    }
                  };
                  imageInput.click();
                }}
                disabled={isUploading}
              >
                {isUploading ? (
                  <Loader2 className="h-3 w-3 animate-spin lg:h-3.5 lg:w-3.5" />
                ) : (
                  <Image className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
                )}
              </Button>
              
              {/* Emoji button - Mobile: smaller, Desktop: normal */}
              <div className="relative">
                <Button 
                  type="button" 
                  size="icon" 
                  variant="ghost" 
                  className="h-6 w-6 rounded text-gray-400 hover:text-blue-400 hover:bg-gray-700 lg:h-7 lg:w-7"
                  onClick={() => !isUploading && setShowEmojiPicker(!showEmojiPicker)}
                  disabled={isUploading}
                >
                  <Smile className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
                </Button>
                
                {/* Emoji picker popup */}
                {showEmojiPicker && (
                  <>
                    {/* Overlay to capture outside clicks */}
                    <div 
                      className="fixed inset-0 z-40"
                      onClick={() => setShowEmojiPicker(false)}
                    />
                    {/* Emoji picker - Mobile: smaller width, Desktop: normal width */}
                    <div 
                      className="fixed z-50 rounded-md border shadow-lg" 
                      ref={emojiPickerRef}
                      style={{ 
                        position: 'fixed', 
                        bottom: 'auto',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 1000,
                        width: window.innerWidth <= 1024 ? '280px' : '320px',
                        backgroundColor: 'hsl(210, 20%, 12%)',
                        borderColor: 'hsl(210, 15%, 18%)'
                      }}
                    >
                      <div className="emoji-picker-container">
                        {/* Emoji Category Tabs - Mobile: smaller padding, Desktop: normal */}
                        <div className="border-b border-gray-600 flex overflow-x-auto">
                          {Object.keys(emojiCategories).map((category) => (
                            <button
                              key={category}
                              type="button"
                              className={`px-1.5 py-1 text-xs font-medium lg:px-2 ${
                                activeEmojiCategory === category
                                  ? "text-blue-400 border-b-2 border-blue-400"
                                  : "text-gray-400 hover:text-gray-300"
                              }`}
                              onClick={() => setActiveEmojiCategory(category)}
                            >
                              {categoryLabels[category]}
                            </button>
                          ))}
                        </div>
                        
                        {/* Emoji Grid - Mobile: more compact, Desktop: normal */}
                        <div className="grid grid-cols-6 gap-0.5 emoji-grid p-1.5 max-h-[160px] overflow-y-auto lg:gap-1 lg:p-2 lg:max-h-[180px]">
                          {emojiCategories[activeEmojiCategory as keyof typeof emojiCategories].map((emoji, index) => (
                            <div
                              key={index}
                              className="p-1 rounded cursor-pointer flex items-center justify-center hover:bg-gray-700 text-lg lg:p-1.5 lg:text-xl"
                              onClick={() => {
                                // Get the textarea DOM element directly
                                if (textareaRef.current) {
                                  // Get current caret position
                                  const start = textareaRef.current.selectionStart || 0;
                                  const end = textareaRef.current.selectionEnd || 0;
                                  
                                  // Get current value
                                  const currentValue = textareaRef.current.value;
                                  
                                  // Add spaces around emoji if needed for better readability
                                  const needsSpaceBefore = start > 0 && currentValue.charAt(start - 1) !== ' ' && currentValue.charAt(start - 1) !== '\n';
                                  const needsSpaceAfter = end < currentValue.length && currentValue.charAt(end) !== ' ' && currentValue.charAt(end) !== '\n';
                                  
                                  // Build new value with emoji inserted at cursor position
                                  const newValue = currentValue.substring(0, start) + 
                                                  (needsSpaceBefore ? ' ' : '') + 
                                                  emoji + 
                                                  (needsSpaceAfter ? ' ' : '') + 
                                                  currentValue.substring(end);
                                  
                                  // Set new value directly on the textarea
                                  textareaRef.current.value = newValue;
                                  
                                  // Update the cursor position to after the emoji
                                  const spacesBefore = needsSpaceBefore ? 1 : 0;
                                  const newPosition = start + spacesBefore + emoji.length;
                                  textareaRef.current.setSelectionRange(newPosition, newPosition);
                                  
                                  // Also update state
                                  setContent(newValue);
                                  
                                  // Focus the textarea
                                  textareaRef.current.focus();
                                }
                                
                                // Close the emoji picker after selection
                                setTimeout(() => {
                                  setShowEmojiPicker(false);
                                }, 100);
                              }}
                            >
                              {emoji}
                            </div>
                          ))}
                        </div>
                        
                        {/* Helper text - Mobile: smaller padding, Desktop: normal */}
                        <div className="px-2 pb-2 pt-1 border-t border-gray-600 lg:px-3">
                          <div className="text-xs text-gray-400 text-center">
                            Click an emoji to add it
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            
            {/* Timestamp toggle button - Mobile: smaller, Desktop: normal */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 text-xs px-1.5 lg:h-7 lg:px-2",
                includeTimestamp 
                  ? "text-blue-400" 
                  : "text-gray-400 hover:text-blue-400"
              )}
              onClick={() => setIncludeTimestamp(!includeTimestamp)}
            >
              {includeTimestamp ? `${formatTime(currentTime)}` : "Add time"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}