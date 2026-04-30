import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import AppLayout from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ProjectCard from "@/components/projects/project-card";
import ShareLinksDialog from "@/components/sharing/share-links-dialog";
import { useFolder, useFolderProjects } from "@/hooks/use-folders";
import { useAuth } from "@/hooks/use-auth";
import type { Folder, Project, File as MediaFile } from "@shared/schema";

type ProjectWithVideo = Project & { latestVideoFile?: MediaFile };
import {
  ArrowLeft,
  FileVideo,
  Folder as FolderIcon,
  Globe,
  Loader2,
  Plus,
  Search,
  Share2,
} from "lucide-react";

export default function FolderPage() {
  const params = useParams<{ id: string }>();
  const folderId = parseInt(params.id ?? "", 10);
  const [_, navigate] = useLocation();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [shareOpen, setShareOpen] = useState(false);

  const { data: folder, isLoading: folderLoading, error: folderError } =
    useFolder(folderId) as { data: Folder | undefined; isLoading: boolean; error: Error | null };
  const { data: projects, isLoading: projectsLoading } =
    useFolderProjects(folderId) as { data: ProjectWithVideo[] | undefined; isLoading: boolean };

  const isAdmin = user?.role === "admin";
  const isOwner = !!user && folder && folder.createdById === user.id;
  const canShare = !!user && (isAdmin || isOwner);

  useEffect(() => {
    if (folder?.name) {
      document.title = `${folder.name} | Folders | Obviu.io`;
    } else {
      document.title = "Folder | Obviu.io";
    }
  }, [folder?.name]);

  const filtered: ProjectWithVideo[] = (projects ?? []).filter((p) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.name?.toLowerCase().includes(term) ||
      p.description?.toLowerCase().includes(term)
    );
  });

  if (Number.isNaN(folderId)) {
    return (
      <AppLayout>
        <div className="p-6">Invalid folder.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <Button
          variant="ghost"
          className="gap-1 -ml-2"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

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
                <Button
                  onClick={() => navigate(`/projects/new?folderId=${folder.id}`)}
                  data-testid="button-folder-page-new-project"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Project
                </Button>
              </div>
            </div>

            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400 dark:text-gray-500" />
              <Input
                placeholder="Search projects in this folder..."
                className="pl-9 dark:bg-gray-800 dark:border-gray-700 dark:placeholder-gray-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-folder-page-search"
              />
            </div>

            {projectsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary dark:text-[#026d55]" />
              </div>
            ) : filtered.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filtered.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
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
          </>
        )}
      </div>
    </AppLayout>
  );
}
