import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertCommentSchema } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Paperclip, Image, Smile } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

// Create a comment schema with only the fields we need for the form
const commentFormSchema = z.object({
  content: z.string().min(1, "Comment cannot be empty"),
});

type CommentFormValues = z.infer<typeof commentFormSchema>;

interface CommentFormProps {
  fileId: number;
  parentId?: number;
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
  const [includeTimestamp, setIncludeTimestamp] = useState(currentTime !== undefined && !parentId);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
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

  // Form setup
  const form = useForm<CommentFormValues>({
    resolver: zodResolver(commentFormSchema),
    defaultValues: {
      content: "",
    },
  });

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: async (data: { content: string }) => {
      const commentData = {
        content: data.content,
        fileId,
        parentId: parentId || null,
        timestamp: includeTimestamp && currentTime ? Math.floor(currentTime) : null,
      };
      
      return apiRequest("POST", `/api/files/${fileId}/comments`, commentData);
    },
    onSuccess: () => {
      form.reset();
      toast({
        title: "Comment added",
        description: "Your comment has been added successfully",
      });
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
      "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙",
      "😋", "😛", "😜", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐",
      "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔", "😪"
    ],
    people: [
      "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👋", "🖐️", 
      "👏", "🙌", "👐", "🤲", "🙏", "🤝", "💪", "👊", "✊", "🤜",
      "🤛", "👈", "👉", "👆", "👇", "✋", "🖖", "👨", "👩", "👶"
    ],
    objects: [
      "💻", "📱", "💾", "💿", "📷", "🎥", "🔍", "🔑", "📁", "📝",
      "📊", "📈", "📉", "📋", "🎬", "🎮", "🎯", "🎲", "🎭", "🎨"
    ],
    nature: [
      "🌱", "🌲", "🌳", "🌴", "🌵", "🌷", "🌸", "🌹", "🌺", "🌻",
      "🍀", "🌿", "☘️", "🍃", "🍂", "🍁", "🌾", "🌞", "🌝", "🌚",
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🦁"
    ],
    symbols: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "✝️", "☪️", "🕉️", "☸️", "✡️", "🔯", "⚠️", "✅", "❌", "⭕",
      "❗", "❓", "‼️", "⁉️", "⭕", "❌", "🔴", "🟠", "🟡", "🟢"
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
  
  // Handler for file/image selection and upload
  const [isUploading, setIsUploading] = useState(false);
  
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
            // Fallback - this is likely not optimal but allows us to still try the upload
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
      const currentContent = form.getValues("content") || "";
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
        
        // Set textarea value and update form
        textareaRef.current.value = newValue;
        form.setValue("content", newValue);
        
        // Trigger form validation
        form.trigger("content");
        
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
  
  // Submit handler
  const onSubmit = (data: CommentFormValues) => {
    createCommentMutation.mutate(data);
  };

  if (!user) return null;

  const userInitial = user.name.charAt(0).toUpperCase();

