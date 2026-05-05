import type { Express, Request, Response, NextFunction } from "express";
import * as crypto from "crypto";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { storage } from "./storage";
import * as fileSystem from "./utils/filesystem";
import { hashPassword, comparePasswords } from "./auth";
import { insertShareLinkSchema, updateShareLinkSchema, insertCommentsUnifiedSchema } from "@shared/schema";
import type { ShareLink, File as DbFile } from "@shared/schema";
import { segmentsToVtt, segmentsToSrt } from "./transcription";

declare module "express-session" {
  interface SessionData {
    shareUnlocks?: Record<string, { email?: string; unlockedAt: number; pwSig?: string | null; reqEmail?: boolean }>;
  }
}

// ---------- helpers ----------

// Generate a short, URL-safe share token. 12 random bytes = 16 base64url chars
// (96 bits of entropy) — keeps URLs roughly half their old length while
// retaining strong brute-force resistance for bearer share links. The pre-
// check is a UX guard; the real correctness comes from catching the unique-
// index violation at insert time and retrying (see createForScope).
async function generateShortShareToken(): Promise<string> {
  const candidate = crypto.randomBytes(12).toString("base64url");
  const existing = await storage.getShareLinkByToken(candidate);
  if (!existing) return candidate;
  return crypto.randomBytes(12).toString("base64url");
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
  if (folder.isGlobal) return false; // only admins manage global folder shares
  return folder.createdById === req.user.id;
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

export function registerShareLinkRoutes(
  app: Express,
  isAuthenticated: (req: Request, res: Response, next: NextFunction) => void,
) {
  // ===== management endpoints =====

  const createForScope = async (req: Request, res: Response, scopeType: "project" | "folder", scopeId: number) => {
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
      if (!expired) {
        if (link.scopeType === "project") {
          const p = await storage.getProject(link.scopeId);
          scopeName = p?.name ?? "";
        } else if (link.scopeType === "folder") {
          const f = await storage.getFolder(link.scopeId);
          scopeName = f?.name ?? "";
        } else if (link.scopeType === "file") {
          const f = await storage.getFile(link.scopeId);
          scopeName = f?.filename ?? "";
          fileProjectId = f?.projectId ?? null;
        }
      }
      res.json({
        scopeType: link.scopeType,
        scopeId: link.scopeId,
        fileProjectId,
        name: link.name,
        scopeName,
        expired,
        requiresPassword: !!link.passwordHash,
        requiresEmail: link.requireEmail,
        allowDownloads: link.allowDownloads,
        allowComments: link.allowComments,
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

      // Public reviewers may only see public comments. Strip creatorToken.
      const visible = all
        .filter((c: any) => c.isPublic === true)
        .map((c: any) => { const { creatorToken, ...rest } = c; return rest; });

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
