import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
// Configure Express to handle large files (50GB limit)
app.use(express.json({ limit: '51200mb' }));
app.use(express.urlencoded({ extended: false, limit: '51200mb' }));

// Increase the HTTP request timeout for large file uploads
app.use((req, res, next) => {
  res.setTimeout(3600000); // 1 hour timeout
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    // Tune HTTP server timeouts for very large uploads (multi-GB media files).
    // Node 18+ defaults requestTimeout to 5 min and headersTimeout to 60s,
    // both of which silently abort long uploads regardless of any reverse-proxy
    // (Nginx) timeouts in front. keepAliveTimeout must exceed the proxy's
    // keep-alive (Nginx default 75s) to avoid 502 races.
    server.requestTimeout = 0;          // disable hard request cap; rely on per-request res.setTimeout + Nginx
    server.headersTimeout = 3600_000;   // 1h ceiling for receiving headers
    server.keepAliveTimeout = 120_000;  // > Nginx 75s keepalive
    server.timeout = 3600_000;          // 1h socket inactivity cap
    log(`serving on port ${port}`);
    import("./llm-client")
      .then(({ logBackend }) => logBackend())
      .catch(() => {});
    // Resume any summarization jobs interrupted by the previous shutdown.
    import("./summarization")
      .then(({ resumePendingSummarizations }) => resumePendingSummarizations())
      .catch((err) =>
        console.error("[Startup] Could not resume summarizations:", err)
      );
    import("./chapters")
      .then(({ resumePendingChapters }) => resumePendingChapters())
      .catch((err) =>
        console.error("[Startup] Could not resume chapters:", err)
      );
    // Resume any video processing jobs interrupted by the previous shutdown.
    import("./routes")
      .then(({ resumeStuckVideoProcessing }) => resumeStuckVideoProcessing())
      .catch((err) =>
        console.error("[Startup] Could not resume video processing:", err)
      );

    // -------------------------------------------------------------------
    // Trash auto-purge loop. Runs hourly. Hard-deletes any soft-deleted
    // files older than FILE_TRASH_RETENTION_DAYS (default 7) by unlinking
    // disk artifacts and removing the DB row. This is the ONLY automatic
    // hard-delete path; soft-deleted projects/folders still require a
    // manual admin purge from /admin/trash.
    // -------------------------------------------------------------------
    const retentionDays = Math.max(1, parseInt(process.env.FILE_TRASH_RETENTION_DAYS || "7", 10));
    const sweepIntervalMs = 60 * 60 * 1000; // 1 hour

    const sweepTrash = async () => {
      try {
        const { storage } = await import("./storage");
        const fileSystem = await import("./utils/filesystem");
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
      }
    };

    // First sweep 60s after boot so we don't slow down startup.
    setTimeout(sweepTrash, 60_000);
    setInterval(sweepTrash, sweepIntervalMs);
    console.log(`[TRASH SWEEP] Auto-purge loop scheduled every ${sweepIntervalMs / 60000} min (retention: ${retentionDays}d)`);
  });
})();
