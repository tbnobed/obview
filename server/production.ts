import express, { type Request, type Response, type NextFunction } from "express";
import path from "path";
import fs from "fs";
import { registerRoutes, resumeStuckVideoProcessing } from "./routes.js";
import { resumePendingSummarizations } from "./summarization.js";
import { resumePendingChapters } from "./chapters.js";
import { logBackend as logLLMBackend } from "./llm-client.js";
import { config } from "./utils/config.js";
import { dbReady } from "./db.js";

// Guard against the "bind-mount over an unmounted data disk" footgun.
// If the persistent uploads disk is NOT mounted at the host uploads path when
// the container starts, Docker bind-mounts the empty fallback directory on the
// root disk. Uploads then land in ephemeral storage that is silently wiped on
// the next `docker compose up -d` recreate (this is how a freshly uploaded file
// was lost with only a dangling DB row left behind, and how root once filled to
// 698GB). When UPLOADS_VOLUME_ID is set we refuse to start unless a matching
// sentinel file is present in the uploads dir — the root-disk fallback never has
// it, so a wrong/absent mount crash-loops loudly instead of eating data.
// One-time setup on the host (with the real disk mounted):
//   echo "<id>" > /srv/obviu/uploads/.obviu-uploads-volume
// then set UPLOADS_VOLUME_ID=<id> in the app environment.
function assertUploadsVolumeMounted() {
  const expected = (process.env.UPLOADS_VOLUME_ID || "").trim();
  if (!expected) return; // opt-in: unset = legacy behavior, no check
  const uploadsDir = process.env.UPLOAD_DIR || "/app/uploads";
  const sentinel = path.join(uploadsDir, ".obviu-uploads-volume");
  let actual = "";
  try {
    actual = fs.readFileSync(sentinel, "utf8").trim();
  } catch {
    /* sentinel missing → treated as mismatch below */
  }
  if (actual !== expected) {
    console.error(
      `❌ FATAL: uploads volume sentinel mismatch at ${sentinel} ` +
        `(expected "${expected}", got "${actual || "<missing>"}"). ` +
        `The persistent uploads disk is not mounted — refusing to start to ` +
        `prevent silent data loss. Verify the data disk is mounted at the host ` +
        `uploads path and that ${sentinel} contains "${expected}".`,
    );
    process.exit(1);
  }
  console.log(`✅ Uploads volume verified via sentinel ("${expected}").`);
}

assertUploadsVolumeMounted();

const app = express();

// Middleware
app.use(express.json({ limit: '51200mb' }));
app.use(express.urlencoded({ extended: true, limit: '51200mb' }));

// Increase the per-request timeout for very large (multi-GB) file uploads.
// Mirrors server/index.ts — without this Node's default request timeout
// silently aborts long uploads. Server-level timeouts are tuned below in
// the listen() callback.
app.use((_req, res, next) => {
  res.setTimeout(3600000); // 1 hour
  next();
});

// NOTE: do NOT call setupAuth(app) here. registerRoutes() already calls it
// (server/routes.ts), and dev (server/index.ts) relies on that single call.
// Calling it here too stacked TWO express-session + passport middlewares on
// every request in prod, which broke the login cookie and forced users to
// sign in twice. Auth is set up inside registerRoutes() below.

// Serve static files from the built frontend
const staticPath = path.resolve(import.meta.dirname, "public");

