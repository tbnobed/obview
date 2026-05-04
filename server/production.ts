import express from "express";
import path from "path";
import fs from "fs";
import { setupAuth } from "./auth.js";
import { registerRoutes, resumeStuckVideoProcessing } from "./routes.js";
import { resumePendingSummarizations } from "./summarization.js";
import { resumePendingChapters } from "./chapters.js";
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
  });
}).catch(error => {
  console.error("Failed to start server:", error);
  process.exit(1);
});