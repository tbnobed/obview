import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/use-projects";
import { useFolders } from "@/hooks/use-folders";

type ProjectStatus = "in_progress" | "in_review" | "approved";
type ApprovalSummary = {
  status: ProjectStatus;
  totalFiles: number;
  approvedFiles: number;
  changesRequestedFiles: number;
};
import ProjectCard from "@/components/projects/project-card";
import ProjectRow from "@/components/projects/project-row";
import OwnerChip from "@/components/projects/owner-chip";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Search, FileVideo, Loader2, ChevronRight, Globe, User as UserIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useViewMode } from "@/hooks/use-view-mode";
import ViewModeToggle from "@/components/ui/view-mode-toggle";

// Sticky open-state for the grouped sections so the user's expand/collapse
// choices survive page navigation and reload.
const GROUPS_OPEN_KEY = "obviu:projects:open-groups-v1";
function readOpenMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(GROUPS_OPEN_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return typeof p === "object" && p ? p : {};
  } catch {
    return {};
  }
}
function writeOpenMap(m: Record<string, boolean>) {
  try {
    localStorage.setItem(GROUPS_OPEN_KEY, JSON.stringify(m));
  } catch {}
}
function useGroupOpen(key: string, defaultOpen: boolean) {
  const [open, setOpenState] = useState<boolean>(() => {
    const m = readOpenMap();
    return key in m ? !!m[key] : defaultOpen;
  });
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    setOpenState((prev) => {
      const v = typeof next === "function" ? (next as (p: boolean) => boolean)(prev) : next;
      const m = readOpenMap();
      m[key] = v;
      writeOpenMap(m);
      return v;
    });
  };
  return [open, setOpen] as const;
}

