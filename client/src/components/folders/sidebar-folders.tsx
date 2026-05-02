import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useFolders,
  useCreateFolder,
  useDeleteFolder,
  useFolderProjects,
  useToggleFolderGlobal,
} from "@/hooks/use-folders";
import { buildFolderTree, type FolderNode } from "@/lib/folder-tree";
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
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ShareLinksDialog from "@/components/sharing/share-links-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
                          Visible to all users on the platform.
                        </p>
                      </div>
                    </FormItem>
                  )}
                />
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
        <FolderGroups folders={folders} currentUserId={user?.id} isAdmin={isAdmin} />
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

function FolderGroups({
  folders,
  currentUserId,
  isAdmin,
}: {
  folders: any[];
  currentUserId?: number;
  isAdmin: boolean;
}) {
  // Build a single tree from the flat list; each section then picks the
  // root folders that belong to it. Children of a global root stay nested
  // under that root regardless of who created them, which matches the
  // mental model: "I'm browsing inside Post Production, show me what's in here."
  const tree = buildFolderTree(folders);

  const globalRoots = tree.filter((n) => n.isGlobal);
  const mineRoots = tree.filter((n) => !n.isGlobal && n.createdById === currentUserId);
  const otherRoots = tree.filter((n) => !n.isGlobal && n.createdById !== currentUserId);

  // Group "others" by owner.
  const ownerMap = new Map<number, { ownerId: number; ownerName: string; roots: FolderNode[] }>();
  for (const f of otherRoots) {
    const id = f.createdById;
    if (!ownerMap.has(id)) {
      ownerMap.set(id, {
        ownerId: id,
        ownerName: (f as any).createdByUsername || `User ${id}`,
        roots: [],
      });
    }
    ownerMap.get(id)!.roots.push(f);
  }
  const owners = Array.from(ownerMap.values()).sort((a, b) =>
    a.ownerName.localeCompare(b.ownerName)
  );

  return (
    <div className="space-y-2">
      {globalRoots.length > 0 && (
        <FolderSection label="Global" defaultOpen>
          {globalRoots.map((f) => (
            <SidebarFolderItem key={f.id} folder={f} depth={0} />
          ))}
        </FolderSection>
      )}

      {mineRoots.length > 0 && (
        <FolderSection label="My folders" defaultOpen>
          {mineRoots.map((f) => (
            <SidebarFolderItem key={f.id} folder={f} depth={0} />
          ))}
        </FolderSection>
      )}

      {isAdmin && owners.length > 0 && (
        <FolderSection label={`Other users (${owners.length})`} defaultOpen={false}>
          {owners.map((owner) => (
            <OwnerGroup key={owner.ownerId} owner={owner} />
          ))}
        </FolderSection>
      )}
    </div>
  );
}

function FolderSection({
  label,
  defaultOpen,
  children,
}: {
  label: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-transform",
            open && "rotate-90"
          )}
        />
        {label}
      </button>
      {open && <div className="space-y-0.5 mt-0.5">{children}</div>}
    </div>
  );
}

