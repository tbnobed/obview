import { useEffect, useRef, useState, type RefObject } from "react";
import { uploadService } from "@/lib/upload-service";
import { useToast } from "@/hooks/use-toast";

// Native DOM drag listeners that accept OS files dropped onto the
// element and upload each one to `projectId`. In-app drags (anything
// carrying our `application/x-obviu-dnd` MIME) are ignored so they
// keep flowing to the existing move/stack handlers.
//
// Returns `isDropTarget` so the caller can render a hover ring.
// Listeners are attached once per mount; `projectId` and `enabled`
// are tracked through refs so the effect doesn't tear down mid-drag.
export function useOsFileDrop(
  ref: RefObject<HTMLElement | null>,
  projectId: number | null | undefined,
  opts: { enabled?: boolean; label?: string } = {},
) {
  const { enabled = true, label = "project" } = opts;
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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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

    const accept = (e: DragEvent) =>
      enabledRef.current && projectIdRef.current != null && !isInternal(e) && isFileDrag(e);

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
        uploadService.uploadFile(f, pid);
      }
      toastRef.current({
        title: files.length === 1 ? "Uploading file" : `Uploading ${files.length} files`,
        description: `${files.map(f => f.name).slice(0, 3).join(", ")}${files.length > 3 ? ", …" : ""} → ${labelRef.current}`,
      });
    };

    el.addEventListener("dragenter", onDragEnter);
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragenter", onDragEnter);
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, [ref]);

  return isDropTarget;
}
