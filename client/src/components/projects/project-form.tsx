import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectFormProps {
  projectId?: number;
  defaultFolderId?: number | null;
  onSuccess?: (projectId: number) => void;
  className?: string;
}

// Define a schema for project creation with validation
const createProjectSchema = z.object({
  name: z.string()
    .min(1, "Project name is required")
    .max(30, "Project name must be 30 characters or less"),
  description: z.string().nullable().optional(),
  folderId: z.number().nullable().optional(),
  status: z.string().default("in_progress")
});

type CreateProjectInput = z.infer<typeof createProjectSchema>;

export default function ProjectForm({ 
  projectId,
  defaultFolderId = null,
  onSuccess,
  className
}: ProjectFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const isEditMode = !!projectId;
  // Local-only thumbnail state for the create flow. We can't POST the image
  // until we have a project id back from the server, so the file is staged
  // here and uploaded in a follow-up request after create succeeds.
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingThumb, setPendingThumb] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingThumb) { setThumbPreview(null); return; }
    const url = URL.createObjectURL(pendingThumb);
    setThumbPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingThumb]);
  const onPickThumb = () => fileRef.current?.click();
  const onThumbChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
      toast({ title: "Unsupported image", description: "Use PNG, JPEG, WebP, or GIF.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 10 MB.", variant: "destructive" });
      return;
    }
    setPendingThumb(file);
  };
  
  // Fetch project data if in edit mode
  const { data: project } = useQuery<any>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: isEditMode,
  });
  
  // Form setup with our schema
  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      folderId: defaultFolderId ?? null,
      status: "in_progress",
    },
    values: project ? {
      name: project.name || "",
      description: project.description || "",
      folderId: project.folderId || null,
      status: project.status || "in_progress",
    } : undefined
  });
  
  // Handle form submission
  const handleSubmit = form.handleSubmit(async (data) => {
    setIsLoading(true);
    
    try {
      const url = isEditMode ? `/api/projects/${projectId}` : '/api/projects';
      const method = isEditMode ? 'PATCH' : 'POST';
      
      // API call
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          description: data.description || null,
          folderId: data.folderId || null,
          status: data.status
        }),
        credentials: 'include'
      });
      
      const responseText = await response.text();
      console.log(`${isEditMode ? "Updating" : "Creating"} project with data:`, data);
      console.log("Response status:", response.status);
      console.log("Response text:", responseText);
      
      if (response.ok) {
        try {
          const responseData = JSON.parse(responseText);

          toast({
            title: isEditMode ? "Project updated" : "Project created",
            description: isEditMode ? "Project updated successfully" : "Project created successfully"
          });

          // Invalidate relevant queries
          queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
          if (isEditMode) {
            queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
          }

          // Fire-and-forget the staged thumbnail so the user isn't blocked
          // on the create spinner. The project already exists; if the
          // image upload fails we surface a single follow-up toast and
          // they can retry from project settings.
          if (!isEditMode && pendingThumb && responseData?.id) {
            const newId = responseData.id;
            const file = pendingThumb;
            (async () => {
              try {
                const fd = new FormData();
                fd.append("thumbnail", file);
                const tRes = await fetch(`/api/projects/${newId}/thumbnail`, {
                  method: "POST",
                  body: fd,
                  credentials: "include",
                });
                if (!tRes.ok) {
                  const tText = await tRes.text();
                  toast({
                    title: "Thumbnail upload failed",
                    description: (tText || "Try again from project settings.") + " Project was created.",
                    variant: "destructive",
                  });
                  return;
                }
                queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                queryClient.invalidateQueries({ queryKey: [`/api/projects/${newId}`] });
              } catch (tErr: any) {
                toast({
                  title: "Thumbnail upload failed",
                  description: (tErr?.message || "Try again from project settings.") + " Project was created.",
                  variant: "destructive",
                });
              }
            })();
          }

          if (onSuccess) onSuccess(responseData.id);
        } catch (parseError) {
          console.error("Error parsing response:", parseError);
          toast({
            title: "Error parsing response",
            description: "Could not parse server response",
            variant: "destructive"
          });
        }
      } else {
        toast({
          title: isEditMode ? "Error updating project" : "Error creating project",
          description: responseText,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error in form submission:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className={cn("space-y-6", className)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter project name (max 30 characters)"
                  {...field}
                  onChange={(e) => {
                    field.onChange(e);
                    form.trigger("name");
                  }}
                />
              </FormControl>
              <FormDescription className="flex justify-end">
                {field.value ? field.value.length : 0}/30 characters
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Enter project description (optional)" 
                  className="resize-none" 
                  rows={4}
                  {...field} 
                  value={field.value || ""}
                />
              </FormControl>
              <FormDescription>
                Briefly describe what this project is about
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project Status</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {!isEditMode && (
          <FormItem>
            <FormLabel>Thumbnail (optional)</FormLabel>
            <div className="flex items-start gap-4">
              <div className="h-24 w-40 shrink-0 rounded-md border bg-neutral-100 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
                {thumbPreview ? (
                  <img
                    src={thumbPreview}
                    alt="Thumbnail preview"
                    className="w-full h-full object-cover"
                    data-testid="create-thumb-preview"
                  />
                ) : (
                  <div className="text-center text-neutral-400">
                    <ImageIcon className="h-6 w-6 mx-auto mb-1" />
                    <span className="text-xs">No image</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={onThumbChosen}
                  data-testid="create-thumb-input"
                />
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={onPickThumb}
                  disabled={isLoading}
                  data-testid="create-thumb-pick"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {pendingThumb ? "Replace image" : "Choose image"}
                </Button>
                {pendingThumb && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPendingThumb(null)}
                    disabled={isLoading}
                    data-testid="create-thumb-clear"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove
                  </Button>
                )}
                <p className="text-xs text-neutral-500 dark:text-gray-400">
                  PNG, JPEG, WebP, or GIF. Max 10 MB.
                </p>
              </div>
            </div>
            <FormDescription>
              Custom poster image. If unset, the card uses the latest video preview.
            </FormDescription>
          </FormItem>
        )}

        <Button 
          type="submit" 
          disabled={isLoading} 
          className="w-full"
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditMode ? 'Update Project' : 'Create Project'}
        </Button>
      </form>
    </Form>
  );
}
