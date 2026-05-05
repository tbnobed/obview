// Resumable, chunked upload server using the tus protocol.
//
// Why tus?
//   - Slow connections were silently failing on single-shot 50GB POSTs.
//     tus uploads in small chunks, retries individual chunks, and resumes
//     across reloads / network drops, fixing the entire class of "upload
//     died at 80%" complaints.
//   - The HTTP layer is per-chunk, so reverse-proxy / Node timeouts can no
//     longer kill an in-flight large upload.
//
// Auth model:
//   The Express layer (see routes.ts) wraps every /api/uploads/tus* request
//   with `isAuthenticated` and stamps the authenticated user id onto a
//   trusted, server-only request header. This module's hooks read that
//   header and ALSO bind the uploader to the upload at create time, so a
//   second user who somehow learns the upload URL still cannot continue or
//   finalize the upload — see `onIncomingRequest` below.

import path from "path";
import fs from "fs";
import { Server as TusServer } from "@tus/server";
import { FileStore } from "@tus/file-store";
import { storage } from "./storage";

export const TUS_USER_HEADER = "x-internal-user-id";

export interface CreateTusServerOptions {
  uploadsDir: string;        // final on-disk destination for completed uploads
  tusDataDir: string;        // working directory tus uses while chunks stream in
  maxFileSize?: number;
  onProcessVideo: (file: any, processingId: number) => void;
  onTranscribe: (args: { fileId: number; inputPath: string; fileType: string }) => void;
}

