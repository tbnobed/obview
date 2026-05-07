import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, MoreHorizontal, Search, Trash2, ExternalLink, FileVideo, Users as UsersIcon } from "lucide-react";

type AdminProject = {
  id: number;
  name: string;
  description: string | null;
  status: "in_progress" | "in_review" | "approved" | string;
  createdAt: string;
  updatedAt: string;
  createdById: number;
  creatorName?: string | null;
  creatorUsername?: string | null;
  fileCount?: number;
  latestVideoFile?: { id: number; filename: string; createdAt: string } | null;
};

type SortKey = "name" | "owner" | "files" | "latest" | "updated" | "created" | "status";
type SortDir = "asc" | "desc";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress",
  in_review: "In review",
  approved: "Approved",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  in_progress: "outline",
  in_review: "secondary",
  approved: "default",
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtRelative(d?: string | null) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return fmtDate(d);
}

export default function ProjectManager() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pendingDelete, setPendingDelete] = useState<AdminProject | null>(null);

  const { data: projects, isLoading } = useQuery<AdminProject[]>({
    queryKey: ["/api/projects"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project moved to trash", description: "Restore from /admin/trash within 7 days." });
      setPendingDelete(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    let rows = projects ?? [];
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter((p) => {
        const owner = (p.creatorName || p.creatorUsername || "").toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q) ||
          owner.includes(q) ||
          String(p.id).includes(q)
        );
      });
    }
    if (statusFilter !== "all") {
      rows = rows.filter((p) => p.status === statusFilter);
    }
    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...rows].sort((a, b) => {
      switch (sortKey) {
        case "name": return a.name.localeCompare(b.name) * dir;
        case "owner": return (a.creatorName || a.creatorUsername || "").localeCompare(b.creatorName || b.creatorUsername || "") * dir;
        case "files": return ((a.fileCount ?? 0) - (b.fileCount ?? 0)) * dir;
        case "latest": {
          const ad = a.latestVideoFile?.createdAt ? new Date(a.latestVideoFile.createdAt).getTime() : 0;
          const bd = b.latestVideoFile?.createdAt ? new Date(b.latestVideoFile.createdAt).getTime() : 0;
          return (ad - bd) * dir;
        }
        case "updated": return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir;
        case "created": return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
        case "status": return (a.status || "").localeCompare(b.status || "") * dir;
      }
    });
    return sorted;
  }, [projects, query, statusFilter, sortKey, sortDir]);

  const totals = useMemo(() => {
    const all = projects ?? [];
    return {
      total: all.length,
      inProgress: all.filter((p) => p.status === "in_progress").length,
      inReview: all.filter((p) => p.status === "in_review").length,
      approved: all.filter((p) => p.status === "approved").length,
      files: all.reduce((acc, p) => acc + (p.fileCount ?? 0), 0),
    };
  }, [projects]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir(k === "name" || k === "owner" ? "asc" : "desc");
    }
  }

  function SortHeader({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) {
    const active = sortKey === k;
    const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide hover:text-primary"
        >
          {children}
          <Icon className={`h-3 w-3 ${active ? "" : "opacity-40"}`} />
        </button>
      </TableHead>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Projects" value={totals.total} />
        <StatTile label="In progress" value={totals.inProgress} />
        <StatTile label="In review" value={totals.inReview} />
        <StatTile label="Total files" value={totals.files} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, owner, or ID…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["all", "in_progress", "in_review", "approved"].map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All" : STATUS_LABEL[s] || s}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-md border dark:border-gray-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader k="name">Project</SortHeader>
              <SortHeader k="owner">Owner</SortHeader>
              <SortHeader k="status">Status</SortHeader>
              <SortHeader k="files" className="text-right">Files</SortHeader>
              <SortHeader k="latest">Latest upload</SortHeader>
              <SortHeader k="updated">Updated</SortHeader>
              <SortHeader k="created">Created</SortHeader>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                  {projects && projects.length > 0 ? "No projects match your filters." : "No projects found."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span className="truncate max-w-[280px]">{p.name}</span>
                      <span className="text-xs text-muted-foreground">#{p.id}{p.description ? ` · ${p.description}` : ""}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-1">
                      <UsersIcon className="h-3 w-3 text-muted-foreground" />
                      <span>{p.creatorName || p.creatorUsername || `user #${p.createdById}`}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[p.status] || "outline"}>
                      {STATUS_LABEL[p.status] || p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div className="inline-flex items-center gap-1">
                      <FileVideo className="h-3 w-3 text-muted-foreground" />
                      {p.fileCount ?? 0}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.latestVideoFile ? (
                      <div className="flex flex-col">
                        <span className="truncate max-w-[200px]">{p.latestVideoFile.filename}</span>
                        <span className="text-xs text-muted-foreground">{fmtRelative(p.latestVideoFile.createdAt)}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtRelative(p.updatedAt)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(p.createdAt)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/projects/${p.id}`)}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open project
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => setPendingDelete(p)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Move to trash
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-xs text-muted-foreground">
        Showing {filtered.length} of {projects?.length ?? 0} projects
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move "{pendingDelete?.name}" to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              The project will be hidden from all users. Files inside it remain on disk and the project can be restored from the trash within 7 days. After that the auto-purge sweep will permanently remove it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Move to trash"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border dark:border-gray-800 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
