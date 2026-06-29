---
name: File version stacks & folder-scoped deletes
description: How file version stacks are keyed vs. how storage.deleteFile cascades — why folder-scoped file deletes must NOT use deleteFile.
---

# File version stacks vs. folder-scoped deletes

**Rule:** Any folder-scoped (or otherwise subset-scoped) file deletion must soft-delete the EXACT file row IDs in scope — never `storage.deleteFile(id)`.

**Why:**
- A version stack (one "card" in the UI) is the set of `files` rows sharing `(projectId, filename, folderId)`. Uploads match/stack a new version only when filename AND folderId match (see `server/tus.ts`, "Same filename in two different subfolders are independent file lineages"). So the same filename in two different subfolders = two independent stacks.
- `storage.deleteFile(id)` (DatabaseStorage, `server/storage.ts`) cascades the soft-delete across the whole `(projectId, filename)` group — it IGNORES folderId. Correct for the per-file delete button (delete a card = delete all its versions), but WRONG for folder-scoped deletes: it would also trash a same-named file living in a folder you are NOT deleting.

**How to apply:**
- When deleting files because their folder/subtree is being removed, collect the row IDs whose `folderId` is in the subtree and batch `db.update(filesTable).set({deletedAt}).where(and(inArray(id, ids), isNull(deletedAt)))`. This is folder-cohesive: all versions of an in-subtree stack share that folder, so they're all included; other folders' stacks are untouched.
- The folder-subtree delete handler is the subfolder branch of `DELETE /api/folders/:folderId` in `server/routes.ts`.

**Client cache note:** the per-project file list query key is the STRING form `["/api/projects/:id/files"]` (see `client/src/hooks/use-media.tsx`). `invalidateQueries(["/api/projects"])` does NOT prefix-match it. After mutations that change a project's files, invalidate it explicitly (e.g. a predicate matching keys that start with `/api/projects/` and end with `/files`), as `useDeleteFolder` now does.

**Read-side stacks must also scope by folderId:** any code that BUILDS a version stack by listing a project's files and grouping must filter on `(filename, folderId)`, not filename alone. Filtering by filename only merges independent same-named lineages from different folders into one bogus stack — the visible symptom is a version picker showing several rows all reading "v1 (latest)" (each is genuinely v1/latest within its own folder). This bit the panel read API `GET /api/v1/files/:id` version-stack builder in `server/routes.ts`; it now mirrors the tus `(filename, folderId)` scoping.

**Per-version display name vs. stack key:** `files.filename` is the SHARED stack key — every version in a stack carries the same value, and version upload OVERWRITES the new file's real name with the stack key (frontend passes the existing `file.filename` as `customFilename`). So `filename` can NEVER tell you which version you're viewing. The real per-version uploaded name lives in nullable `files.originalFilename` (DB `original_filename`), captured at upload in ALL FOUR row-creation paths: `server/tus.ts` single-stream (`meta.filename`), `server/tus.ts` multipart (`manifest.filename`), `server/routes.ts` multipart route (`req.file.originalname`), `server/share-links.ts` reviewer upload (`file.originalname`). **Rule:** any user-visible file name must render `originalFilename || filename`. Rows created before this column existed have NULL → intentionally fall back to the shared `filename` (their real names were already lost at upload and cannot be recovered). Downloads still use `filename` (stack key) on purpose.