if (fs.existsSync(staticPath)) {
  console.log("✅ Serving static files from:", staticPath);
  app.use(express.static(staticPath));
  
  // Fallback to index.html for SPA routing
  app.get('*', (_req, res, next) => {
    // Skip API routes and public file sharing routes
    if (_req.path.startsWith('/api/') || _req.path.startsWith('/public/')) {
      return next();
    }
    res.sendFile(path.join(staticPath, 'index.html'));
  });
} else {
  console.error("❌ Static files directory not found:", staticPath);
  app.get('*', (_req, res, next) => {
    if (_req.path.startsWith('/api/') || _req.path.startsWith('/public/')) {
      return next();
    }
    res.status(500).send('Application not properly built');
  });
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Register all routes and start the server
registerRoutes(app).then(server => {
  // Global error handler (mirrors server/index.ts). Registered after routes
  // so it catches errors thrown from any route handler.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    console.error("[error]", err);
  });

  // Start listening on the configured port
  server.listen(config.port, '0.0.0.0', () => {
    // Tune HTTP server timeouts for very large uploads (multi-GB media files).
    // Node 18+ defaults requestTimeout to 5 min and headersTimeout to 60s,
    // both of which silently abort long uploads regardless of any reverse-proxy
    // (Nginx) timeouts in front. keepAliveTimeout must exceed the proxy's
    // keep-alive (Nginx default 75s) to avoid 502 races. Mirrors index.ts.
    server.requestTimeout = 0;          // disable hard request cap; rely on per-request res.setTimeout + Nginx
    server.headersTimeout = 3600_000;   // 1h ceiling for receiving headers
    server.keepAliveTimeout = 120_000;  // > Nginx 75s keepalive
    server.timeout = 3600_000;          // 1h socket inactivity cap
    console.log(`🚀 Production server running on port ${config.port}`);
    console.log(`📁 Static files served from: ${staticPath}`);
    logLLMBackend();
    // Wait for the lazy DB connection to finish initializing, THEN resume any
    // jobs that were interrupted by the previous shutdown and recover videos
    // that silently failed quality encoding before this fix landed.
    dbReady.then(() => {
      resumeStuckVideoProcessing().catch((err) =>
        console.error("[Startup] Could not resume video processing:", err)
      );
      resumePendingSummarizations().catch((err) =>
        console.error("[Startup] Could not resume summarizations:", err)
      );
      resumePendingChapters().catch((err) =>
        console.error("[Startup] Could not resume chapters:", err)
      );
    });

    // -------------------------------------------------------------------
    // Trash auto-purge loop. Runs hourly. Hard-deletes any soft-deleted
    // files older than FILE_TRASH_RETENTION_DAYS (default 7) by unlinking
    // disk artifacts and removing the DB row. This is the ONLY automatic
    // hard-delete path; soft-deleted projects/folders still require a
    // manual admin purge from /admin/trash.
    //
    // NOTE: this MUST stay mirrored with the identical loop in
    // server/index.ts. Production runs THIS file (dist/production.js via the
    // Dockerfile CMD), not index.ts — a sweep that lives only in index.ts
    // never executes in prod and trash never purges.
    // -------------------------------------------------------------------
    const retentionDays = Math.max(1, parseInt(process.env.FILE_TRASH_RETENTION_DAYS || "7", 10));
    const sweepIntervalMs = 60 * 60 * 1000; // 1 hour

    // Re-entrancy guard: a large first-run backlog can take a while to unlink;
    // skip a scheduled tick if the previous sweep is still running so they
    // don't overlap and double-process.
    let sweepRunning = false;
    const sweepTrash = async () => {
      if (sweepRunning) return;
      sweepRunning = true;
      try {
        const { storage } = await import("./storage.js");
        const fileSystem = await import("./utils/filesystem.js");
        const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
        const expired = await storage.getExpiredTrashedFiles(cutoff);
        if (expired.length === 0) return;
        console.log(`[TRASH SWEEP] Purging ${expired.length} file(s) past ${retentionDays}-day retention`);
        for (const f of expired) {
          // RACE-SAFE ORDER: delete DB row first (atomic guard on
          // deletedAt IS NOT NULL); only then unlink disk so a concurrent
          // restore cannot leave the user with a live row pointing at
          // missing files.
          const ok = await storage.purgeFile(f.id);
          if (!ok) {
            console.log(`[TRASH SWEEP] Skipped file ${f.id} (restored mid-sweep)`);
            continue;
          }
          try {
            const cleanup = await fileSystem.removeFileCompletely(f.id, f.filePath);
            if (!cleanup.original) console.warn(`[TRASH SWEEP] Could not unlink ${f.filePath}`);
            if (!cleanup.processed) console.warn(`[TRASH SWEEP] Could not remove processed dir for file ${f.id}`);
          } catch (e) {
            console.error(`[TRASH SWEEP] Filesystem cleanup failed for file ${f.id}:`, e);
          }
        }
      } catch (e) {
        console.error("[TRASH SWEEP] Iteration failed:", e);
      } finally {
        sweepRunning = false;
      }
    };

    // First sweep 60s after boot so we don't slow down startup.
    setTimeout(sweepTrash, 60_000);
    setInterval(sweepTrash, sweepIntervalMs);
    console.log(`[TRASH SWEEP] Auto-purge loop scheduled every ${sweepIntervalMs / 60000} min (retention: ${retentionDays}d)`);
  });
}).catch(error => {
  console.error("Failed to start server:", error);
  process.exit(1);
});