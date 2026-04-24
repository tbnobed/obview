import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useFolders,
  useCreateFolder,
  useFolderProjects,
} from "@/hooks/use-folders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Share2,
  Globe,
  Loader2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ShareLinksDialog from "@/components/sharing/share-links-dialog";

const createFolderSchema = z.object({
  name: z
    .string()
    .min(1, "Folder name is required")
    .max(50, "Folder name must be 50 characters or less"),
  description: z.string().nullable().optional(),
  isGlobal: z.boolean().optional(),
});

type CreateFolderInput = z.infer<typeof createFolderSchema>;

export default function SidebarFolders() {
  const { data: folders, isLoading } = useFolders();
  const [createOpen, setCreateOpen] = useState(false);
  const createMutation = useCreateFolder();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const form = useForm<CreateFolderInput>({
    resolver: zodResolver(createFolderSchema),
    defaultValues: { name: "", description: "", isGlobal: false },
  });

  const handleCreate = async (data: CreateFolderInput) => {
    try {
      await createMutation.mutateAsync(data);
      form.reset();
      setCreateOpen(false);
    } catch (err) {
      console.error("Error creating folder:", err);
    }
  };

  return (
    <div className="px-4 py-4 border-t border-neutral-200 dark:border-gray-900">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-300 uppercase tracking-wider">
          Folders
        </h2>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-neutral-500 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400"
            onClick={() => setCreateOpen(true)}
            data-testid="button-sidebar-create-folder"
            title="New folder"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Folder</DialogTitle>
              <DialogDescription>
                Organize your projects into a folder
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleCreate)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter folder name..."
                          {...field}
                          data-testid="input-sidebar-folder-name"
                        />
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
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Describe this folder..."
                          {...field}
                          value={field.value || ""}
                          data-testid="input-sidebar-folder-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {isAdmin && (
                  <FormField
                    control={form.control}
                    name="isGlobal"
                    render={({ field }) => (
                      <FormItem className="flex items-start gap-3 rounded-md border p-3">
                        <FormControl>
                          <Checkbox
                            checked={!!field.value}
                            onCheckedChange={(v) => field.onChange(v === true)}
                            data-testid="checkbox-sidebar-folder-global"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="cursor-pointer flex items-center gap-1.5">
                            <Globe className="h-3.5 w-3.5" />
                            Global folder
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">
                            Visible to all users. Only admins can create or edit global folders.
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
        </div>
      ) : folders && folders.length > 0 ? (
        <div className="space-y-0.5">
          {folders.map((folder: any) => (
            <SidebarFolderItem key={folder.id} folder={folder} />
          ))}
        </div>
      ) : (
        <div className="px-2 py-2 text-xs text-neutral-500 dark:text-neutral-400">
          No folders yet.{" "}
          <button
            type="button"
            className="text-primary-600 dark:text-primary-400 hover:underline"
            onClick={() => setCreateOpen(true)}
          >
            Create one
          </button>
        </div>
      )}
    </div>
  );
}

function SidebarFolderItem({ folder }: { folder: any }) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const { data: projects, isLoading } = useFolderProjects(open ? folder.id : 0);
  const projectCount = projects?.length ?? 0;
  const { user } = useAuth();
  const canShare = user && (user.role === "admin" || (folder.createdById === user.id && !folder.isGlobal));
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group flex w-full items-center gap-1.5 px-2 py-1.5 text-sm rounded-md transition-colors",
          "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-gray-900/70"
        )}
        data-testid={`button-sidebar-folder-${folder.id}`}
        title={folder.description || folder.name}
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform",
            open && "rotate-90"
          )}
        />
        {folder.isGlobal ? (
          <Globe className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
        ) : open ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-primary-600 dark:text-[#10a37f]" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-400" />
        )}
        <span className="truncate flex-1 text-left">
          {folder.name}
          {folder.createdByUsername && (
            <span className="ml-1.5 text-xs text-neutral-400 dark:text-neutral-500 font-normal">
              · {folder.createdByUsername}
            </span>
          )}
        </span>
        {canShare && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); setShareOpen(true); }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-gray-800"
            title="Share folder"
            data-testid={`button-share-folder-${folder.id}`}
          >
            <Share2 className="h-3.5 w-3.5 text-neutral-500" />
          </span>
        )}
      </button>

      {canShare && (
        <ShareLinksDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          scopeType="folder"
          scopeId={folder.id}
          scopeName={folder.name}
        />
      )}

      {open && (
        <div className="ml-5 mt-0.5 mb-1 space-y-0.5 border-l border-neutral-200 dark:border-gray-800 pl-2">
          {isLoading ? (
            <div className="flex justify-center py-2">
              <Loader2 className="h-3 w-3 animate-spin text-neutral-400" />
            </div>
          ) : projectCount > 0 ? (
            projects!.map((project: any) => {
              const active = location === `/project/${project.id}`;
              return (
                <Link key={project.id} href={`/project/${project.id}`}>
                  <div
                    className={cn(
                      "px-2 py-1 text-xs rounded-md cursor-pointer truncate transition-colors",
                      active
                        ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400"
                        : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-gray-900/70"
                    )}
                    title={project.name}
                    data-testid={`link-sidebar-folder-project-${project.id}`}
                  >
                    {project.name}
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="px-2 py-1 text-xs text-neutral-400 dark:text-neutral-500 italic">
              Empty folder
            </div>
          )}
        </div>
      )}
    </div>
  );
}