  return (
    <div className={cn("flex items-start space-x-2", className)}>
      <Avatar className="h-7 w-7 mt-1 hidden sm:block">
        <AvatarFallback className="bg-primary-100 text-primary-700 text-xs">
          {userInitial}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="border border-neutral-300 rounded-lg overflow-hidden focus-within:border-primary-400 focus-within:ring-1 focus-within:ring-primary-400">
            <Textarea 
              {...form.register("content")}
              ref={textareaRef}
              rows={2} 
              className="block w-full px-3 py-2 border-0 resize-none focus:ring-0 text-xs sm:text-sm" 
              placeholder={
                parentId 
                  ? "Add a reply..." 
                  : includeTimestamp && currentTime !== undefined
                    ? `Add a comment at ${formatTime(currentTime)}...`
                    : "Add a comment..."
              }
            />
            
            <div className="p-2 bg-neutral-50 border-t border-neutral-200 flex justify-between items-center">
              <div className="flex space-x-1">
                {/* Show only timestamp button on small screens */}
                <div className="hidden sm:flex space-x-1">
                  {/* Paperclip button */}
                  <Button 
                    type="button" 
                    size="icon" 
                    variant="ghost" 
                    className="h-7 w-7 rounded text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Paperclip className="h-3.5 w-3.5" />
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
                  
                  {/* Image button */}
                  <Button 
                    type="button" 
                    size="icon" 
                    variant="ghost" 
                    className="h-7 w-7 rounded text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
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
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Image className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  
                  {/* Emoji button */}
                  <div className="relative">
                    <Button 
                      type="button" 
                      size="icon" 
                      variant="ghost" 
                      className="h-7 w-7 rounded text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
                      onClick={() => !isUploading && setShowEmojiPicker(!showEmojiPicker)}
                      disabled={isUploading}
                    >
                      <Smile className="h-3.5 w-3.5" />
                    </Button>
                    
                    {/* Emoji picker popup */}
                    {showEmojiPicker && (
                      <>
                        {/* Overlay to capture outside clicks */}
                        <div 
                          className="fixed inset-0 z-40"
                          onClick={() => setShowEmojiPicker(false)}
                        />
                        <div 
                          className="fixed z-50 bg-white rounded-md border border-gray-200 shadow-lg" 
                          ref={emojiPickerRef}
                          style={{ 
                            position: 'fixed', 
                            bottom: 'auto',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 1000,
                            width: '320px',
                          }}
                        >
                          <div className="emoji-picker-container">
                            {/* Emoji Category Tabs */}
                            <div className="border-b border-gray-200 flex overflow-x-auto">
                              {Object.keys(emojiCategories).map((category) => (
                                <button
                                  key={category}
                                  type="button"
                                  className={`px-2 py-1 text-xs font-medium ${
                                    activeEmojiCategory === category
                                      ? "text-primary-600 border-b-2 border-primary-600"
                                      : "text-gray-500 hover:text-gray-700"
                                  }`}
                                  onClick={() => setActiveEmojiCategory(category)}
                                >
                                  {categoryLabels[category]}
                                </button>
                              ))}
                            </div>
                            
                            {/* Emoji Grid */}
                            <div className="grid grid-cols-6 gap-1 emoji-grid p-2 max-h-[180px] overflow-y-auto">
                              {emojiCategories[activeEmojiCategory as keyof typeof emojiCategories].map((emoji, index) => (
                                <div
                                  key={index}
                                  className="p-1.5 rounded cursor-pointer flex items-center justify-center hover:bg-gray-100 text-xl"
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
                                      
                                      // Trigger an input event to ensure react-hook-form updates
                                      const event = new Event('input', { bubbles: true });
                                      textareaRef.current.dispatchEvent(event);
                                      
                                      // Also update the form value to be safe
                                      form.setValue("content", newValue);
                                      
                                      // Focus the textarea
                                      textareaRef.current.focus();
                                      
                                      // Make sure to update the form validation
                                      form.trigger("content");
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
                            
                            {/* Search box placeholder for future enhancement */}
                            <div className="px-3 pb-2 pt-1 border-t border-gray-200">
                              <div className="text-xs text-gray-500 text-center">
                                Click an emoji to add it
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                
                {!parentId && currentTime !== undefined && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 text-xs px-2",
                      includeTimestamp ? "text-primary-600" : "text-neutral-500"
                    )}
                    onClick={() => setIncludeTimestamp(!includeTimestamp)}
                  >
                    {includeTimestamp ? `${formatTime(currentTime)}` : "Add time"}
                  </Button>
                )}
              </div>
              
              <Button 
                type="submit" 
                size="sm"
                className="h-7 px-3 text-xs"
                disabled={createCommentMutation.isPending || !form.formState.isValid}
              >
                {createCommentMutation.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                {parentId ? "Reply" : "Submit"}
              </Button>
            </div>
          </div>
          
          {form.formState.errors.content && (
            <p className="mt-1 text-sm text-red-600">
              {form.formState.errors.content.message}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}