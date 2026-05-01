import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { formatTimeAgo } from "@/lib/utils/formatters";

type TrashedProject = {
  id: number;
  name: string;
  description?: string | null;
  createdById: number;
  creatorUsername?: string | null;
  creatorName?: string | null;
  deletedAt: string;
  fileCount?: number;
};

type TrashedFolder = {
  id: number;
  name: string;
  createdById: number;
  creatorUsername?: string | null;
  creatorName?: string | null;
  deletedAt: string;
};

type TrashResponse = { projects: TrashedProject[]; folders: TrashedFolder[] };

export default function AdminTrashPage() {
  const [_, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [purgeTarget, setPurgeTarget] = useState<TrashedProject | null>(null);
  const [purgeTyped, setPurgeTyped] = useState("");

  useEffect(() => { document.title = "Trash | Obviu.io"; }, []);
  useEffect(() => {
    if (user && user.role !== "admin") navigate("/projects");
  }, [user, navigate]);

  const { data, isLoading, error } = useQuery<TrashResponse>({
    queryKey: ["/api/admin/trash"],
  });

  const restoreProject = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/admin/trash/projects/${id}/restore`),
    onSuccess: (_d, id) => {
      toast({ title: "Project restored", description: `Project #${id} is back on the dashboard.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/trash"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (e: any) => toast({ title: "Restore failed", description: e?.message ?? "", variant: "destructive" }),
  });

  const purgeProject = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/trash/projects/${id}`),
    onSuccess: () => {
      toast({ title: "Project permanently removed", description: "Files were unlinked from disk." });
      setPurgeTarget(null);
      setPurgeTyped("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/trash"] });
    },
    onError: (e: any) => toast({ title: "Purge failed", description: e?.message ?? "", variant: "destructive" }),
  });

  const restoreFolder = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/admin/trash/folders/${id}/restore`),
    onSuccess: () => {
      toast({ title: "Folder restored" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/trash"] });
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
    },
  });

  const purgeFolder = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/trash/folders/${id}`),
    onSuccess: () => {
      toast({ title: "Folder permanently removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/trash"] });
    },
  });

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Trash</h1>
            <p className="text-neutral-500 text-sm mt-1">
              Soft-deleted projects and folders. Restore puts them back on the dashboard.
              Permanent delete removes the database row and unlinks the files from disk.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/projects")}>Back to projects</Button>
        </div>

        {isLoading && (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        )}
        {error && <div className="text-red-600">Failed to load trash</div>}

        {data && (
          <>
            <Card>
              <CardHeader><CardTitle className="text-lg">Projects ({data.projects.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.projects.length === 0 && <p className="text-sm text-neutral-500">No deleted projects.</p>}
                {data.projects.map(p => {
                  const owner = p.creatorName || p.creatorUsername || `user #${p.createdById}`;
                  return (
                    <div key={p.id} className="flex items-center justify-between border rounded-md p-3 gap-3" data-testid={`trash-project-row-${p.id}`}>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="text-xs text-neutral-500 flex flex-wrap gap-2 mt-1">
                          <Badge variant="outline" className="font-normal">Owner: {owner}</Badge>
                          {typeof p.fileCount === "number" && <Badge variant="outline" className="font-normal">{p.fileCount} file{p.fileCount === 1 ? "" : "s"}</Badge>}
                          <span>Deleted {formatTimeAgo(new Date(p.deletedAt))}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => restoreProject.mutate(p.id)}
                          disabled={restoreProject.isPending}
                          data-testid={`restore-project-${p.id}`}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => { setPurgeTarget(p); setPurgeTyped(""); }}
                          data-testid={`purge-project-${p.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete forever
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">Folders ({data.folders.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.folders.length === 0 && <p className="text-sm text-neutral-500">No deleted folders.</p>}
                {data.folders.map(f => {
                  const owner = f.creatorName || f.creatorUsername || `user #${f.createdById}`;
                  return (
                    <div key={f.id} className="flex items-center justify-between border rounded-md p-3 gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{f.name}</div>
                        <div className="text-xs text-neutral-500 mt-1">
                          <Badge variant="outline" className="font-normal mr-2">Owner: {owner}</Badge>
                          Deleted {formatTimeAgo(new Date(f.deletedAt))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => restoreFolder.mutate(f.id)} disabled={restoreFolder.isPending}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => purgeFolder.mutate(f.id)} disabled={purgeFolder.isPending}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete forever
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={!!purgeTarget} onOpenChange={(open) => { if (!open) { setPurgeTarget(null); setPurgeTyped(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently delete project?</DialogTitle>
            <DialogDescription>
              This unlinks <span className="font-semibold">{purgeTarget?.name}</span>'s {purgeTarget?.fileCount ?? 0} file
              {purgeTarget?.fileCount === 1 ? "" : "s"} from disk and removes the database row. This cannot be undone — it will not even
              be in the trash anymore.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="purge-confirm">Type <span className="font-semibold">{purgeTarget?.name}</span> to confirm</Label>
            <Input id="purge-confirm" autoFocus value={purgeTyped} onChange={(e) => setPurgeTyped(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurgeTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!purgeTarget || purgeTyped.trim() !== purgeTarget.name || purgeProject.isPending}
              onClick={() => purgeTarget && purgeProject.mutate(purgeTarget.id)}
              data-testid="purge-confirm-button"
            >
              {purgeProject.isPending ? "Deleting…" : "Delete forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
