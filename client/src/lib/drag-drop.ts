// Tiny drag-and-drop payload helper used to move things around the app.
//
// We use HTML5 native DnD (no extra deps). The payload is JSON-serialised
// onto a custom mime type so we can:
//   - cleanly tell our drags apart from random text/file drops
//   - inspect the payload during dragover (when most browsers HIDE the
//     payload), by also stashing it in module state for the lifetime of
//     the drag. This lets a drop target decide whether to accept BEFORE
//     the user releases the mouse.

export const DRAG_MIME = "application/x-obviu-dnd";

export type DragPayload =
  | { type: "project"; id: number; sourceFolderId: number | null }
  // Multi-project drag. Drop targets that accept "project" should also
  // accept "projects" and iterate `ids`. sourceFolderId is the folder
  // the FIRST selected project came from — used only as a hint so the
  // target can short-circuit a no-op drop on the same folder.
  | { type: "projects"; ids: number[]; sourceFolderId: number | null }
  | { type: "folder"; id: number; sourceParentFolderId: number | null; isGlobal: boolean }
  | { type: "file"; id: number; sourceProjectId: number }
  // Multi-file drag (project-scoped). Drop targets that already accept
  // "file" should also accept "files" and iterate `ids`.
  | { type: "files"; ids: number[]; sourceProjectId: number };

let activePayload: DragPayload | null = null;

export function setDragPayload(e: React.DragEvent, payload: DragPayload) {
  try {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
    // Some browsers also need a text/plain fallback to allow the drag at all.
    const idHint =
      payload.type === "files" || payload.type === "projects"
        ? payload.ids.join(",")
        : String(payload.id);
    e.dataTransfer.setData("text/plain", `${payload.type}:${idHint}`);
    e.dataTransfer.effectAllowed = "move";
  } catch {
    // ignore — DataTransfer can throw in edge cases (cross-origin iframes etc.)
  }
  activePayload = payload;
}

// Read the payload during drop. Falls back to the cached payload only
// when the dropped item ACTUALLY carries our custom MIME — otherwise an
// unrelated drop (e.g. a file from the OS, or a stale cache after an
// aborted drag) could trigger a move with old IDs.
export function getDragPayload(e: React.DragEvent): DragPayload | null {
  if (!hasDragMime(e)) return null;
  try {
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (raw) return JSON.parse(raw) as DragPayload;
  } catch {
    // fall through to cached value
  }
  return activePayload;
}

// Read-only peek used during dragover so a target can decide whether to
// accept before the drop fires. Browsers hide dataTransfer values during
// dragover (security) but they DO expose `types`, which we use to make
// sure this drag actually started from inside the app — that gates the
// fallback to the cached payload and prevents stale-cache mis-drops.
export function peekDragPayload(e?: React.DragEvent): DragPayload | null {
  if (e && !hasDragMime(e)) return null;
  return activePayload;
}

function hasDragMime(e: React.DragEvent): boolean {
  try {
    const types = e.dataTransfer?.types;
    if (!types) return false;
    // DataTransferItemList vs string[] — both expose includes/contains.
    if (typeof (types as any).includes === "function") {
      return (types as any).includes(DRAG_MIME);
    }
    for (let i = 0; i < (types as any).length; i++) {
      if ((types as any)[i] === DRAG_MIME) return true;
    }
  } catch {}
  return false;
}

export function clearDragPayload() {
  activePayload = null;
}
