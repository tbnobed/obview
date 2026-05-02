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
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      // Refresh both source and target folder project lists. We don't
      // know the source folder here so we invalidate the list endpoint
      // broadly — folder-page queries use this key prefix.
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey?.[0];
        return typeof k === "string" && k.startsWith("/api/folders/") && k.endsWith("/projects");
      }});
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
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      toast({ title: "Folder moved", description: "The folder has been re-parented." });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't move folder", description: err.message, variant: "destructive" });
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
      // Both projects' file lists should refresh. We don't know the
      // source project id here, so invalidate everything that looks like
      // a project-scoped file query. Cheap and correct.
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey?.[0];
        return typeof k === "string" && (k.startsWith("/api/projects/") || k === "/api/projects");
      }});
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${vars.projectId}/files`] });
      // Folder-page project lists carry latest-video / file-count
      // metadata that changes when a file is moved across projects, so
      // they must refresh too.
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey?.[0];
        return typeof k === "string" && k.startsWith("/api/folders/") && k.endsWith("/projects");
      }});
      toast({ title: "File moved", description: "The file has been moved to the target project." });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't move file", description: err.message, variant: "destructive" });
    },
  });
}
