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

  // List of common emojis
  const commonEmojis = [
    "👍", "👎", "❤️", "😊", "😂", "😍", 
    "🙂", "😉", "🤔", "👏", "🔥", "✅",
    "❌", "⭐", "🎉", "👀", "💯", "🙏"
  ];
  
  // Handler for inserting an emoji
  const handleEmojiClick = (emoji: string) => {
    const currentContent = form.getValues("content");
    form.setValue("content", currentContent + emoji);
    setShowEmojiPicker(false);
    
    // Focus the textarea after inserting emoji
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
    
    // Trigger form validation after updating content
    form.trigger("content");
  };
  
  // Handler for file/image selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    // Display image upload notification since we're not implementing the full upload feature
    toast({
      title: "Feature in development",
      description: "File/image upload will be implemented in a future update.",
    });
    
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
                  >
                    <Paperclip className="h-3.5 w-3.5" />
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
                  >
                    <Image className="h-3.5 w-3.5" />
                  </Button>
                  
                  {/* Emoji button */}
                  <div className="relative">
                    <Button 
                      type="button" 
                      size="icon" 
                      variant="ghost" 
                      className="h-7 w-7 rounded text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    >
                      <Smile className="h-3.5 w-3.5" />
                    </Button>
                    
                    {/* Emoji picker popup */}
                    {showEmojiPicker && (
                      <div 
                        className="absolute bottom-9 right-0 z-50" 
                        ref={emojiPickerRef}
                        style={{ 
                          position: 'absolute', 
                          bottom: '100%', 
                          right: '0', 
                          zIndex: 1000,
                          boxShadow: '0 0 10px rgba(0,0,0,0.2)',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          marginBottom: '8px',
                          background: 'white',
                          width: '200px',
                          padding: '8px'
                        }}
                      >
                        <div className="grid grid-cols-6 gap-2 emoji-grid">
                          {commonEmojis.map((emoji, index) => (
                            <button
                              key={index}
                              type="button"
                              className="p-1 rounded cursor-pointer"
                              onClick={() => handleEmojiClick(emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
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
