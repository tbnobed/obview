import type { Folder } from "@shared/schema";

export type FolderNode = Folder & {
  createdByUsername?: string | null;
  children: FolderNode[];
};

// Build a tree from the flat folders array. We exclude project-scoped
// folders (folder.projectId != null) because those live inside a single
// project and never appear in the global / sidebar folder hierarchy.
// Orphans (parentFolderId points at a folder we can't see) are surfaced
// as roots so they don't silently disappear from the UI.
//
// Cycle safety: if the data ever contains a cycle (A→B→A or self-parent),
// we detect it during the parent walk and demote the cycle participant to
// a root so it stays visible. The server's PATCH guard prevents new
// cycles, but pre-existing or out-of-band data could still produce them
// and a missing folder in the sidebar is harder to debug than a stray
// root.
export function buildFolderTree(folders: Folder[] | undefined | null): FolderNode[] {
  if (!folders || folders.length === 0) return [];
  const eligible = folders.filter((f) => !f.projectId);
  const byId = new Map<number, FolderNode>();
  for (const f of eligible) byId.set(f.id, { ...(f as any), children: [] });
  const roots: FolderNode[] = [];
  for (const node of Array.from(byId.values())) {
    const parentId = (node as any).parentFolderId as number | null;
    if (parentId == null || parentId === node.id) {
      // No parent, or self-referential — render as a root.
      roots.push(node);
      continue;
    }
    const parent = byId.get(parentId);
    if (!parent) {
      // Orphan: parent isn't visible to this user. Surface as a root.
      roots.push(node);
      continue;
    }
    // Walk up from the prospective parent to make sure we won't be
    // forming a cycle by attaching `node` underneath it.
    let cursor: FolderNode | undefined = parent;
    const seen = new Set<number>([node.id]);
    let cyclic = false;
    while (cursor) {
      if (seen.has(cursor.id)) { cyclic = true; break; }
      seen.add(cursor.id);
      const nextParentId = (cursor as any).parentFolderId as number | null;
      if (nextParentId == null) break;
      cursor = byId.get(nextParentId);
    }
    if (cyclic) roots.push(node);
    else parent.children.push(node);
  }
  const sortByName = (a: FolderNode, b: FolderNode) => a.name.localeCompare(b.name);
  const sortRecursive = (nodes: FolderNode[]) => {
    nodes.sort(sortByName);
    for (const n of nodes) sortRecursive(n.children);
  };
  sortRecursive(roots);
  return roots;
}

// Return the chain of folders from root → ... → folderId, inclusive.
// Returns [] if the folder isn't found.
export function getFolderPath(folders: Folder[] | undefined | null, folderId: number): Folder[] {
  if (!folders) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const target = byId.get(folderId);
  if (!target) return [];
  const path: Folder[] = [target];
  const seen = new Set<number>([target.id]);
  let cursor: Folder | undefined = target;
  while (cursor && (cursor as any).parentFolderId != null) {
    const parent = byId.get((cursor as any).parentFolderId as number);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    path.unshift(parent);
    cursor = parent;
  }
  return path;
}

// Children of a given folder (one level down only).
export function getDirectSubfolders(folders: Folder[] | undefined | null, parentId: number): Folder[] {
  if (!folders) return [];
  return folders
    .filter((f) => !f.projectId && (f as any).parentFolderId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}
