import { useEffect, useRef, useState, type RefObject } from "react";
import { uploadService } from "@/lib/upload-service";
import { useToast } from "@/hooks/use-toast";

// Window-level capture-phase drag listeners that accept OS files
// dropped anywhere inside `ref.current` and upload each one to
// `projectId`. Listening at window/capture means we still see the
// event even if a descendant component (e.g. a media card with its
// own drop handler) calls stopPropagation. We bail out if the drop
// target is inside a descendant that has its own data-os-drop-handled
// marker — but cards stop propagation only AFTER they handle their
// own internal drop, so external file drops still flow through.
//
// In-app drags (carrying our `application/x-obviu-dnd` MIME) are
// ignored so the existing move/stack handlers stay in charge.
//
// Returns `isDropTarget` so the caller can render a hover ring.
export function useOsFileDrop(
  ref: RefObject<HTMLElement | null>,
  projectId: number | null | undefined,
  opts: { enabled?: boolean; label?: string; folderId?: number | null } = {},
) {
  const { enabled = true, label = "project", folderId = null } = opts;
  const [isDropTarget, setIsDropTarget] = useState(false);
  const { toast } = useToast();

  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const labelRef = useRef(label);
  labelRef.current = label;
  const folderIdRef = useRef(folderId);
  folderIdRef.current = folderId;

  useEffect(() => {
    const dragDepth = { n: 0 };

    const isInternal = (e: DragEvent): boolean => {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      for (let i = 0; i < types.length; i++) {
        if (types[i] === "application/x-obviu-dnd") return true;
      }
      return false;
    };
    const isFileDrag = (e: DragEvent): boolean => {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      for (let i = 0; i < types.length; i++) {
        if (types[i] === "Files") return true;
      }
      return false;
    };
    const insideRef = (e: DragEvent): boolean => {
      const el = ref.current;
      const t = e.target as Node | null;
      return !!(el && t && el.contains(t));
    };
    const accept = (e: DragEvent) =>
      enabledRef.current &&
      projectIdRef.current != null &&
      !isInternal(e) &&
      isFileDrag(e) &&
      insideRef(e);

    const onDragEnter = (e: DragEvent) => {
      if (!accept(e)) return;
      e.preventDefault();
      dragDepth.n += 1;
      setIsDropTarget(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!accept(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (e: DragEvent) => {
      if (!accept(e)) return;
      dragDepth.n = Math.max(0, dragDepth.n - 1);
      if (dragDepth.n === 0) setIsDropTarget(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!accept(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepth.n = 0;
      setIsDropTarget(false);
      const pid = projectIdRef.current;
      if (pid == null) return;
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length === 0) return;
      for (const f of files) {
        uploadService.uploadFile(f, pid, undefined, folderIdRef.current);
      }
      toastRef.current({
        title: files.length === 1 ? "Uploading file" : `Uploading ${files.length} files`,
        description: `${files.map(f => f.name).slice(0, 3).join(", ")}${files.length > 3 ? ", …" : ""} → ${labelRef.current}`,
      });
    };

    // Bubble phase: descendants (e.g. media-card-grid card-level
    // handlers) get first crack and can stopPropagation to claim the
    // drop (stack-as-version). If no descendant claims it — empty
    // space inside the project page — the window-bubble handler runs
    // and uploads as a new file.
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [ref]);

  return isDropTarget;
}