export default function ProjectsPage() {
  const [_, navigate] = useLocation();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  // Admin-only ownership scope. Defaults to "all" so an admin loading the
  // dashboard immediately sees every team's project (this is the visibility
  // gap that contributed to the 04-30 accidental delete).
  const [ownerScope, setOwnerScope] = useState<"all" | "mine">("all");
  const [viewMode, setViewMode] = useViewMode("projects", "grid");

  const { data: projects, isLoading, error } = useProjects();
  const { data: folders, isLoading: foldersLoading } = useFolders();
  const isAdmin = user?.role === "admin";

  // Derived per-project review status (server aggregates file approvals).
  // Falls back to "in_progress" while loading or if a project is missing.
  const { data: approvalSummaries } = useQuery<Record<number, ApprovalSummary>>({
    queryKey: ["/api/projects/approval-summaries"],
  });
  const statusFor = (projectId: number): ProjectStatus =>
    approvalSummaries?.[projectId]?.status ?? "in_progress";

  // Set of folder ids that are global so we can split projects sitting
  // inside a global folder into their own group regardless of who owns
  // them. Memoised to avoid rebuilding on every keystroke in the search
  // box.
  const globalFolderIds = useMemo(
    () => new Set((folders || []).filter((f) => f.isGlobal).map((f) => f.id)),
    [folders]
  );

  useEffect(() => {
    document.title = "Projects | Obviu.io";
  }, []);

  // Filter projects by search term, status, and (admin-only) ownership scope.
  const filteredProjects = projects?.filter(project => {
    const matchesSearch = searchTerm === "" ||
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (project.description?.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === null || statusFor(project.id) === statusFilter;

    const matchesOwner = !isAdmin || ownerScope === "all" || project.createdById === user?.id;

    return matchesSearch && matchesStatus && matchesOwner;
  });

  const isEditor = user?.role === "admin" || user?.role === "editor";

  // Build the grouped view: Yours first, then Global (any owner, in a
  // global folder), then one section per other owner, sorted by name.
  // Yours-owned global projects still go under "Yours" so the user
  // doesn't see the same project in two places.
  // Server augments admin payloads with creatorName/creatorUsername; the
  // base Project type doesn't carry those, so we widen here for the
  // grouping logic below.
  type ProjectItem = NonNullable<typeof filteredProjects>[number] & {
    creatorName?: string | null;
    creatorUsername?: string | null;
  };
  const groups = useMemo(() => {
    const yours: ProjectItem[] = [];
    const globalProjects: ProjectItem[] = [];
    const ownerMap = new Map<
      number,
      { ownerId: number; ownerName: string; items: ProjectItem[] }
    >();
    for (const raw of filteredProjects ?? []) {
      const p = raw as ProjectItem;
      const isYours = user?.id != null && p.createdById === user.id;
      const isGlobal = p.folderId != null && globalFolderIds.has(p.folderId);
      if (isYours) {
        yours.push(p);
      } else if (isGlobal) {
        globalProjects.push(p);
      } else {
        const name =
          p.creatorName || p.creatorUsername || `user #${p.createdById}`;
        const existing = ownerMap.get(p.createdById) || {
          ownerId: p.createdById,
          ownerName: name,
          items: [] as ProjectItem[],
        };
        existing.items.push(p);
        ownerMap.set(p.createdById, existing);
      }
    }
    const others = Array.from(ownerMap.values()).sort((a, b) =>
      a.ownerName.localeCompare(b.ownerName)
    );
    return { yours, global: globalProjects, others };
  }, [filteredProjects, user?.id, globalFolderIds]);

  // Group only when the user is browsing the full list; "Mine" mode is
  // always one bucket so grouping headers would just be noise.
  const ownerCount =
    (groups.yours.length > 0 ? 1 : 0) +
    (groups.global.length > 0 ? 1 : 0) +
    groups.others.length;
  const showGroups = ownerScope === "all" && ownerCount > 1;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-teal-300">Projects</h1>
            <p className="text-neutral-500 dark:text-gray-400 mt-1">
              Manage your media review projects
            </p>
          </div>
          
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="outline" onClick={() => navigate("/admin/trash")} data-testid="open-trash-button">
                Trash
              </Button>
            )}
            {isEditor && (
              <Button onClick={() => navigate("/projects/new")}>
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400 dark:text-gray-500" />
            <Input
              placeholder="Search projects..."
              className="pl-9 dark:bg-gray-800 dark:border-gray-700 dark:placeholder-gray-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {isAdmin && (
            <div className="flex gap-2 items-center" data-testid="owner-scope-filter">
              <Button
                variant={ownerScope === "mine" ? "default" : "outline"}
                size="sm"
                onClick={() => setOwnerScope("mine")}
                className={ownerScope === "mine" ? "dark:bg-[#026d55] dark:hover:bg-[#025943] dark:text-white" : ""}
                data-testid="owner-scope-mine"
              >
                Mine
              </Button>
              <Button
                variant={ownerScope === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setOwnerScope("all")}
                className={ownerScope === "all" ? "dark:bg-[#026d55] dark:hover:bg-[#025943] dark:text-white" : ""}
                data-testid="owner-scope-all"
              >
                All projects
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Button 
              variant={statusFilter === null ? "default" : "outline"} 
              size="sm"
              onClick={() => setStatusFilter(null)}
              className={statusFilter === null ? "dark:bg-[#026d55] dark:hover:bg-[#025943] dark:text-white" : ""}
            >
              All
            </Button>
            <Button 
              variant={statusFilter === "in_progress" ? "default" : "outline"} 
              size="sm"
              onClick={() => setStatusFilter("in_progress")}
              className={statusFilter === "in_progress" ? "dark:bg-[#026d55] dark:hover:bg-[#025943] dark:text-white" : ""}
            >
              In Progress
            </Button>
            <Button 
              variant={statusFilter === "in_review" ? "default" : "outline"} 
              size="sm"
              onClick={() => setStatusFilter("in_review")}
              className={statusFilter === "in_review" ? "dark:bg-[#026d55] dark:hover:bg-[#025943] dark:text-white" : ""}
            >
              In Review
            </Button>
            <Button 
              variant={statusFilter === "approved" ? "default" : "outline"} 
              size="sm"
              onClick={() => setStatusFilter("approved")}
              className={statusFilter === "approved" ? "dark:bg-[#026d55] dark:hover:bg-[#025943] dark:text-white" : ""}
            >
              Approved
            </Button>
          </div>
          <div className="flex items-center">
            <ViewModeToggle
              value={viewMode}
              onChange={setViewMode}
              testIdPrefix="projects-view"
            />
          </div>
        </div>

        {/* Project list */}
        {isLoading || foldersLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary dark:text-[#026d55]" />
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-md">
            Error loading projects: {error.message}
          </div>
        ) : filteredProjects && filteredProjects.length > 0 ? (
          showGroups ? (
            <div className="space-y-6">
              {groups.yours.length > 0 && (
                <ProjectGroup
                  groupKey="yours"
                  defaultOpen
                  viewMode={viewMode}
                  header={
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                        style={{ backgroundColor: "#026d55" }}
                      >
                        Y
                      </span>
                      <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                        Yours
                      </span>
                    </div>
                  }
                  count={groups.yours.length}
                  accent="#026d55"
                  items={groups.yours}
                />
              )}
              {groups.global.length > 0 && (
                <ProjectGroup
                  groupKey="global"
                  defaultOpen
                  viewMode={viewMode}
                  header={
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: "#0ea5e9" }}
                      >
                        <Globe className="h-3 w-3" />
                      </span>
                      <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                        Global
                      </span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        · in shared folders
                      </span>
                    </div>
                  }
                  count={groups.global.length}
                  accent="#0ea5e9"
                  items={groups.global}
                />
              )}
              {groups.others.map((g) => (
                <ProjectGroup
                  key={`owner-${g.ownerId}`}
                  groupKey={`owner-${g.ownerId}`}
                  defaultOpen={false}
                  header={
                    <OwnerChip
                      ownerId={g.ownerId}
                      ownerName={g.ownerName}
                      size="md"
                    />
                  }
                  count={g.items.length}
                  items={g.items}
                  viewMode={viewMode}
                />
              ))}
            </div>
          ) : viewMode === "grid" ? (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
            >
              {filteredProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredProjects.map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center py-12 bg-white dark:bg-gray-900 rounded-lg shadow">
            <div className="h-16 w-16 rounded-full bg-primary-50 dark:bg-[#026d55]/20 flex items-center justify-center mb-4">
              <FileVideo className="h-8 w-8 text-primary-400 dark:text-[#026d55]" />
            </div>
            {searchTerm || statusFilter ? (
              <>
                <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">No matching projects found</h3>
                <p className="text-neutral-500 dark:text-gray-400 text-center mb-6 max-w-md">
                  Try adjusting your search or filters to find what you're looking for
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter(null);
                  }}
                  className="dark:bg-[#026d55] dark:hover:bg-[#025943] dark:text-white"
                >
                  Clear Filters
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">No projects yet</h3>
                <p className="text-neutral-500 dark:text-gray-400 text-center mb-6 max-w-md">
                  Create your first project to start reviewing media files
                </p>
                {isEditor && (
                  <Button onClick={() => navigate("/projects/new")}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Project
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// Collapsible "owner" section in the grouped projects view. We keep
// the open state in localStorage (via useGroupOpen) so navigating away
// and back doesn't fold everything up again.
function ProjectGroup({
  groupKey,
  header,
  count,
  items,
  defaultOpen,
  accent,
  viewMode = "grid",
}: {
  groupKey: string;
  header: React.ReactNode;
  count: number;
  items: Array<React.ComponentProps<typeof ProjectCard>["project"]>;
  defaultOpen: boolean;
  accent?: string;
  viewMode?: "grid" | "list";
}) {
  const [open, setOpen] = useGroupOpen(groupKey, defaultOpen);
  const regionId = `project-group-region-${groupKey}`;
  return (
    <section data-testid={`project-group-${groupKey}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={regionId}
        className="group flex w-full items-center gap-2 px-1 py-1 mb-2 rounded-md hover:bg-neutral-100 dark:hover:bg-gray-900/50 transition-colors"
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-neutral-400 transition-transform",
            open && "rotate-90"
          )}
        />
        {header}
        <span
          className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] px-1.5 h-5 rounded-full text-[10px] font-semibold text-white"
          style={{ backgroundColor: accent || "#737373" }}
        >
          {count}
        </span>
        <div className="flex-1 ml-2 h-px bg-neutral-200 dark:bg-gray-800" />
      </button>
      {open && (
        viewMode === "grid" ? (
          <div
            id={regionId}
            role="region"
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
          >
            {items.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        ) : (
          <div id={regionId} role="region" className="flex flex-col gap-2">
            {items.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </div>
        )
      )}
    </section>
  );
}
