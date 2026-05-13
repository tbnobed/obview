import type { Express, Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from "express";
import * as crypto from "crypto";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { storage } from "./storage";
import * as fileSystem from "./utils/filesystem";
import { hashPassword, comparePasswords } from "./auth";
import { insertShareLinkSchema, updateShareLinkSchema, insertCommentsUnifiedSchema } from "@shared/schema";
import { generateFCPXML, generateEDL, generateCSV } from "./utils/marker-export";
import type { ShareLink, File as DbFile } from "@shared/schema";
import { segmentsToVtt, segmentsToSrt } from "./transcription";

declare module "express-session" {
  interface SessionData {
    shareUnlocks?: Record<string, { email?: string; unlockedAt: number; pwSig?: string | null; reqEmail?: boolean }>;
  }
}

// ---------- helpers ----------

// Generate a short, URL-safe share token. 6 random bytes = 8 base64url chars
// (48 bits of entropy) — keeps share URLs minimal (e.g. obviu.io/aB3xK9mQ)
// while remaining unguessable for bearer access. The pre-check is a UX
// guard; correctness under concurrency comes from catching the unique-
// index violation at insert time and retrying (see createForScope).
async function generateShortShareToken(): Promise<string> {
  const candidate = crypto.randomBytes(6).toString("base64url");
  const existing = await storage.getShareLinkByToken(candidate);
  if (!existing) return candidate;
  return crypto.randomBytes(6).toString("base64url");
}

// Postgres unique-violation SQLSTATE
function isUniqueViolation(err: any): boolean {
  return !!err && (err.code === "23505" || /unique/i.test(String(err?.message ?? "")));
}

function isExpired(link: ShareLink): boolean {
  return !!(link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now());
}

function isUsable(link: ShareLink | undefined): link is ShareLink {
  if (!link) return false;
  if (link.revokedAt) return false;
  if (isExpired(link)) return false;
  return true;
}

function pwSigOf(link: ShareLink): string | null {
  return link.passwordHash ? crypto.createHash("sha256").update(link.passwordHash).digest("hex").slice(0, 16) : null;
}

function buildWatermarkLabel(req: Request, link: ShareLink): string | null {
  if (!link.watermarkEnabled) return null;
  if (link.watermarkText && link.watermarkText.trim().length > 0) return link.watermarkText.trim();
  // Default label: reviewer email if captured, else IP fragment, plus short timestamp
  const u = req.session?.shareUnlocks?.[link.token];
  const who = u?.email || (req.ip || req.socket.remoteAddress || "viewer").toString();
  const ts = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
  return `${who} · ${ts}`;
}

function isUnlocked(req: Request, link: ShareLink): boolean {
  // No password and no email gate => always unlocked
  if (!link.passwordHash && !link.requireEmail) return true;
  const u = req.session?.shareUnlocks?.[link.token];
  if (!u) return false;
  // Invalidate stale unlocks if link requirements changed
  const currentSig = pwSigOf(link);
  if ((u.pwSig ?? null) !== currentSig) return false;
  if ((u.reqEmail ?? false) !== !!link.requireEmail) return false;
  if (link.requireEmail && !u.email) return false;
  return true;
}

async function gatherScopeFiles(link: ShareLink): Promise<DbFile[]> {
  if (link.scopeType === "file") {
    const f = await storage.getFile(link.scopeId);
    return f ? [f] : [];
  }
  if (link.scopeType === "project") {
    const files = await storage.getFilesByProject(link.scopeId);
    return files.filter(f => f.isLatestVersion !== false);
  }
  if (link.scopeType === "folder") {
    const folder = await storage.getFolder(link.scopeId);
    if (!folder) return [];
    // Project subfolder: contains files directly via files.folderId.
    if (folder.projectId != null) {
      const fs2 = await storage.getFilesByProject(folder.projectId);
      return fs2.filter(f => f.folderId === link.scopeId && f.isLatestVersion !== false);
    }
    // Sidebar/top-level folder: contains projects; union their files.
    const projects = await storage.getProjectsByFolder(link.scopeId);
    const all: DbFile[] = [];
    for (const p of projects) {
      const fs2 = await storage.getFilesByProject(p.id);
      for (const f of fs2) if (f.isLatestVersion !== false) all.push(f);
    }
    return all;
  }
  return [];
}

async function fileBelongsToScope(link: ShareLink, fileId: number): Promise<DbFile | undefined> {
  const f = await storage.getFile(fileId);
  if (!f) return undefined;
  if (link.scopeType === "file") return link.scopeId === f.id ? f : undefined;
  if (link.scopeType === "project") return link.scopeId === f.projectId ? f : undefined;
  if (link.scopeType === "folder") {
    const folder = await storage.getFolder(link.scopeId);
    if (!folder) return undefined;
    // Project subfolder: file must be directly in this subfolder.
    if (folder.projectId != null) {
      return f.folderId === link.scopeId && f.projectId === folder.projectId ? f : undefined;
    }
    // Sidebar folder: file's project must live in this folder.
    const proj = await storage.getProject(f.projectId);
    return proj && proj.folderId === link.scopeId ? f : undefined;
  }
  return undefined;
}

async function loadGatedLink(req: Request, res: Response, requireUnlock = true): Promise<{ link: ShareLink } | null> {
  const link = await storage.getShareLinkByToken(req.params.token);
  if (!isUsable(link)) {
    res.status(404).json({ message: "Share link not found, expired, or revoked" });
    return null;
  }
  if (requireUnlock && !isUnlocked(req, link)) {
    res.status(401).json({
      message: "Unlock required",
      requiresPassword: !!link.passwordHash,
      requiresEmail: link.requireEmail,
    });
    return null;
  }
  return { link };
}

async function isAdminOrOwnerOfLink(req: Request, link: ShareLink): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.role === "admin") return true;
  return link.createdById === req.user.id;
}

