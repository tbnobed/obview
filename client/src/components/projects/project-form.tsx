import { useState } from "react";
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
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFolders } from "@/hooks/use-folders";

interface ProjectFormProps {
  projectId?: number;
  onSuccess?: (projectId: number) => void;
  className?: string;
}

// Define a schema for project creation with validation
const createProjectSchema = z.object({
  name: z.string()
    .min(1, "Project name is required")
    .max(20, "Project name must be 20 characters or less"),
  description: z.string().nullable().optional(),
  folderId: z.number().nullable().optional(),
  status: z.string().default("in_progress")
});

type CreateProjectInput = z.infer<typeof createProjectSchema>;

export default function ProjectForm({ 
  projectId,
  onSuccess,
  className
}: ProjectFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const isEditMode = !!projectId;
  const { data: folders } = useFolders();
  
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
      folderId: null,
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
                  placeholder="Enter project name (max 20 characters)"
                  {...field}
                  onChange={(e) => {
                    field.onChange(e);
                    form.trigger("name");
                  }}
                />
              </FormControl>
              <FormDescription className="flex justify-end">
                {field.value ? field.value.length : 0}/20 characters
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
          name="folderId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Folder (optional)</FormLabel>
              <Select
                onValueChange={(value) => field.onChange(value === "none" ? null : parseInt(value))}
                value={field.value ? field.value.toString() : "none"}
              >
                <FormControl>
                  <SelectTrigger className="w-full" data-testid="select-folder">
                    <SelectValue placeholder="Select a folder or leave unorganized" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">No folder (unorganized)</SelectItem>
                  {folders && folders.map((folder) => (
                    <SelectItem 
                      key={folder.id} 
                      value={folder.id.toString()}
                      data-testid={`select-folder-${folder.id}`}
                    >
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Organize this project by placing it in a folder
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
