import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Trash2, Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Project } from "@shared/schema";

// Lets the project owner / editor / admin set or clear the project's
// custom poster image. Falls back to the latest video sprite when no
// custom thumbnail is set. Sits inside the Project Settings sheet.
export function ProjectThumbnailManager({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<"upload" | "delete" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The default fetcher in queryClient only uses queryKey[0], which would
  // hit the list endpoint /api/projects — we need the single-project URL,
  // so override queryFn here.
  const { data: project, refetch } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: Number.isFinite(projectId),
  });

  const hasCustom = !!project?.customThumbnailPath;
  const cacheBust = project?.updatedAt
    ? new Date(project.updatedAt).getTime()
    : Date.now();

  const invalidateLists = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects/folder"] });
    queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
  };

  const onPick = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
      toast({
        title: "Unsupported image",
        description: "Use PNG, JPEG, WebP, or GIF.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Image too large",
        description: "Max 10 MB.",
        variant: "destructive",
      });
      return;
    }
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("thumbnail", file);
      const res = await fetch(`/api/projects/${projectId}/thumbnail`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      invalidateLists();
      toast({ title: "Thumbnail updated" });
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const onClear = async () => {
    if (!hasCustom) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/projects/${projectId}/thumbnail`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      invalidateLists();
      toast({ title: "Thumbnail removed" });
    } catch (err: any) {
      toast({
        title: "Could not remove thumbnail",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-base font-medium dark:text-gray-200">
        Project Thumbnail
      </h3>
      <p className="text-sm text-neutral-500 dark:text-gray-400">
        Upload a custom poster image for this project. When unset, the project
        card shows the latest video's sprite preview.
      </p>

      <div className="flex items-start gap-4">
        <div className="h-24 w-40 shrink-0 rounded-md border bg-neutral-100 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
          {hasCustom ? (
            <img
              src={`/api/projects/${projectId}/thumbnail?v=${cacheBust}`}
              alt="Project thumbnail"
              className="w-full h-full object-cover"
              data-testid={`thumbnail-preview-${projectId}`}
            />
          ) : (
            <div className="text-center text-neutral-400">
              <ImageIcon className="h-6 w-6 mx-auto mb-1" />
              <span className="text-xs">No custom image</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={onFile}
            data-testid={`thumbnail-file-input-${projectId}`}
          />
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onPick}
            disabled={busy !== null}
            data-testid={`thumbnail-upload-${projectId}`}
          >
            {busy === "upload" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {hasCustom ? "Replace image" : "Upload image"}
          </Button>
          {hasCustom && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClear}
              disabled={busy !== null}
              data-testid={`thumbnail-clear-${projectId}`}
            >
              {busy === "delete" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Remove
            </Button>
          )}
          <p className="text-xs text-neutral-500 dark:text-gray-400">
            PNG, JPEG, WebP, or GIF. Max 10 MB.
          </p>
        </div>
      </div>
    </div>
  );
}