function OwnerGroup({ owner }: { owner: { ownerId: number; ownerName: string; roots: FolderNode[] } }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group flex w-full items-center gap-1.5 px-2 py-1.5 text-sm rounded-md transition-colors",
          "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-gray-900/70"
        )}
        title={owner.ownerName}
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform",
            open && "rotate-90"
          )}
        />
        <Folder className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-400" />
        <span className="truncate flex-1 text-left">
          {owner.ownerName}
          <span className="ml-1.5 text-xs text-neutral-400 dark:text-neutral-500 font-normal">
            · {owner.roots.length}
          </span>
        </span>
      </button>
      {open && (
        <div className="ml-5 mt-0.5 mb-1 space-y-0.5 border-l border-neutral-200 dark:border-gray-800 pl-2">
          {owner.roots.map((f) => (
            <SidebarFolderItem key={f.id} folder={f} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarFolderItem({ folder, depth = 0 }: { folder: FolderNode; depth?: number }) {
  const children: FolderNode[] = (folder as any).children || [];
  const hasChildren = children.length > 0;
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const { data: projects, isLoading } = useFolderProjects(open ? folder.id : 0);
  const projectCount = projects?.length ?? 0;
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isOwner = !!user && folder.createdById === user.id;
  const canShare = user && (isAdmin || isOwner);
  const canToggleGlobal = isAdmin || isOwner;
  const canDelete = isAdmin || isOwner;
  const [shareOpen, setShareOpen] = useState(false);
  const toggleGlobal = useToggleFolderGlobal();
  const deleteFolder = useDeleteFolder();
  const isToggling =
    toggleGlobal.isPending && toggleGlobal.variables?.folderId === folder.id;
  const isDeleting =
    deleteFolder.isPending && deleteFolder.variables === folder.id;

  return (
    <div>
      <div
        className={cn(
          "group flex w-full items-center gap-1.5 px-2 py-1.5 text-sm rounded-md transition-colors",
          "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-gray-900/70"
        )}
        data-testid={`row-sidebar-folder-${folder.id}`}
        title={folder.description || folder.name}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          className="shrink-0 p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-gray-800"
          data-testid={`button-sidebar-folder-toggle-${folder.id}`}
          aria-label={open ? "Collapse folder" : "Expand folder"}
          aria-expanded={open}
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 text-neutral-400 transition-transform",
              open && "rotate-90"
            )}
          />
        </button>
        <Link
          href={`/folders/${folder.id}`}
          className="flex items-center gap-1.5 flex-1 min-w-0"
          data-testid={`link-sidebar-folder-${folder.id}`}
        >
          {folder.isGlobal ? (
            <Globe className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
          ) : open ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-primary-600 dark:text-[#10a37f]" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-400" />
          )}
          <span className="truncate flex-1 min-w-0 text-left">
            {folder.name}
            {folder.createdByUsername && (
              <span className="ml-1.5 text-xs text-neutral-400 dark:text-neutral-500 font-normal group-hover:hidden">
                · {folder.createdByUsername}
              </span>
            )}
          </span>
        </Link>
        {canToggleGlobal && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="hidden group-hover:inline-flex shrink-0 p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-gray-800"
                title={folder.isGlobal ? "Make private" : "Make global"}
                aria-label={folder.isGlobal ? "Make folder private" : "Make folder global"}
                data-testid={`button-toggle-global-folder-${folder.id}`}
              >
                {isToggling ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-500" />
                ) : folder.isGlobal ? (
                  <UserIcon className="h-3.5 w-3.5 text-neutral-500" />
                ) : (
                  <Globe className="h-3.5 w-3.5 text-neutral-500" />
                )}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent
              onClick={(e) => e.stopPropagation()}
              data-testid={`dialog-toggle-global-${folder.id}`}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {folder.isGlobal ? "Make folder private?" : "Make folder global?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {folder.isGlobal ? (
                    <>
                      "{folder.name}" will become private. Only you and other admins
                      will be able to see it. Other users will lose access.
                    </>
                  ) : (
                    <>
                      "{folder.name}" will become visible to all users on the
                      platform. They will be able to see this folder and the
                      projects inside it (subject to project-level access).
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid={`button-cancel-toggle-global-${folder.id}`}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={isToggling}
                  onClick={() =>
                    toggleGlobal.mutate({
                      folderId: folder.id,
                      isGlobal: !folder.isGlobal,
                    })
                  }
                  data-testid={`button-confirm-toggle-global-${folder.id}`}
                >
                  {folder.isGlobal ? "Make Private" : "Make Global"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {canShare && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShareOpen(true); }}
            className="hidden group-hover:inline-flex shrink-0 p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-gray-800"
            title="Share folder"
            aria-label="Share folder"
            data-testid={`button-share-folder-${folder.id}`}
          >
            <Share2 className="h-3.5 w-3.5 text-neutral-500" />
          </button>
        )}
        {canDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="hidden group-hover:inline-flex shrink-0 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                title="Delete folder"
                aria-label="Delete folder"
                data-testid={`button-delete-folder-${folder.id}`}
              >
                {isDeleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-red-500" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                )}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent
              onClick={(e) => e.stopPropagation()}
              data-testid={`dialog-delete-folder-${folder.id}`}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>Delete folder "{folder.name}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  {open && projectCount > 0 ? (
                    <>
                      This folder contains <strong>{projectCount} project{projectCount === 1 ? "" : "s"}</strong>.
                      The folder <strong>and every project inside it</strong> will be deleted.
                      An admin can still restore them from the trash.
                    </>
                  ) : (
                    <>
                      The folder will be deleted. Any projects inside it will also be deleted
                      (admins can restore them from the trash).
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid={`button-cancel-delete-folder-${folder.id}`}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={isDeleting}
                  onClick={() => deleteFolder.mutate(folder.id)}
                  className="bg-red-600 hover:bg-red-700"
                  data-testid={`button-confirm-delete-folder-${folder.id}`}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

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
          {/* Child subfolders render above the projects list so the user
              can drill straight down through the tree without losing
              their place. */}
          {hasChildren && children.map((child) => (
            <SidebarFolderItem key={child.id} folder={child} depth={depth + 1} />
          ))}
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
          ) : !hasChildren ? (
            <div className="px-2 py-1 text-xs text-neutral-400 dark:text-neutral-500 italic">
              Empty folder
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