async function canManageLinkNow(req: Request, link: ShareLink): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.role === "admin") return true;
  // Must still be the creator AND retain current scope-management privilege
  if (link.createdById !== req.user.id) return false;
  if (link.scopeType === "project") return canManageProjectShares(req, link.scopeId);
  if (link.scopeType === "folder") return canManageFolderShares(req, link.scopeId);
  if (link.scopeType === "file") return canManageFileShares(req, link.scopeId);
  return false;
}

// ---------- unlock attempt throttling ----------
const unlockAttempts = new Map<string, { count: number; resetAt: number }>();
function takeUnlockAttempt(key: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const cur = unlockAttempts.get(key);
  if (!cur || cur.resetAt < now) { unlockAttempts.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  if (cur.count >= max) return false;
  cur.count++; return true;
}

async function canManageProjectShares(req: Request, projectId: number): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.role === "admin") return true;
  const pu = await storage.getProjectUser(projectId, req.user.id);
  if (!pu) return false;
  return pu.role === "editor";
}

async function canManageFolderShares(req: Request, folderId: number): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.role === "admin") return true;
  const folder = await storage.getFolder(folderId);
  if (!folder) return false;
  // Project subfolders (folder.projectId != null) are file groupings INSIDE
  // a single project — share-link management for them must follow current
  // project edit access, not stale `createdById`. Without this, a former
  // editor who created a subfolder could keep minting public links to it
  // after being removed from the project. Mirrors `canManageFileShares`
  // (admin / project editor-or-admin / site-editor in a global folder).
  if (folder.projectId != null) {
    const pu = await storage.getProjectUser(folder.projectId, req.user.id);
    if (pu && (pu.role === "editor" || pu.role === "admin")) return true;
    if (req.user.role === "editor") {
      const project = await storage.getProject(folder.projectId);
      if (project?.folderId != null) {
        const parent = await storage.getFolder(project.folderId);
        if (parent?.isGlobal) return true;
      }
    }
    return false;
  }
  // Sidebar/top-level folders (no projectId): existing rule — only admins
  // manage shares on global folders, otherwise only the creator.
  if (folder.isGlobal) return false;
  return folder.createdById === req.user.id;
}

// File-scope share-link management mirrors the project edit-access check
// (admin / project editor-or-admin / site-editor in a global folder). We
// inline the logic here rather than importing from routes.ts to avoid a
// circular import (routes.ts → share-links.ts).
async function canManageFileShares(req: Request, fileId: number): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.role === "admin") return true;
  const file = await storage.getFile(fileId);
  if (!file) return false;
  const pu = await storage.getProjectUser(file.projectId, req.user.id);
  if (pu && (pu.role === "editor" || pu.role === "admin")) return true;
  if (req.user.role === "editor") {
    const project = await storage.getProject(file.projectId);
    if (project?.folderId != null) {
      const folder = await storage.getFolder(project.folderId);
      if (folder?.isGlobal) return true;
    }
  }
  return false;
}

