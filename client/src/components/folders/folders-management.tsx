import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useFolders, useCreateFolder, useUpdateFolder, useDeleteFolder, useFolderProjects } from "@/hooks/use-folders";
import { useMediaFiles } from "@/hooks/use-media";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit, Trash2, Folder, FolderOpen, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface FoldersManagementProps {
  className?: string;
}

const createFolderSchema = z.object({
  name: z.string()
    .min(1, "Folder name is required")
    .max(50, "Folder name must be 50 characters or less"),
  description: z.string().nullable().optional(),
});

type CreateFolderInput = z.infer<typeof createFolderSchema>;

export default function FoldersManagement({ className }: FoldersManagementProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [projectsDialogOpen, setProjectsDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<any>(null);
  const [selectedFolder, setSelectedFolder] = useState<any>(null);

  const { data: folders, isLoading } = useFolders();
  const createMutation = useCreateFolder();
  const updateMutation = useUpdateFolder(editingFolder?.id || 0);
  const deleteMutation = useDeleteFolder();

  // Create folder form
  const createForm = useForm<CreateFolderInput>({
    resolver: zodResolver(createFolderSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  // Edit folder form
  const editForm = useForm<CreateFolderInput>({
    resolver: zodResolver(createFolderSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  // Update edit form when editing folder changes
  useEffect(() => {
    if (editingFolder) {
      editForm.reset({
        name: editingFolder.name || "",
        description: editingFolder.description || "",
      });
    }
  }, [editingFolder, editForm]);

  // Handle create folder
  const handleCreateFolder = async (data: CreateFolderInput) => {
    try {
      await createMutation.mutateAsync(data);
      createForm.reset();
      setCreateDialogOpen(false);
    } catch (error) {
      console.error("Error creating folder:", error);
    }
  };

  // Handle update folder
  const handleUpdateFolder = async (data: CreateFolderInput) => {
    if (!editingFolder) return;
    
    try {
      await updateMutation.mutateAsync(data);
      editForm.reset();
      setEditDialogOpen(false);
      setEditingFolder(null);
    } catch (error) {
      console.error("Error updating folder:", error);
    }
  };

  // Handle delete folder
  const handleDeleteFolder = async (folderId: number) => {
    try {
      await deleteMutation.mutateAsync(folderId);
    } catch (error) {
      console.error("Error deleting folder:", error);
    }
  };

  // Open edit dialog
  const openEditDialog = (folder: any) => {
    setEditingFolder(folder);
    setEditDialogOpen(true);
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Folders</h2>
          <p className="text-neutral-600 dark:text-gray-400 mt-1">
            Organize your projects into folders for better structure and management.
          </p>
        </div>
        
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-folder">
              <Plus className="mr-2 h-4 w-4" />
              Create Folder
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-create-folder">
            <DialogHeader>
              <DialogTitle>Create New Folder</DialogTitle>
              <DialogDescription>
                Create a new folder to organize your projects
              </DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(handleCreateFolder)} className="space-y-4">
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter folder name..." 
                          {...field} 
                          data-testid="input-folder-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter folder description..." 
                          {...field} 
                          value={field.value || ""}
                          data-testid="input-folder-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setCreateDialogOpen(false)}
                    data-testid="button-cancel-create"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending}
                    data-testid="button-submit-create"
                  >
                    {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Folder
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : folders && folders.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              onClick={() => {
                setSelectedFolder(folder);
                setProjectsDialogOpen(true);
              }}
              onEdit={() => openEditDialog(folder)}
              onDelete={() => handleDeleteFolder(folder.id)}
              isDeleting={deleteMutation.isPending}
            />
          ))}
        </div>
      ) : (
        <Card className="bg-white/50 border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-12 w-12 rounded-full bg-primary-50 flex items-center justify-center mb-4">
              <Folder className="h-6 w-6 text-primary-500" />
            </div>
            <h3 className="text-lg font-medium text-neutral-900 mb-2">No folders yet</h3>
            <p className="text-neutral-500 text-center mb-6 max-w-sm">
              Create your first folder to organize your projects and keep them structured.
            </p>
            <Button 
              onClick={() => setCreateDialogOpen(true)}
              data-testid="button-create-first-folder"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Folder
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Projects Dialog */}
      <Dialog open={projectsDialogOpen} onOpenChange={setProjectsDialogOpen}>
        <DialogContent className="max-w-4xl" data-testid="dialog-folder-projects">
          <DialogHeader>
            <DialogTitle>{selectedFolder?.name} Projects</DialogTitle>
            <DialogDescription>
              {selectedFolder?.description && `${selectedFolder.description} • `}
              Projects organized in this folder
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {selectedFolder && <FolderProjectsList folderId={selectedFolder.id} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-folder">
          <DialogHeader>
            <DialogTitle>Edit Folder</DialogTitle>
            <DialogDescription>
              Update your folder details
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleUpdateFolder)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter folder name..." 
                        {...field} 
                        data-testid="input-edit-folder-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter folder description..." 
                        {...field} 
                        value={field.value || ""}
                        data-testid="input-edit-folder-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setEditDialogOpen(false)}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateMutation.isPending}
                  data-testid="button-submit-edit"
                >
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Folder
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface FolderCardProps {
  folder: any;
  onClick?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function FolderCard({ folder, onClick, onEdit, onDelete, isDeleting }: FolderCardProps) {
  const { data: projects } = useFolderProjects(folder.id);
  const projectCount = projects?.length || 0;

  return (
    <Card 
      className={`hover:shadow-md transition-shadow ${onClick ? 'cursor-pointer' : ''}`} 
      data-testid={`card-folder-${folder.id}`}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary-50 dark:bg-[#026d55]/20 flex items-center justify-center">
              {projectCount > 0 ? (
                <FolderOpen className="h-5 w-5 text-primary-600 dark:text-[#026d55]" />
              ) : (
                <Folder className="h-5 w-5 text-primary-600 dark:text-[#026d55]" />
              )}
            </div>
            <div>
              <CardTitle className="text-lg" data-testid={`text-folder-name-${folder.id}`}>
                {folder.name}
              </CardTitle>
              {folder.description && (
                <CardDescription className="text-sm mt-1" data-testid={`text-folder-description-${folder.id}`}>
                  {folder.description}
                </CardDescription>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              data-testid={`button-edit-folder-${folder.id}`}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isDeleting}
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`button-delete-folder-${folder.id}`}
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent data-testid={`dialog-delete-folder-${folder.id}`}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Folder</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{folder.name}"? This action cannot be undone.
                    {projectCount > 0 && (
                      <span className="block mt-2 font-medium text-amber-600">
                        This folder contains {projectCount} project{projectCount !== 1 ? 's' : ''}. 
                        Please move or delete the projects before deleting this folder.
                      </span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid={`button-cancel-delete-${folder.id}`}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    disabled={projectCount > 0}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-testid={`button-confirm-delete-${folder.id}`}
                  >
                    Delete Folder
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="flex items-center justify-between">
          <Badge 
            variant="secondary" 
            className="text-xs"
            data-testid={`badge-project-count-${folder.id}`}
          >
            {projectCount} {projectCount === 1 ? 'project' : 'projects'}
          </Badge>
          <p className="text-xs text-neutral-500 dark:text-gray-400">
            Created {new Date(folder.createdAt).toLocaleDateString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// Component to show projects in a folder
function FolderProjectsList({ folderId }: { folderId: number }) {
  const { data: projects, isLoading } = useFolderProjects(folderId);
  const [, navigate] = useLocation();
  
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  
  if (!projects || projects.length === 0) {
    return (
      <div className="text-center py-8">
        <Folder className="mx-auto h-12 w-12 text-neutral-400 mb-4" />
        <p className="text-neutral-500">No projects in this folder yet</p>
      </div>
    );
  }
  
  // Match status badge styling from project cards
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-600">Approved</Badge>;
      case 'in_review':
        return <Badge className="bg-blue-600">In Review</Badge>;
      case 'in_progress':
      default:
        return <Badge className="bg-yellow-600">In Progress</Badge>;
    }
  };
  
  return (
    <div className="space-y-3">
      {projects.map((project) => (
        <ProjectItem 
          key={project.id}
          project={project}
          onNavigate={() => navigate(`/projects/${project.id}`)}
          getStatusBadge={getStatusBadge}
        />
      ))}
    </div>
  );
}

// Individual project item with thumbnail
function ProjectItem({ project, onNavigate, getStatusBadge }: {
  project: any;
  onNavigate: () => void;
  getStatusBadge: (status: string) => JSX.Element;
}) {
  const { data: files } = useMediaFiles(project.id);
  
  // Find the latest video file for thumbnail
  const latestVideoFile = files?.find((file: any) => file.fileType === 'video') || null;
  
  return (
    <div 
      className="flex items-center gap-4 p-4 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 hover:border-primary-300 transition-all cursor-pointer group shadow-sm"
      onClick={onNavigate}
      data-testid={`project-item-${project.id}`}
    >
      {/* Thumbnail Preview */}
      <div className="flex-shrink-0">
        {latestVideoFile ? (
          <div className="relative w-20 h-12 bg-gray-900 rounded overflow-hidden">
            <video
              className="w-full h-full object-cover"
              src={`/api/files/${latestVideoFile.id}/scrub`}
              muted
              playsInline
              preload="metadata"
              onError={(e) => {
                // Fallback to file icon if video fails to load
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
            {/* Fallback icon */}
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800" style={{ display: 'none' }}>
              <Folder className="h-6 w-6 text-gray-400" />
            </div>
            {/* Play indicator overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
              <div className="w-6 h-6 rounded-full bg-white/90 flex items-center justify-center">
                <ExternalLink className="h-3 w-3 text-gray-800" />
              </div>
            </div>
          </div>
        ) : (
          <div className="w-20 h-12 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
            <Folder className="h-6 w-6 text-gray-400" />
          </div>
        )}
      </div>
      
      {/* Project Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-semibold text-neutral-900 dark:text-white group-hover:text-primary-600 transition-colors truncate">
            {project.name}
          </h4>
          <ExternalLink className="h-4 w-4 text-neutral-400 group-hover:text-primary-600 transition-colors flex-shrink-0" />
        </div>
        {project.description && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-1">
            {project.description}
          </p>
        )}
        {files && files.length > 0 && (
          <p className="text-xs text-neutral-500 mt-1">
            {files.length} file{files.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
      
      {/* Status Badge */}
      <div className="flex-shrink-0">
        {getStatusBadge(project.status || 'in_progress')}
      </div>
    </div>
  );
}