function readUserIdFromTusReq(req: any): number | null {
  // srvx wraps the node request; the trusted header set by the Express
  // middleware lives on the underlying node IncomingMessage.
  const node = req?.runtime?.node?.req || req?.node?.req;
  const headerVal =
    (node?.headers?.[TUS_USER_HEADER] as string | undefined) ||
    (req?.headers?.get?.(TUS_USER_HEADER) as string | undefined);
  const n = Number(headerVal);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function userCanEditProject(userId: number, projectId: number): Promise<boolean> {
  const user = await storage.getUser(userId);
  if (!user) return false;
  if (user.role === "admin") return true;
  const pu = await storage.getProjectUser(projectId, userId);
  return !!pu && (pu.role === "editor" || pu.role === "admin");
}

export function createTusServer(opts: CreateTusServerOptions): TusServer {
  fs.mkdirSync(opts.tusDataDir, { recursive: true });
  fs.mkdirSync(opts.uploadsDir, { recursive: true });

  const datastore = new FileStore({ directory: opts.tusDataDir });

  return new TusServer({
    path: "/api/uploads/tus",
    datastore,
    maxSize: opts.maxFileSize ?? 50 * 1024 * 1024 * 1024, // 50 GB
    respectForwardedHeaders: true,

    // Re-check authorization on EVERY request that touches an existing
    // upload (HEAD / PATCH / DELETE / final POST). Without this an
    // attacker who steals an authenticated session and an upload URL
    // could resume or terminate someone else's upload, or finalize it
    // into a project they don't have edit access to. By binding the
    // uploader id and target project to the upload at create time and
    // re-validating both here, an upload URL is only useful to the
    // user who created it, for the project it was created for.
    async onIncomingRequest(req, uploadId) {
      if (!uploadId) return; // POST creation goes through onUploadCreate.
      const currentUserId = readUserIdFromTusReq(req);
      if (!currentUserId) {
        throw { status_code: 401, body: "Unauthorized" };
      }
      let upload;
      try {
        upload = await datastore.getUpload(uploadId);
      } catch {
        // Let tus produce its standard 404 for unknown ids.
        return;
      }
      const meta = upload.metadata || {};
      const ownerId = Number(meta.uploaderId);
      const projectId = Number(meta.projectId);
      if (!Number.isFinite(ownerId) || ownerId !== currentUserId) {
        throw { status_code: 403, body: "Forbidden" };
      }
      if (!Number.isFinite(projectId) || !(await userCanEditProject(currentUserId, projectId))) {
        throw { status_code: 403, body: "Insufficient permissions" };
      }
    },

    // Validate that the uploader is authenticated AND has edit rights to
    // the target project before we accept a single byte. We also stamp
    // the server-trusted uploader id onto the upload's metadata so
    // `onIncomingRequest` can re-validate ownership on every later
    // chunk without trusting anything from the wire.
    async onUploadCreate(req, upload) {
      const meta = upload.metadata || {};
      const projectIdStr = meta.projectId;
      if (!projectIdStr || !/^\d+$/.test(projectIdStr)) {
        throw { status_code: 400, body: "projectId metadata required" };
      }
      const userId = readUserIdFromTusReq(req);
      if (!userId) throw { status_code: 401, body: "Unauthorized" };

      const projectId = Number(projectIdStr);
      const project = await storage.getProject(projectId);
      if (!project) throw { status_code: 404, body: "Project not found" };

      if (!(await userCanEditProject(userId, projectId))) {
        throw { status_code: 403, body: "Insufficient permissions" };
      }

      return {
        metadata: {
          ...meta,
          uploaderId: String(userId),
        },
      };
    },

    // Move the assembled file out of the tus working dir into the canonical
    // uploads directory, create the DB row, log the activity and kick off
    // the existing post-upload pipeline (video processing + transcription).
    // The response body returned here is delivered to tus-js-client via its
    // `onAfterResponse` hook so the UI can immediately reflect the new file.
    async onUploadFinish(req, upload) {
      const meta = upload.metadata || {};
      const projectId = Number(meta.projectId);
      const storedUploaderId = Number(meta.uploaderId);
      const currentUserId = readUserIdFromTusReq(req);
      // Defense in depth: even though onIncomingRequest already checked,
      // refuse to commit if the IDs don't line up.
      if (!currentUserId || currentUserId !== storedUploaderId) {
        throw { status_code: 403, body: "Forbidden" };
      }
      if (!(await userCanEditProject(currentUserId, projectId))) {
        throw { status_code: 403, body: "Insufficient permissions" };
      }

      const filename = meta.customFilename || meta.filename || `upload-${upload.id}`;
      const mimetype = meta.filetype || "application/octet-stream";

      const ext = path.extname(filename) || "";
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      const finalPath = path.join(opts.uploadsDir, uniqueName);
      const tusPath = path.join(opts.tusDataDir, upload.id);

      try {
        await fs.promises.rename(tusPath, finalPath);
      } catch (e: any) {
        // Cross-device fallback (e.g. uploads/.tus and uploads/ on different
        // mounts) — copy then remove so renames stay free where possible.
        if (e?.code === "EXDEV") {
          await fs.promises.copyFile(tusPath, finalPath);
          await fs.promises.unlink(tusPath);
        } else {
          throw e;
        }
      }

      let fileType = "other";
      if (mimetype.startsWith("video/")) fileType = "video";
      else if (mimetype.startsWith("audio/")) fileType = "audio";
      else if (mimetype.startsWith("image/")) fileType = "image";

      // Versioning. Important ordering rule: insert the new row FIRST,
      // then demote the previously-latest siblings. If we demoted first
      // and the insert failed, the project would be left with no row
      // marked as latest. Concurrent finishes for the same filename are
      // still racy in theory, but each will end up with a unique
      // monotonically-increasing version and a single demotion pass.
      let fileRow: any;
      let existing: any[] = [];
      let similar: any[] = [];
      try {
        existing = await storage.getFilesByProject(projectId);
        similar = existing.filter((f: any) => f.filename === filename);
        const version =
          similar.length > 0
            ? Math.max(...similar.map((f: any) => f.version)) + 1
            : 1;

        fileRow = await storage.createFile({
          filename,
          fileType,
          fileSize: upload.size ?? 0,
          filePath: finalPath,
          projectId,
          uploadedById: currentUserId,
          version,
          isLatestVersion: true,
        });
      } catch (err) {
        // DB insert failed — the moved file would otherwise be orphaned
        // on disk forever. Best-effort cleanup before re-throwing.
        await fs.promises.unlink(finalPath).catch(() => {});
        throw err;
      }

      // Sidecar tus metadata and any older "latest" markers can be
      // cleaned up now that the new row is safely committed. Failures
      // here are non-fatal — the file is already saved and visible.
      await fs.promises.unlink(`${tusPath}.json`).catch(() => {});
      try {
        if (similar.length > 0) {
          await Promise.all(
            similar.map((f: any) =>
              storage.updateFile(f.id, { isLatestVersion: false })
            )
          );
        }
      } catch (err) {
        console.error("[tus] Failed to demote previous file versions:", err);
      }

      try {
        await storage.logActivity({
          action: "upload",
          entityType: "file",
          entityId: fileRow.id,
          userId: currentUserId,
          metadata: {
            projectId,
            filename: fileRow.filename,
            version: fileRow.version,
            source: "tus",
          },
        });

        if (fileType === "video") {
          const processing = await storage.createVideoProcessing({
            fileId: fileRow.id,
            status: "pending",
          });
          opts.onProcessVideo(fileRow, processing.id);
        }
        if (fileType === "video" || fileType === "audio") {
          opts.onTranscribe({
            fileId: fileRow.id,
            inputPath: fileRow.filePath,
            fileType,
          });
        }
      } catch (err) {
        console.error("[tus] Post-upload pipeline failed:", err);
      }

      return {
        status_code: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fileRow),
      };
    },
  });
}