function streamRanged(req: Request, res: Response, filePath: string, contentType: string, downloadName?: string) {
  const range = req.headers.range;
  return fsPromises.stat(filePath).then(stats => {
    const headers: Record<string, any> = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
      "Cross-Origin-Resource-Policy": "cross-origin",
    };
    if (downloadName) headers["Content-Disposition"] = `attachment; filename="${downloadName.replace(/"/g, "")}"`;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = end - start + 1;
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${stats.size}`, "Content-Length": chunksize });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { ...headers, "Content-Length": stats.size });
      fs.createReadStream(filePath).pipe(res);
    }
  });
}

function contentTypeFor(filename: string, fallback = "application/octet-stream"): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mp4": return "video/mp4";
    case "webm": return "video/webm";
    case "mov": return "video/quicktime";
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    case "jpg": case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "svg": return "image/svg+xml";
    case "pdf": return "application/pdf";
    default: return fallback;
  }
}

// ---------- registration ----------

export type ShareLinkRouteDeps = {
  uploadSingle: RequestHandler;
  handleMulterErrors: ErrorRequestHandler;
  processUploadedFile: (file: DbFile, opts: { reviewerEmail?: string | null; reviewerIp?: string | null; linkId: string }) => Promise<void> | void;
};

export function registerShareLinkRoutes(
  app: Express,
  isAuthenticated: (req: Request, res: Response, next: NextFunction) => void,
  deps?: ShareLinkRouteDeps,
) {
  // ===== management endpoints =====

  const createForScope = async (req: Request, res: Response, scopeType: "project" | "folder" | "file", scopeId: number) => {
    const parsed = insertShareLinkSchema.safeParse({
      ...req.body,
      scopeType,
      scopeId,
      createdById: req.user!.id,
    });
    if (!parsed.success) return res.status(400).json({ message: "Invalid share link", errors: parsed.error.errors });

    const id = crypto.randomUUID();
    const passwordHash = parsed.data.password ? await hashPassword(parsed.data.password) : null;
    const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt as any) : null;

    // Retry on the unique-index race in case two concurrent creators
    // happen to generate the same token (vanishingly unlikely at 96 bits,
    // but the bounded retry makes the path race-free in principle).
    let link: ShareLink | null = null;
    let lastErr: any = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = await generateShortShareToken();
      try {
        link = await storage.createShareLink({
          id, token,
          scopeType, scopeId,
          name: parsed.data.name ?? null,
          passwordHash,
          expiresAt,
          allowDownloads: !!parsed.data.allowDownloads,
          allowComments: parsed.data.allowComments !== false,
          allowUploads: !!parsed.data.allowUploads,
          requireEmail: !!parsed.data.requireEmail,
          watermarkEnabled: !!parsed.data.watermarkEnabled,
          watermarkText: parsed.data.watermarkText ?? null,
          createdById: req.user!.id,
        });
        break;
      } catch (err) {
        lastErr = err;
        if (!isUniqueViolation(err)) throw err;
      }
    }
    if (!link) throw lastErr ?? new Error("Failed to allocate share token");
    res.status(201).json(sanitizeLink(link));
  };

  app.post("/api/projects/:projectId/share-links", isAuthenticated, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (!(await canManageProjectShares(req, projectId))) return res.status(403).json({ message: "Forbidden" });
      await createForScope(req, res, "project", projectId);
    } catch (e) { next(e); }
  });

  app.get("/api/projects/:projectId/share-links", isAuthenticated, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (!(await canManageProjectShares(req, projectId))) return res.status(403).json({ message: "Forbidden" });
      const links = await storage.listShareLinksForScope("project", projectId);
      res.json(links.map(sanitizeLink));
    } catch (e) { next(e); }
  });

  app.post("/api/folders/:folderId/share-links", isAuthenticated, async (req, res, next) => {
    try {
      const folderId = parseInt(req.params.folderId);
      if (!(await canManageFolderShares(req, folderId))) return res.status(403).json({ message: "Forbidden" });
      await createForScope(req, res, "folder", folderId);
    } catch (e) { next(e); }
  });

  // File-scoped share links — mirrors project/folder shape so the same
  // ShareLinksDialog UI can manage per-file links with full permission
  // controls (password, expiry, downloads, comments, email gate,
  // watermark). Note: allowUploads stays project-only (enforced at the
  // public upload endpoint), but the field is harmless on file links.
  app.post("/api/files/:fileId/share-links", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      if (!(await canManageFileShares(req, fileId))) return res.status(403).json({ message: "Forbidden" });
      await createForScope(req, res, "file", fileId);
    } catch (e) { next(e); }
  });

  app.get("/api/files/:fileId/share-links", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      if (!(await canManageFileShares(req, fileId))) return res.status(403).json({ message: "Forbidden" });
      const links = await storage.listShareLinksForScope("file", fileId);
      res.json(links.map(sanitizeLink));
    } catch (e) { next(e); }
  });

  app.get("/api/folders/:folderId/share-links", isAuthenticated, async (req, res, next) => {
    try {
      const folderId = parseInt(req.params.folderId);
      if (!(await canManageFolderShares(req, folderId))) return res.status(403).json({ message: "Forbidden" });
      const links = await storage.listShareLinksForScope("folder", folderId);
      res.json(links.map(sanitizeLink));
    } catch (e) { next(e); }
  });

  app.patch("/api/share-links/:id", isAuthenticated, async (req, res, next) => {
    try {
      const link = await storage.getShareLink(req.params.id);
      if (!link) return res.status(404).json({ message: "Not found" });
      if (!(await canManageLinkNow(req, link))) return res.status(403).json({ message: "Forbidden" });

      const parsed = updateShareLinkSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid update", errors: parsed.error.errors });

      const update: any = {};
      if (parsed.data.name !== undefined) update.name = parsed.data.name;
      if (parsed.data.allowDownloads !== undefined) update.allowDownloads = parsed.data.allowDownloads;
      if (parsed.data.allowComments !== undefined) update.allowComments = parsed.data.allowComments;
      if (parsed.data.allowUploads !== undefined) update.allowUploads = parsed.data.allowUploads;
      if (parsed.data.requireEmail !== undefined) update.requireEmail = parsed.data.requireEmail;
      if (parsed.data.watermarkEnabled !== undefined) update.watermarkEnabled = parsed.data.watermarkEnabled;
      if (parsed.data.watermarkText !== undefined) update.watermarkText = parsed.data.watermarkText;
      if (parsed.data.expiresAt !== undefined) update.expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt as any) : null;
      if (parsed.data.clearPassword) update.passwordHash = null;
      else if (parsed.data.password) update.passwordHash = await hashPassword(parsed.data.password);

      const updated = await storage.updateShareLink(link.id, update);
      res.json(updated ? sanitizeLink(updated) : null);
    } catch (e) { next(e); }
  });

  app.delete("/api/share-links/:id", isAuthenticated, async (req, res, next) => {
    try {
      const link = await storage.getShareLink(req.params.id);
      if (!link) return res.status(404).json({ message: "Not found" });
      if (!(await canManageLinkNow(req, link))) return res.status(403).json({ message: "Forbidden" });
      await storage.revokeShareLink(link.id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ===== public endpoints =====

  app.get("/api/public/share/:token/info", async (req, res, next) => {
    try {
      const link = await storage.getShareLinkByToken(req.params.token);
      if (!link || link.revokedAt) return res.status(404).json({ message: "Not found" });
      const expired = isExpired(link);
      let scopeName = "";
      // For file shares, also expose the parent project id so an authenticated
      // viewer can be redirected to /projects/:projectId?media=:fileId.
      let fileProjectId: number | null = null;
      // Folder the file lives in (so the signed-in viewer lands on that
      // folder inside the project, not the project root). NULL means the
      // file is at the project root.
      let fileFolderId: number | null = null;
      // For folder shares, expose the owning project id when this is a
      // PROJECT SUBFOLDER (folders.projectId != null). The client uses it
      // to redirect signed-in viewers to /projects/:fid?folder=:folderId
      // instead of leaving them stranded on the public share page.
      // NULL means a sidebar/global folder (no parent project).
      let folderProjectId: number | null = null;
      if (!expired) {
        if (link.scopeType === "project") {
          const p = await storage.getProject(link.scopeId);
          scopeName = p?.name ?? "";
        } else if (link.scopeType === "folder") {
          const f = await storage.getFolder(link.scopeId);
          scopeName = f?.name ?? "";
          folderProjectId = f?.projectId ?? null;
        } else if (link.scopeType === "file") {
          const f = await storage.getFile(link.scopeId);
          scopeName = f?.filename ?? "";
          fileProjectId = f?.projectId ?? null;
          fileFolderId = f?.folderId ?? null;
        }
      }
      res.json({
        scopeType: link.scopeType,
        scopeId: link.scopeId,
        fileProjectId,
        fileFolderId,
        folderProjectId,
        name: link.name,
        scopeName,
        expired,
        requiresPassword: !!link.passwordHash,
        requiresEmail: link.requireEmail,
        allowDownloads: link.allowDownloads,
        allowComments: link.allowComments,
        allowUploads: link.allowUploads && link.scopeType === "project",
        watermarkEnabled: link.watermarkEnabled,
        watermarkText: link.watermarkText,
        watermarkLabel: buildWatermarkLabel(req, link),
        unlocked: !expired && isUnlocked(req, link),
        viewerAuthenticated: !!(req.isAuthenticated && req.isAuthenticated() && req.user),
      });
    } catch (e) { next(e); }
  });

  app.post("/api/public/share/:token/unlock", async (req, res, next) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const throttleKey = `${ip}:${req.params.token}`;
      if (!takeUnlockAttempt(throttleKey)) {
        return res.status(429).json({ message: "Too many attempts, please wait a minute and try again" });
      }
      const link = await storage.getShareLinkByToken(req.params.token);
      if (!isUsable(link)) return res.status(404).json({ message: "Not found or expired" });

      const { password, email } = req.body ?? {};
      if (link.passwordHash) {
        if (typeof password !== "string" || !password) return res.status(400).json({ message: "Password required" });
        const ok = await comparePasswords(password, link.passwordHash);
        if (!ok) return res.status(401).json({ message: "Incorrect password" });
      }
      if (link.requireEmail) {
        if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return res.status(400).json({ message: "Valid email required" });
        }
      }
      if (!req.session.shareUnlocks) req.session.shareUnlocks = {};
      req.session.shareUnlocks[link.token] = {
        email: email || undefined,
        unlockedAt: Date.now(),
        pwSig: pwSigOf(link),
        reqEmail: !!link.requireEmail,
      };
      req.session.save(() => res.json({ ok: true }));
    } catch (e) { next(e); }
  });

  app.get("/api/public/share/:token/manifest", async (req, res, next) => {
    try {
      const gated = await loadGatedLink(req, res);
      if (!gated) return;
      const { link } = gated;
      const files = await gatherScopeFiles(link);
      // Group by project for nicer rendering
      const byProject = new Map<number, { id: number; name: string; files: any[] }>();
      for (const f of files) {
        if (!byProject.has(f.projectId)) {
          const p = await storage.getProject(f.projectId);
          byProject.set(f.projectId, { id: f.projectId, name: p?.name ?? "Project", files: [] });
        }
        byProject.get(f.projectId)!.files.push({
          id: f.id,
          filename: f.filename,
          fileType: f.fileType,
          fileSize: f.fileSize,
          version: f.version,
          createdAt: f.createdAt,
          isAvailable: f.isAvailable !== false,
        });
      }
      res.json({
        scopeType: link.scopeType,
        name: link.name,
        allowDownloads: link.allowDownloads,
        allowComments: link.allowComments,
        allowUploads: link.allowUploads && link.scopeType === "project",
        watermarkEnabled: link.watermarkEnabled,
        watermarkText: link.watermarkText,
        watermarkLabel: buildWatermarkLabel(req, link),
        projects: Array.from(byProject.values()),
      });
    } catch (e) { next(e); }
  });

  app.get("/api/public/share/:token/files/:fileId/metadata", async (req, res, next) => {
    try {
      const gated = await loadGatedLink(req, res); if (!gated) return;
      const file = await fileBelongsToScope(gated.link, parseInt(req.params.fileId));
      if (!file) return res.status(404).json({ message: "Not found" });
      res.json({
        id: file.id, filename: file.filename, fileType: file.fileType, fileSize: file.fileSize,
        version: file.version, isAvailable: file.isAvailable !== false, createdAt: file.createdAt,
      });
    } catch (e) { next(e); }
  });

  app.get("/api/public/share/:token/files/:fileId/processing", async (req, res, next) => {
    try {
      const gated = await loadGatedLink(req, res); if (!gated) return;
      const file = await fileBelongsToScope(gated.link, parseInt(req.params.fileId));
      if (!file) return res.status(404).json({ message: "Not found" });
      const processing = await storage.getVideoProcessing(file.id);
      if (!processing) return res.status(404).json({ message: "No processing data" });
      res.json(processing);
    } catch (e) { next(e); }
  });

  app.get("/api/public/share/:token/files/:fileId/scrub", async (req, res, next) => {
    try {
      const gated = await loadGatedLink(req, res); if (!gated) return;
      const file = await fileBelongsToScope(gated.link, parseInt(req.params.fileId));
      if (!file) return res.status(404).send("Not found");
      const processing = await storage.getVideoProcessing(file.id);
      if (!processing?.scrubVersionPath || !existsSync(processing.scrubVersionPath)) return res.status(404).send("Scrub not available");
      await streamRanged(req, res, processing.scrubVersionPath, "video/mp4");
    } catch (e) { next(e); }
  });

  // Hover-scrub sprite + metadata for public/share pages. Same payload as
  // the authenticated /api/files/:id/sprite{,-metadata} routes; gated by
  // the share token instead of session auth so reviewers get the same
  // hover-thumbnail UX as logged-in users.
  app.get("/api/public/share/:token/files/:fileId/sprite", async (req, res, next) => {
    try {
      const gated = await loadGatedLink(req, res); if (!gated) return;
      const file = await fileBelongsToScope(gated.link, parseInt(req.params.fileId));
      if (!file) return res.status(404).send("Not found");
      const processing = await storage.getVideoProcessing(file.id);
      if (!processing?.thumbnailSpritePath || !existsSync(processing.thumbnailSpritePath)) {
        return res.status(404).send("Sprite not available");
      }
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.sendFile(path.resolve(processing.thumbnailSpritePath));
    } catch (e) { next(e); }
  });

  app.get("/api/public/share/:token/files/:fileId/sprite-metadata", async (req, res, next) => {
    try {
      const gated = await loadGatedLink(req, res); if (!gated) return;
      const file = await fileBelongsToScope(gated.link, parseInt(req.params.fileId));
      if (!file) return res.status(404).json({ message: "Not found" });
      const processing = await storage.getVideoProcessing(file.id);
      if (!processing?.spriteMetadata) return res.status(404).json({ message: "Sprite metadata not available" });
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.json(processing.spriteMetadata);
    } catch (e) { next(e); }
  });

  app.get("/api/public/share/:token/files/:fileId/qualities/:quality", async (req, res, next) => {
    try {
      const gated = await loadGatedLink(req, res); if (!gated) return;
      const file = await fileBelongsToScope(gated.link, parseInt(req.params.fileId));
      if (!file) return res.status(404).send("Not found");
      const processing = await storage.getVideoProcessing(file.id);
      const q = processing?.qualities?.find((qq: any) => qq.resolution === req.params.quality);
      if (!q || !existsSync(q.path)) return res.status(404).send("Quality not found");
      await streamRanged(req, res, q.path, "video/mp4");
    } catch (e) { next(e); }
  });

  app.get("/api/public/share/:token/files/:fileId/content", async (req, res, next) => {
    try {
      const gated = await loadGatedLink(req, res); if (!gated) return;
      const file = await fileBelongsToScope(gated.link, parseInt(req.params.fileId));
      if (!file) return res.status(404).send("Not found");
      if (file.isAvailable === false || !(await fileSystem.fileExists(file.filePath))) return res.status(404).send("Not available");
      await streamRanged(req, res, file.filePath, contentTypeFor(file.filename, file.fileType));
    } catch (e) { next(e); }
  });

  app.get("/api/public/share/:token/files/:fileId/download", async (req, res, next) => {
    try {
      const gated = await loadGatedLink(req, res); if (!gated) return;
      if (!gated.link.allowDownloads) return res.status(403).send("Downloads disabled for this link");
      const file = await fileBelongsToScope(gated.link, parseInt(req.params.fileId));
      if (!file) return res.status(404).send("Not found");
      if (file.isAvailable === false || !(await fileSystem.fileExists(file.filePath))) return res.status(404).send("Not available");
      await streamRanged(req, res, file.filePath, contentTypeFor(file.filename, file.fileType), file.filename);
    } catch (e) { next(e); }
  });

  // Marker exports (FCP XML / EDL / CSV). These contain only timestamped
  // comment text — same data already exposed in the share's side panel —
  // so they are NOT gated behind allowDownloads. Reviewers on a share link
  // need them to round-trip notes into Premiere/Resolve regardless of
  // whether source-media downloads are enabled.
  app.get("/api/public/share/:token/files/:fileId/export/:format", async (req, res, next) => {
    try {
      const gated = await loadGatedLink(req, res); if (!gated) return;
      const format = req.params.format;
      if (!["xml", "edl", "csv"].includes(format)) {
        return res.status(400).json({ message: "Unsupported format. Use xml, edl, or csv." });
      }
      const file = await fileBelongsToScope(gated.link, parseInt(req.params.fileId));
      if (!file) return res.status(404).json({ message: "File not found" });

      const comments = await storage.getUnifiedCommentsByFileV2(file.id);
      const topLevel = comments
        .filter(c => !c.parentId)
        .map(c => ({
          content: c.content,
          authorName: c.authorName,
          timestamp: c.timestamp,
          createdAt: c.createdAt,
        }));

      const rawDuration = parseFloat(req.query.duration as string);
      const duration = isNaN(rawDuration) || rawDuration < 0 ? 60 : Math.min(rawDuration, 86400);
      const rawFps = parseInt(req.query.fps as string);
      const fps = isNaN(rawFps) || rawFps < 1 || rawFps > 120 ? 30 : rawFps;
      const baseName = file.filename.replace(/\.[^.]+$/, "");

      if (format === "xml") {
        const xml = generateFCPXML(file.filename, duration, topLevel, fps);
        res.setHeader("Content-Type", "application/xml");
        res.setHeader("Content-Disposition", `attachment; filename="${baseName}_markers.xml"`);
        return res.send(xml);
      } else if (format === "edl") {
        const edl = generateEDL(file.filename, duration, topLevel, fps);
        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Content-Disposition", `attachment; filename="${baseName}_markers.edl"`);
        return res.send(edl);
      } else {
        const csv = generateCSV(topLevel, fps);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${baseName}_markers.csv"`);
        return res.send(csv);
      }
    } catch (e) { next(e); }
  });

  app.get("/api/public/share/:token/files/:fileId/transcript", async (req, res, next) => {
    try {
      const gated = await loadGatedLink(req, res); if (!gated) return;
      const file = await fileBelongsToScope(gated.link, parseInt(req.params.fileId));
      if (!file) return res.status(404).json({ message: "Not found" });
      const transcript = await storage.getTranscript(file.id);
      if (!transcript) return res.status(404).json({ message: "No transcript yet" });
      res.json(transcript);
    } catch (e) { next(e); }
  });

  app.get("/api/public/share/:token/files/:fileId/transcript.vtt", async (req, res, next) => {
    try {
      const gated = await loadGatedLink(req, res); if (!gated) return;
      if (!gated.link.allowDownloads) return res.status(403).send("Downloads disabled for this link");
      const file = await fileBelongsToScope(gated.link, parseInt(req.params.fileId));
      if (!file) return res.status(404).send("Not found");
      const transcript = await storage.getTranscript(file.id);
      if (!transcript || !transcript.segments?.length) return res.status(404).send("No transcript available");
      res.setHeader("Content-Type", "text/vtt");
      res.send(segmentsToVtt(transcript.segments));
    } catch (e) { next(e); }
  });

  app.get("/api/public/share/:token/files/:fileId/transcript.srt", async (req, res, next) => {
    try {
      const gated = await loadGatedLink(req, res); if (!gated) return;
      if (!gated.link.allowDownloads) return res.status(403).send("Downloads disabled for this link");
      const file = await fileBelongsToScope(gated.link, parseInt(req.params.fileId));
      if (!file) return res.status(404).send("Not found");
      const transcript = await storage.getTranscript(file.id);
      if (!transcript || !transcript.segments?.length) return res.status(404).send("No transcript available");
      res.setHeader("Content-Type", "application/x-subrip");
      res.setHeader("Content-Disposition", `attachment; filename="transcript-${file.id}.srt"`);
      res.send(segmentsToSrt(transcript.segments));
    } catch (e) { next(e); }
  });

  app.get("/api/public/share/:token/files/:fileId/transcript.txt", async (req, res, next) => {
    try {
      const gated = await loadGatedLink(req, res); if (!gated) return;
      if (!gated.link.allowDownloads) return res.status(403).send("Downloads disabled for this link");
      const file = await fileBelongsToScope(gated.link, parseInt(req.params.fileId));
      if (!file) return res.status(404).send("Not found");
      const transcript = await storage.getTranscript(file.id);
      if (!transcript) return res.status(404).send("No transcript available");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="transcript-${file.id}.txt"`);
      res.send(transcript.text || (transcript.segments || []).map((s: any) => s.text).join("\n"));
    } catch (e) { next(e); }
  });

  app.get("/api/public/share/:token/files/:fileId/comments", async (req, res, next) => {
    try {
      const gated = await loadGatedLink(req, res); if (!gated) return;
      const file = await fileBelongsToScope(gated.link, parseInt(req.params.fileId));
      if (!file) return res.status(404).json({ message: "Not found" });
      const all = await storage.getUnifiedCommentsByFileV2(file.id);

      // Show every comment on the file (matches /api/share/:token/comments
      // for single-file shares — reviewers expect to see the full thread,
      // not just other reviewers' public posts). Strip creatorToken.
      const visible = all.map((c: any) => {
        const { creatorToken, ...rest } = c;
        return rest;
      });

      // Enrich with author names so registered users don't appear as "Anonymous"
      const userIds = Array.from(new Set(visible.map((c: any) => c.userId).filter((x: any) => x != null)));
      const userMap = new Map<number, string>();
      await Promise.all(userIds.map(async (uid) => {
        try {
          const u = await storage.getUser(uid as number);
          if (u) userMap.set(u.id, u.name || u.username || "User");
        } catch {}
      }));

      const enriched = visible.map((c: any) => ({
        ...c,
        user: c.userId && userMap.has(c.userId) ? { name: userMap.get(c.userId) } : null,
      }));

      res.json(enriched);
    } catch (e) { next(e); }
  });

  // Simple per-IP rate limit
  const rate = new Map<string, { count: number; resetAt: number }>();
  function takeRate(ip: string): boolean {
    const now = Date.now();
    const cur = rate.get(ip);
    if (!cur || cur.resetAt < now) { rate.set(ip, { count: 1, resetAt: now + 60_000 }); return true; }
    if (cur.count >= 20) return false;
    cur.count++; return true;
  }

  // ===== reviewer uploads (project scope only, when allowUploads=true) =====
  if (deps) {
    // Preflight: gate the link BEFORE multer touches the wire so an attacker
    // can't fill our disk by streaming garbage to invalid/locked tokens.
    const uploadPreflight = async (req: Request, res: Response, next: NextFunction) => {
      try {
        const gated = await loadGatedLink(req, res); if (!gated) return;
        const link = gated.link;
        if (!link.allowUploads) return res.status(403).json({ message: "Uploads disabled" });
        if (link.scopeType !== "project") return res.status(403).json({ message: "Uploads only allowed on project shares" });
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        if (!takeRate(ip)) return res.status(429).json({ message: "Too many uploads, slow down" });
        (req as any)._shareUploadCtx = { link, ip };
        next();
      } catch (e) { next(e); }
    };

    // Best-effort cleanup of multer's temp file on any non-2xx outcome so a
    // late failure (DB error, etc) can't leave orphans on disk.
    const cleanupOnFailure = (req: Request, res: Response) => {
      const f = (req as any).file as Express.Multer.File | undefined;
      if (!f?.path) return;
      const tryUnlink = () => {
        if (res.statusCode >= 200 && res.statusCode < 300) return;
        fsPromises.unlink(f.path).catch(() => {});
      };
      res.on("finish", tryUnlink);
      res.on("close", tryUnlink);
    };

    app.post(
      "/api/public/share/:token/upload",
      uploadPreflight,
      deps.uploadSingle,
      deps.handleMulterErrors,
      async (req: Request, res: Response, next: NextFunction) => {
        cleanupOnFailure(req, res);
        try {
          const ctx = (req as any)._shareUploadCtx as { link: ShareLink; ip: string } | undefined;
          if (!ctx) return res.status(500).json({ message: "Upload context missing" });
          const { link, ip } = ctx;
          const file = (req as any).file as Express.Multer.File | undefined;
          if (!file) return res.status(400).json({ message: "No file uploaded" });

          const projectId = link.scopeId;
          const customFilename = (req.body && (req.body.customFilename as string)) || "";
          const filename = customFilename || file.originalname;

          let fileType = "other";
          if (file.mimetype.startsWith("video/")) fileType = "video";
          else if (file.mimetype.startsWith("audio/")) fileType = "audio";
          else if (file.mimetype.startsWith("image/")) fileType = "image";

          const existing = await storage.getFilesByProject(projectId);
          const similar = existing.filter(f => f.filename === filename);
          const version = similar.length > 0 ? Math.max(...similar.map(f => f.version)) + 1 : 1;
          if (version > 1) {
            await Promise.all(similar.map(f => storage.updateFile(f.id, { isLatestVersion: false })));
          }

          const created = await storage.createFile({
            filename,
            fileType,
            fileSize: file.size,
            filePath: file.path,
            projectId,
            uploadedById: link.createdById,
            version,
            isLatestVersion: true,
          });

          const sessionEmail = (req as any).session?.shareUnlocks?.[link.token]?.email ?? null;
          const reviewerEmail = ((req.body && (req.body.reviewerEmail as string)) || sessionEmail || null) || null;

          res.status(201).json({ id: created.id, filename: created.filename, version: created.version, fileType: created.fileType, fileSize: created.fileSize });

          try {
            await storage.logActivity({
              action: "upload",
              entityType: "file",
              entityId: created.id,
              userId: link.createdById,
              metadata: {
                projectId,
                filename: created.filename,
                version: created.version,
                source: "share_link",
                shareLinkId: link.id,
                reviewerEmail,
                reviewerIp: ip,
              },
            });
            await deps.processUploadedFile(created, { reviewerEmail, reviewerIp: ip, linkId: link.id });
          } catch (err) {
            console.error(`[share-links] post-upload pipeline failed for file ${created.id}:`, err);
          }
        } catch (e) { next(e); }
      },
    );
  }

  app.post("/api/public/share/:token/files/:fileId/comments", async (req, res, next) => {
    try {
      const gated = await loadGatedLink(req, res); if (!gated) return;
      if (!gated.link.allowComments) return res.status(403).json({ message: "Comments disabled" });
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      if (!takeRate(ip)) return res.status(429).json({ message: "Too many comments, slow down" });
      const file = await fileBelongsToScope(gated.link, parseInt(req.params.fileId));
      if (!file) return res.status(404).json({ message: "Not found" });

      const sessionEmail = req.session?.shareUnlocks?.[gated.link.token]?.email;
      const email = req.body.authorEmail || req.body.email || sessionEmail || undefined;
      const payload: Record<string, unknown> = {
        content: req.body.content,
        fileId: file.id,
        isPublic: true,
        authorName: req.body.displayName || req.body.authorName || "Anonymous",
      };
      if (email) payload.authorEmail = email;
      if (req.body.timestamp != null) payload.timestamp = req.body.timestamp;
      if (req.body.inPoint != null) payload.inPoint = req.body.inPoint;
      if (req.body.outPoint != null) payload.outPoint = req.body.outPoint;
      if (req.body.parentId) payload.parentId = req.body.parentId;
      if (req.body.annotations) {
        payload.annotations =
          typeof req.body.annotations === "string"
            ? req.body.annotations
            : JSON.stringify(req.body.annotations);
      }
      const parsed = insertCommentsUnifiedSchema.safeParse(payload);
      if (!parsed.success) {
        console.warn("[share-links] invalid public comment", parsed.error.errors);
        return res.status(400).json({ message: "Invalid comment", errors: parsed.error.errors });
      }

      const creatorToken = crypto.randomBytes(32).toString("hex");
      const comment = await storage.createUnifiedComment({ ...parsed.data, creatorToken } as any);
      res.status(201).json({ ...comment, creatorToken });
    } catch (e) { next(e); }
  });
}

function sanitizeLink(link: ShareLink) {
  const { passwordHash, ...rest } = link;
  return { ...rest, hasPassword: !!passwordHash };
}
