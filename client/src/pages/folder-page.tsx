import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { formatTimeAgo } from "@/lib/utils/formatters";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import AppLayout from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ProjectCard from "@/components/projects/project-card";
import ProjectRow from "@/components/projects/project-row";
import ShareLinksDialog from "@/components/sharing/share-links-dialog";
import { useViewMode } from "@/hooks/use-view-mode";
import ViewModeToggle from "@/components/ui/view-mode-toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFolder, useFolderProjects, useDeleteFolder, useFolders, useCreateFolder } from "@/hooks/use-folders";
import { useAuth } from "@/hooks/use-auth";
import { getFolderPath, getDirectSubfolders } from "@/lib/folder-tree";
import { cn } from "@/lib/utils";
import {
  setDragPayload,
  getDragPayload,
  peekDragPayload,
  clearDragPayload,
  type DragPayload,
} from "@/lib/drag-drop";
import {
  useMoveProjectToFolder,
  useMoveProjectsToFolder,
  useMoveFolderUnderParent,
} from "@/hooks/use-drag-move";
import type { Folder, Project, File as MediaFile } from "@shared/schema";
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

type ProjectWithVideo = Project & { latestVideoFile?: MediaFile };

// Subfolder card on the folder page. Both a drag source (re-parent) and
// a drop target (drop projects/folders into it).
function SubfolderDropCard({ sf }: { sf: Folder }) {
  const moveProject = useMoveProjectToFolder();
  const moveProjects = useMoveProjectsToFolder();
  const moveFolder = useMoveFolderUnderParent();
  const [isOver, setIsOver] = useState(false);
  const accepts = (p: DragPayload | null): boolean => {
    if (!p) return false;
    if (p.type === "project") return p.sourceFolderId !== sf.id;
    if (p.type === "projects") return p.ids.length > 0 && p.sourceFolderId !== sf.id;
    if (p.type === "folder") {
      if (p.id === sf.id) return false;
      if (p.sourceParentFolderId === sf.id) return false;
      // Project subfolders never reparent into the global folder tree.
      if (p.sourceProjectId != null) return false;
      return true;
    }
    return false;
  };
  return (
    <Link
      href={`/folders/${sf.id}`}
      data-testid={`link-subfolder-${sf.id}`}
      className={cn(
        "group flex items-center gap-2 px-3 py-3 rounded-lg border border-neutral-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-primary-300 dark:hover:border-[#10a37f] hover:bg-primary-50/40 dark:hover:bg-[#10a37f]/10 transition-colors",
        isOver && "ring-2 ring-primary-500 dark:ring-[#10a37f] bg-primary-50/60 dark:bg-[#10a37f]/15",
      )}
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        setDragPayload(e, {
          type: "folder",
          id: sf.id,
          sourceParentFolderId: (sf as any).parentFolderId ?? null,
          isGlobal: !!sf.isGlobal,
        });
      }}
      onDragEnd={clearDragPayload}
      onDragOver={(e) => {
        if (!accepts(peekDragPayload(e))) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!isOver) setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        const p = getDragPayload(e);
        if (!accepts(p)) return;
        e.preventDefault();
        e.stopPropagation();
        setIsOver(false);
        clearDragPayload();
        if (p!.type === "project") moveProject.mutate({ projectId: p!.id, folderId: sf.id });
        else if (p!.type === "projects") moveProjects.mutate({ projectIds: p!.ids, folderId: sf.id });
        else if (p!.type === "folder") moveFolder.mutate({ folderId: p!.id, parentFolderId: sf.id });
      }}
    >
      <div className="flex items-start gap-2 min-w-0">
        {sf.isGlobal ? (
          <Globe className="h-5 w-5 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
        ) : (
          <FolderIcon className="h-5 w-5 shrink-0 mt-0.5 text-primary-600 dark:text-[#10a37f]" />
        )}
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">
            {sf.name}
          </span>
          <div className="flex items-center gap-2 mt-1 text-xs text-neutral-400 dark:text-neutral-500">
            <span>{(sf as any).fileCount ?? 0} file{((sf as any).fileCount ?? 0) !== 1 ? "s" : ""}</span>
            <span>·</span>
            <span>{formatTimeAgo(new Date((sf as any).lastActivityAt ?? sf.updatedAt))}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
import {
  ArrowLeft,
  ChevronRight,
  FileVideo,
  Folder as FolderIcon,
  FolderPlus,
  Globe,
  Loader2,
  Plus,
  Search,
  Share2,
  Trash2,
} from "lucide-react";
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

