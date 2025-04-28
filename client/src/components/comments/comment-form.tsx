import { useState } from "react";
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
  
  // Format time (seconds to MM:SS)
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

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
      queryClient.invalidateQueries({ queryKey: [`/api/files/${fileId}/comments`] });
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

  // Submit handler
  const onSubmit = (data: CommentFormValues) => {
    createCommentMutation.mutate(data);
  };

  if (!user) return null;

  const userInitial = user.name.charAt(0).toUpperCase();

  return (
    <div className={cn("flex items-start space-x-3", className)}>
      <Avatar className="h-9 w-9">
        <AvatarFallback className="bg-primary-100 text-primary-700">
          {userInitial}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="border border-neutral-300 rounded-lg overflow-hidden focus-within:border-primary-400 focus-within:ring-1 focus-within:ring-primary-400">
            <Textarea 
              {...form.register("content")}
              rows={2} 
              className="block w-full px-3 py-2 border-0 resize-none focus:ring-0 sm:text-sm" 
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
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100">
                  <Image className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100">
                  <Smile className="h-4 w-4" />
                </Button>
                
                {!parentId && currentTime !== undefined && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "text-xs",
                      includeTimestamp ? "text-primary-600" : "text-neutral-500"
                    )}
                    onClick={() => setIncludeTimestamp(!includeTimestamp)}
                  >
                    {includeTimestamp ? `At ${formatTime(currentTime)}` : "Add timestamp"}
                  </Button>
                )}
              </div>
              
              <Button 
                type="submit" 
                size="sm"
                disabled={createCommentMutation.isPending || !form.formState.isValid}
              >
                {createCommentMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
