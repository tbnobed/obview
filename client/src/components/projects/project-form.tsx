import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InsertProject, insertProjectSchema } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useProject } from "@/hooks/use-projects";
import { cn } from "@/lib/utils";

interface ProjectFormProps {
  projectId?: number;
  onSuccess?: (projectId: number) => void;
  className?: string;
}

export default function ProjectForm({ 
  projectId, 
  onSuccess,
  className
}: ProjectFormProps) {
  const { toast } = useToast();
  const [isEditMode] = useState(!!projectId);
  
  const { data: existingProject, isLoading: projectLoading } = useProject(
    projectId || 0, 
    { enabled: isEditMode }
  );

  // Form setup
  const form = useForm<InsertProject>({
    resolver: zodResolver(insertProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      status: "in_progress",
    },
  });

  // Load existing project data if in edit mode
  useEffect(() => {
    if (isEditMode && existingProject) {
      form.reset({
        name: existingProject.name,
        description: existingProject.description || "",
        status: existingProject.status,
      });
    }
  }, [isEditMode, existingProject, form]);

  // Create project mutation
  const createMutation = useMutation({
    mutationFn: async (data: InsertProject) => {
      const res = await apiRequest("POST", "/api/projects", data);
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Project created",
        description: "Your new project has been created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      if (onSuccess) onSuccess(data.id);
    },
    onError: (error: Error) => {
      console.error("Failed to create project:", error);
      toast({
        title: "Failed to create project",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update project mutation
  const updateMutation = useMutation({
    mutationFn: async (data: InsertProject) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}`, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Project updated",
        description: "Your project has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      if (onSuccess && projectId) onSuccess(projectId);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update project",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertProject) => {
    console.log("Submitting project data:", data);
    
    // Add user validation check and more detailed logging
    if (!form.formState.isValid) {
      console.error("Form is not valid:", form.formState.errors);
      return;
    }
    
    if (isEditMode) {
      console.log("Updating existing project:", projectId);
      updateMutation.mutate(data);
    } else {
      console.log("Creating new project with data:", JSON.stringify(data));
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isEditMode && projectLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className={cn("space-y-6", className)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter project name" {...field} />
              </FormControl>
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
                  <SelectTrigger>
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
        
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditMode ? "Update Project" : "Create Project"}
        </Button>
      </form>
    </Form>
  );
}