export default function FolderPage() {
  const params = useParams<{ id: string }>();
  const folderId = parseInt(params.id ?? "", 10);
  const [_, navigate] = useLocation();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [viewMode, setViewMode] = useViewMode("projects", "grid");
  // Sort preference for the main folder grid/list. Persisted per browser
  // so the user's choice survives reloads and navigation between folders.
  type SortKey = "name-asc" | "name-desc" | "updated-desc" | "created-desc";
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    if (typeof window === "undefined") return "name-asc";
    const v = window.localStorage.getItem("folder-page:sort");
    return (v === "name-asc" || v === "name-desc" || v === "updated-desc" || v === "created-desc")
      ? (v as SortKey)
      : "name-asc";
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("folder-page:sort", sortKey);
  }, [sortKey]);

  const { data: folder, isLoading: folderLoading, error: folderError } =
    useFolder(folderId) as { data: Folder | undefined; isLoading: boolean; error: Error | null };
  const { data: projects, isLoading: projectsLoading } =
    useFolderProjects(folderId) as { data: ProjectWithVideo[] | undefined; isLoading: boolean };
  const { data: allFolders } = useFolders();

  const isAdmin = user?.role === "admin";
  const isOwner = !!user && folder && folder.createdById === user.id;
  const canShare = !!user && (isAdmin || isOwner);
  const canDelete = !!user && (isAdmin || isOwner);
  // Subfolder creation follows the same access rule as POST /api/folders:
  // any authenticated user can create one inside a global folder; private
  // folders are limited to admins or the owner.
  const canCreateSubfolder = !!user && !!folder && (isAdmin || isOwner || folder.isGlobal);
  const deleteFolder = useDeleteFolder();
  const createFolder = useCreateFolder();
  const [createSubOpen, setCreateSubOpen] = useState(false);

  const breadcrumbs = folder ? getFolderPath(allFolders, folder.id) : [];
  const subfolders = getDirectSubfolders(allFolders, folderId);

  // Drop handling for the current folder page. The page itself is a drop
  // target so a user can drag a project (or folder) anywhere in the
  // grid and it will land inside the folder they're viewing.
  const moveProject = useMoveProjectToFolder();
  const moveProjectsBulk = useMoveProjectsToFolder();
  const moveFolderUnderParent = useMoveFolderUnderParent();
  const [isPageDragOver, setIsPageDragOver] = useState(false);
  const acceptsAtPageLevel = (p: DragPayload | null): boolean => {
    if (!p || !folder) return false;
    if (p.type === "project") return p.sourceFolderId !== folder.id;
    if (p.type === "projects") return p.ids.length > 0 && p.sourceFolderId !== folder.id;
    if (p.type === "folder") {
      if (p.id === folder.id) return false;
      if (p.sourceParentFolderId === folder.id) return false;
      // Project subfolders never reparent into the global folder tree.
      if (p.sourceProjectId != null) return false;
      return true;
    }
    return false;
  };
  const onPageDragOver = (e: React.DragEvent) => {
    if (!acceptsAtPageLevel(peekDragPayload(e))) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!isPageDragOver) setIsPageDragOver(true);
  };
  const onPageDrop = (e: React.DragEvent) => {
    if (!folder) return;
    const p = getDragPayload(e);
    if (!acceptsAtPageLevel(p)) return;
    e.preventDefault();
    setIsPageDragOver(false);
    clearDragPayload();
    if (p!.type === "project") moveProject.mutate({ projectId: p!.id, folderId: folder.id });
    else if (p!.type === "projects") moveProjectsBulk.mutate({ projectIds: p!.ids, folderId: folder.id });
    else if (p!.type === "folder") moveFolderUnderParent.mutate({ folderId: p!.id, parentFolderId: folder.id });
  };

  const subfolderForm = useForm<{ name: string; description?: string | null }>({
    resolver: zodResolver(
      z.object({
        name: z.string().min(1, "Folder name is required").max(50, "50 characters max"),
        description: z.string().nullable().optional(),
      }),
    ),
    defaultValues: { name: "", description: "" },
  });

  const handleCreateSubfolder = async (values: { name: string; description?: string | null }) => {
    if (!folder) return;
    try {
      await createFolder.mutateAsync({
        name: values.name,
        description: values.description || undefined,
        parentFolderId: folder.id,
        // Server forces isGlobal to match the parent when parent is global,
        // but sending it here keeps the optimistic UX accurate.
        isGlobal: folder.isGlobal,
      });
      subfolderForm.reset();
      setCreateSubOpen(false);
    } catch (err) {
      console.error("Error creating subfolder:", err);
    }
  };

  useEffect(() => {
    if (folder?.name) {
      document.title = `${folder.name} | Folders | Obviu.io`;
    } else {
      document.title = "Folder | Obviu.io";
    }
  }, [folder?.name]);

  const filtered: ProjectWithVideo[] = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const matches = (projects ?? []).filter((p) => {
      if (!searchTerm) return true;
      return (
        p.name?.toLowerCase().includes(term) ||
        p.description?.toLowerCase().includes(term)
      );
    });
    const ts = (v: unknown): number => {
      if (!v) return 0;
      const t = new Date(v as string | number | Date).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    const sorted = matches.slice();
    switch (sortKey) {
      case "name-asc":
        sorted.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }));
        break;
      case "name-desc":
        sorted.sort((a, b) => (b.name ?? "").localeCompare(a.name ?? "", undefined, { sensitivity: "base" }));
        break;
      case "updated-desc":
        sorted.sort((a, b) => ts((b as any).lastActivityAt ?? (b as any).updatedAt) - ts((a as any).lastActivityAt ?? (a as any).updatedAt));
        break;
      case "created-desc":
        sorted.sort((a, b) => ts((b as any).createdAt) - ts((a as any).createdAt));
        break;
    }
    return sorted;
  }, [projects, searchTerm, sortKey]);

  if (Number.isNaN(folderId)) {
    return (
      <AppLayout>
        <div className="p-6">Invalid folder.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div
        className={cn(
          "p-6 space-y-6 min-h-[calc(100vh-4rem)] transition-colors",
          isPageDragOver && "bg-primary-50/40 dark:bg-[#10a37f]/10",
        )}
        onDragOver={onPageDragOver}
        onDragLeave={() => setIsPageDragOver(false)}
        onDrop={onPageDrop}
      >
        <Button
          variant="ghost"
          className="gap-1 -ml-2"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        {/* Breadcrumb chain shows the full ancestor path so the user
            always knows where they are in a nested folder tree and can
            jump back up with one click. */}
        {breadcrumbs.length > 1 && (
          <nav className="flex items-center flex-wrap gap-1 text-sm text-neutral-500 dark:text-gray-400" aria-label="Folder breadcrumbs">
            {breadcrumbs.map((b, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <span key={b.id} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-neutral-400 dark:text-gray-600" />}
                  {isLast ? (
                    <span className="font-medium text-neutral-900 dark:text-teal-300 truncate max-w-[200px]" title={b.name}>{b.name}</span>
                  ) : (
                    <Link
                      href={`/folders/${b.id}`}
                      className="hover:text-primary-600 dark:hover:text-[#10a37f] truncate max-w-[160px]"
                      title={b.name}
                      data-testid={`link-breadcrumb-folder-${b.id}`}
                    >
                      {b.name}
                    </Link>
                  )}
                </span>
              );
            })}
          </nav>
        )}

        {folderLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary dark:text-[#026d55]" />
          </div>
        ) : folderError || !folder ? (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-md">
            {folderError ? folderError.message : "Folder not found"}
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="h-12 w-12 rounded-lg bg-primary-50 dark:bg-[#026d55]/20 flex items-center justify-center shrink-0">
                  {folder.isGlobal ? (
                    <Globe className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                  ) : (
                    <FolderIcon className="h-6 w-6 text-primary-600 dark:text-[#10a37f]" />
                  )}
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold text-neutral-900 dark:text-teal-300 truncate">
                    {folder.name}
                  </h1>
                  <p className="text-sm text-neutral-500 dark:text-gray-400 mt-0.5">
                    {folder.isGlobal ? "Global folder" : "Private folder"}
                    {projects && (
                      <> &middot; {projects.length} project{projects.length === 1 ? "" : "s"}</>
                    )}
                  </p>
                  {folder.description && (
                    <p className="text-neutral-600 dark:text-gray-400 mt-2">
                      {folder.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                {canShare && (
                  <Button
                    variant="outline"
                    onClick={() => setShareOpen(true)}
                    data-testid="button-folder-page-share"
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </Button>
                )}
                {canDelete && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-900/20"
                        data-testid="button-folder-page-delete"
                      >
                        {deleteFolder.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="mr-2 h-4 w-4" />
                        )}
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent data-testid="dialog-folder-page-delete">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete folder "{folder.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {projects && projects.length > 0 ? (
                            <>
                              This folder contains <strong>{projects.length} project{projects.length === 1 ? "" : "s"}</strong>.
                              The folder <strong>and every project inside it</strong> will be deleted.
                              An admin can still restore them from the trash.
                            </>
                          ) : (
                            <>The folder will be deleted. It is empty so nothing else changes.</>
                          )}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="button-folder-page-cancel-delete">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          disabled={deleteFolder.isPending}
                          onClick={async () => {
                            await deleteFolder.mutateAsync(folder.id);
                            navigate("/");
                          }}
                          className="bg-red-600 hover:bg-red-700"
                          data-testid="button-folder-page-confirm-delete"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {canCreateSubfolder && (
                  <Button
                    variant="outline"
                    onClick={() => setCreateSubOpen(true)}
                    data-testid="button-folder-page-new-subfolder"
                  >
                    <FolderPlus className="mr-2 h-4 w-4" />
                    New Subfolder
                  </Button>
                )}
                <Button
                  onClick={() => navigate(`/projects/new?folderId=${folder.id}`)}
                  data-testid="button-folder-page-new-project"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Project
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400 dark:text-gray-500" />
                <Input
                  placeholder="Search projects in this folder..."
                  className="pl-9 dark:bg-gray-800 dark:border-gray-700 dark:placeholder-gray-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-folder-page-search"
                />
              </div>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger
                  className="w-[180px] dark:bg-gray-800 dark:border-gray-700"
                  data-testid="select-folder-page-sort"
                >
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-asc">Name (A–Z)</SelectItem>
                  <SelectItem value="name-desc">Name (Z–A)</SelectItem>
                  <SelectItem value="updated-desc">Recently updated</SelectItem>
                  <SelectItem value="created-desc">Recently created</SelectItem>
                </SelectContent>
              </Select>
              <ViewModeToggle
                value={viewMode}
                onChange={setViewMode}
                testIdPrefix="folder-view"
              />
            </div>

            {/* Subfolders grid renders directly inside the parent folder
                view so users can drill straight into nested folders the
                way they would in a file explorer. */}
            {subfolders.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Subfolders
                </h2>
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
                >
                  {subfolders.map((sf) => (
                    <SubfolderDropCard key={sf.id} sf={sf} />
                  ))}
                </div>
              </div>
            )}

            {projectsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary dark:text-[#026d55]" />
              </div>
            ) : filtered.length > 0 ? (
              viewMode === "grid" ? (
                <div
                  className="grid gap-4"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
                >
                  {filtered.map((project) => (
                    <ProjectCard key={project.id} project={project} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {filtered.map((project) => (
                    <ProjectRow key={project.id} project={project} />
                  ))}
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center py-12 bg-white dark:bg-gray-900 rounded-lg shadow">
                <div className="h-16 w-16 rounded-full bg-primary-50 dark:bg-[#026d55]/20 flex items-center justify-center mb-4">
                  <FileVideo className="h-8 w-8 text-primary-400 dark:text-[#026d55]" />
                </div>
                {searchTerm ? (
                  <>
                    <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">
                      No matching projects
                    </h3>
                    <p className="text-neutral-500 dark:text-gray-400 mb-6 max-w-md text-center">
                      Try a different search.
                    </p>
                    <Button variant="outline" onClick={() => setSearchTerm("")}>
                      Clear search
                    </Button>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">
                      No projects in this folder yet
                    </h3>
                    <p className="text-neutral-500 dark:text-gray-400 mb-6 max-w-md text-center">
                      Create a project here, or add an existing one to this folder from its
                      settings.
                    </p>
                    <Button
                      onClick={() => navigate(`/projects/new?folderId=${folder.id}`)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create Project
                    </Button>
                  </>
                )}
              </div>
            )}

            {canShare && (
              <ShareLinksDialog
                open={shareOpen}
                onOpenChange={setShareOpen}
                scopeType="folder"
                scopeId={folder.id}
                scopeName={folder.name}
              />
            )}

            <Dialog open={createSubOpen} onOpenChange={setCreateSubOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create subfolder in "{folder.name}"</DialogTitle>
                  <DialogDescription>
                    {folder.isGlobal
                      ? "This subfolder will inherit global visibility from its parent."
                      : "This subfolder will live inside the current private folder."}
                  </DialogDescription>
                </DialogHeader>
                <Form {...subfolderForm}>
                  <form onSubmit={subfolderForm.handleSubmit(handleCreateSubfolder)} className="space-y-4">
                    <FormField
                      control={subfolderForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. Podcasts"
                              {...field}
                              data-testid="input-folder-page-subfolder-name"
                              autoFocus
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={subfolderForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (optional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Describe this subfolder..."
                              {...field}
                              value={field.value || ""}
                              data-testid="input-folder-page-subfolder-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setCreateSubOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createFolder.isPending} data-testid="button-folder-page-create-subfolder">
                        {createFolder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </AppLayout>
  );
}
