import express from "express";
import path from "path";
import fs from "fs";
import { setupAuth } from "./auth.js";
import { registerRoutes, resumeStuckVideoProcessing } from "./routes.js";
import { resumePendingSummarizations } from "./summarization.js";
import { resumePendingChapters } from "./chapters.js";
import { logBackend as logLLMBackend } from "./llm-client.js";
import { config } from "./utils/config.js";
import { dbReady } from "./db.js";

const app = express();

// Middleware
app.use(express.json({ limit: '51200mb' }));
app.use(express.urlencoded({ extended: true, limit: '51200mb' }));

// Setup authentication
setupAuth(app);

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
  // Start listening on the configured port
  server.listen(config.port, '0.0.0.0', () => {
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