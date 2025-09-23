import express from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { setupAuth } from "./auth.js";
import { createRoutes } from "./routes.js";
import { config } from "./utils/config.js";

const app = express();
const server = createServer(app);

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Setup authentication
setupAuth(app);

// API routes
app.use('/api', createRoutes());

// Serve static files from the built frontend
const staticPath = path.resolve(import.meta.dirname, "public");

if (fs.existsSync(staticPath)) {
  console.log("✅ Serving static files from:", staticPath);
  app.use(express.static(staticPath));
  
  // Fallback to index.html for SPA routing
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });
} else {
  console.error("❌ Static files directory not found:", staticPath);
  app.get('*', (_req, res) => {
    res.status(500).send('Application not properly built');
  });
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const port = config.port;
server.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Production server running on port ${port}`);
  console.log(`📁 Static files served from: ${staticPath}`);
});