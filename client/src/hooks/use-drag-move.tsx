import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Centralised mutations for drag-and-drop moves so every drop target uses
// the same invalidation strategy and toast wording. Keeping this here
// (instead of inside each component) means one place to fix when a query
// key changes.

export function useMoveProjectToFolder() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ projectId, folderId }: { projectId: number; folderId: number | null }) => {
      return await apiRequest("PATCH", `/api/projects/${projectId}`, { folderId });
    },
    onSuccess: (_data, vars) => {
      // refetchType: 'all' forces a refetch even for inactive (closed
      // sidebar / unmounted folder page) queries. With the global
      // staleTime of Infinity, the default 'active' setting would
      // leave a stale cache entry sitting around so when the user
      // later expanded the target folder they'd briefly see the old
      // contents. We want fresh data the next time any folder query
      // mounts, so refetch everything that matched.
      const refetchType = "all" as const;
      queryClient.invalidateQueries({ queryKey: ["/api/projects"], refetchType });
      queryClient.invalidateQueries({ queryKey: ["/api/folders"], refetchType });
      // Folder-projects keys are templated single-string keys
      // (`/api/folders/<id>/projects`). Match both the source and the
      // target via predicate so neither side serves stale rows.
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey?.[0];
          return typeof k === "string" && k.startsWith("/api/folders/") && k.endsWith("/projects");
        },
        refetchType,
      });
      toast({
        title: vars.folderId == null ? "Project moved out of folder" : "Project moved",
        description: "The project has been moved.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't move project", description: err.message, variant: "destructive" });
    },
  });
}

export function useMoveFolderUnderParent() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ folderId, parentFolderId }: { folderId: number; parentFolderId: number | null }) => {
      return await apiRequest("PATCH", `/api/folders/${folderId}`, { parentFolderId });
    },
    onSuccess: () => {
      // Same rationale as useMoveProjectToFolder: refetchType 'all' so
      // closed sidebar branches don't keep stale parent/child data
      // when the user expands them later.
      queryClient.invalidateQueries({ queryKey: ["/api/folders"], refetchType: "all" });
      toast({ title: "Folder moved", description: "The folder has been re-parented." });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't move folder", description: err.message, variant: "destructive" });
    },
  });
}

export function useMoveFileToFolder() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ fileId, folderId, projectId }: { fileId: number; folderId: number | null; projectId: number }) => {
      // projectId stays the same — only folderId changes. Server expects
      // both fields on the move endpoint.
      return await apiRequest("PATCH", `/api/files/${fileId}/move`, { folderId, projectId });
    },
    onSuccess: (_data, vars) => {
      const refetchType = "all" as const;
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${vars.projectId}/files`],
        refetchType,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", vars.projectId, "files"],
        refetchType,
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${vars.projectId}/folders`],
        refetchType,
      });
      toast({
        title: vars.folderId == null ? "Moved to project root" : "File moved to folder",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't move file", description: err.message, variant: "destructive" });
    },
  });
}

// Bulk variant of useMoveFileToFolder — moves N files in parallel and
// fires a single invalidation + toast when they're all done. Used by
// drag-and-drop multi-select on the project page.
export function useMoveFilesToFolder() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({
      fileIds,
      folderId,
      projectId,
    }: {
      fileIds: number[];
      folderId: number | null;
      projectId: number;
    }) => {
      const results = await Promise.allSettled(
        fileIds.map((id) =>
          apiRequest("PATCH", `/api/files/${id}/move`, { folderId, projectId }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      return { total: fileIds.length, failed };
    },
    onSuccess: (res, vars) => {
      const refetchType = "all" as const;
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${vars.projectId}/files`],
        refetchType,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", vars.projectId, "files"],
        refetchType,
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${vars.projectId}/folders`],
        refetchType,
      });
      const moved = res.total - res.failed;
      if (res.failed === 0) {
        toast({
          title:
            vars.folderId == null
              ? `Moved ${moved} file${moved === 1 ? "" : "s"} to project root`
              : `Moved ${moved} file${moved === 1 ? "" : "s"} to folder`,
        });
      } else {
        toast({
          title: `Moved ${moved} of ${res.total} files`,
          description: `${res.failed} could not be moved.`,
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't move files", description: err.message, variant: "destructive" });
    },
  });
}

export function useMoveFileToProject() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ fileId, projectId }: { fileId: number; projectId: number }) => {
      return await apiRequest("PATCH", `/api/files/${fileId}/move`, { projectId });
    },
    onSuccess: (_data, vars) => {
      const refetchType = "all" as const;
      // Both projects' file lists should refresh. We don't know the
      // source project id here, so invalidate everything that looks like
      // a project-scoped file query. Cheap and correct.
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey?.[0];
          return typeof k === "string" && (k.startsWith("/api/projects/") || k === "/api/projects");
        },
        refetchType,
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${vars.projectId}/files`],
        refetchType,
      });
      // Folder-page project lists carry latest-video / file-count
      // metadata that changes when a file is moved across projects, so
      // they must refresh too.
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey?.[0];
          return typeof k === "string" && k.startsWith("/api/folders/") && k.endsWith("/projects");
        },
        refetchType,
      });
      toast({ title: "File moved", description: "The file has been moved to the target project." });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't move file", description: err.message, variant: "destructive" });
    },
  });
}
