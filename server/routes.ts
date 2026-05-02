import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, generateToken, hashPassword } from "./auth";
import multer from "multer";
import type { Multer } from "multer"; // Import multer types
import path from "path";
import { z } from "zod";
import { File as StorageFile, videoProcessing, files as filesTable } from "@shared/schema";
import * as fileSystem from "./utils/filesystem";
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { existsSync } from 'fs';
import * as crypto from 'crypto';
import { generateFCPXML, generateEDL, generateCSV } from './utils/marker-export';
import { registerShareLinkRoutes } from "./share-links";

// Extended Request type to handle file uploads
// Using declaration merging with Express namespace
declare namespace Express {
  export interface Request {
    user?: import("@shared/schema").User;
  }
}

// Interface for file upload requests with multer file
interface FileRequest extends Request {
  file?: {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    destination: string;
    filename: string;
    path: string;
    size: number;
  };
}
import { 
  insertProjectSchema,
  insertFolderSchema,
  insertCommentSchema,
  insertPublicCommentSchema,
  insertCommentsUnifiedSchema,
  insertFileSchema,
  insertProjectUserSchema,
  insertApprovalSchema,
  users as usersTable,
  projects as projectsTable,
  folders as foldersTable,
} from "@shared/schema";
import { db } from "./db";
import { sql, inArray, eq } from "drizzle-orm";
import { VideoProcessor } from "./video-processor";
import {
  transcribeFile,
  segmentsToVtt,
  segmentsToSrt,
  isTranscriptionAvailable,
} from "./transcription";
import { collectDiagnostics } from "./diagnostics";

/**
 * Resume any video processing rows that were stuck mid-encode by a previous
 * server shutdown/crash. Without this, files appear permanently "Processing"
 * in the UI because nothing in the new process owns the job.
 */
export async function resumeStuckVideoProcessing() {
  try {
    const { eq } = await import("drizzle-orm");
    console.log("[Video Processing] Startup recovery scanning for stuck jobs...");
    const allRows = await db.select().from(videoProcessing);
    // Stuck = mid-encode when the previous process died, OR previously
    // "completed" but with zero quality renditions (silent FFmpeg failure
    // from before this fix). Both manifest as a permanent "Processing"
    // badge in the UI.
    const stuck = allRows.filter((r: any) => {
      if (r.status === "processing" || r.status === "pending") return true;
      if (r.status === "completed") {
        const qualities = Array.isArray(r.qualities) ? r.qualities : [];
        // Only treat completed-with-no-qualities as stuck for video files.
        // Audio/image rows legitimately have no qualities.
        return qualities.length === 0 && !!r.scrubVersionPath;
      }
      // Re-pick up rows that failed due to now-fixed encoder bugs:
      //  1. Old "skip sub-720p" code produced zero qualities.
      //  2. Aspect-preserving downscale of portrait/odd-aspect sources
      //     produced odd output dimensions, which libx264+yuv420p rejects
      //     with "width not divisible by 2" / FFmpeg exit code 187.
      // The native-resolution + even-rounding fixes resolve both, so a
      // single retry is safe. Generic "Quality encoding failed" without
      // these markers is NOT matched, so genuinely broken files don't
      // retry on every restart.
      if (r.status === "failed") {
        const err: string = r.errorMessage || "";
        return /no quality renditions produced|input resolution too low|width not divisible by 2|height not divisible by 2|code 187/i.test(err);
      }
      return false;
    });
    if (stuck.length === 0) return;
    console.log(
      `[Video Processing] Found ${stuck.length} interrupted job(s) — resuming`
    );
    for (const row of stuck) {
      const [file] = await db
        .select()
        .from(filesTable)
        .where(eq(filesTable.id, row.fileId));
      if (!file) {
        console.warn(
          `[Video Processing] Skipping resume for processing ${row.id}: source file ${row.fileId} missing`
        );
        await storage
          .updateVideoProcessing(row.id, {
            status: "failed",
            errorMessage: "Source file missing on resume",
          })
          .catch(() => {});
        continue;
      }
      if (!fs.existsSync(file.filePath)) {
        console.warn(
          `[Video Processing] Skipping resume for ${file.filename}: file not on disk at ${file.filePath}`
        );
        await storage
          .updateVideoProcessing(row.id, {
            status: "failed",
            errorMessage: `Original file missing on disk: ${file.filePath}`,
          })
          .catch(() => {});
        continue;
      }
      console.log(
        `[Video Processing] Resuming processing for ${file.filename} (id ${file.id})`
      );
      // Fire-and-forget — same pattern as the original upload handler.
      processVideoInBackground(file, row.id).catch((err) =>
        console.error(
          `[Video Processing] Resume failed for ${file.filename}:`,
          err
        )
      );
    }
  } catch (err) {
    console.error("[Video Processing] Startup resume failed:", err);
  }
}

// Background video processing function
async function processVideoInBackground(file: any, processingId: number) {
  try {
    console.log(`[Video Processing] Starting processing for file: ${file.filename}`);
    
    // Update status to processing
    await storage.updateVideoProcessing(processingId, {
      status: "processing"
    });
    
    // Set up processing paths
    const inputPath = file.filePath;
    const outputDir = path.join(path.dirname(inputPath), 'processed', file.id.toString());
    
    // Process the video
    const result = await VideoProcessor.processVideo({
      inputPath,
      outputDir,
      filename: path.parse(file.filename).name
    });
    
    // Update processing record with results (including spriteMetadata and
    // the cached ffprobe payload so the MediaInfo dialog doesn't have to
    // re-run ffprobe every time someone opens it).
    await storage.updateVideoProcessing(processingId, {
      status: "completed",
      qualities: result.qualities,
      scrubVersionPath: result.scrubVersion,
      thumbnailSpritePath: result.thumbnailSprite,
      spriteMetadata: result.spriteMetadata, // Fix: Include sprite metadata
      mediaInfo: result.mediaInfo,
      duration: Math.round(result.duration),
      frameRate: Math.round(result.frameRate),
      processedAt: new Date()
    });
    
    console.log(`[Video Processing] Completed processing for file: ${file.filename}`);
  } catch (error) {
    console.error(`[Video Processing] Error processing file ${file.filename}:`, error);
    
    // Update processing record with error
    await storage.updateVideoProcessing(processingId, {
      status: "failed",
      errorMessage: error.message || "Unknown processing error"
    }).catch(updateError => {
      console.error("[Video Processing] Failed to update error status:", updateError);
    });
  }
}

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
// Create uploads directory if it doesn't exist
// Don't use fs.mkdir directly to avoid ES module issues
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (error) {
  console.error(`Error creating uploads directory: ${error}`);
}

// Configure multer storage
const storage_config = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage_config,
  limits: {
    fileSize: 50 * 1024 * 1024 * 1024, // 50GB limit
  }
});

// Custom error handling middleware for multer errors
const handleMulterErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err.code, err.message);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        message: "File too large. Maximum file size is 5GB.",
        error: err.message
      });
    }
    return res.status(400).json({ 
      message: "File upload error",
      error: err.message
    });
  }
  next(err);
};

// Middleware to check authentication
function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  console.log("Auth check - isAuthenticated:", req.isAuthenticated());
  console.log("Auth check - session:", req.session);
  console.log("Auth check - user:", req.user ? { id: req.user.id, username: req.user.username, role: req.user.role } : 'undefined');
  
  if (req.isAuthenticated() && req.user) {
    console.log("User is authenticated, proceeding");
    return next();
  }
  console.log("Authentication failed, returning 401");
  res.status(401).json({ message: "Unauthorized" });
}

// Middleware to check if user is admin
function isAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user && req.user.role === "admin") {
    return next();
  }
  res.status(403).json({ message: "Forbidden" });
}

// Middleware to check if user has access to view a project.
// Read access is granted to any authenticated user — this lets logged-in
// reviewers who receive a share link land on the full authenticated project
// view instead of the public share page. Personal dashboards (`GET /api/projects`)
// remain scoped to membership so other users' projects don't appear there.
// Edit/mutation routes use `hasProjectEditAccess`, which still enforces
// membership + editor/admin role.
async function hasProjectAccess(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }

    // Verify the project exists so we still 404 on bad IDs.
    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    next();
  } catch (error) {
    next(error);
  }
}

// Middleware to check if user has edit access to a project
async function hasProjectEditAccess(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }

    // Admin has edit access to all projects
    if (req.user.role === "admin") {
      return next();
    }

    // Check if user is a member of the project with editor role
    const projectUser = await storage.getProjectUser(projectId, req.user.id);
    if (!projectUser || (projectUser.role !== "editor" && projectUser.role !== "admin")) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    next();
  } catch (error) {
    next(error);
  }
}

// Middleware to check if user has access to a file. Read access is granted
// to any authenticated user (mirrors `hasProjectAccess`). Mutation routes
// must use `hasFileEditAccess` instead.
async function hasFileAccess(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const fileId = parseInt(req.params.id);
    if (isNaN(fileId)) {
      return res.status(400).json({ message: "Invalid file ID" });
    }

    const file = await storage.getFile(fileId);
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    next();
  } catch (error) {
    next(error);
  }
}

// Mutation-level guard for file endpoints (reprocess, transcript regenerate,
// summary regenerate, etc.). Requires the user to be an admin or an editor
// member of the file's project.
async function hasFileEditAccess(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const fileId = parseInt(req.params.id);
    if (isNaN(fileId)) {
      return res.status(400).json({ message: "Invalid file ID" });
    }

    const file = await storage.getFile(fileId);
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    if (req.user.role === "admin") {
      return next();
    }

    const projectUser = await storage.getProjectUser(file.projectId, req.user.id);
    if (!projectUser || (projectUser.role !== "editor" && projectUser.role !== "admin")) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    next();
  } catch (error) {
    next(error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint for Docker and monitoring
  app.get("/api/health", async (req, res) => {
    try {
      // Check database connectivity
      let dbStatus = "unknown";
      let dbError = null;
      try {
        await db.execute(sql`SELECT 1`);
        dbStatus = "connected";
      } catch (error) {
        dbStatus = "disconnected";
        dbError = error instanceof Error ? error.message : "Unknown error";
      }

      // Gather system info
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();

      res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || "unknown",
        environment: process.env.NODE_ENV,
        uptime: Math.floor(uptime),
        database: {
          status: dbStatus,
          error: dbError
        },
        memory: {
          rss: Math.floor(memoryUsage.rss / 1024 / 1024) + "MB",
          heapTotal: Math.floor(memoryUsage.heapTotal / 1024 / 1024) + "MB",
          heapUsed: Math.floor(memoryUsage.heapUsed / 1024 / 1024) + "MB"
        }
      });
    } catch (error) {
      console.error("Health check error:", error);
      res.status(500).json({
        status: "error",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  // Set up authentication
  setupAuth(app);
  registerShareLinkRoutes(app, isAuthenticated);

  // Admin diagnostics: read-only snapshot of the host (CPU/RAM, GPUs via
  // nvidia-smi, FFmpeg + NVENC encoders, uploads/ mount + free space, NFS/
  // RDMA detection, optional DGX Spark reachability via SPARK_HOST /
  // SPARK_DIAG_URL). Used to validate the AI-hardware setup before
  // unfreezing the GPU/transcription pipeline.
  app.get("/api/admin/diag", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const report = await collectDiagnostics();
      res.json(report);
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error: err?.message || String(err),
      });
    }
  });
  
  // Test authentication endpoint
  app.get('/api/test-auth', (req, res) => {
    console.log('Test auth endpoint called');
    console.log('Is authenticated:', req.isAuthenticated());
    console.log('Session ID:', req.sessionID);
    console.log('User:', req.user);
    
    if (req.isAuthenticated()) {
      res.json({
        authenticated: true,
        user: {
          id: req.user?.id,
          username: req.user?.username,
          name: req.user?.name,
          role: req.user?.role
        },
        sessionID: req.sessionID
      });
    } else {
      res.status(401).json({ 
        authenticated: false,
        message: 'Not authenticated',
        sessionID: req.sessionID
      });
    }
  });

  // Debug endpoint for email testing (only in development)
  if (process.env.NODE_ENV === 'development') {
    // Email configuration debug endpoint
    app.get("/api/debug/email-config", isAuthenticated, isAdmin, async (req, res) => {
      try {
        // Gather environment variables related to URL construction
        const envVars = {
          REPL_ID: process.env.REPL_ID || 'not set',
          REPL_OWNER: process.env.REPL_OWNER || 'not set',
          REPLIT_SLUG: process.env.REPLIT_SLUG || 'not set',
          APP_URL: process.env.APP_URL || 'not set',
          EMAIL_FROM: process.env.EMAIL_FROM || 'not set',
          SENDGRID_API_KEY: process.env.SENDGRID_API_KEY ? 'set (length: ' + process.env.SENDGRID_API_KEY.length + ')' : 'not set'
        };

        // Determine what URL would be used based on current environment
        let baseUrl = '';
        
        if (process.env.APP_URL) {
          baseUrl = process.env.APP_URL;
        }
        else if (process.env.REPL_ID) {
          if (process.env.REPLIT_SLUG && process.env.REPL_OWNER) {
            baseUrl = `https://${process.env.REPLIT_SLUG}.${process.env.REPL_OWNER}.repl.co`;
          }
          else if (process.env.REPLIT_SLUG) {
            baseUrl = `https://${process.env.REPLIT_SLUG}.replit.app`;
          }
          else {
            baseUrl = `https://${process.env.REPL_ID}.repl.co`;
          }
        }
        else {
          baseUrl = 'http://localhost:5000';
        }
        
        const sampleInviteUrl = `${baseUrl}/invite/sample-token-12345`;
        
        // Get logs if available
        let logs = 'Logs not available';
        try {
          const { fileURLToPath } = await import('url');
          const __filename = fileURLToPath(import.meta.url);
          const __dirname = path.dirname(__filename);
          const logDir = path.join(__dirname, 'logs');
          const logFilePath = path.join(logDir, 'sendgrid.log');
          
          if (fs.existsSync(logFilePath)) {
            // Get last 20 lines of log file
            const logContent = fs.readFileSync(logFilePath, 'utf8');
            const logLines = logContent.split('\n').filter((line: string) => line.trim());
            logs = logLines.slice(-20).join('\n');
          }
        } catch (error) {
          logs = `Error reading logs: ${error instanceof Error ? error.message : String(error)}`;
        }
        
        return res.json({
          environment: envVars,
          urlConstruction: {
            determinedBaseUrl: baseUrl,
            sampleInviteUrl: sampleInviteUrl
          },
          recentLogs: logs
        });
      } catch (error) {
        console.error("Error in debug email endpoint:", error);
        return res.status(500).json({ message: "Error retrieving email debug information" });
      }
    });
    
    // Test email sending endpoint
    app.get("/api/debug/send-test-email", async (req, res) => {
      try {
        const { sendEmail } = await import('./utils/sendgrid');
        
        const to = req.query.to as string || 'test@example.com';
        console.log(`Attempting to send test email to: ${to}`);
        
        const result = await sendEmail({
          to,
          from: req.query.from as string || 'alerts@obedtv.com',
          subject: 'Test Email from ObedTV',
          text: 'This is a test email to verify SendGrid functionality.',
          html: '<h1>Test Email</h1><p>This is a test email to verify SendGrid functionality.</p>'
        });
        
        if (result) {
          console.log(`Test email successfully sent to ${to}`);
          res.json({ success: true, message: `Test email sent successfully to ${to}` });
        } else {
          console.error(`Failed to send test email to ${to}`);
          res.status(500).json({ success: false, message: "Failed to send test email" });
        }
      } catch (error) {
        console.error('Error sending test email:', error);
        res.status(500).json({ 
          success: false, 
          message: "Error sending test email", 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    });
  }

  // ===== USER ROUTES =====
  // Get all users (admin only)
  app.get("/api/users", isAdmin, async (req, res, next) => {
    try {
      const users = await storage.getAllUsers();
      
      // Remove passwords from response
      const safeUsers = users.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      
      res.json(safeUsers);
    } catch (error) {
      next(error);
    }
  });
  
  // Get all invitations (admin only)
  app.get("/api/invitations", isAdmin, async (req, res, next) => {
    try {
      // Get all invitations (including system-wide and project-specific)
      const allInvitations = await storage.getAllInvitations();
      
      // Get creator and project details for each invitation
      const enrichedInvitations = await Promise.all(
        allInvitations.map(async (invitation) => {
          const creator = await storage.getUser(invitation.createdById);
          let project = null;
          
          if (invitation.projectId !== null) {
            project = await storage.getProject(invitation.projectId);
          }
          
          // Remove sensitive information
          let creatorInfo = null;
          if (creator) {
            const { password, ...creatorWithoutPassword } = creator;
            creatorInfo = creatorWithoutPassword;
          }
          
          return {
            ...invitation,
            creator: creatorInfo,
            project: project,
            isSystemInvite: invitation.projectId === null
          };
        })
      );
      
      // Sort by newest first
      const sortedInvitations = enrichedInvitations.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      res.json(sortedInvitations);
    } catch (error) {
      console.error("Error retrieving all invitations:", error);
      next(error);
    }
  });

  // Get user by ID
  app.get("/api/users/:userId", isAuthenticated, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId);
      
      // Only admins can get other users' details
      if (userId !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Remove password from response
      const { password, ...userWithoutPassword } = user;
      
      res.json(userWithoutPassword);
    } catch (error) {
      next(error);
    }
  });

  // Update user (admin or self)
  app.patch("/api/users/:userId", isAuthenticated, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId);
      
      // Only admins can update other users
      if (userId !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Only admins can change roles
      if (req.body.role && req.user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can change roles" });
      }
      
      let updateData;
      
      // Handle password update (allow for admins or users updating their own password)
      if (req.body.password && (req.user.role === "admin" || userId === req.user.id)) {
        // Hash the password before storing it
        const hashedPassword = await hashPassword(req.body.password);
        const { password, ...restData } = req.body;
        updateData = { ...restData, password: hashedPassword };
        
        if (req.user.role === "admin" && userId !== req.user.id) {
          console.log(`Admin (id: ${req.user.id}) updating password for user (id: ${userId})`);
        } else {
          console.log(`User (id: ${req.user.id}) updating their own password`);
        }
      } else {
        // Regular update without password change
        const { password, ...restData } = req.body;
        updateData = restData;
      }
      
      const updatedUser = await storage.updateUser(userId, updateData);

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Log role changes explicitly so the audit trail makes them
      // discoverable. Without this, investigating "did this user used
      // to be an admin?" requires guessing — exactly the dead end we
      // hit while diagnosing project 30.
      if (req.body.role && req.body.role !== user.role) {
        await storage.logActivity({
          action: "update",
          entityType: "user",
          entityId: userId,
          userId: req.user.id,
          metadata: {
            username: updatedUser.username,
            reason: "role_change",
            changes: { role: { from: user.role, to: req.body.role } },
          },
        });
      }

      // Remove password from response
      const { password: pwd, ...userWithoutPassword } = updatedUser;

      res.json(userWithoutPassword);
    } catch (error) {
      next(error);
    }
  });

  // Update user theme preference
  app.patch("/api/user/theme", isAuthenticated, async (req, res, next) => {
    try {
      const { themePreference } = req.body;
      
      // Validate theme preference
      if (!themePreference || !["light", "dark", "system"].includes(themePreference)) {
        return res.status(400).json({ 
          message: "Invalid theme preference", 
          details: "Theme preference must be 'light', 'dark', or 'system'" 
        });
      }
      
      // Update user
      const updatedUser = await storage.updateUser(req.user.id, { themePreference });
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Return user without password
      const { password, ...userWithoutPassword } = updatedUser;
      res.status(200).json(userWithoutPassword);
    } catch (error) {
      next(error);
    }
  });

  // Create user (admin only)
  app.post("/api/users", isAdmin, async (req, res, next) => {
    try {
      // Validate the input
      const { username, password, email, name, role } = req.body;
      
      if (!username || !password || !email || !name) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Check if username or email already exists
      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }

      // Create the user with hashed password
      const hashedPassword = await hashPassword(password);
      
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        email,
        name,
        role: role || "viewer", // Default role
      });

      // Remove sensitive data before returning
      const userResponse = { ...user };
      delete userResponse.password;

      // Log activity
      await storage.logActivity({
        action: "create",
        entityType: "user",
        entityId: user.id,
        userId: req.user.id,
        metadata: { createdUsername: user.username },
      });

      // Return the user without logging them in
      res.status(201).json(userResponse);
    } catch (error) {
      next(error);
    }
  });

  // Delete user (admin only)
  app.delete("/api/users/:userId", isAdmin, async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId);
      
      // Don't allow deleting yourself
      if (userId === req.user.id) {
        return res.status(400).json({ message: "You cannot delete your own account" });
      }
      
      const success = await storage.deleteUser(userId);
      
      if (!success) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  // ===== FOLDER ROUTES =====
  // Get all folders for the current user
  app.get("/api/folders", isAuthenticated, async (req, res, next) => {
    try {
      const isAdmin = req.user.role === "admin";
      let folders = isAdmin
        ? await storage.getAllFolders()
        : await storage.getFoldersByUser(req.user.id);

      // Non-admins also see all global folders (created by any admin and
      // shared with the entire workspace).
      if (!isAdmin) {
        const allFolders = await storage.getAllFolders();
        const globalFolders = allFolders.filter((f) => f.isGlobal);
        const seen = new Set(folders.map((f) => f.id));
        for (const gf of globalFolders) {
          if (!seen.has(gf.id)) folders.push(gf);
        }
      }

      // For admins, enrich each folder with the creator's username so the UI
      // can disambiguate folders that different users named the same thing
      // (e.g., multiple "Praise" folders).
      if (isAdmin && folders.length > 0) {
        const creatorIds = Array.from(
          new Set(folders.map((f) => f.createdById).filter((id): id is number => typeof id === "number"))
        );
        const creators = creatorIds.length > 0
          ? await db
              .select({ id: usersTable.id, username: usersTable.username })
              .from(usersTable)
              .where(inArray(usersTable.id, creatorIds))
          : [];
        const usernameById = new Map(creators.map((u) => [u.id, u.username]));
        const enriched = folders.map((f) => ({
          ...f,
          createdByUsername: usernameById.get(f.createdById) ?? null,
        }));
        return res.json(enriched);
      }

      res.json(folders);
    } catch (error) {
      next(error);
    }
  });

  // Shared helper: validate a proposed parentFolderId for the actor.
  // Returns { ok: true, parent } | { ok: false, status, message }.
  // Rules:
  //   - parent must exist and not be soft-deleted
  //   - parent must not be a project-scoped folder (those live inside a project)
  //   - non-admins must own the parent OR the parent must be global
  //   - if parent is global, the child is forced to be global too (so it
  //     stays visible to everyone who can see the parent)
  async function validateFolderParent(
    parentId: number,
    actor: { id: number; role: string },
  ): Promise<
    | { ok: true; parent: any; forceGlobal: boolean }
    | { ok: false; status: number; message: string }
  > {
    const parent = await storage.getFolder(parentId);
    if (!parent) return { ok: false, status: 400, message: "Parent folder not found" };
    if (parent.projectId) {
      return { ok: false, status: 400, message: "Cannot nest a top-level folder under a project subfolder" };
    }
    const isAdmin = actor.role === "admin";
    if (!isAdmin && !parent.isGlobal && parent.createdById !== actor.id) {
      return { ok: false, status: 403, message: "You don't have access to that parent folder" };
    }
    return { ok: true, parent, forceGlobal: !!parent.isGlobal };
  }

  // Create a new folder
  app.post("/api/folders", isAuthenticated, async (req, res, next) => {
    try {
      // Any authenticated user may create a global folder.
      const incoming = { ...req.body };

      // If creating a subfolder, validate the parent up-front so we can
      // (a) reject bad input cleanly and (b) inherit isGlobal from the
      // parent — the parent's audience is the source of truth, otherwise
      // a private subfolder under a global parent would be invisible to
      // everyone who can see the parent.
      if (incoming.parentFolderId != null) {
        // Coerce defensively: bare Number() turns "abc" into NaN and would
        // happily pass through to storage.getFolder, where the DB driver
        // could throw a 500 instead of returning a clean 400.
        const parentNum = Number(incoming.parentFolderId);
        if (!Number.isInteger(parentNum) || parentNum <= 0) {
          return res.status(400).json({ message: "Invalid parentFolderId" });
        }
        const check = await validateFolderParent(parentNum, req.user);
        if (!check.ok) return res.status(check.status).json({ message: check.message });
        if (check.forceGlobal) incoming.isGlobal = true;
        incoming.parentFolderId = parentNum;
      }

      // Validate input using Zod schema
      const validatedData = insertFolderSchema.parse({
        ...incoming,
        createdById: req.user.id, // Set the creator to the current user
      });

      const folder = await storage.createFolder(validatedData);
      
      // Log activity
      await storage.logActivity({
        action: "create",
        entityType: "folder",
        entityId: folder.id,
        userId: req.user.id,
        metadata: { folderName: folder.name },
      });

      res.status(201).json(folder);
    } catch (error) {
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      next(error);
    }
  });

  // Get a specific folder by ID
  app.get("/api/folders/:folderId", isAuthenticated, async (req, res, next) => {
    try {
      const folderId = parseInt(req.params.folderId);
      
      if (isNaN(folderId)) {
        return res.status(400).json({ message: "Invalid folder ID" });
      }

      const folder = await storage.getFolder(folderId);
      
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }

      // Check if user has access to this folder. Global folders are
      // visible to everyone; private folders are limited to the creator
      // and admins.
      if (
        req.user.role !== "admin" &&
        folder.createdById !== req.user.id &&
        !folder.isGlobal
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      res.json(folder);
    } catch (error) {
      next(error);
    }
  });

  // Update a folder
  app.patch("/api/folders/:folderId", isAuthenticated, async (req, res, next) => {
    try {
      const folderId = parseInt(req.params.folderId);
      
      if (isNaN(folderId)) {
        return res.status(400).json({ message: "Invalid folder ID" });
      }

      const existingFolder = await storage.getFolder(folderId);
      
      if (!existingFolder) {
        return res.status(404).json({ message: "Folder not found" });
      }

      // Admins can edit any folder. Folder owners can edit (and toggle the
      // isGlobal flag on) their own folders, whether private or global.
      const isAdmin = req.user.role === "admin";
      const isOwner = existingFolder.createdById === req.user.id;
      if (!isAdmin && !isOwner) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const incoming = { ...req.body };

      // If parentFolderId is changing, validate the new parent and walk
      // up the chain to refuse cycles. Without this guard, the UI could
      // (e.g.) drop folder A under its own descendant B and orphan an
      // entire subtree from every read query.
      if ("parentFolderId" in incoming && incoming.parentFolderId != null) {
        const newParentId = Number(incoming.parentFolderId);
        if (!Number.isInteger(newParentId) || newParentId <= 0) {
          return res.status(400).json({ message: "Invalid parentFolderId" });
        }
        if (newParentId === folderId) {
          return res.status(400).json({ message: "A folder cannot be its own parent" });
        }
        const check = await validateFolderParent(newParentId, req.user);
        if (!check.ok) return res.status(check.status).json({ message: check.message });
        // Walk up: refuse if folderId appears anywhere above newParentId.
        let cursorId: number | null = newParentId;
        const seen = new Set<number>();
        while (cursorId != null) {
          if (seen.has(cursorId)) break; // existing data already cyclic; bail
          seen.add(cursorId);
          if (cursorId === folderId) {
            return res.status(400).json({ message: "Cannot move a folder into one of its own subfolders" });
          }
          const cursor: any = await storage.getFolder(cursorId);
          cursorId = cursor?.parentFolderId ?? null;
        }
        // Inherit isGlobal from the new parent if the parent is global.
        if (check.forceGlobal) incoming.isGlobal = true;
        // Write the coerced number back so string inputs (e.g. "12")
        // pass `insertFolderSchema.partial()` which expects a number.
        incoming.parentFolderId = newParentId;
      }

      // Validate input
      const validatedData = insertFolderSchema.partial().parse(incoming);

      // Compute a real before/after diff so the activity log records WHAT
      // changed, not just that something changed. Without this the only
      // way to investigate a "where did my project go?" report is to
      // triangulate from indirect evidence — exactly the bug that
      // stranded project 30 inside folder 8 on 2026-05-01.
      const trackedFields: (keyof typeof validatedData)[] = [
        "name",
        "isGlobal",
        "parentFolderId",
        "projectId",
      ];
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const field of trackedFields) {
        if (field in validatedData) {
          const next = (validatedData as any)[field];
          const prev = (existingFolder as any)[field];
          if (prev !== next) changes[field as string] = { from: prev, to: next };
        }
      }

      // When a folder flips from global → private, any projects inside it
      // that belong to OTHER users would silently disappear from those
      // users' dashboards (the project still lives in the folder, but the
      // folder is no longer visible to them). Auto-move those projects
      // back to root so their owners don't lose them. Projects owned by
      // the actor stay where they are.
      let movedProjects: Array<{ id: number; name: string; ownerId: number }> = [];
      const isGoingPrivate =
        existingFolder.isGlobal === true &&
        validatedData.isGlobal === false;
      if (isGoingPrivate) {
        const projectsInFolder = await storage.getProjectsByFolder(folderId);
        const orphanCandidates = projectsInFolder.filter(
          (p) => p.createdById !== existingFolder.createdById && p.createdById !== req.user.id,
        );
        for (const p of orphanCandidates) {
          await storage.updateProject(p.id, { folderId: null });
          await storage.logActivity({
            action: "update",
            entityType: "project",
            entityId: p.id,
            userId: req.user.id,
            metadata: {
              projectName: p.name,
              reason: "folder_made_private",
              changes: { folderId: { from: folderId, to: null } },
              folderId,
              folderName: existingFolder.name,
            },
          });
          movedProjects.push({ id: p.id, name: p.name, ownerId: p.createdById });
        }
      }

      const updatedFolder = await storage.updateFolder(folderId, validatedData);

      if (!updatedFolder) {
        return res.status(404).json({ message: "Folder not found" });
      }

      // Log activity
      await storage.logActivity({
        action: "update",
        entityType: "folder",
        entityId: folderId,
        userId: req.user.id,
        metadata: {
          folderName: updatedFolder.name,
          changes,
          movedProjectsCount: movedProjects.length,
          movedProjects: movedProjects.length > 0 ? movedProjects : undefined,
        },
      });

      res.json({ ...updatedFolder, movedProjects });
    } catch (error) {
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      next(error);
    }
  });

  // Delete a folder
  app.delete("/api/folders/:folderId", isAuthenticated, async (req, res, next) => {
    try {
      const folderId = parseInt(req.params.folderId);
      
      if (isNaN(folderId)) {
        return res.status(400).json({ message: "Invalid folder ID" });
      }

      const existingFolder = await storage.getFolder(folderId);
      
      if (!existingFolder) {
        return res.status(404).json({ message: "Folder not found" });
      }

      // Admins or the folder owner can delete the folder.
      const isAdminDel = req.user.role === "admin";
      if (!isAdminDel && existingFolder.createdById !== req.user.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Deleting a folder also soft-deletes every project inside it. The
      // projects (and the folder itself) remain recoverable from
      // /api/admin/trash, but they disappear from every dashboard view
      // immediately. This matches the user's expectation that "delete the
      // folder" means "delete the contents too" rather than orphaning the
      // projects to the root.
      const projectsInFolder = await storage.getProjectsByFolder(folderId);
      const deletedProjects: { id: number; name: string; ownerId: number }[] = [];
      for (const p of projectsInFolder) {
        const ok = await storage.deleteProject(p.id);
        if (!ok) continue;
        await storage.logActivity({
          action: "delete",
          entityType: "project",
          entityId: p.id,
          userId: req.user.id,
          metadata: {
            projectName: p.name,
            ownerId: p.createdById,
            reason: "parent_folder_deleted",
            folderId,
            folderName: existingFolder.name,
          },
        });
        deletedProjects.push({ id: p.id, name: p.name, ownerId: p.createdById });
      }

      const success = await storage.deleteFolder(folderId);

      if (!success) {
        return res.status(404).json({ message: "Folder not found" });
      }

      // Log activity
      await storage.logActivity({
        action: "delete",
        entityType: "folder",
        entityId: folderId,
        userId: req.user.id,
        metadata: {
          folderName: existingFolder.name,
          deletedProjectsCount: deletedProjects.length,
          deletedProjects: deletedProjects.length > 0 ? deletedProjects : undefined,
        },
      });

      res.status(200).json({
        success: true,
        deletedProjectsCount: deletedProjects.length,
      });
    } catch (error) {
      next(error);
    }
  });

  // Get all projects in a specific folder
  app.get("/api/folders/:folderId/projects", isAuthenticated, async (req, res, next) => {
    try {
      const folderId = parseInt(req.params.folderId);
      
      if (isNaN(folderId)) {
        return res.status(400).json({ message: "Invalid folder ID" });
      }

      const folder = await storage.getFolder(folderId);
      
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }

      // Folder contents are readable by any authenticated user (mirrors
      // the loosened project read access). Use the enriched query so
      // the folder page can render thumbnails / sprites / file counts
      // identically to the dashboard and projects page.
      const projects = await storage.getProjectsByFolderWithLatestVideo(folderId);

      res.json(projects);
    } catch (error) {
      next(error);
    }
  });

  // ===== PROJECT ROUTES =====
  // Get all projects (accessible to user)
  app.get("/api/projects", isAuthenticated, async (req, res, next) => {
    try {
      let projects;
      
      // Admins can see all projects
      if (req.user.role === "admin") {
        projects = await storage.getAllProjectsWithLatestVideo();
      } else {
        projects = await storage.getProjectsByUserWithLatestVideo(req.user.id);
      }
      
      res.json(projects);
    } catch (error) {
      next(error);
    }
  });

  // Create a new project
  app.post("/api/projects", isAuthenticated, async (req, res, next) => {
    try {
      console.log("POST /api/projects received", {
        body: req.body,
        user: req.user.id,
        authenticated: req.isAuthenticated()
      });

      // If a folderId is provided, the requester must be allowed to place
      // projects in that folder: admin, the folder's creator, or any user
      // when the folder is global. This prevents leaking project metadata
      // into private folders owned by other users.
      if (req.body.folderId != null) {
        const targetFolder = await storage.getFolder(Number(req.body.folderId));
        if (!targetFolder) {
          return res.status(400).json({ message: "Invalid folderId" });
        }
        const isAdmin = req.user.role === "admin";
        if (!isAdmin && !targetFolder.isGlobal && targetFolder.createdById !== req.user.id) {
          return res.status(403).json({ message: "You don't have access to that folder" });
        }
      }

      // The project creator is ALWAYS the authenticated user. Never trust
      // a client-supplied createdById — accepting it would let any user
      // attribute a project to anyone else (e.g. an editor could spoof a
      // project as if an admin had created it). Strip it from req.body.
      const { createdById: _ignoredCreatedById, ...safeBody } = req.body;
      const projectData = {
        ...safeBody,
        createdById: req.user.id,
      };
      
      // Validate the request body
      const validationResult = insertProjectSchema.safeParse(projectData);
      
      if (!validationResult.success) {
        console.error("Project validation failed:", validationResult.error.errors);
        return res.status(400).json({ 
          message: "Invalid project data", 
          errors: validationResult.error.errors 
        });
      }
      
      console.log("Project validation passed, creating project");
      
      // Create the project
      const project = await storage.createProject(validationResult.data);
      
      console.log("Project created:", project);
      
      // Add creator as a project admin
      await storage.addUserToProject({
        projectId: project.id,
        userId: req.user.id,
        role: "editor", // Creator is an editor
      });
      
      console.log("User added to project");
      
      // Log activity
      await storage.logActivity({
        action: "create",
        entityType: "project",
        entityId: project.id,
        userId: req.user.id,
        metadata: { projectName: project.name },
      });
      
      console.log("Activity logged, sending response");
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      next(error);
    }
  });

  // Get a specific project
  app.get("/api/projects/:projectId", hasProjectAccess, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      res.json(project);
    } catch (error) {
      next(error);
    }
  });

  // Update a project
  app.patch("/api/projects/:projectId", hasProjectEditAccess, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // If reassigning to a folder, verify the requester is allowed to
      // place projects there (admin, folder owner, or any user for global
      // folders). Setting folderId to null is always allowed.
      if ("folderId" in req.body && req.body.folderId != null) {
        const targetFolder = await storage.getFolder(Number(req.body.folderId));
        if (!targetFolder) {
          return res.status(400).json({ message: "Invalid folderId" });
        }
        const isAdmin = req.user.role === "admin";
        if (!isAdmin && !targetFolder.isGlobal && targetFolder.createdById !== req.user.id) {
          return res.status(403).json({ message: "You don't have access to that folder" });
        }
      }

      // Update the project
      const updatedProject = await storage.updateProject(projectId, req.body);
      
      if (!updatedProject) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Log activity
      await storage.logActivity({
        action: "update",
        entityType: "project",
        entityId: projectId,
        userId: req.user.id,
        metadata: { projectName: updatedProject.name },
      });
      
      res.json(updatedProject);
    } catch (error) {
      next(error);
    }
  });

  // Soft-delete a project. The DB row stays (deleted_at timestamp), file
  // rows stay, and the on-disk files are LEFT UNTOUCHED so an admin can
  // restore the project from /api/admin/trash. To permanently remove
  // a project + its disk files, an admin uses
  // DELETE /api/admin/trash/projects/:id.
  app.delete("/api/projects/:projectId", hasProjectEditAccess, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const project = await storage.getProject(projectId);

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const projectFiles = await storage.getFilesByProject(projectId);

      await storage.logActivity({
        action: "soft_delete",
        entityType: "project",
        entityId: projectId,
        userId: req.user.id,
        metadata: { projectName: project.name, fileCount: projectFiles.length },
      });

      const success = await storage.deleteProject(projectId);
      if (!success) {
        return res.status(404).json({ message: "Project not found" });
      }

      console.log(`[PROJECT SOFT-DELETE] project ${projectId} (${project.name}) marked deleted; ${projectFiles.length} files preserved on disk and recoverable via admin trash`);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  // Get project users
  app.get("/api/projects/:projectId/users", hasProjectAccess, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const projectUsers = await storage.getProjectUsers(projectId);
      
      // Get full user details for each project user
      const detailedUsers = await Promise.all(
        projectUsers.map(async (pu) => {
          const user = await storage.getUser(pu.userId);
          
          if (!user) return null;
          
          // Remove password from response
          const { password, ...userWithoutPassword } = user;
          
          return {
            ...pu,
            user: userWithoutPassword,
          };
        })
      );
      
      res.json(detailedUsers.filter(Boolean));
    } catch (error) {
      next(error);
    }
  });

  // Add user to project
  app.post("/api/projects/:projectId/users", hasProjectEditAccess, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      // Validate the request body
      const validationResult = insertProjectUserSchema.safeParse({
        ...req.body,
        projectId,
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid data", 
          errors: validationResult.error.errors 
        });
      }
      
      // Check if user exists
      const user = await storage.getUser(validationResult.data.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Check if user is already in project
      const existingProjectUser = await storage.getProjectUser(projectId, validationResult.data.userId);
      if (existingProjectUser) {
        return res.status(400).json({ message: "User is already in this project" });
      }
      
      // Add user to project
      const projectUser = await storage.addUserToProject(validationResult.data);
      
      // Log activity
      await storage.logActivity({
        action: "add_user",
        entityType: "project",
        entityId: projectId,
        userId: req.user.id,
        metadata: { 
          projectName: project.name, 
          addedUserId: user.id,
          addedUserName: user.name,
          role: validationResult.data.role,
        },
      });
      
      res.status(201).json(projectUser);
    } catch (error) {
      next(error);
    }
  });

  // Update user role in project
  app.patch("/api/projects/:projectId/users/:userId", hasProjectEditAccess, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = parseInt(req.params.userId);
      
      // Validate role
      if (!req.body.role || !["editor", "viewer"].includes(req.body.role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      
      // Check if project user exists
      const projectUser = await storage.getProjectUser(projectId, userId);
      if (!projectUser) {
        return res.status(404).json({ message: "User is not part of this project" });
      }
      
      // Update role
      const updatedProjectUser = await storage.updateProjectUserRole(projectUser.id, req.body.role);
      
      if (!updatedProjectUser) {
        return res.status(404).json({ message: "Project user not found" });
      }
      
      // Log activity
      await storage.logActivity({
        action: "update_role",
        entityType: "project_user",
        entityId: projectUser.id,
        userId: req.user.id,
        metadata: { 
          projectId,
          targetUserId: userId,
          role: req.body.role,
        },
      });
      
      res.json(updatedProjectUser);
    } catch (error) {
      next(error);
    }
  });

  // Remove user from project
  app.delete("/api/projects/:projectId/users/:userId", hasProjectEditAccess, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = parseInt(req.params.userId);
      
      // Check if project user exists
      const projectUser = await storage.getProjectUser(projectId, userId);
      if (!projectUser) {
        return res.status(404).json({ message: "User is not part of this project" });
      }
      
      // Log activity before removal
      await storage.logActivity({
        action: "remove_user",
        entityType: "project",
        entityId: projectId,
        userId: req.user.id,
        metadata: { 
          projectId,
          removedUserId: userId,
        },
      });
      
      // Remove user from project
      const success = await storage.removeUserFromProject(projectId, userId);
      
      if (!success) {
        return res.status(404).json({ message: "Failed to remove user from project" });
      }
      
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  // ===== FILE ROUTES =====
  // Catch-all for invalid /api/files requests (without specific ID or project context)
  app.get("/api/files", isAuthenticated, async (req, res) => {
    res.status(400).json({ 
      message: "Invalid request. Use /api/projects/:projectId/files to get files for a project, or /api/files/:fileId for a specific file." 
    });
  });

  // Get files for a project
  app.get("/api/projects/:projectId/files", hasProjectAccess, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      console.log(`[DEBUG] Getting files for project ID: ${projectId}`);
      const files = await storage.getFilesByProject(projectId);
      console.log(`[DEBUG] Found ${files.length} files for project ID ${projectId}`);
      
      res.json(files);
    } catch (error) {
      console.error(`[ERROR] Failed to get files for project ${req.params.projectId}:`, error);
      next(error);
    }
  });

  // Upload a file to a project (support both endpoints for compatibility)
  app.post(["/api/projects/:projectId/files", "/api/projects/:projectId/upload"], hasProjectEditAccess, upload.single('file'), handleMulterErrors, async (req: FileRequest, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      // Add detailed logging for large file uploads to help debug issues
      const isLargeFile = req.file.size > 1024 * 1024 * 1024; // > 1GB
      if (isLargeFile) {
        console.log(`[Upload] Processing large file upload: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);
      }
      
      // Use custom filename if provided
      const customFilename = req.body.customFilename;
      const filename = customFilename || req.file.originalname;
      
      // Determine file type from mimetype
      let fileType = "other";
      if (req.file.mimetype.startsWith("video/")) {
        fileType = "video";
      } else if (req.file.mimetype.startsWith("audio/")) {
        fileType = "audio";
      } else if (req.file.mimetype.startsWith("image/")) {
        fileType = "image";
      }
      
      // Check for existing files to determine version
      const existingFiles = await storage.getFilesByProject(projectId);
      const similarFiles = existingFiles.filter(f => f.filename === filename);
      
      // Determine version number
      const version = similarFiles.length > 0 
        ? Math.max(...similarFiles.map(f => f.version)) + 1 
        : 1;
      
      // If this is a new version, mark old versions as not latest
      if (version > 1) {
        await Promise.all(
          similarFiles.map(async (file) => {
            await storage.updateFile(file.id, { isLatestVersion: false });
          })
        );
      }
      
      // Create file record in storage with custom filename if provided
      const file = await storage.createFile({
        filename: filename, // Use custom filename or original filename
        fileType,
        fileSize: req.file.size,
        filePath: req.file.path,
        projectId,
        uploadedById: req.user.id,
        version,
        isLatestVersion: true
      });
      
      // IMMEDIATELY respond to client to prevent timeout
      res.status(201).json(file);
      
      // Continue with background operations after response is sent
      try {
        // Log activity
        await storage.logActivity({
          action: "upload",
          entityType: "file",
          entityId: file.id,
          userId: req.user.id,
          metadata: { 
            projectId,
            filename: file.filename,
            version: file.version,
          },
        });
        
        // Process video files automatically for better scrubbing performance
        if (fileType === "video") {
          // Create video processing record
          const processing = await storage.createVideoProcessing({
            fileId: file.id,
            status: "pending"
          });
          
          // Start processing in background (don't wait for completion)
          processVideoInBackground(file, processing.id).catch(error => {
            console.error(`[Video Processing] Failed for file ${file.id}:`, error);
          });
          
          console.log(`[Video Processing] Started background processing for: ${file.filename}`);
        }

        // Auto-transcribe audio/video files in the background
        if (fileType === "video" || fileType === "audio") {
          transcribeFile({ fileId: file.id, inputPath: file.filePath, fileType }).catch(
            (err) => console.error(`[Transcription] Background failed for file ${file.id}:`, err)
          );
        }
      } catch (error) {
        console.error(`[Upload] Background operations failed for file ${file.id}:`, error);
        // Don't re-throw since response already sent
      }
    } catch (error) {
      // Check specifically for integer overflow errors which might indicate file size issues
      if (error.message && error.message.includes("out of range for type integer")) {
        console.error('[Upload Error] File size error detected:', {
          error: error.message,
          fileName: req.file?.originalname,
          fileSize: req.file?.size,
          // Convert to MB for more readable logs
          fileSizeMB: req.file ? (req.file.size / (1024 * 1024)).toFixed(2) + " MB" : "unknown"
        });
        
        return res.status(500).json({
          message: "The file is too large for the database. Please contact your administrator.",
          details: "The file size exceeds the maximum allowed by the database schema."
        });
      }
      
      // Forward to the generic error handler
      next(error);
    }
  });

  // Get a specific file
  app.get("/api/files/:fileId", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const file = await storage.getFile(fileId);
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Read access is open to any authenticated user (see hasProjectAccess).
      
      res.json(file);
    } catch (error) {
      next(error);
    }
  });
  
  // Get a file's project information (useful for uploading related files)
  app.get("/api/files/:fileId/project", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const file = await storage.getFile(fileId);
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Read access is open to any authenticated user.
      
      const project = await storage.getProject(file.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      res.json(project);
    } catch (error) {
      next(error);
    }
  });

  // Serve file content
  // Handle both HEAD and GET requests for file content
  app.use("/api/files/:fileId/content", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      console.log(`[DEBUG] File content requested for fileId: ${fileId}`);
      
      const file = await storage.getFile(fileId);
      
      if (!file) {
        console.log(`[DEBUG] No database record found for file ID: ${fileId}`);
        return res.status(404).json({ message: "File not found" });
      }
      
      console.log(`[DEBUG] Database record found for file ID: ${fileId}`, {
        filename: file.filename,
        fileType: file.fileType,
        filePath: file.filePath,
        isAvailable: file.isAvailable
      });
      
      // Read access is open to any authenticated user.
      
      // Check if file is marked as unavailable
      if (file.isAvailable === false) {
        console.log(`File ${fileId} (${file.filename}) was requested but is marked as unavailable`);
        return res.status(404).json({ 
          message: "File not available", 
          code: "FILE_UNAVAILABLE",
          details: "This file has been deleted from the server."
        });
      }
      
      // Check if the file physically exists before sending
      console.log(`[DEBUG] Checking if file exists at path: ${file.filePath}`);
      const fileExists = await fileSystem.fileExists(file.filePath);
      console.log(`[DEBUG] File exists check result: ${fileExists}`);
      
      if (!fileExists) {
        console.error(`File ${fileId} (${file.filename}) physical file not found at ${file.filePath}`);
        
        // If file doesn't physically exist but is not marked as unavailable, mark it now
        if (file.isAvailable !== false) {
          console.log(`Marking file ${fileId} as unavailable since it was not found on disk`);
          try {
            // Update all database records with similar file paths
            const allFiles = await storage.getAllFiles();
            const missingFiles = allFiles.filter(f => 
              // Look for files with the same path
              f.filePath === file.filePath ||
              // Or files with the same timestamp-based filename pattern
              (file.filePath.includes('/uploads/') && 
               f.filePath.includes('/uploads/') &&
               file.filePath.split('/').pop() === f.filePath.split('/').pop())
            );
            
            console.log(`Found ${missingFiles.length} database records with the same missing file path`);
            
            // Update all these files as unavailable
            for (const missingFile of missingFiles) {
              await storage.updateFile(missingFile.id, { isAvailable: false });
              console.log(`Updated file ID ${missingFile.id} (${missingFile.filename}) as unavailable`);
            }
          } catch (updateError) {
            console.error('Error updating missing file statuses:', updateError);
            // Continue with the request, just mark the current file
            await storage.updateFile(fileId, { isAvailable: false });
          }
        }
        
        return res.status(404).json({ 
          message: "File not available", 
          code: "FILE_UNAVAILABLE",
          details: "This file has been deleted from the server."
        });
      }
      
      // Set appropriate content type headers for common media types
      const fileType = file.fileType.toLowerCase();
      const fileExt = file.filename.split('.').pop()?.toLowerCase();
      
      // Don't force download for media files when viewing in the player
      // Only set Content-Type header for common media types we know
      if (fileType.startsWith('video/') || 
          fileType.startsWith('audio/') || 
          fileType.startsWith('image/') ||
          fileType === 'application/pdf') {
        res.setHeader('Content-Type', file.fileType);
      } else if (fileExt === 'mp4') {
        res.setHeader('Content-Type', 'video/mp4');
      } else if (fileExt === 'webm') {
        res.setHeader('Content-Type', 'video/webm');
      } else if (fileExt === 'mp3') {
        res.setHeader('Content-Type', 'audio/mpeg');
      } else if (fileExt === 'wav') {
        res.setHeader('Content-Type', 'audio/wav');
      } else if (fileExt === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
      }
      
      // Set additional headers to help with streaming and caching
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache
      
      // Log that we're sending the file
      console.log(`Serving file ${fileId} (${file.filename}) - type: ${file.fileType}, path: ${file.filePath}`);
      
      // Handle HEAD requests specifically (for video player precheck)
      if (req.method === 'HEAD') {
        // Just return basic headers for HEAD requests
        res.status(200).end();
        return;
      }
      
      // Send the file for GET requests
      res.sendFile(file.filePath, { root: '/' });
    } catch (error) {
      next(error);
    }
  });
  
  // Download file
  app.get("/api/files/:fileId/download", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const file = await storage.getFile(fileId);
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Read access is open to any authenticated user.
      
      // Check if file is marked as unavailable
      if (file.isAvailable === false) {
        console.log(`File ${fileId} (${file.filename}) download requested but file is marked as unavailable`);
        return res.status(404).json({ 
          message: "File not available", 
          code: "FILE_UNAVAILABLE",
          details: "This file has been deleted from the server."
        });
      }
      
      // Check if the file physically exists before sending
      const fileExists = await fileSystem.fileExists(file.filePath);
      if (!fileExists) {
        console.error(`File ${fileId} (${file.filename}) physical file not found at ${file.filePath}`);
        
        // If file doesn't physically exist but is not marked as unavailable, mark it now
        if (file.isAvailable !== false) {
          console.log(`Marking file ${fileId} as unavailable since it was not found on disk`);
          try {
            // Update all database records with similar file paths
            const allFiles = await storage.getAllFiles();
            const missingFiles = allFiles.filter(f => 
              // Look for files with the same path
              f.filePath === file.filePath ||
              // Or files with the same timestamp-based filename pattern
              (file.filePath.includes('/uploads/') && 
               f.filePath.includes('/uploads/') &&
               file.filePath.split('/').pop() === f.filePath.split('/').pop())
            );
            
            console.log(`Found ${missingFiles.length} database records with the same missing file path`);
            
            // Update all these files as unavailable
            for (const missingFile of missingFiles) {
              await storage.updateFile(missingFile.id, { isAvailable: false });
              console.log(`Updated file ID ${missingFile.id} (${missingFile.filename}) as unavailable`);
            }
          } catch (updateError) {
            console.error('Error updating missing file statuses:', updateError);
            // Continue with the request, just mark the current file
            await storage.updateFile(fileId, { isAvailable: false });
          }
        }
        
        return res.status(404).json({ 
          message: "File not available", 
          code: "FILE_UNAVAILABLE",
          details: "This file has been deleted from the server."
        });
      }
      
      // Set content disposition to force download
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      
      // Send the file
      res.sendFile(file.filePath, { root: '/' });
    } catch (error) {
      next(error);
    }
  });

  // ============ VIDEO PROCESSING API ENDPOINTS ============
  
  // Trigger reprocessing of an existing video file
  app.post("/api/files/:id/reprocess", isAuthenticated, hasFileEditAccess, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      if (isNaN(fileId)) {
        return res.status(400).json({ message: "Invalid file ID" });
      }

      console.log(`🎬 [REPROCESS] Request for file ID: ${fileId}`);

      // Get the file
      const file = await storage.getFile(fileId);
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }

      // Check if it's a video file
      if (!file.mimeType.startsWith('video/')) {
        return res.status(400).json({ message: "File is not a video" });
      }

      // Check if file exists on disk
      if (!existsSync(file.filePath)) {
        return res.status(404).json({ message: "File not found on disk" });
      }

      // Get or create processing record
      let processing = await storage.getVideoProcessing(fileId);
      if (!processing) {
        processing = await storage.createVideoProcessing({
          fileId: file.id,
          status: "pending"
        });
      } else {
        // Update existing record to pending
        await storage.updateVideoProcessing(processing.id, {
          status: "pending"
        });
      }

      // Start reprocessing in background
      processVideoInBackground(file, processing.id).catch(error => {
        console.error(`[Video Reprocessing] Failed for file ${file.id}:`, error);
      });

      console.log(`🎬 [REPROCESS] Started reprocessing for: ${file.filename}`);

      res.json({ 
        message: "Reprocessing started", 
        processingId: processing.id,
        status: "pending"
      });
    } catch (error) {
      console.error("[Video Reprocessing API] Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Get video processing status and metadata
  // MediaInfo-style technical details for a file. Runs ffprobe on demand
  // against the original upload and returns format + per-stream info plus
  // filesystem stats. Used by the "View Details" dropdown action.
  app.get("/api/files/:id/mediainfo", isAuthenticated, hasFileAccess, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      if (isNaN(fileId)) {
        return res.status(400).json({ message: "Invalid file ID" });
      }

      const file = await storage.getFile(fileId);
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }

      const fsMod = await import("fs/promises");
      let stat: { size: number; mtimeMs: number } | null = null;
      let onDisk = false;
      try {
        const s = await fsMod.stat(file.filePath);
        stat = { size: s.size, mtimeMs: s.mtimeMs };
        onDisk = true;
      } catch {
        onDisk = false;
      }

      // Prefer the cached ffprobe payload captured at processing time. Fall
      // back to a live probe (and persist it for next time) only when the
      // cache is empty — e.g. legacy rows from before this column existed,
      // or audio/image uploads that don't go through the video processor.
      const processing = await storage.getVideoProcessing(fileId);
      let probe: any = processing?.mediaInfo ?? null;
      let probeError: string | null = null;
      let cached = !!probe;

      if (!probe) {
        if (onDisk) {
          try {
            probe = await VideoProcessor.probeFull(file.filePath);
            // Best-effort backfill so subsequent opens hit the cache
            if (processing) {
              storage.updateVideoProcessing(processing.id, { mediaInfo: probe })
                .catch(err => console.warn("[MediaInfo API] backfill failed:", err));
            }
          } catch (err: any) {
            probeError = err?.message || String(err);
          }
        } else {
          probeError = "Original file is not present on disk";
        }
      }

      res.json({
        file: {
          id: file.id,
          filename: file.filename,
          fileType: file.fileType,
          fileSize: file.fileSize,
          filePath: file.filePath,
          version: file.version,
          isLatestVersion: file.isLatestVersion,
          createdAt: file.createdAt,
        },
        diskSize: stat?.size ?? null,
        mtimeMs: stat?.mtimeMs ?? null,
        onDisk,
        probe,
        probeError,
        cached,
      });
    } catch (error) {
      console.error("[MediaInfo API] Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/files/:id/processing", isAuthenticated, hasFileAccess, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      if (isNaN(fileId)) {
        return res.status(400).json({ message: "Invalid file ID" });
      }

      console.log(`🎬 [PROCESSING STATUS] Request for file ID: ${fileId}`);

      const processing = await storage.getVideoProcessing(fileId);
      
      console.log(`🎬 [PROCESSING STATUS] Found processing data:`, processing ? {
        status: processing.status,
        hasQualities: !!processing.qualities,
        hasScrubVersion: !!processing.scrubVersionPath,
        qualitiesCount: processing.qualities?.length || 0,
        scrubPath: processing.scrubVersionPath
      } : 'No processing record found');
      
      if (!processing) {
        console.log(`🎬 [PROCESSING STATUS] No processing record found for file ${fileId}`);
        return res.status(404).json({ message: "Processing record not found" });
      }

      // Note: File existence checks removed to prevent import errors in production

      res.json(processing);
    } catch (error) {
      console.error("[Video Processing API] Error fetching processing status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ===== Transcript routes =====
  app.get("/api/transcription/status", isAuthenticated, async (_req, res) => {
    const available = await isTranscriptionAvailable();
    res.json({
      available,
      enabled: (process.env.TRANSCRIPTION_ENABLED || "true").toLowerCase() !== "false",
      model: process.env.WHISPER_MODEL || "base.en",
    });
  });

  app.get("/api/files/:id/transcript", isAuthenticated, hasFileAccess, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      if (isNaN(fileId)) return res.status(400).json({ message: "Invalid file ID" });
      const transcript = await storage.getTranscript(fileId);
      if (!transcript) return res.status(404).json({ message: "No transcript yet" });
      res.json(transcript);
    } catch (err) {
      console.error("[Transcript API] Get error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/files/:id/transcript/regenerate", isAuthenticated, hasFileEditAccess, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      if (isNaN(fileId)) return res.status(400).json({ message: "Invalid file ID" });
      const file = await storage.getFile(fileId);
      if (!file) return res.status(404).json({ message: "File not found" });
      if (file.fileType !== "video" && file.fileType !== "audio") {
        return res.status(400).json({ message: "File type does not support transcription" });
      }
      transcribeFile({ fileId: file.id, inputPath: file.filePath, fileType: file.fileType }).catch(
        (err) => console.error(`[Transcription] Regenerate failed for file ${file.id}:`, err)
      );
      res.json({ message: "Transcription started", fileId });
    } catch (err) {
      console.error("[Transcript API] Regenerate error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/files/:id/summary/regenerate", isAuthenticated, hasFileEditAccess, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      if (isNaN(fileId)) return res.status(400).json({ message: "Invalid file ID" });
      const transcript = await storage.getTranscript(fileId);
      if (!transcript || transcript.status !== "completed") {
        return res.status(400).json({ message: "Transcript must be completed before summarizing" });
      }
      // Flip status to pending synchronously so the client's next refetch
      // immediately sees the in-flight state (avoids a polling race).
      await storage.updateTranscript(transcript.id, {
        summaryStatus: "pending",
        summaryError: null,
      } as any);
      const { summarizeForFile } = await import("./summarization");
      summarizeForFile(fileId).catch((err) =>
        console.error(`[Summarization] Regenerate failed for file ${fileId}:`, err)
      );
      res.json({ message: "Summarization started", fileId });
    } catch (err) {
      console.error("[Summary API] Regenerate error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/files/:id/transcript.vtt", isAuthenticated, hasFileAccess, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      const transcript = await storage.getTranscript(fileId);
      if (!transcript || !transcript.segments?.length) {
        return res.status(404).send("No transcript available");
      }
      res.setHeader("Content-Type", "text/vtt; charset=utf-8");
      res.send(segmentsToVtt(transcript.segments));
    } catch (err) {
      console.error("[Transcript API] VTT error:", err);
      res.status(500).send("Internal server error");
    }
  });

  app.get("/api/files/:id/transcript.srt", isAuthenticated, hasFileAccess, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      const transcript = await storage.getTranscript(fileId);
      if (!transcript || !transcript.segments?.length) {
        return res.status(404).send("No transcript available");
      }
      res.setHeader("Content-Type", "application/x-subrip; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="transcript-${fileId}.srt"`);
      res.send(segmentsToSrt(transcript.segments));
    } catch (err) {
      console.error("[Transcript API] SRT error:", err);
      res.status(500).send("Internal server error");
    }
  });

  app.get("/api/files/:id/transcript.txt", isAuthenticated, hasFileAccess, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      const transcript = await storage.getTranscript(fileId);
      if (!transcript) return res.status(404).send("No transcript available");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="transcript-${fileId}.txt"`);
      res.send(transcript.text || (transcript.segments || []).map((s) => s.text).join("\n"));
    } catch (err) {
      console.error("[Transcript API] TXT error:", err);
      res.status(500).send("Internal server error");
    }
  });

  // Serve processed video quality versions
  app.get("/api/files/:id/qualities/:quality", isAuthenticated, hasFileAccess, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      const quality = req.params.quality;
      
      console.log(`🎬 [QUALITY ENDPOINT] Request for file ID: ${fileId}, quality: ${quality}`);
      
      if (isNaN(fileId)) {
        return res.status(400).json({ message: "Invalid file ID" });
      }

      const processing = await storage.getVideoProcessing(fileId);
      
      console.log(`🎬 [QUALITY ENDPOINT] Processing data:`, processing ? {
        status: processing.status,
        hasQualities: !!processing.qualities,
        availableQualities: processing.qualities?.map(q => q.resolution) || []
      } : 'No processing data found');
      if (!processing || !processing.qualities) {
        return res.status(404).json({ message: "Processed qualities not available" });
      }

      const qualityVersion = processing.qualities.find(q => q.resolution === quality);
      if (!qualityVersion || !existsSync(qualityVersion.path)) {
        return res.status(404).json({ message: "Quality version not found" });
      }

      // Set appropriate headers for video streaming with range support
      const stats = await fsPromises.stat(qualityVersion.path);
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunksize = (end - start) + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
          'Cache-Control': 'public, max-age=3600'
        });

        const stream = fs.createReadStream(qualityVersion.path, { start, end });
        stream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stats.size,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600'
        });

        const stream = fs.createReadStream(qualityVersion.path);
        stream.pipe(res);
      }
    } catch (error) {
      console.error("[Video Processing API] Error serving quality:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Serve scrub version for smooth scrubbing
  app.get("/api/files/:id/scrub", isAuthenticated, hasFileAccess, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      
      console.log(`🎬 [SCRUB ENDPOINT] Request for file ID: ${fileId}`);
      
      if (isNaN(fileId)) {
        return res.status(400).json({ message: "Invalid file ID" });
      }

      const processing = await storage.getVideoProcessing(fileId);
      
      console.log(`🎬 [SCRUB ENDPOINT] Processing data:`, processing ? {
        status: processing.status,
        hasScrubVersion: !!processing.scrubVersionPath,
        scrubPath: processing.scrubVersionPath
      } : 'No processing data found');
      if (!processing || !processing.scrubVersionPath) {
        console.log(`🎬 [SCRUB ENDPOINT] No scrub version path for file ${fileId}`);
        return res.status(404).json({ message: "Scrub version not available" });
      }
      
      try {
        if (!existsSync(processing.scrubVersionPath)) {
          console.log(`🎬 [SCRUB ENDPOINT] ❌ Scrub file does not exist at path: ${processing.scrubVersionPath}`);
          return res.status(404).json({ message: "Scrub version not available" });
        }
        console.log(`🎬 [SCRUB ENDPOINT] ✅ File exists: ${processing.scrubVersionPath}`);
      } catch (fsError) {
        console.error(`🎬 [SCRUB ENDPOINT] ❌ File check error:`, fsError);
        return res.status(500).json({ message: "File system error" });
      }
      
      // Log file size for debugging
      console.log(`🎬 [SCRUB ENDPOINT] Serving scrub file: ${processing.scrubVersionPath}`);

      const stats = await fsPromises.stat(processing.scrubVersionPath);
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunksize = (end - start) + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
          'Cache-Control': 'public, max-age=3600'
        });

        const stream = fs.createReadStream(processing.scrubVersionPath, { start, end });
        stream.on('error', (streamError) => {
          console.error(`🎬 [SCRUB ENDPOINT] ❌ Stream error (range):`, streamError);
          if (!res.headersSent) {
            res.status(500).json({ message: "Stream error" });
          }
        });
        stream.on('open', () => {
          console.log(`🎬 [SCRUB ENDPOINT] ✅ Range stream opened successfully`);
        });
        stream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stats.size,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600'
        });

        const stream = fs.createReadStream(processing.scrubVersionPath);
        stream.on('error', (streamError) => {
          console.error(`🎬 [SCRUB ENDPOINT] ❌ Stream error (full):`, streamError);
          if (!res.headersSent) {
            res.status(500).json({ message: "Stream error" });
          }
        });
        stream.on('open', () => {
          console.log(`🎬 [SCRUB ENDPOINT] ✅ Full stream opened successfully`);
        });
        stream.pipe(res);
      }
    } catch (error) {
      console.error("[Video Processing API] Error serving scrub version:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Serve individual thumbnail for cards (uses first frame of sprite)
  app.get("/api/files/:id/thumbnail", isAuthenticated, hasFileAccess, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      
      if (isNaN(fileId)) {
        return res.status(400).json({ message: "Invalid file ID" });
      }

      const processing = await storage.getVideoProcessing(fileId);
      if (!processing || !processing.thumbnailSpritePath || !existsSync(processing.thumbnailSpritePath)) {
        return res.status(404).json({ message: "Thumbnail not available" });
      }

      // For now, serve the sprite as thumbnail - in production you'd generate individual thumbnails
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hour cache
      res.sendFile(path.resolve(processing.thumbnailSpritePath));
    } catch (error) {
      console.error("[Video Processing API] Error serving thumbnail:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Serve thumbnail sprite
  app.get("/api/files/:id/sprite", isAuthenticated, hasFileAccess, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      
      if (isNaN(fileId)) {
        return res.status(400).json({ message: "Invalid file ID" });
      }

      const processing = await storage.getVideoProcessing(fileId);
      if (!processing || !processing.thumbnailSpritePath || !existsSync(processing.thumbnailSpritePath)) {
        return res.status(404).json({ message: "Thumbnail sprite not available" });
      }

      res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hour cache for sprites
      res.sendFile(path.resolve(processing.thumbnailSpritePath));
    } catch (error) {
      console.error("[Video Processing API] Error serving sprite:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Serve sprite metadata  
  app.get("/api/files/:id/sprite-metadata", isAuthenticated, hasFileAccess, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      
      if (isNaN(fileId)) {
        return res.status(400).json({ message: "Invalid file ID" });
      }

      const processing = await storage.getVideoProcessing(fileId);
      if (!processing || !processing.spriteMetadata) {
        return res.status(404).json({ message: "Sprite metadata not available" });
      }

      res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hour cache
      res.json(processing.spriteMetadata);
    } catch (error) {
      console.error("[Video Processing API] Error serving sprite metadata:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Public share metadata - get file metadata for shared files without authentication
  app.get("/api/share/:token/metadata", async (req, res, next) => {
    try {
      const token = req.params.token;
      // Find file by share token with project information
      const fileWithProject = await storage.getFileWithProjectByShareToken(token);
      
      if (!fileWithProject) {
        return res.status(404).json({ message: "Shared file not found" });
      }
      
      // Check if file is marked as unavailable
      if (fileWithProject.isAvailable === false) {
        return res.status(404).json({ 
          message: "Shared file not available", 
          code: "FILE_UNAVAILABLE",
          details: "This file has been deleted from the server."
        });
      }
      
      // Return file metadata with project name (excluding sensitive fields).
      // `projectId` is included so the client can redirect signed-in users
      // straight to the authenticated project view.
      return res.json({
        id: fileWithProject.id,
        filename: fileWithProject.filename,
        fileType: fileWithProject.fileType,
        fileSize: fileWithProject.fileSize,
        projectId: fileWithProject.projectId,
        projectName: fileWithProject.projectName,
        createdAt: fileWithProject.createdAt
      });
    } catch (error) {
      console.error("Error fetching shared file metadata:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get video processing data for shared files (no authentication required)
  app.get("/api/share/:token/processing", async (req, res, next) => {
    try {
      const token = req.params.token;
      const file = await storage.getFileByShareToken(token);
      
      if (!file) {
        return res.status(404).json({ message: "Shared file not found" });
      }
      
      // Check if file is marked as unavailable
      if (file.isAvailable === false) {
        return res.status(404).json({ 
          message: "Shared file not available", 
          code: "FILE_UNAVAILABLE",
          details: "This file has been deleted from the server."
        });
      }
      
      // Get video processing data if available
      const processing = await storage.getVideoProcessing(file.id);
      if (!processing) {
        return res.status(404).json({ message: "Video processing data not available" });
      }
      
      res.json(processing);
    } catch (error) {
      console.error("Error fetching shared file processing data:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Simple in-memory rate limiting for public comments
  const publicCommentRateLimit = new Map<string, { count: number; resetTime: number }>();
  
  const checkRateLimit = (ip: string): boolean => {
    const now = Date.now();
    const limit = publicCommentRateLimit.get(ip);
    
    if (!limit || now > limit.resetTime) {
      // Reset or create new limit
      publicCommentRateLimit.set(ip, { count: 1, resetTime: now + 60000 }); // 1 minute window
      return true;
    }
    
    if (limit.count >= 10) { // 10 comments per minute
      return false;
    }
    
    limit.count++;
    return true;
  };

  // Get unified comments for shared file (no authentication required)
  app.get("/api/share/:token/comments", async (req, res, next) => {
    try {
      const token = req.params.token;
      const file = await storage.getFileByShareToken(token);
      
      if (!file) {
        return res.status(404).json({ message: "Shared file not found" });
      }
      
      // Check if file is marked as unavailable
      if (file.isAvailable === false) {
        return res.status(404).json({ 
          message: "Shared file not available", 
          code: "FILE_UNAVAILABLE",
          details: "This file has been deleted from the server."
        });
      }
      
      // Get unified comments (both regular and public comments)
      const comments = await storage.getUnifiedCommentsByFileV2(file.id);
      // Strip creatorToken from response for security
      const sanitizedComments = comments.map(comment => {
        const { creatorToken, ...sanitizedComment } = comment;
        return sanitizedComment;
      });
      res.json(sanitizedComments);
    } catch (error) {
      console.error("Error fetching shared file comments:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create public comment for shared file (no authentication required)
  app.post("/api/share/:token/comments", async (req, res, next) => {
    try {
      const token = req.params.token;
      const clientIp = req.ip || req.connection.remoteAddress || "unknown";
      
      // Check rate limit
      if (!checkRateLimit(clientIp)) {
        return res.status(429).json({ 
          message: "Too many comments. Please wait before commenting again." 
        });
      }
      
      const file = await storage.getFileByShareToken(token);
      
      if (!file) {
        return res.status(404).json({ message: "Shared file not found" });
      }
      
      // Check if file is marked as unavailable
      if (file.isAvailable === false) {
        return res.status(404).json({ 
          message: "Shared file not available", 
          code: "FILE_UNAVAILABLE",
          details: "This file has been deleted from the server."
        });
      }
      
      // Validate unified comment data for public comment
      const validationResult = insertCommentsUnifiedSchema.safeParse({
        ...req.body,
        fileId: file.id,
        isPublic: true,
        userId: null, // Public comments have no userId
        authorName: req.body.displayName || req.body.authorName || "Anonymous", // Map displayName to authorName
        authorEmail: req.body.authorEmail || req.body.email // Include email if provided
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid comment data", 
          errors: validationResult.error.errors 
        });
      }
      
      // Generate a unique creator token for this comment
      const creatorToken = crypto.randomBytes(32).toString('hex');
      
      // Create the unified comment with the creator token
      const commentData = {
        ...validationResult.data,
        creatorToken
      };
      
      const comment = await storage.createUnifiedComment(commentData);
      
      // Return the comment with the creator token for client-side storage
      res.status(201).json({
        ...comment,
        creatorToken
      });
    } catch (error) {
      console.error("Error creating public comment:", error);
      
      // Handle validation errors specifically
      if (error.message?.includes("Parent comment does not exist") || 
          error.message?.includes("Parent comment must belong to the same file") ||
          error.message?.includes("cycle in the comment thread")) {
        return res.status(400).json({ 
          message: "Invalid comment data", 
          details: error.message 
        });
      }
      
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get proxy quality versions for shared files  
  app.get("/api/share/:token/qualities/:quality", async (req, res) => {
    try {
      const token = req.params.token;
      const quality = req.params.quality;
      
      console.log(`[PRODUCTION QUALITY] Request for token: ${token}, quality: ${quality}`);
      
      const file = await storage.getFileByShareToken(token);
      if (!file) {
        console.error(`[PRODUCTION QUALITY] File not found for token: ${token}`);
        return res.status(404).send('File not found');
      }
      
      console.log(`[PRODUCTION QUALITY] Found file: ${file.filename} (ID: ${file.id})`);
      
      if (file.isAvailable === false) {
        console.log(`[PRODUCTION QUALITY] File marked as unavailable for token ${token}`);
        return res.status(404).send('File not available');
      }

      const processing = await storage.getVideoProcessing(file.id);
      console.log(`[PRODUCTION QUALITY] Processing data:`, processing ? {
        status: processing.status,
        hasQualities: !!processing.qualities,
        qualitiesCount: processing.qualities?.length || 0
      } : 'No processing data found');
      
      if (!processing || !processing.qualities) {
        console.log(`[PRODUCTION QUALITY] No processed qualities available for file ${file.id}`);
        return res.status(404).send('Quality not available');
      }

      const qualityVersion = processing.qualities.find(q => q.resolution === quality);
      if (!qualityVersion) {
        console.log(`[PRODUCTION QUALITY] Quality ${quality} not found for file ${file.id}`);
        console.log(`[PRODUCTION QUALITY] Available qualities:`, processing.qualities.map(q => q.resolution));
        return res.status(404).send('Quality version not found');
      }
      
      console.log(`[PRODUCTION QUALITY] Found quality version at path: ${qualityVersion.path}`);
      
      if (!existsSync(qualityVersion.path)) {
        console.error(`[PRODUCTION QUALITY] Quality file does not exist at path: ${qualityVersion.path}`);
        return res.status(404).send('Quality file not found');
      }

      // Set appropriate headers for video streaming with range support
      const stats = await fsPromises.stat(qualityVersion.path);
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunksize = (end - start) + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
          'Cache-Control': 'public, max-age=3600',
          'Cross-Origin-Resource-Policy': 'cross-origin'
        });

        const stream = fs.createReadStream(qualityVersion.path, { start, end });
        stream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stats.size,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600',
          'Cross-Origin-Resource-Policy': 'cross-origin'
        });

        const stream = fs.createReadStream(qualityVersion.path);
        stream.pipe(res);
      }
    } catch (error) {
      console.error("[PRODUCTION QUALITY] Error serving quality:", error);
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      }
    }
  });

  // Get scrub version for shared files (no authentication required)
  app.get("/api/share/:token/scrub", async (req, res) => {
    try {
      const token = req.params.token;
      
      console.log(`[PRODUCTION SCRUB] Request for token: ${token}`);
      
      const file = await storage.getFileByShareToken(token);
      if (!file) {
        console.error(`[PRODUCTION SCRUB] File not found for token: ${token}`);
        return res.status(404).send('File not found');
      }
      
      console.log(`[PRODUCTION SCRUB] Found file: ${file.filename} (ID: ${file.id})`);
      
      if (file.isAvailable === false) {
        console.log(`[PRODUCTION SCRUB] File marked as unavailable for token ${token}`);
        return res.status(404).send('File not available');
      }

      const processing = await storage.getVideoProcessing(file.id);
      console.log(`[PRODUCTION SCRUB] Processing data:`, processing ? {
        status: processing.status,
        hasScrubVersion: !!processing.scrubVersionPath,
        scrubPath: processing.scrubVersionPath
      } : 'No processing data found');
      
      if (!processing || !processing.scrubVersionPath) {
        console.log(`[PRODUCTION SCRUB] No scrub version available for file ${file.id}`);
        return res.status(404).send('Scrub version not available');
      }
      
      console.log(`[PRODUCTION SCRUB] Found scrub version at path: ${processing.scrubVersionPath}`);
      
      if (!existsSync(processing.scrubVersionPath)) {
        console.error(`[PRODUCTION SCRUB] Scrub file does not exist at path: ${processing.scrubVersionPath}`);
        return res.status(404).send('Scrub file not found');
      }

      // Set appropriate headers for video streaming with range support
      const stats = await fsPromises.stat(processing.scrubVersionPath);
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunksize = (end - start) + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
          'Cache-Control': 'public, max-age=3600',
          'Cross-Origin-Resource-Policy': 'cross-origin'
        });

        const stream = fs.createReadStream(processing.scrubVersionPath, { start, end });
        stream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stats.size,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600',
          'Cross-Origin-Resource-Policy': 'cross-origin'
        });

        const stream = fs.createReadStream(processing.scrubVersionPath);
        stream.pipe(res);
      }
    } catch (error) {
      console.error("[PRODUCTION SCRUB] Error serving scrub:", error);
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      }
    }
  });

  // Transcript / synopsis for legacy shared file (read-only, public)
  app.get("/api/share/:token/transcript", async (req, res, next) => {
    try {
      const file = await storage.getFileByShareToken(req.params.token);
      if (!file) return res.status(404).json({ message: "Shared file not found" });
      const transcript = await storage.getTranscript(file.id);
      if (!transcript) return res.status(404).json({ message: "No transcript yet" });
      res.json(transcript);
    } catch (e) { next(e); }
  });
  app.get("/api/share/:token/transcript.vtt", async (req, res, next) => {
    try {
      const file = await storage.getFileByShareToken(req.params.token);
      if (!file) return res.status(404).send("Shared file not found");
      const t = await storage.getTranscript(file.id);
      if (!t || !t.segments?.length) return res.status(404).send("No transcript available");
      const { segmentsToVtt } = await import("./transcription");
      res.setHeader("Content-Type", "text/vtt; charset=utf-8");
      res.send(segmentsToVtt(t.segments as any));
    } catch (e) { next(e); }
  });
  app.get("/api/share/:token/transcript.srt", async (req, res, next) => {
    try {
      const file = await storage.getFileByShareToken(req.params.token);
      if (!file) return res.status(404).send("Shared file not found");
      const t = await storage.getTranscript(file.id);
      if (!t || !t.segments?.length) return res.status(404).send("No transcript available");
      const { segmentsToSrt } = await import("./transcription");
      res.setHeader("Content-Type", "application/x-subrip; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="transcript-${file.id}.srt"`);
      res.send(segmentsToSrt(t.segments as any));
    } catch (e) { next(e); }
  });
  app.get("/api/share/:token/transcript.txt", async (req, res, next) => {
    try {
      const file = await storage.getFileByShareToken(req.params.token);
      if (!file) return res.status(404).send("Shared file not found");
      const t = await storage.getTranscript(file.id);
      if (!t) return res.status(404).send("No transcript available");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="transcript-${file.id}.txt"`);
      res.send((t as any).text || ((t.segments as any[]) || []).map((s: any) => s.text).join("\n"));
    } catch (e) { next(e); }
  });

  // Request changes for shared file (no authentication required)
  app.post("/api/share/:token/request-changes", async (req, res, next) => {
    try {
      const token = req.params.token;
      const clientIp = req.ip || req.connection.remoteAddress || "unknown";
      
      // Check rate limit (reuse the same rate limiting logic)
      if (!checkRateLimit(clientIp)) {
        return res.status(429).json({ 
          message: "Too many requests. Please wait before submitting again." 
        });
      }
      
      const file = await storage.getFileByShareToken(token);
      
      if (!file) {
        return res.status(404).json({ message: "Shared file not found" });
      }
      
      // Check if file is marked as unavailable
      if (file.isAvailable === false) {
        return res.status(404).json({ 
          message: "Shared file not available", 
          code: "FILE_UNAVAILABLE",
          details: "This file has been deleted from the server."
        });
      }
      
      // Validate request data
      const { requesterName, requesterEmail } = req.body;
      
      if (!requesterName || !requesterEmail) {
        return res.status(400).json({ 
          message: "Requester name and email are required" 
        });
      }
      
      // Get project information
      const project = await storage.getProject(file.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Get all project users (collaborators and owner)
      const projectUsers = await storage.getProjectUsers(file.projectId);
      const allUsers = await Promise.all(
        projectUsers.map(pu => storage.getUser(pu.userId))
      );
      
      // Filter out null users and get their emails
      const validUsers = allUsers.filter(user => user !== undefined);
      
      // Send emails to all project members
      const { sendApprovalEmail } = await import('./utils/sendgrid');
      const emailPromises = validUsers.map(user => {
        if (user) {
          return sendApprovalEmail(
            user.email,
            requesterName,
            project.name,
            file.filename,
            "changes_requested",
            null, // No feedback - just notification
            req.get('origin') || req.get('host'),
            project.id
          );
        }
        return Promise.resolve(false);
      });
      
      await Promise.all(emailPromises);
      
      console.log(`Public request for changes sent for file ${file.filename} by ${requesterName} (${requesterEmail})`);
      console.log(`Emails sent to ${validUsers.length} project members`);
      
      res.status(200).json({ 
        message: "Changes requested successfully. Project members have been notified via email.",
        emailsSent: validUsers.length
      });
    } catch (error) {
      console.error("Error requesting changes:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Public share link - only serves the video content without authentication
  app.get("/public/share/:token", async (req, res, next) => {
    try {
      const token = req.params.token;
      console.log(`[PRODUCTION SHARE] Request for token: ${token}`);
      
      // Find file by share token
      const files = await storage.getAllFiles();
      const file = files.find((f: StorageFile) => f.shareToken === token);
      
      if (!file) {
        console.error(`[PRODUCTION SHARE] File not found for token: ${token}`);
        // Return 404 without JSON to avoid Content-Type issues
        return res.status(404).send('File not found');
      }
      
      console.log(`[PRODUCTION SHARE] Found file: ${file.filename} (ID: ${file.id})`);
      console.log(`[PRODUCTION SHARE] File path: ${file.filePath}`);
      
      // Check if file is marked as unavailable
      if (file.isAvailable === false) {
        console.log(`[PRODUCTION SHARE] File marked as unavailable for token ${token}`);
        return res.status(404).send('File not available');
      }
      
      // Check if the file physically exists before sending
      console.log(`[PRODUCTION SHARE] Checking if file exists at path: ${file.filePath}`);
      const fileExists = await fileSystem.fileExists(file.filePath);
      console.log(`[PRODUCTION SHARE] File exists check result: ${fileExists}`);
      
      if (!fileExists) {
        console.error(`[PRODUCTION SHARE] Physical file not found at ${file.filePath}`);
        
        // If file doesn't physically exist but is not marked as unavailable, mark it now
        if (file.isAvailable !== false) {
          console.log(`[PRODUCTION SHARE] Marking file ID ${file.id} as unavailable (missing from disk)`);
          try {
            await storage.updateFile(file.id, { isAvailable: false });
            console.log(`[PRODUCTION SHARE] Successfully marked file as unavailable`);
          } catch (updateError) {
            console.error('[PRODUCTION SHARE] Error updating file status:', updateError);
          }
        }
        
        // Return 404 without JSON to avoid Content-Type issues
        return res.status(404).send('File not available');
      }
      
      // Set appropriate content type headers based on file extension first, then fallback to stored MIME type
      const fileExt = file.filename.split('.').pop()?.toLowerCase();
      let contentType = 'application/octet-stream'; // Default fallback
      
      // Determine content type by extension first (more reliable)
      if (fileExt === 'mp4') {
        contentType = 'video/mp4';
      } else if (fileExt === 'webm') {
        contentType = 'video/webm';
      } else if (fileExt === 'mp3') {
        contentType = 'audio/mpeg';
      } else if (fileExt === 'wav') {
        contentType = 'audio/wav';
      } else if (fileExt === 'pdf') {
        contentType = 'application/pdf';
      } else if (fileExt === 'jpg' || fileExt === 'jpeg') {
        contentType = 'image/jpeg';
      } else if (fileExt === 'png') {
        contentType = 'image/png';
      } else if (fileExt === 'gif') {
        contentType = 'image/gif';
      } else if (fileExt === 'webp') {
        contentType = 'image/webp';
      } else if (fileExt === 'svg') {
        contentType = 'image/svg+xml';
      } else if (file.fileType && file.fileType !== 'video' && file.fileType !== 'audio') {
        // If we didn't match by extension but have a valid MIME type in the database, use that
        contentType = file.fileType;
      }
      
      // Set content type header
      res.setHeader('Content-Type', contentType);
      
      // Set additional headers to help with streaming and caching
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache
      
      // Explicitly set Cross-Origin headers to allow browser media playback
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      
      // For video files, check if optimized H.264 720p version is available
      let fileToServe = file.filePath;
      let finalContentType = contentType;
      
      if (contentType.startsWith('video/')) {
        console.log(`[PRODUCTION SHARE] Video file detected, checking for optimized versions...`);
        
        try {
          const processing = await storage.getVideoProcessing(file.id);
          if (processing && processing.status === 'completed' && processing.qualities) {
            const quality720p = processing.qualities.find((q: any) => q.resolution === '720p');
            
            // For Docker environments, try multiple potential paths for 720p files
            const potentialPaths = [];
            
            if (quality720p && typeof quality720p.path === 'string') {
              // Original path from database
              potentialPaths.push(quality720p.path);
              
              // Convert dev path to Docker path
              if (quality720p.path.includes('/home/runner/workspace/uploads')) {
                potentialPaths.push(quality720p.path.replace('/home/runner/workspace/uploads', '/app/uploads'));
              }
              
              // Standard Docker path structure
              const fileName = `${path.parse(file.filename).name}_720p.mp4`;
              potentialPaths.push(`/app/uploads/processed/${file.id}/qualities/${fileName}`);
            }
            
            console.log(`[PRODUCTION SHARE] Checking ${potentialPaths.length} potential 720p paths for file ${file.id}`);
            
            // Try each potential path until we find a working one
            let foundValidFile = false;
            for (const testPath of potentialPaths) {
              try {
                console.log(`[PRODUCTION SHARE] Testing path: ${testPath}`);
                const fileExists = await fileSystem.fileExists(testPath);
                if (fileExists) {
                  const stats = await fs.promises.stat(testPath);
                  if (stats.size > 0) {
                    fileToServe = testPath;
                    finalContentType = 'video/mp4';
                    foundValidFile = true;
                    console.log(`[PRODUCTION SHARE] ✅ Found valid 720p file: ${testPath} (${stats.size} bytes)`);
                    break;
                  } else {
                    console.log(`[PRODUCTION SHARE] ❌ File exists but empty: ${testPath}`);
                  }
                } else {
                  console.log(`[PRODUCTION SHARE] ❌ File not found: ${testPath}`);
                }
              } catch (pathError) {
                console.log(`[PRODUCTION SHARE] ❌ Error checking path ${testPath}:`, pathError.message);
              }
            }
            
            if (!foundValidFile) {
              console.log(`[PRODUCTION SHARE] No valid 720p version found, using original file`);
            }
          } else {
            console.log(`[PRODUCTION SHARE] No video processing data or not completed, using original file`);
          }
        } catch (processingError) {
          console.error(`[PRODUCTION SHARE] Error checking video processing:`, processingError);
          console.log(`[PRODUCTION SHARE] Falling back to original file`);
        }
      }
      
      // Update content type header if changed
      if (finalContentType !== contentType) {
        res.setHeader('Content-Type', finalContentType);
      }
      
      // Log that we're sending the file
      console.log(`[PRODUCTION SHARE] Serving file ${file.id} (${file.filename}) - type: ${finalContentType}, path: ${fileToServe}`);
      
      // Verify final file exists before attempting to send
      try {
        console.log(`[PRODUCTION SHARE] Final verification - checking file: ${fileToServe}`);
        const finalFileExists = await fileSystem.fileExists(fileToServe);
        if (!finalFileExists) {
          console.error(`[PRODUCTION SHARE] ❌ Final file missing: ${fileToServe}`);
          return res.status(404).send('File not found');
        }
        
        const finalStats = await fs.promises.stat(fileToServe);
        console.log(`[PRODUCTION SHARE] Final file confirmed: ${fileToServe} (${finalStats.size} bytes)`);
      } catch (finalCheckError) {
        console.error(`[PRODUCTION SHARE] ❌ Final file check failed:`, finalCheckError);
        return res.status(500).send('File system error');
      }

      // Send the file content with proper options
      res.sendFile(fileToServe, { 
        root: '/',
        headers: {
          'Content-Type': finalContentType,
          'Accept-Ranges': 'bytes'
        }
      }, (err) => {
        if (err) {
          console.error(`[PRODUCTION SHARE] ❌ Error sending file: ${err.message}`);
          console.error(`[PRODUCTION SHARE] Error details:`, {
            code: err.code,
            path: fileToServe,
            contentType: finalContentType
          });
          if (!res.headersSent) {
            res.status(500).send('Error serving file');
          }
        } else {
          console.log(`[PRODUCTION SHARE] ✅ File sent successfully: ${fileToServe}`);
        }
      });
    } catch (error) {
      next(error);
    }
  });

  // Serve file content through share token (for attached images in comments)
  app.get("/api/share/:token/files/:fileId/content", async (req, res, next) => {
    try {
      const token = req.params.token;
      const fileId = parseInt(req.params.fileId);
      
      console.log(`[SHARE FILE] Request for file ${fileId} via token: ${token}`);
      
      // Find the main shared file by token to validate access
      const files = await storage.getAllFiles();
      const sharedFile = files.find((f: StorageFile) => f.shareToken === token);
      
      if (!sharedFile) {
        console.error(`[SHARE FILE] Invalid share token: ${token}`);
        return res.status(404).json({ message: "Share link not found" });
      }
      
      // Get the requested file
      const requestedFile = await storage.getFile(fileId);
      if (!requestedFile) {
        console.error(`[SHARE FILE] File not found: ${fileId}`);
        return res.status(404).json({ message: "File not found" });
      }
      
      // Check if the requested file belongs to the same project as the shared file
      if (requestedFile.projectId !== sharedFile.projectId) {
        console.error(`[SHARE FILE] File ${fileId} not in same project as shared file`);
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Check if file is available
      if (requestedFile.isAvailable === false) {
        console.log(`[SHARE FILE] File marked as unavailable: ${fileId}`);
        return res.status(404).json({ message: "File not available" });
      }
      
      // Check if the file physically exists
      const fileExists = await fileSystem.fileExists(requestedFile.filePath);
      if (!fileExists) {
        console.error(`[SHARE FILE] Physical file not found: ${requestedFile.filePath}`);
        return res.status(404).json({ message: "File not found" });
      }
      
      // Set appropriate content type
      const fileExt = requestedFile.filename.split('.').pop()?.toLowerCase();
      let contentType = 'application/octet-stream';
      
      if (fileExt === 'png') {
        contentType = 'image/png';
      } else if (fileExt === 'jpg' || fileExt === 'jpeg') {
        contentType = 'image/jpeg';
      } else if (fileExt === 'gif') {
        contentType = 'image/gif';
      } else if (fileExt === 'webp') {
        contentType = 'image/webp';
      } else if (fileExt === 'svg') {
        contentType = 'image/svg+xml';
      } else if (requestedFile.fileType === 'image') {
        contentType = 'image/png'; // Default for images
      }
      
      // Set headers
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      
      console.log(`[SHARE FILE] Serving file ${fileId} (${requestedFile.filename}) - type: ${contentType}`);
      
      // Send the file
      res.sendFile(requestedFile.filePath, { 
        root: '/',
        headers: {
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes'
        }
      }, (err) => {
        if (err) {
          console.error(`[SHARE FILE] Error sending file: ${err.message}`);
          if (!res.headersSent) {
            res.status(500).json({ message: "Error serving file" });
          }
        } else {
          console.log(`[SHARE FILE] File sent successfully`);
        }
      });
    } catch (error) {
      next(error);
    }
  });
  
  // Create public share link
  app.post("/api/files/:fileId/share", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const file = await storage.getFile(fileId);
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Check if user has access to the project
      if (req.user && req.user.role !== "admin") {
        const projectUser = await storage.getProjectUser(file.projectId, req.user.id);
        if (!projectUser) {
          return res.status(403).json({ message: "You don't have access to this file" });
        }
      }
      
      // Generate a random token if one doesn't exist
      if (!file.shareToken) {
        const token = generateToken(32);
        await storage.updateFile(fileId, { shareToken: token });
        file.shareToken = token;
      }
      
      // Return share URL
      const shareUrl = `${req.protocol}://${req.get('host')}/share/${file.shareToken}`;
      res.json({ shareUrl });
    } catch (error) {
      next(error);
    }
  });

  // Send share link via email
  app.post("/api/files/:fileId/share/email", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const { recipientEmail, message } = req.body;
      
      if (!recipientEmail) {
        return res.status(400).json({ message: "Recipient email is required" });
      }
      
      const file = await storage.getFile(fileId);
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Check if user has access to the project
      if (req.user && req.user.role !== "admin") {
        const projectUser = await storage.getProjectUser(file.projectId, req.user.id);
        if (!projectUser) {
          return res.status(403).json({ message: "You don't have access to this file" });
        }
      }
      
      // Generate a random token if one doesn't exist
      if (!file.shareToken) {
        const token = generateToken(32);
        await storage.updateFile(fileId, { shareToken: token });
        file.shareToken = token;
      }
      
      // Generate share URL
      const shareUrl = `${req.protocol}://${req.get('host')}/share/${file.shareToken}`;
      
      // Send email
      const { sendShareLinkEmail } = await import('./utils/sendgrid');
      const emailSent = await sendShareLinkEmail(
        recipientEmail,
        req.user.name || req.user.username,
        file.filename,
        shareUrl,
        message
      );
      
      if (emailSent) {
        res.json({ 
          message: "Share link sent successfully",
          shareUrl 
        });
      } else {
        res.status(500).json({ message: "Failed to send email" });
      }
    } catch (error) {
      next(error);
    }
  });

  // Delete a file
  app.delete("/api/files/:fileId", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const file = await storage.getFile(fileId);
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Check if user has edit access to the project
      if (req.user.role !== "admin") {
        const projectUser = await storage.getProjectUser(file.projectId, req.user.id);
        if (!projectUser || projectUser.role !== "editor") {
          return res.status(403).json({ message: "You don't have permission to delete this file" });
        }
      }
      
      // Log activity before deletion
      await storage.logActivity({
        action: "delete",
        entityType: "file",
        entityId: file.id,
        userId: req.user.id,
        metadata: { 
          projectId: file.projectId,
          filename: file.filename,
        },
      });
      
      // Comprehensive filesystem cleanup - remove original file and all processed versions
      console.log(`[FILE DELETE] Starting comprehensive cleanup for file ${fileId}: ${file.filename}`);
      const cleanupResult = await fileSystem.removeFileCompletely(file.id, file.filePath);
      
      // Check if filesystem cleanup had any critical failures
      if (!cleanupResult.original && !cleanupResult.processed) {
        console.error(`[FILE DELETE] Critical filesystem cleanup failure for file ${fileId}`);
        return res.status(409).json({ 
          message: "Failed to remove file from filesystem. Database not modified to prevent orphaned records." 
        });
      }
      
      // Log filesystem cleanup results
      if (!cleanupResult.original) {
        console.warn(`[FILE DELETE] Failed to remove original file: ${file.filePath}`);
      }
      if (!cleanupResult.processed) {
        console.warn(`[FILE DELETE] Failed to remove processed directory for file ${fileId}`);
      }
      
      // Delete file record from database (this will cascade to related records with our schema)
      const success = await storage.deleteFile(fileId);
      
      if (!success) {
        return res.status(404).json({ message: "File not found" });
      }
      
      console.log(`[FILE DELETE] ✅ Successfully deleted file ${fileId}: ${file.filename}`);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  // ===== MARKER EXPORT ROUTES =====
  app.get("/api/files/:fileId/export/:format", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      if (isNaN(fileId)) return res.status(400).json({ message: "Invalid file ID" });
      const format = req.params.format;

      if (!['xml', 'edl', 'csv'].includes(format)) {
        return res.status(400).json({ message: "Unsupported format. Use xml, edl, or csv." });
      }

      const file = await storage.getFile(fileId);
      if (!file) return res.status(404).json({ message: "File not found" });

      // Read access is open to any authenticated user.

      const comments = await storage.getUnifiedCommentsByFileV2(fileId);
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
      const baseName = file.filename.replace(/\.[^.]+$/, '');

      if (format === 'xml') {
        const xml = generateFCPXML(file.filename, duration, topLevel, fps);
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}_markers.xml"`);
        return res.send(xml);
      } else if (format === 'edl') {
        const edl = generateEDL(file.filename, duration, topLevel, fps);
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}_markers.edl"`);
        return res.send(edl);
      } else {
        const csv = generateCSV(topLevel, fps);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}_markers.csv"`);
        return res.send(csv);
      }
    } catch (error) {
      next(error);
    }
  });

  // ===== COMMENT ROUTES =====
  // Get comments for a file
  app.get("/api/files/:fileId/comments", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      console.log(`🔍 [COMMENT API] GET /api/files/${fileId}/comments requested by user ${req.user.id}`);
      
      const file = await storage.getFile(fileId);
      
      if (!file) {
        console.log(`🔍 [COMMENT API] File ${fileId} not found`);
        return res.status(404).json({ message: "File not found" });
      }
      
      // Read access is open to any authenticated user.
      
      console.log(`🔍 [COMMENT API] User ${req.user.id} authorized for file ${fileId}, fetching comments...`);
      
      // Get unified comments (includes both regular and public comments)
      const comments = await storage.getUnifiedCommentsByFileV2(fileId);
      // Strip creatorToken from response for security
      const sanitizedComments = comments.map(comment => {
        const { creatorToken, ...sanitizedComment } = comment;
        return sanitizedComment;
      });
      
      console.log(`🔍 [COMMENT API] Returning ${comments.length} comments for file ${fileId}`);
      res.json(sanitizedComments);
    } catch (error) {
      console.error(`🔍 [COMMENT API] Error getting comments for file ${req.params.fileId}:`, error);
      next(error);
    }
  });

  // Add a comment to a file
  app.post("/api/files/:fileId/comments", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      console.log(`🔍 [COMMENT API] POST /api/files/${fileId}/comments requested by user ${req.user.id}`);
      console.log(`🔍 [COMMENT API] Request body:`, JSON.stringify(req.body));
      
      const file = await storage.getFile(fileId);
      
      if (!file) {
        console.log(`🔍 [COMMENT API] File ${fileId} not found for comment creation`);
        return res.status(404).json({ message: "File not found" });
      }
      
      // Any authenticated user may comment (Frame.io-style collaboration).
      
      console.log(`🔍 [COMMENT API] User ${req.user.id} authorized for file ${fileId}, validating comment data...`);
      
      // Validate unified comment data for authenticated comment
      const validationResult = insertCommentsUnifiedSchema.safeParse({
        ...req.body,
        fileId,
        userId: req.user.id,
        isPublic: false, // Authenticated comments are not public
        authorName: req.user.name || req.user.username, // Use user's name or username
        authorEmail: req.user.email // Include user's email
      });
      
      if (!validationResult.success) {
        console.log(`🔍 [COMMENT API] Validation failed:`, validationResult.error.errors);
        return res.status(400).json({ 
          message: "Invalid comment data", 
          errors: validationResult.error.errors 
        });
      }
      
      console.log(`🔍 [COMMENT API] Validation passed, comment data:`, JSON.stringify(validationResult.data));
      
      // Create the unified comment (parentId validation handled automatically by storage layer)
      const comment = await storage.createUnifiedComment(validationResult.data);
      
      // Get user details
      const { password, ...userWithoutPassword } = req.user;
      
      // Include user in response
      const commentWithUser = {
        ...comment,
        user: userWithoutPassword,
      };
      
      // Log activity
      await storage.logActivity({
        action: "comment",
        entityType: "file",
        entityId: fileId,
        userId: req.user.id,
        metadata: { 
          projectId: file.projectId,
          commentId: comment.id,
          isReply: !!validationResult.data.parentId,
        },
      });
      
      res.status(201).json(commentWithUser);
    } catch (error) {
      console.error("Error creating authenticated comment:", error);
      
      // Handle validation errors specifically
      if (error.message?.includes("Parent comment does not exist") || 
          error.message?.includes("Parent comment must belong to the same file") ||
          error.message?.includes("cycle in the comment thread")) {
        return res.status(400).json({ 
          message: "Invalid comment data", 
          details: error.message 
        });
      }
      
      next(error);
    }
  });

  // Update a comment (resolve/unresolve)
  app.patch("/api/comments/:commentId", isAuthenticated, async (req, res, next) => {
    try {
      const commentId = req.params.commentId; // UUID string now
      const comment = await storage.getUnifiedComment(commentId);
      
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      // Explicitly reject public comment edits
      if (comment.isPublic) {
        return res.status(400).json({ message: "Public comments cannot be edited. Only authenticated comments can be updated." });
      }
      
      // Check if user is the comment author or has edit access to the project
      const file = await storage.getFile(comment.fileId);
      
      if (!file) {
        return res.status(404).json({ message: "Associated file not found" });
      }
      
      // For unified comments: check if user owns the comment (authenticated) or is admin
      let hasPermission = false;
      if (req.user.role === "admin") {
        hasPermission = true;
      } else if (!comment.isPublic && comment.userId === req.user.id) {
        hasPermission = true; // User owns their authenticated comment
      } else if (!comment.isPublic) {
        // For authenticated comments, also check project edit access
        const projectUser = await storage.getProjectUser(file.projectId, req.user.id);
        hasPermission = !!projectUser && projectUser.role === "editor";
      }
      // Note: Public comments cannot be updated via this route
      
      if (!hasPermission) {
        return res.status(403).json({ message: "You don't have permission to update this comment" });
      }
      
      // Only allow updating specific fields
      const allowedUpdates = ["isResolved", "content"];
      const updates: Record<string, any> = {};
      
      for (const field of allowedUpdates) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      // Restrict content edits to the comment author (admins/editors can still resolve)
      if (updates.content !== undefined) {
        if (typeof updates.content !== "string" || !updates.content.trim()) {
          return res.status(400).json({ message: "Content cannot be empty" });
        }
        if (comment.userId !== req.user.id) {
          return res.status(403).json({ message: "Only the author can edit a comment's content" });
        }
        updates.content = updates.content.trim();
      }
      
      // Update the unified comment
      const updatedComment = await storage.updateUnifiedComment(commentId, updates);
      
      if (!updatedComment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      // Log activity
      await storage.logActivity({
        action: updatedComment.isResolved ? "resolve_comment" : "unresolve_comment",
        entityType: "comment",
        entityId: commentId,
        userId: req.user.id,
        metadata: { 
          fileId: comment.fileId,
          projectId: file.projectId,
        },
      });
      
      // Get user details
      const user = await storage.getUser(updatedComment.userId);
      let commentWithUser = updatedComment;
      
      if (user) {
        const { password, ...userWithoutPassword } = user;
        commentWithUser = {
          ...updatedComment,
          user: userWithoutPassword,
        };
      }
      
      res.json(commentWithUser);
    } catch (error) {
      next(error);
    }
  });

  // Delete a comment
  app.delete("/api/comments/:commentId", isAuthenticated, async (req, res, next) => {
    try {
      const commentId = req.params.commentId; // UUID string now
      const comment = await storage.getUnifiedComment(commentId);
      
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      // Authorization check: user must own the comment OR be an admin
      if (comment.isPublic) {
        // For public comments: only admins can delete via this endpoint (moderation)
        if (req.user.role !== "admin") {
          return res.status(400).json({ message: "Use the public comment deletion endpoint for public comments" });
        }
      } else {
        // For authenticated comments: user must own it OR be admin
        if (comment.userId !== req.user.id && req.user.role !== "admin") {
          return res.status(403).json({ message: "You don't have permission to delete this comment" });
        }
      }
      
      // Log activity before deletion (entity_id is integer; use fileId, keep UUID in metadata)
      try {
        await storage.logActivity({
          action: "delete_comment",
          entityType: "comment",
          entityId: comment.fileId,
          userId: req.user.id,
          metadata: { 
            fileId: comment.fileId,
            commentId,
          },
        });
      } catch (logErr) {
        console.error("Failed to log delete_comment activity:", logErr);
      }
      
      // Delete the unified comment
      const success = await storage.deleteUnifiedComment({
        id: commentId,
        byUserId: comment.isPublic ? undefined : req.user!.id, // Only pass userId for auth comments
        byAdminUserId: comment.isPublic ? req.user!.id : undefined // Pass admin ID for public comment moderation
      });
      
      if (!success) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  // Delete a public comment (requires creatorToken for authorization)
  app.delete("/api/public-comments/:commentId", async (req, res, next) => {
    try {
      const commentId = req.params.commentId; // UUID string now
      const { creatorToken } = req.body;
      
      // Check if the unified comment exists first
      const comment = await storage.getUnifiedComment(commentId);
      
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      // Check if it's actually a public comment
      if (!comment.isPublic) {
        return res.status(400).json({ message: "This is not a public comment" });
      }
      
      // Check authorization: only allow deletion if creatorToken matches
      // For backward compatibility, if comment has no creatorToken, deny deletion
      if (!comment.creatorToken || !creatorToken) {
        return res.status(403).json({ message: "You don't have permission to delete this comment" });
      }
      
      if (comment.creatorToken !== creatorToken) {
        return res.status(403).json({ message: "You don't have permission to delete this comment" });
      }
      
      // Delete the unified comment
      const success = await storage.deleteUnifiedComment({
        id: commentId,
        byCreatorToken: creatorToken
      });
      
      if (!success) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  // Edit a public comment's content (requires creatorToken for authorization)
  app.patch("/api/public-comments/:commentId", async (req, res, next) => {
    try {
      const commentId = req.params.commentId;
      const { creatorToken, content } = req.body || {};

      const comment = await storage.getUnifiedComment(commentId);
      if (!comment) return res.status(404).json({ message: "Comment not found" });
      if (!comment.isPublic) return res.status(400).json({ message: "This is not a public comment" });
      if (!comment.creatorToken || !creatorToken || comment.creatorToken !== creatorToken) {
        return res.status(403).json({ message: "You don't have permission to edit this comment" });
      }
      if (typeof content !== "string" || !content.trim()) {
        return res.status(400).json({ message: "Content cannot be empty" });
      }

      const updated = await storage.updateUnifiedComment(commentId, { content: content.trim() });
      if (!updated) return res.status(404).json({ message: "Comment not found" });

      // Strip creatorToken from response
      const { creatorToken: _ct, ...safe } = updated as any;
      res.json(safe);
    } catch (error) {
      next(error);
    }
  });

  // ===== COMMENT REACTIONS ROUTES =====
  // Add reaction to a comment
  app.post("/api/comments/:commentId/reactions", async (req, res, next) => {
    try {
      const commentId = req.params.commentId;
      const { reactionType, creatorToken, visitorToken } = req.body;
      
      // Check if the comment exists
      const comment = await storage.getUnifiedComment(commentId);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      let userId = null;
      let authToken = null;
      
      // Handle authentication - either authenticated user or anonymous visitor
      if (req.user) {
        userId = req.user.id;
      } else {
        // For anonymous users, use visitorToken (not creatorToken)
        authToken = visitorToken || creatorToken;
        if (!authToken) {
          return res.status(401).json({ message: "Authentication required" });
        }
      }
      
      // Validate reaction type
      const validReactions = ["👍", "❤️", "👏", "🎉", "😮", "😢", "😡"];
      if (!validReactions.includes(reactionType)) {
        return res.status(400).json({ message: "Invalid reaction type" });
      }
      
      // Add or update reaction
      const reaction = await storage.addCommentReaction({
        commentId,
        userId,
        creatorToken: authToken,
        reactionType
      });
      
      res.status(201).json(reaction);
    } catch (error) {
      next(error);
    }
  });
  
  // Remove reaction from a comment
  app.delete("/api/comments/:commentId/reactions", async (req, res, next) => {
    try {
      const commentId = req.params.commentId;
      const { reactionType, creatorToken, visitorToken } = req.body;
      
      if (!reactionType) {
        return res.status(400).json({ message: "reactionType is required" });
      }
      
      let userId = null;
      let authToken = null;
      
      // Handle authentication - either authenticated user or anonymous visitor
      if (req.user) {
        userId = req.user.id;
      } else {
        // For anonymous users, use visitorToken (not creatorToken)
        authToken = visitorToken || creatorToken;
        if (!authToken) {
          return res.status(401).json({ message: "Authentication required" });
        }
      }
      
      const success = await storage.removeCommentReaction({
        commentId,
        userId,
        creatorToken: authToken,
        reactionType
      });
      
      if (!success) {
        return res.status(404).json({ message: "Reaction not found" });
      }
      
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  
  // Get reactions for a comment
  app.get("/api/comments/:commentId/reactions", async (req, res, next) => {
    try {
      const commentId = req.params.commentId;
      const includeUsers = req.query.includeUsers === 'true';
      
      // Check if the comment exists
      const comment = await storage.getUnifiedComment(commentId);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      // Get visitor token from headers or query params for anonymous users
      const visitorToken = req.get('X-Visitor-Token') || req.query.visitorToken as string;
      
      // Determine user identity
      let userId: number | undefined;
      let authToken: string | undefined;
      
      if (req.user) {
        userId = req.user.id;
      } else if (visitorToken) {
        authToken = visitorToken;
      }
      
      // Return detailed user information if requested
      if (includeUsers) {
        const reactions = await storage.getCommentReactionsWithUsers(commentId, userId, authToken);
        res.json(reactions);
      } else {
        const reactions = await storage.getCommentReactionsWithUserStatus(commentId, userId, authToken);
        res.json(reactions);
      }
    } catch (error) {
      next(error);
    }
  });
  
  // Mark comment as resolved/unresolved
  app.patch("/api/comments/:commentId/resolve", async (req, res, next) => {
    try {
      const commentId = req.params.commentId;
      const { isResolved } = req.body;
      
      if (typeof isResolved !== 'boolean') {
        return res.status(400).json({ message: "isResolved must be a boolean" });
      }
      
      // Check if the comment exists
      const comment = await storage.getUnifiedComment(commentId);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      // For authenticated users, check project access
      if (req.user) {
        const file = await storage.getFile(comment.fileId);
        if (!file) {
          return res.status(404).json({ message: "File not found" });
        }
        
        const projectUser = await storage.getProjectUser(file.projectId, req.user.id);
        if (!projectUser && req.user.role !== "admin") {
          return res.status(403).json({ message: "You don't have access to this project" });
        }
      } else {
        // For public comments, only allow if it's a public comment
        if (!comment.isPublic) {
          return res.status(403).json({ message: "Authentication required to resolve private comments" });
        }
      }
      
      const updatedComment = await storage.updateUnifiedComment(commentId, { isResolved });
      
      if (!updatedComment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      res.json(updatedComment);
    } catch (error) {
      next(error);
    }
  });

  // ===== APPROVAL ROUTES =====
  // Get approvals for a file
  app.get("/api/files/:fileId/approvals", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const file = await storage.getFile(fileId);
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Read access is open to any authenticated user.
      
      const approvals = await storage.getApprovalsByFile(fileId);
      
      // Get user details for each approval
      const approvalsWithUsers = await Promise.all(
        approvals.map(async (approval) => {
          const user = await storage.getUser(approval.userId);
          
          if (!user) return approval;
          
          // Remove password from user object
          const { password, ...userWithoutPassword } = user;
          
          return {
            ...approval,
            user: userWithoutPassword,
          };
        })
      );
      
      res.json(approvalsWithUsers);
    } catch (error) {
      next(error);
    }
  });

  // Add or update approval for a file
  app.post("/api/files/:fileId/approvals", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const file = await storage.getFile(fileId);
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Any authenticated user may approve / request changes (Frame.io-style review).
      
      // Validate approval data
      const validationResult = insertApprovalSchema.safeParse({
        ...req.body,
        fileId,
        userId: req.user.id,
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid approval data", 
          errors: validationResult.error.errors 
        });
      }
      
      // Check if user already has an approval for this file
      const existingApproval = await storage.getApprovalByUserAndFile(req.user.id, fileId);
      
      let approval;
      
      if (existingApproval) {
        // Update existing approval
        approval = await storage.updateApproval(existingApproval.id, validationResult.data);
      } else {
        // Create new approval
        approval = await storage.createApproval(validationResult.data);
      }
      
      // Get user details
      const { password, ...userWithoutPassword } = req.user;
      
      // Include user in response
      const approvalWithUser = {
        ...approval,
        user: userWithoutPassword,
      };
      
      // If all editors have approved, update project status
      if (validationResult.data.status === "approved") {
        const project = await storage.getProject(file.projectId);
        if (project) {
          // Get project editors
          const projectUsers = await storage.getProjectUsers(file.projectId);
          const editorIds = projectUsers
            .filter(pu => pu.role === "editor" || pu.role === "admin")
            .map(pu => pu.userId);
          
          // Get approvals for this file
          const approvals = await storage.getApprovalsByFile(fileId);
          const approvedEditorIds = approvals
            .filter(a => a.status === "approved")
            .map(a => a.userId);
          
          // Check if all editors have approved
          const allEditorsApproved = editorIds.every(id => approvedEditorIds.includes(id));
          
          if (allEditorsApproved) {
            await storage.updateProject(file.projectId, { status: "approved" });
          }
        }
      } else if (validationResult.data.status === "requested_changes") {
        // If changes are requested, update project status
        await storage.updateProject(file.projectId, { status: "in_progress" });
      }
      
      // Log activity
      await storage.logActivity({
        action: validationResult.data.status === "approved" ? "approve" : "request_changes",
        entityType: "file",
        entityId: fileId,
        userId: req.user.id,
        metadata: { 
          projectId: file.projectId,
          status: validationResult.data.status,
        },
      });
      
      // Send email notification to project members if SendGrid API key is available
      if (process.env.SENDGRID_API_KEY) {
        try {
          // Import the sendApprovalEmail function from utils/sendgrid
          const { sendApprovalEmail } = await import('./utils/sendgrid');
          
          // Get all users in the project
          const projectUsers = await storage.getProjectUsers(file.projectId);
          const project = await storage.getProject(file.projectId);
          
          if (project && projectUsers.length > 0) {
            // Get emails of all project members except the current user
            const userPromises = projectUsers
              .filter(pu => pu.userId !== req.user.id) // Exclude the current user
              .map(async pu => {
                const user = await storage.getUser(pu.userId);
                return user;
              });
            
            const users = await Promise.all(userPromises);
            const validUsers = users.filter(Boolean);
            
            console.log(`Sending approval notification emails to ${validUsers.length} project members`);
            
            // Send emails in parallel
            if (validUsers.length > 0) {
              // Get the base URL from the request (if provided in headers)
              const appUrl = req.headers.origin || undefined;
              
              // Send email to each project member
              const emailPromises = validUsers.map(user => {
                return sendApprovalEmail(
                  user.email,
                  req.user.name,
                  project.name,
                  file.filename,
                  validationResult.data.status,
                  validationResult.data.feedback,
                  appUrl,
                  file.projectId
                );
              });
              
              // Wait for all emails to be sent
              const emailResults = await Promise.all(emailPromises);
              const sentCount = emailResults.filter(Boolean).length;
              
              console.log(`Successfully sent ${sentCount} of ${emailResults.length} approval notification emails`);
            }
          }
        } catch (emailError) {
          console.error('Error sending approval notification emails:', emailError);
          // Don't fail the request if emails fail to send
        }
      }
      
      res.status(201).json(approvalWithUser);
    } catch (error) {
      next(error);
    }
  });
  
  // Alternative endpoint for approving files (used by the client)
  app.post("/api/files/:fileId/approve", isAuthenticated, async (req, res, next) => {
    try {
      // Log request to help debug
      console.log("Approval request received for file", req.params.fileId, "with status", req.body.status);
      
      const fileId = parseInt(req.params.fileId);
      const file = await storage.getFile(fileId);
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Any authenticated user may approve / request changes (Frame.io-style review).
      
      // Format the data for the approval schema
      const approvalData = {
        fileId,
        userId: req.user.id,
        status: req.body.status,
        feedback: req.body.feedback || null
      };
      
      // Validate approval data
      const validationResult = insertApprovalSchema.safeParse(approvalData);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid approval data", 
          errors: validationResult.error.errors 
        });
      }
      
      // Check if user already has an approval for this file
      const existingApproval = await storage.getApprovalByUserAndFile(req.user.id, fileId);
      
      let approval;
      
      if (existingApproval) {
        // Update existing approval
        approval = await storage.updateApproval(existingApproval.id, validationResult.data);
        console.log(`Updated existing approval (ID: ${existingApproval.id}) for file ${fileId}`);
      } else {
        // Create new approval
        approval = await storage.createApproval(validationResult.data);
        console.log(`Created new approval for file ${fileId}`);
      }
      
      // Get user details
      const { password, ...userWithoutPassword } = req.user;
      
      // Include user in response
      const approvalWithUser = {
        ...approval,
        user: userWithoutPassword,
      };
      
      // Update project status based on approval/rejection
      if (validationResult.data.status === "approved") {
        const project = await storage.getProject(file.projectId);
        if (project) {
          console.log(`Processing approval for project ${project.id}`);
          
          // Get project editors
          const projectUsers = await storage.getProjectUsers(file.projectId);
          const editorIds = projectUsers
            .filter(pu => pu.role === "editor" || pu.role === "admin")
            .map(pu => pu.userId);
          
          console.log(`Project has ${editorIds.length} editors that need to approve`);
          
          // Get approvals for this file
          const approvals = await storage.getApprovalsByFile(fileId);
          const approvedEditorIds = approvals
            .filter(a => a.status === "approved")
            .map(a => a.userId);
          
          console.log(`File has ${approvedEditorIds.length} editor approvals so far`);
          
          // Check if all editors have approved
          const allEditorsApproved = editorIds.every(id => approvedEditorIds.includes(id));
          
          if (allEditorsApproved) {
            console.log(`All editors have approved file ${fileId}, updating project status to 'approved'`);
            await storage.updateProject(file.projectId, { status: "approved" });
          } else {
            console.log(`Not all editors have approved yet. Waiting for more approvals.`);
          }
        }
      } else if (validationResult.data.status === "changes_requested") {
        // If changes are requested, update project status to in_progress
        console.log(`Changes requested for file ${fileId}, updating project status to 'in_progress'`);
        await storage.updateProject(file.projectId, { status: "in_progress" });
      }
      
      // Log activity
      await storage.logActivity({
        action: validationResult.data.status === "approved" ? "approve" : "request_changes",
        entityType: "file",
        entityId: fileId,
        userId: req.user.id,
        metadata: { 
          projectId: file.projectId,
          status: validationResult.data.status,
        },
      });
      
      // Return success response
      console.log(`Successfully processed ${validationResult.data.status} for file ${fileId}`);
      res.status(200).json(approvalWithUser);
    } catch (error) {
      console.error(`Error in file approval endpoint:`, error);
      next(error);
    }
  });

  // ===== SYSTEM SETTINGS ROUTES =====
  // Get system settings (admin only)
  app.get("/api/system/settings", isAdmin, async (req, res, next) => {
    try {
      // This would be replaced with actual system settings from a configuration or database
      // For now, we'll just return basic system information
      const stats = {
        systemVersion: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uploadDirectory: process.env.UPLOAD_DIR || './uploads',
        maxUploadSize: parseInt(process.env.MAX_UPLOAD_SIZE || '5368709120'), // 5GB default
        allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/quicktime', 'application/pdf'],
        serverStartTime: new Date().toISOString(),
        emailEnabled: !!process.env.SENDGRID_API_KEY
      };
      
      res.json(stats);
    } catch (error) {
      next(error);
    }
  });
  
  // DEBUG ENDPOINT: Utility endpoint to check file paths and existence
  app.get("/api/debug/files", isAdmin, async (req, res, next) => {
    try {
      console.log("Running debug file check endpoint");
      
      // Get all files from storage
      const files = await storage.getAllFiles();
      
      // Check each file's existence on disk
      const fileDetails = await Promise.all(
        files.map(async (file) => {
          const exists = await fileSystem.fileExists(file.filePath);
          
          return {
            id: file.id,
            filename: file.filename,
            filePath: file.filePath,
            fileType: file.fileType,
            projectId: file.projectId,
            isAvailable: file.isAvailable,
            exists: exists,
            absolutePath: path.resolve(file.filePath),
            uploadDir: process.env.UPLOAD_DIR || './uploads',
            currentDir: process.cwd()
          };
        })
      );
      
      res.json({
        count: files.length,
        files: fileDetails
      });
    } catch (error) {
      next(error);
    }
  });
  
  // ----------------------------------------------------------------------
  // Admin trash: list / restore / permanent-purge soft-deleted projects.
  // Folders use the same pattern. Only admins can see or act on the trash.
  // ----------------------------------------------------------------------
  app.get("/api/admin/trash", isAdmin, async (_req, res, next) => {
    try {
      const [trashedProjects, trashedFolders] = await Promise.all([
        storage.getDeletedProjects(),
        storage.getDeletedFolders(),
      ]);

      // Attach file counts per project so the trash UI can warn the admin
      // before a permanent purge.
      const projectsWithCounts = await Promise.all(trashedProjects.map(async (p) => {
        const projectFiles = await storage.getFilesByProject(p.id);
        return { ...p, fileCount: projectFiles.length };
      }));

      res.json({ projects: projectsWithCounts, folders: trashedFolders });
    } catch (e) { next(e); }
  });

  app.post("/api/admin/trash/projects/:id/restore", isAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const ok = await storage.restoreProject(id);
      if (!ok) return res.status(404).json({ message: "Project not in trash" });
      await storage.logActivity({
        action: "restore",
        entityType: "project",
        entityId: id,
        userId: req.user.id,
        metadata: {},
      });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.delete("/api/admin/trash/projects/:id", isAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });

      // SAFETY GATE: only purge projects that are actually in the trash.
      // storage.purgeProject also enforces this with a SQL guard, but we
      // verify here too so that we never unlink files belonging to a live
      // project even if the storage method ever changes. A direct DB read
      // is required because storage.getProject filters out trashed rows.
      const [target] = await db
        .select({ id: projectsTable.id, deletedAt: projectsTable.deletedAt })
        .from(projectsTable)
        .where(eq(projectsTable.id, id));
      if (!target) return res.status(404).json({ message: "Project not found" });
      if (!target.deletedAt) {
        return res.status(409).json({
          message: "Project is not in the trash. Soft-delete it first via DELETE /api/projects/:id.",
        });
      }

      // Pull file paths BEFORE the row is gone — we need them to unlink later.
      // We bypass storage.getFilesByProject because the project is soft-
      // deleted, so we fetch directly.
      const filesToRemove = await db.select().from(filesTable).where(sql`${filesTable.projectId} = ${id}`);

      // RACE-SAFE ORDER: delete the DB row FIRST. storage.purgeProject runs a
      // single SQL DELETE guarded by `deletedAt IS NOT NULL`, so it is
      // atomic against a concurrent restore. If it returns false, someone
      // restored the project in between and we MUST NOT unlink any files —
      // doing so would silently destroy media for a now-live project.
      const ok = await storage.purgeProject(id);
      if (!ok) {
        return res.status(409).json({
          message: "Project was restored by another admin while purge was running. No files were deleted.",
        });
      }

      // Row is gone; cascade has removed file rows. Now safe to unlink disk
      // files. Failures here are reported but cannot be rolled back.
      let filesystemErrors: string[] = [];
      if (filesToRemove.length > 0) {
        const cleanupResults = await fileSystem.removeMultipleFiles(
          filesToRemove.map(f => ({ id: f.id, filePath: f.filePath })),
          3,
        );
        const summary = fileSystem.summarizeCleanupResults(cleanupResults);
        filesystemErrors = summary.totalErrors;
      }

      await storage.logActivity({
        action: "purge",
        entityType: "project",
        entityId: id,
        userId: req.user.id,
        metadata: { fileCount: filesToRemove.length, filesystemErrors },
      });

      res.json({ ok: true, filesRemoved: filesToRemove.length, filesystemErrors });
    } catch (e) { next(e); }
  });

  app.post("/api/admin/trash/folders/:id/restore", isAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const ok = await storage.restoreFolder(id);
      if (!ok) return res.status(404).json({ message: "Folder not in trash" });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.delete("/api/admin/trash/folders/:id", isAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const ok = await storage.purgeFolder(id);
      if (!ok) return res.status(404).json({ message: "Folder not found" });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ----------------------------------------------------------------------
  // Project subfolders (T005): folders nested inside a single project. Reuse
  // the existing access middleware. Top-level project-grouping folders are
  // unaffected (they have project_id = NULL).
  // ----------------------------------------------------------------------
  app.get("/api/projects/:projectId/folders", hasProjectAccess, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const subfolders = await storage.getProjectFolders(projectId);
      res.json(subfolders);
    } catch (e) { next(e); }
  });

  app.post("/api/projects/:projectId/folders", hasProjectEditAccess, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const schema = z.object({
        name: z.string().min(1).max(60),
        parentFolderId: z.number().int().positive().nullable().optional(),
      });
      const parsed = schema.parse(req.body);
      // Validate parent (if given) belongs to the same project.
      if (parsed.parentFolderId) {
        const parent = await storage.getFolder(parsed.parentFolderId);
        if (!parent || parent.projectId !== projectId) {
          return res.status(400).json({ message: "Parent folder does not belong to this project" });
        }
      }
      const folder = await storage.createProjectFolder({
        projectId,
        parentFolderId: parsed.parentFolderId ?? null,
        name: parsed.name,
        createdById: req.user.id,
      });
      res.status(201).json(folder);
    } catch (e) { next(e); }
  });

  // Move a file. Two modes:
  //   - { folderId } : move into a subfolder of the SAME project (or to
  //     project root with folderId: null).
  //   - { projectId } : move the file to a DIFFERENT project. The user
  //     must have edit access on BOTH the source and target projects.
  //     Cross-project moves clear folderId because folders are scoped to
  //     a single project, so any existing folder reference would dangle.
  app.patch("/api/files/:fileId/move", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const file = await storage.getFile(fileId);
      if (!file) return res.status(404).json({ message: "File not found" });

      const sourceProject = await storage.getProject(file.projectId);
      if (!sourceProject) return res.status(404).json({ message: "Source project not found" });

      const isAdminUser = req.user.role === "admin";
      const hasEditAccess = async (projectId: number) => {
        if (isAdminUser) return true;
        const members = await storage.getProjectUsers(projectId);
        return members.some(
          (pu) => pu.userId === req.user.id && (pu.role === "admin" || pu.role === "editor"),
        );
      };

      if (!(await hasEditAccess(file.projectId))) {
        return res.status(403).json({ message: "You don't have edit access to this project" });
      }

      const schema = z.object({
        folderId: z.number().int().positive().nullable().optional(),
        projectId: z.number().int().positive().optional(),
      });
      const body = schema.parse(req.body);

      // Cross-project move
      if (body.projectId != null && body.projectId !== file.projectId) {
        const target = await storage.getProject(body.projectId);
        if (!target) return res.status(400).json({ message: "Target project not found" });
        if (!(await hasEditAccess(body.projectId))) {
          return res.status(403).json({ message: "You don't have edit access to the target project" });
        }
        // Clear folderId on cross-project moves — folders belong to a
        // single project so the old folder reference would dangle.
        const updated = await storage.updateFile(fileId, {
          projectId: body.projectId,
          folderId: null,
        } as any);
        await storage.logActivity({
          action: "move",
          entityType: "file",
          entityId: fileId,
          userId: req.user.id,
          metadata: {
            fromProjectId: file.projectId,
            toProjectId: body.projectId,
          },
        });
        return res.json(updated);
      }

      // Same-project folder move (legacy behaviour)
      if (body.folderId !== undefined) {
        if (body.folderId !== null) {
          const targetFolder = await storage.getFolder(body.folderId);
          if (!targetFolder || targetFolder.projectId !== file.projectId) {
            return res.status(400).json({ message: "Target folder does not belong to this project" });
          }
        }
        const updated = await storage.updateFile(fileId, { folderId: body.folderId } as any);
        return res.json(updated);
      }

      return res.status(400).json({ message: "Provide folderId or projectId to move the file" });
    } catch (e) { next(e); }
  });

  app.post("/api/admin/scan-files", isAdmin, async (req, res, next) => {
    try {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      console.log(`Starting file system scan on ${uploadsDir}`);
      
      // 1. Scan the uploads directory to get existing and missing files
      const scanResults = await fileSystem.scanUploadsDirectory(uploadsDir);
      
      // 2. Get all files from the database
      const allFiles = await storage.getAllFiles();
      console.log(`Found ${allFiles.length} files in database`);
      
      // 3. Track statistics
      const stats = {
        totalDatabaseFiles: allFiles.length,
        totalFileSystemFiles: scanResults.existingFiles.length + scanResults.missingFiles.length,
        missingFilesUpdated: 0,
        existingFilesUpdated: 0,
        errors: scanResults.errors
      };
      
      // 4. Mark files as unavailable if they don't exist on disk
      const updatePromises = [];
      
      for (const file of allFiles) {
        const filePath = file.filePath;
        const fileExists = scanResults.existingFiles.includes(filePath);
        
        // If file doesn't exist on disk but is marked as available, update it
        if (!fileExists && file.isAvailable !== false) {
          console.log(`Marking file ${file.id} (${file.filename}) as unavailable`);
          updatePromises.push(
            storage.updateFile(file.id, { isAvailable: false })
              .then(() => stats.missingFilesUpdated++)
              .catch(err => {
                console.error(`Error updating file ${file.id}:`, err);
                stats.errors.push(`Failed to update file ${file.id}: ${err.message}`);
              })
          );
        }
        
        // If file exists on disk but is marked as unavailable, update it
        if (fileExists && file.isAvailable === false) {
          console.log(`Marking file ${file.id} (${file.filename}) as available`);
          updatePromises.push(
            storage.updateFile(file.id, { isAvailable: true })
              .then(() => stats.existingFilesUpdated++)
              .catch(err => {
                console.error(`Error updating file ${file.id}:`, err);
                stats.errors.push(`Failed to update file ${file.id}: ${err.message}`);
              })
          );
        }
      }
      
      // 5. Wait for all updates to complete
      await Promise.allSettled(updatePromises);
      
      console.log('File system scan complete with results:', stats);
      
      res.json({
        message: 'File system scan complete',
        stats
      });
    } catch (error) {
      console.error('Error performing file system scan:', error);
      res.status(500).json({ 
        error: 'Server error during file scan',
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Force delete unlinked files (admin only)
  app.post("/api/admin/force-delete-unlinked", isAdmin, async (req, res, next) => {
    try {
      console.log("🗑️ [FORCE DELETE] Starting deletion of files not linked to any projects");
      
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      
      // Get all database files and valid projects
      const dbFiles = await storage.getAllFiles();
      const projects = await storage.getAllProjects();
      const validProjectIds = new Set(projects.map(p => p.id));
      
      let deleteResults = {
        deletedFiles: 0,
        totalFilesRemoved: 0,
        errors: [] as string[]
      };
      
      // Find files that exist on disk but have invalid project associations
      for (const dbFile of dbFiles) {
        try {
          // Check if file exists on disk
          const fileExistsOnDisk = await fileSystem.fileExists(dbFile.filePath);
          
          if (fileExistsOnDisk) {
            // Check if file is truly orphaned (no project or project no longer exists)
            const isOrphaned = !dbFile.projectId || !validProjectIds.has(dbFile.projectId);
            
            if (isOrphaned) {
              console.log(`🗑️ [FORCE DELETE] Deleting unlinked file: ${dbFile.filename} (ID: ${dbFile.id})`);
              
              // Delete the physical file and its processed versions
              const removed = await fileSystem.removeFileCompletely(dbFile.id, dbFile.filePath);
              
              if (removed.original) {
                // Remove from database
                await storage.deleteFile(dbFile.id);
                deleteResults.deletedFiles++;
                deleteResults.totalFilesRemoved++;
                console.log(`🗑️ [FORCE DELETE] Successfully deleted file ${dbFile.id}: ${dbFile.filename}`);
              } else {
                deleteResults.errors.push(`Failed to delete file: ${dbFile.filename} (${dbFile.filePath})`);
              }
            }
          }
        } catch (error) {
          console.error(`Error processing file ${dbFile.id}:`, error);
          deleteResults.errors.push(`Error processing file ${dbFile.filename}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      console.log(`🗑️ [FORCE DELETE] Completed: ${deleteResults.totalFilesRemoved} files deleted, ${deleteResults.errors.length} errors`);
      
      res.json({
        message: `Force deletion completed. Removed ${deleteResults.totalFilesRemoved} unlinked files.`,
        results: deleteResults
      });
      
    } catch (error) {
      console.error("Error during force deletion:", error);
      res.status(500).json({
        error: 'Server error during force deletion',
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Clean up orphaned files (admin only)
  app.post("/api/admin/cleanup-orphaned-files", isAdmin, async (req, res, next) => {
    try {
      console.log("🧹 [ORPHAN CLEANUP] Starting orphaned file cleanup");
      
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      const processedDir = fileSystem.joinPaths(uploadDir, 'processed');
      
      // Get all database files
      const dbFiles = await storage.getAllFiles();
      const dbFilePaths = new Set(dbFiles.map(f => f.filePath));
      const dbFileIds = new Set(dbFiles.map(f => f.id.toString()));
      
      console.log(`🧹 [ORPHAN CLEANUP] Found ${dbFiles.length} files in database`);
      console.log(`🧹 [ORPHAN CLEANUP] Database file paths:`, Array.from(dbFilePaths).slice(0, 5));
      console.log(`🧹 [ORPHAN CLEANUP] Database file IDs:`, Array.from(dbFileIds).slice(0, 5));
      
      let cleanupResults = {
        orphanedOriginals: 0,
        orphanedProcessed: 0,
        totalFilesRemoved: 0,
        errors: [] as string[]
      };
      
      // 1. Clean up orphaned original files in uploads directory
      try {
        console.log(`🧹 [ORPHAN CLEANUP] Scanning upload directory: ${uploadDir}`);
        const allFiles = await fileSystem.listFiles(uploadDir);
        console.log(`🧹 [ORPHAN CLEANUP] Found ${allFiles.length} items in upload directory:`, allFiles);
        
        for (const filename of allFiles) {
          // Skip directories and system files
          if (filename === 'processed' || filename.startsWith('.')) continue;
          
          const fullPath = fileSystem.joinPaths(uploadDir, filename);
          const stats = await fileSystem.getFileStats(fullPath);
          
          if (!stats.isDirectory()) {
            // Check if this file path is in database  
            // Convert to absolute path for comparison
            const absolutePath = path.resolve(process.cwd(), fullPath);
            const hasFullPath = dbFilePaths.has(fullPath) || dbFilePaths.has(absolutePath);
            const hasEndingMatch = Array.from(dbFilePaths).some(dbPath => dbPath.endsWith(filename));
            const isOrphaned = !hasFullPath && !hasEndingMatch;
            
            console.log(`🧹 [ORPHAN CLEANUP] Checking file: ${filename}`);
            console.log(`🧹 [ORPHAN CLEANUP] Full path: ${fullPath}`);
            console.log(`🧹 [ORPHAN CLEANUP] Has full path: ${hasFullPath}`);
            console.log(`🧹 [ORPHAN CLEANUP] Has ending match: ${hasEndingMatch}`);
            console.log(`🧹 [ORPHAN CLEANUP] Is orphaned: ${isOrphaned}`);
            
            if (isOrphaned) {
              console.log(`🧹 [ORPHAN CLEANUP] Removing orphaned original file: ${filename}`);
              const removed = await fileSystem.removeOriginalFile(fullPath);
              if (removed) {
                cleanupResults.orphanedOriginals++;
                cleanupResults.totalFilesRemoved++;
              } else {
                cleanupResults.errors.push(`Failed to remove orphaned file: ${filename}`);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error cleaning orphaned original files:", error);
        cleanupResults.errors.push(`Error scanning original files: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // 2. Clean up orphaned processed directories
      try {
        if (await fileSystem.fileExists(processedDir)) {
          const processedDirs = await fileSystem.listFiles(processedDir);
          
          for (const dirName of processedDirs) {
            // Check if this file ID exists in database
            if (!dbFileIds.has(dirName)) {
              const processedDirPath = fileSystem.joinPaths(processedDir, dirName);
              console.log(`🧹 [ORPHAN CLEANUP] Removing orphaned processed directory: ${dirName}`);
              const removed = await fileSystem.removeProcessedDirectory(parseInt(dirName));
              if (removed) {
                cleanupResults.orphanedProcessed++;
                cleanupResults.totalFilesRemoved++;
              } else {
                cleanupResults.errors.push(`Failed to remove orphaned processed directory: ${dirName}`);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error cleaning orphaned processed directories:", error);
        cleanupResults.errors.push(`Error scanning processed directories: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // 3. Clean up stale database entries (files in DB but not on disk)
      try {
        console.log(`🧹 [ORPHAN CLEANUP] Checking for stale database entries...`);
        let staleDbEntries = 0;
        
        for (const dbFile of dbFiles) {
          const fileExistsOnDisk = await fileSystem.fileExists(dbFile.filePath);
          
          if (!fileExistsOnDisk) {
            console.log(`🧹 [ORPHAN CLEANUP] Found stale DB entry for missing file: ${dbFile.filePath} (ID: ${dbFile.id})`);
            // Mark the file as unavailable instead of deleting the database record
            // This preserves project structure and metadata while marking file as missing
            await storage.updateFile(dbFile.id, { isAvailable: false });
            staleDbEntries++;
            console.log(`🧹 [ORPHAN CLEANUP] Marked file ${dbFile.id} as unavailable in database`);
          }
        }
        
        cleanupResults.totalFilesRemoved += staleDbEntries;
        console.log(`🧹 [ORPHAN CLEANUP] Marked ${staleDbEntries} stale database entries as unavailable`);
        
      } catch (error) {
        console.error("Error cleaning stale database entries:", error);
        cleanupResults.errors.push(`Error cleaning database entries: ${error instanceof Error ? error.message : String(error)}`);
      }

      console.log(`🧹 [ORPHAN CLEANUP] Completed: ${cleanupResults.totalFilesRemoved} files removed, ${cleanupResults.errors.length} errors`);
      
      res.json({
        message: `Orphaned file cleanup completed. Removed ${cleanupResults.totalFilesRemoved} orphaned files.`,
        results: {
          ...cleanupResults,
          staleDbEntries: cleanupResults.totalFilesRemoved - cleanupResults.orphanedOriginals - cleanupResults.orphanedProcessed
        }
      });
      
    } catch (error) {
      console.error("Error during orphaned file cleanup:", error);
      res.status(500).json({
        error: 'Server error during orphaned file cleanup',
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Get all uploaded files (admin only)
  app.get("/api/system/uploads", isAdmin, async (req, res, next) => {
    try {
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      
      // Read directory contents
      const files = await fileSystem.listFiles(uploadDir);
      
      // Get details for each file
      const fileDetails = await Promise.all(
        files.map(async (filename) => {
          const filePath = fileSystem.joinPaths(uploadDir, filename);
          const stats = await fileSystem.getFileStats(filePath);
          
          // Try to get file metadata from database if available
          let fileMetadata = null;
          try {
            // Find files from database that match this filename or path
            const allFiles = await storage.getAllFiles();
            const matchedFile = allFiles.find(file => 
              file.filePath.includes(filename) || 
              file.filename === filename
            );
            
            if (matchedFile) {
              // Get additional information about project and uploader
              const project = matchedFile.projectId ? await storage.getProject(matchedFile.projectId) : null;
              const uploader = matchedFile.uploadedById ? await storage.getUser(matchedFile.uploadedById) : null;
              
              fileMetadata = {
                id: matchedFile.id,
                projectId: matchedFile.projectId,
                projectName: project ? project.name : null,
                uploadedById: matchedFile.uploadedById,
                uploadedByName: uploader ? uploader.name : null
              };
            }
          } catch (err) {
            console.error("Error getting file metadata:", err);
          }
          
          return {
            filename,
            path: filePath,
            size: stats.size,
            createdAt: stats.birthtime || stats.ctime,
            modifiedAt: stats.mtime,
            isDirectory: stats.isDirectory(),
            metadata: fileMetadata
          };
        })
      );
      
      // Sort files by modified date (newest first)
      fileDetails.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
      
      res.json(fileDetails);
    } catch (error) {
      console.error("Error retrieving uploads:", error);
      next(error);
    }
  });
  
  // Delete an uploaded file (admin only)
  app.delete("/api/system/uploads/:filename", isAdmin, async (req, res, next) => {
    try {
      const { filename } = req.params;
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      
      console.log(`[DELETE] Attempting to delete file: ${filename}`);
      console.log(`[DELETE] Upload directory: ${uploadDir}`);
      
      // Prevent path traversal attacks
      const sanitizedFilename = fileSystem.sanitizeFilename(filename);
      let filePath = fileSystem.joinPaths(uploadDir, sanitizedFilename);
      
      console.log(`[DELETE] Sanitized path: ${filePath}`);
      
      // Check if file exists with better error handling
      let exists = await fileSystem.fileExists(filePath);
      if (!exists) {
        console.log(`[DELETE ERROR] File not found at path: ${filePath}`);
        
        // Try alternative path in case upload directory configuration is inconsistent
        const alternativePath = fileSystem.joinPaths('./uploads', sanitizedFilename);
        console.log(`[DELETE RETRY] Trying alternative path: ${alternativePath}`);
        
        const alternativeExists = await fileSystem.fileExists(alternativePath);
        if (alternativeExists) {
          console.log(`[DELETE RETRY] File found at alternative path! Using: ${alternativePath}`);
          // Use the alternative path if found
          filePath = alternativePath;
          exists = true;
        } else {
          // Try with workspace path
          const workspacePath = fileSystem.joinPaths('/home/runner/workspace/uploads', sanitizedFilename);
          console.log(`[DELETE RETRY] Trying workspace path: ${workspacePath}`);
          
          const workspaceExists = await fileSystem.fileExists(workspacePath);
          if (workspaceExists) {
            console.log(`[DELETE RETRY] File found at workspace path! Using: ${workspacePath}`);
            filePath = workspacePath;
            exists = true;
          } else {
            console.log(`[DELETE ERROR] File not found at any attempted paths`);
            return res.status(404).json({ message: "File not found" });
          }
        }
      }
      
      // Look for any database entries that reference this file
      const allFiles = await storage.getAllFiles();
      const matchingFiles = allFiles.filter(file => 
        (file.filePath && file.filePath.includes(sanitizedFilename)) || 
        file.filename === sanitizedFilename
      );
      
      console.log(`[DELETE] Found ${matchingFiles.length} database references to file ${sanitizedFilename}`);
      
      // Mark matching files as unavailable in the database
      if (matchingFiles.length > 0) {
        for (const file of matchingFiles) {
          console.log(`[DELETE] Marking file ID ${file.id} as unavailable`);
          await storage.updateFile(file.id, { isAvailable: false });
        }
      }
      
      // Delete the physical file with better error handling
      try {
        console.log(`[DELETE] Attempting to delete physical file at: ${filePath}`);
        await fileSystem.deleteFile(filePath);
        console.log(`[DELETE] Physical file deleted successfully`);
      } catch (deleteError) {
        console.error(`[DELETE ERROR] Failed to delete physical file:`, deleteError);
        // Continue even if physical file deletion fails, but with warning
        return res.status(207).json({
          message: "Database updated but failed to delete physical file",
          error: deleteError instanceof Error ? deleteError.message : String(deleteError),
          databaseEntriesUpdated: matchingFiles.length
        });
      }
      
      // Log activity with references to affected database entries
      try {
        await storage.logActivity({
          action: "delete",
          entityType: "file",
          entityId: matchingFiles.length > 0 ? matchingFiles[0].id : 0,
          userId: req.user?.id || 0,
          metadata: { 
            filename: sanitizedFilename,
            affectedFileIds: matchingFiles.map(f => f.id),
            filesMarkedUnavailable: matchingFiles.length
          }
        });
      } catch (logError) {
        console.error(`[DELETE WARNING] Failed to log activity:`, logError);
        // Don't fail the request if just the logging fails
      }
      
      res.json({ 
        message: "File deleted successfully", 
        databaseEntriesUpdated: matchingFiles.length
      });
    } catch (error) {
      console.error(`[DELETE ERROR] Unexpected error during file deletion:`, error);
      // Send error response instead of using next(error)
      res.status(500).json({ 
        message: "Failed to delete file", 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // ===== ACTIVITY LOG ROUTES =====
  // Enrich a list of activity rows with the actor user, the entity name
  // (file/project/folder/user), and a project name for file-scoped events.
  // We bypass storage.getProject/getFolder so soft-deleted entities still
  // resolve to their original name — the audit trail must remain readable
  // after a project is trashed.
  async function enrichActivities(activities: any[]) {
    if (activities.length === 0) return [];

    const userIds = new Set<number>();
    const fileIds = new Set<number>();
    const projectIds = new Set<number>();
    const folderIds = new Set<number>();
    const targetUserIds = new Set<number>();

    for (const a of activities) {
      if (a.userId) userIds.add(a.userId);
      const meta = (a.metadata || {}) as Record<string, any>;
      if (typeof meta.projectId === "number") projectIds.add(meta.projectId);
      if (typeof meta.fileId === "number") fileIds.add(meta.fileId);
      if (typeof meta.addedUserId === "number") targetUserIds.add(meta.addedUserId);
      if (typeof meta.removedUserId === "number") targetUserIds.add(meta.removedUserId);
      if (typeof meta.targetUserId === "number") targetUserIds.add(meta.targetUserId);
      switch (a.entityType) {
        case "file":
          if (a.entityId) fileIds.add(a.entityId);
          break;
        case "project":
          if (a.entityId) projectIds.add(a.entityId);
          break;
        case "folder":
          if (a.entityId) folderIds.add(a.entityId);
          break;
        case "user":
          if (a.entityId) targetUserIds.add(a.entityId);
          break;
      }
    }

    const allUserIds = [...new Set([...userIds, ...targetUserIds])];

    const [userRows, fileRows, projectRows, folderRows] = await Promise.all([
      allUserIds.length
        ? db.select().from(usersTable).where(inArray(usersTable.id, allUserIds))
        : Promise.resolve([] as any[]),
      fileIds.size
        ? db.select().from(filesTable).where(inArray(filesTable.id, [...fileIds]))
        : Promise.resolve([] as any[]),
      projectIds.size
        ? db.select().from(projectsTable).where(inArray(projectsTable.id, [...projectIds]))
        : Promise.resolve([] as any[]),
      folderIds.size
        ? db.select().from(foldersTable).where(inArray(foldersTable.id, [...folderIds]))
        : Promise.resolve([] as any[]),
    ]);

    const userMap = new Map<number, any>(userRows.map((u: any) => [u.id, u]));
    const fileMap = new Map<number, any>(fileRows.map((f: any) => [f.id, f]));
    // Project lookups also need to surface the file's parent project.
    for (const f of fileRows as any[]) {
      if (typeof f.projectId === "number") projectIds.add(f.projectId);
    }
    if (projectRows.length === 0 && projectIds.size > 0) {
      const extra = await db
        .select()
        .from(projectsTable)
        .where(inArray(projectsTable.id, [...projectIds]));
      for (const p of extra) projectRows.push(p);
    } else if (projectIds.size > projectRows.length) {
      const have = new Set(projectRows.map((p: any) => p.id));
      const missing = [...projectIds].filter((id) => !have.has(id));
      if (missing.length) {
        const extra = await db
          .select()
          .from(projectsTable)
          .where(inArray(projectsTable.id, missing));
        for (const p of extra) projectRows.push(p);
      }
    }
    const projectMap = new Map<number, any>(projectRows.map((p: any) => [p.id, p]));
    const folderMap = new Map<number, any>(folderRows.map((f: any) => [f.id, f]));

    return activities.map((a) => {
      const meta = (a.metadata || {}) as Record<string, any>;
      const actor = userMap.get(a.userId);
      const actorClean = actor
        ? (() => { const { password, ...rest } = actor; return rest; })()
        : null;

      let entityName: string | null = null;
      let projectName: string | null = null;
      let projectId: number | null = null;

      switch (a.entityType) {
        case "file": {
          const f = fileMap.get(a.entityId);
          entityName = f?.filename ?? meta.filename ?? null;
          projectId = f?.projectId ?? meta.projectId ?? null;
          break;
        }
        case "project": {
          const p = projectMap.get(a.entityId);
          entityName = p?.name ?? meta.projectName ?? null;
          projectId = a.entityId ?? null;
          break;
        }
        case "folder": {
          const f = folderMap.get(a.entityId);
          entityName = f?.name ?? meta.folderName ?? null;
          break;
        }
        case "user": {
          const u = userMap.get(a.entityId);
          entityName = u?.name ?? u?.username ?? meta.createdUsername ?? null;
          break;
        }
        case "comment": {
          // entityId is the file id for comment activities; surface the file name.
          const f = fileMap.get(a.entityId);
          entityName = f?.filename ?? null;
          projectId = f?.projectId ?? meta.projectId ?? null;
          break;
        }
        default:
          entityName = meta.projectName ?? meta.filename ?? meta.folderName ?? null;
      }

      if (projectId != null && projectName == null) {
        const p = projectMap.get(projectId);
        projectName = p?.name ?? meta.projectName ?? null;
      }

      // Resolve target user names referenced by metadata.
      const targetUserName =
        meta.addedUserName ??
        (meta.addedUserId && userMap.get(meta.addedUserId)?.name) ??
        (meta.removedUserId && userMap.get(meta.removedUserId)?.name) ??
        (meta.targetUserId && userMap.get(meta.targetUserId)?.name) ??
        null;

      return {
        ...a,
        user: actorClean ?? a.user,
        entityName,
        projectName,
        projectId: projectId ?? meta.projectId ?? null,
        targetUserName,
      };
    });
  }

  // Get all activity logs (admin only)
  app.get("/api/activities", isAdmin, async (req, res, next) => {
    try {
      const activities = await storage.getAllActivities();
      const enriched = await enrichActivities(activities);
      res.json(enriched);
    } catch (error) {
      next(error);
    }
  });

  // Get activity logs for a project
  app.get("/api/projects/:projectId/activities", hasProjectAccess, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const activities = await storage.getActivitiesByProject(projectId);
      const enriched = await enrichActivities(activities);
      res.json(enriched);
    } catch (error) {
      next(error);
    }
  });
  
  // Create a new invitation
  app.post("/api/invite", isAuthenticated, async (req, res, next) => {
    try {
      console.log("POST /api/invite - Starting invitation creation process");
      console.log("Request body:", JSON.stringify(req.body));
      
      const { email, projectId, role = "viewer", appUrl } = req.body;
      
      if (!email) {
        console.error("POST /api/invite - Email is required but was not provided");
        return res.status(400).json({ message: "Email is required" });
      }
      
      if (!req.user) {
        console.error("POST /api/invite - No authenticated user found");
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Log the client domain if provided
      if (appUrl) {
        console.log(`Client URL provided for invitation: ${appUrl}`);
      } else {
        console.warn("No client URL provided for invitation - using default domain");
      }
      
      // Admin invitation (system-wide) versus project-specific invitation
      const isAdminInvite = !projectId;
      console.log(`Invitation type: ${isAdminInvite ? 'System-wide (Admin)' : 'Project-specific'}`);
      console.log(`Inviting email: ${email} with role: ${role}`);
      
      // For project-specific invitations, perform additional checks
      if (!isAdminInvite) {
        console.log(`Checking project ${projectId} exists`);
        const project = await storage.getProject(parseInt(projectId));
        if (!project) {
          console.error(`Project with ID ${projectId} not found`);
          return res.status(404).json({ message: "Project not found" });
        }
        
        // Check if user has edit access to the project
        if (req.user.role !== "admin") {
          console.log(`User role is not admin, checking project-specific permissions`);
          const projectUser = await storage.getProjectUser(parseInt(projectId), req.user.id);
          if (!projectUser || !["admin", "editor"].includes(projectUser.role)) {
            console.error(`User ${req.user.id} does not have permission to invite users to project ${projectId}`);
            return res.status(403).json({ message: "You don't have permission to invite users to this project" });
          }
        }
        
        // Check if user already exists
        console.log(`Checking if user with email ${email} already exists`);
        const existingUser = await storage.getUserByEmail(email);
        
        // If user exists and is already a member of the project, return an error
        if (existingUser) {
          console.log(`User with email ${email} exists (ID: ${existingUser.id}), checking if already in project`);
          const existingMember = await storage.getProjectUser(parseInt(projectId), existingUser.id);
          if (existingMember) {
            console.error(`User ${existingUser.id} is already a member of project ${projectId}`);
            return res.status(400).json({ message: "User is already a member of this project" });
          }
        }
        
        // Check if there's already a pending invitation for this email and project
        console.log(`Checking for existing invitations for email ${email} in project ${projectId}`);
        const existingInvitations = await storage.getInvitationsByProject(parseInt(projectId));
        const alreadyInvited = existingInvitations.some(inv => inv.email === email && !inv.isAccepted);
        
        if (alreadyInvited) {
          console.error(`Email ${email} already has a pending invitation to project ${projectId}`);
          return res.status(400).json({ message: "User has already been invited to this project" });
        }
      } else {
        // For admin invitations, only admins can create them
        console.log(`System invitation - checking if user ${req.user.id} is an admin`);
        if (req.user.role !== "admin") {
          console.error(`User ${req.user.id} with role ${req.user.role} attempted to create a system invitation`);
          return res.status(403).json({ message: "Only administrators can send system-wide invitations" });
        }
        
        // Check if user already exists with this email
        console.log(`Checking if user with email ${email} already exists`);
        const existingUser = await storage.getUserByEmail(email);
        if (existingUser) {
          console.error(`User with email ${email} already exists (ID: ${existingUser.id})`);
          return res.status(400).json({ message: "A user with this email already exists in the system" });
        }
        
        // For admin invites, we should check if there's a pending global invitation
        console.log(`Checking for existing system invitations for email ${email}`);
        const allInvitations = await storage.getAllInvitations();
        const alreadyInvited = allInvitations.some(inv => 
          inv.email === email && 
          !inv.isAccepted && 
          inv.projectId === null
        );
        
        if (alreadyInvited) {
          console.error(`Email ${email} already has a pending system invitation`);
          return res.status(400).json({ message: "This email has already been invited to join the system" });
        }
      }
      
      // Generate a unique token for this invitation
      const token = generateToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Invitation expires in 7 days
      
      console.log(`Creating invitation for ${email} with token ${token.substring(0, 8)}...`);
      
      // Create the invitation (initially with emailSent as false)
      const invitation = await storage.createInvitation({
        email,
        role,
        createdById: req.user.id,
        projectId: projectId ? parseInt(projectId) : null,
        token,
        expiresAt,
        isAccepted: false,
        emailSent: false
      });
      
      console.log(`Invitation created successfully with ID ${invitation.id}`);
      
      // If SendGrid API key is available, send an email
      let emailSent = false;
      console.log(`Checking SendGrid API key availability for invitation to ${email}`);
      console.log(`API Key: SENDGRID_API_KEY ${process.env.SENDGRID_API_KEY ? 'is set' : 'is NOT set'}`);
      
      // For project-specific invitations, get the project
      let projectObj;
      if (!isAdminInvite) {
        projectObj = await storage.getProject(parseInt(projectId));
      }
      
      if (process.env.SENDGRID_API_KEY) {
        console.log(`SendGrid API key is available, preparing to send invitation email to ${email}`);
        try {
          // Import the sendInvitationEmail function from utils/sendgrid
          const { sendInvitationEmail, sendSystemInvitationEmail } = await import('./utils/sendgrid');
          
          // Get the name of the user who created the invitation
          const inviter = await storage.getUser(req.user.id);
          
          if (inviter) {
            if (isAdminInvite) {
              // This is a system-wide invitation from an admin
              console.log(`Sending system invitation email to ${email} from "${inviter.name}"`);
              
              // Send the system invitation email
              emailSent = await sendSystemInvitationEmail(
                email,
                inviter.name,
                role,
                token,
                appUrl // Pass the client app URL (undefined if not provided)
              );
              
              if (emailSent) {
                console.log(`SUCCESS: System invitation email sent to ${email}`);
                
                // Update the invitation to record that email was sent successfully
                await storage.updateInvitation(invitation.id, { emailSent: true });
                invitation.emailSent = true;
              } else {
                console.error(`ERROR: Failed to send system invitation email to ${email}`);
              }
            } 
            else if (projectObj) {
              // This is a project-specific invitation
              console.log(`Sending project invitation email to ${email} for project "${projectObj.name}" from "${inviter.name}"`);
              
              // Send the invitation email (with client domain if provided)
              emailSent = await sendInvitationEmail(
                email,
                inviter.name,
                projectObj.name,
                role,
                token,
                appUrl // Pass the client app URL (undefined if not provided)
              );
              
              if (emailSent) {
                console.log(`SUCCESS: Project invitation email sent to ${email} for project ${projectObj.name}`);
                
                // Update the invitation to record that email was sent successfully
                await storage.updateInvitation(invitation.id, { emailSent: true });
                invitation.emailSent = true;
              } else {
                console.error(`ERROR: Failed to send project invitation email to ${email} for project ${projectObj.name}`);
              }
            } else {
              console.error(`Cannot send project invitation email: Project not found`);
            }
          } else {
            console.error(`Cannot send invitation email: Inviter not found`);
          }
        } catch (emailError) {
          console.error('Error sending invitation email:', emailError);
          console.error('Error details:', emailError instanceof Error ? emailError.message : String(emailError));
          if (emailError instanceof Error && emailError.stack) {
            console.error('Stack trace:', emailError.stack);
          }
        }
      } else {
        console.warn(`SendGrid API key is not available, unable to send invitation email to ${email}`);
      }
      
      // Log activity - different for admin invite vs project invite
      if (isAdminInvite) {
        // Log system-wide invitation
        console.log(`Logging system-wide invitation activity`);
        await storage.logActivity({
          userId: req.user.id,
          action: "invited_user_to_system",
          entityType: "system",
          entityId: invitation.id, // Use invitation ID as the entity ID
          metadata: { inviteeEmail: email, role, emailSent }
        });
      } else {
        // Log project-specific invitation
        console.log(`Logging project-specific invitation activity`);
        await storage.logActivity({
          userId: req.user.id,
          action: "invited_user",
          entityType: "project",
          entityId: parseInt(projectId),
          metadata: { inviteeEmail: email, role, emailSent }
        });
      }
      
      // Debug the final response data
      const responseData = { 
        invitationId: invitation.id,
        token: invitation.token,
        email: invitation.email,
        emailSent // Include the email sent status that the client needs
      };
      
      console.log("DEBUGGING INVITATION RESPONSE:", JSON.stringify(responseData));
      
      // Return the invitation details in a client-friendly format
      console.log(`Sending 201 response with invitation data`);
      return res.status(201).json(responseData);
    } catch (error) {
      console.error("Error creating invitation:", error);
      console.error("Error details:", error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error("Error stack trace:", error.stack);
      }
      next(error);
    }
  });
  
  // Get invitation details - Public route that doesn't require authentication
  app.get("/api/invite/:token", async (req, res, next) => {
    try {
      const { token } = req.params;
      console.log(`Retrieving invitation details for token: ${token}`);
      
      // Find the invitation
      const invitation = await storage.getInvitationByToken(token);
      
      console.log(`Invitation lookup result:`, invitation ? `Found invitation ID: ${invitation.id}` : 'No invitation found');
      
      if (!invitation) {
        console.log(`Invitation not found for token: ${token}`);
        return res.status(404).json({ message: "Invitation not found or invalid link" });
      }
      
      // Check if the invitation has expired
      const now = new Date();
      const isExpired = now > invitation.expiresAt;
      console.log(`Invitation expiry check: now=${now.toISOString()}, expiresAt=${invitation.expiresAt}, isExpired=${isExpired}`);
      
      if (isExpired) {
        console.log(`Invitation has expired: ${invitation.expiresAt}`);
        return res.status(400).json({ message: "Invitation has expired" });
      }
      
      // Check if the invitation has already been accepted
      console.log(`Invitation acceptance status: ${invitation.isAccepted ? 'Accepted' : 'Not yet accepted'}`);
      if (invitation.isAccepted) {
        return res.status(400).json({ message: "Invitation has already been accepted" });
      }
      
      // Get project and creator details to provide context in the UI
      const project = await storage.getProject(invitation.projectId);
      const creator = await storage.getUser(invitation.createdById);
      
      console.log(`Project details: ${project ? `Found "${project.name}"` : 'Project not found'}`);
      console.log(`Creator details: ${creator ? `Found "${creator.name}"` : 'Creator not found'}`);
      
      // Remove sensitive information
      let creatorInfo = null;
      if (creator) {
        const { password, ...creatorWithoutPassword } = creator;
        creatorInfo = creatorWithoutPassword;
      }
      
      const response = {
        ...invitation,
        project,
        creator: creatorInfo
      };
      
      console.log(`Sending invitation details response for ${invitation.email}`);
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  // DEBUG Endpoint: Test invitation token validation
  // This endpoint is for development/testing only and should be removed in production
  app.get("/api/debug/validate-token/:token", isAuthenticated, async (req, res, next) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Unauthorized. Only admins can access this endpoint." });
      }
      
      const { token } = req.params;
      console.log(`VALIDATE TOKEN DEBUG: Testing token validation for: ${token}`);
      
      // Find the invitation
      const invitation = await storage.getInvitationByToken(token);
      
      if (!invitation) {
        console.log(`VALIDATE TOKEN DEBUG: No invitation found for token: ${token}`);
        return res.status(404).json({ 
          status: "error", 
          message: "Invitation not found", 
          token 
        });
      }
      
      console.log(`VALIDATE TOKEN DEBUG: Found invitation details:`, invitation);
      
      // Get project and creator details
      const project = await storage.getProject(invitation.projectId);
      const creator = await storage.getUser(invitation.createdById);
      
      const result = {
        status: "success",
        invitation: {
          ...invitation,
          isExpired: new Date() > invitation.expiresAt
        },
        project: project ? {
          id: project.id,
          name: project.name,
          createdAt: project.createdAt
        } : null,
        creator: creator ? {
          id: creator.id,
          name: creator.name,
          email: creator.email
        } : null
      };
      
      console.log(`VALIDATE TOKEN DEBUG: Validation response:`, result);
      res.json(result);
    } catch (error) {
      console.error(`VALIDATE TOKEN DEBUG: Error:`, error);
      next(error);
    }
  });

  // DEBUG Endpoint: Test SendGrid email directly 
  // This endpoint is for development/testing only and should be removed in production
  app.post("/api/debug/send-test-email", isAuthenticated, async (req, res, next) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Unauthorized. Only admins can access this endpoint." });
      }
      
      const { to } = req.body;
      
      if (!to) {
        return res.status(400).json({ message: "Email address is required" });
      }
      
      // Import the sendEmail function
      const { sendEmail } = await import('./utils/sendgrid');
      
      console.log(`Sending test email to ${to}`);
      
      const emailSent = await sendEmail({
        to: to,
        from: process.env.EMAIL_FROM || 'alerts@obedtv.com',
        subject: 'Test Email from ObedTV',
        text: 'This is a test email sent directly from the /api/debug/send-test-email endpoint.',
        html: '<p>This is a test email sent directly from the <code>/api/debug/send-test-email</code> endpoint.</p>'
      });
      
      if (emailSent) {
        res.json({ 
          success: true, 
          message: `Test email sent to ${to}. Check the logs for details.`,
          apiKey: process.env.SENDGRID_API_KEY ? "API key is set" : "API key is missing",
          sandboxMode: process.env.SENDGRID_SANDBOX === 'true' ? "enabled" : "disabled" 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          message: `Failed to send test email to ${to}. Check the logs for details.`,
          apiKey: process.env.SENDGRID_API_KEY ? "API key is set" : "API key is missing",
          sandboxMode: process.env.SENDGRID_SANDBOX === 'true' ? "enabled" : "disabled"
        });
      }
    } catch (error) {
      next(error);
    }
  });

  // Accept an invitation
  app.post("/api/invite/:token/accept", isAuthenticated, async (req, res, next) => {
    try {
      const { token } = req.params;
      console.log(`Processing invitation acceptance for token: ${token} by user: ${req.user.email} (ID: ${req.user.id})`);
      
      // Find the invitation
      const invitation = await storage.getInvitationByToken(token);
      
      if (!invitation) {
        console.log(`Accept invitation error: Invitation with token "${token}" not found`);
        return res.status(404).json({ message: "Invitation not found or invalid link" });
      }
      
      console.log(`Found invitation ${invitation.id} for project ${invitation.projectId}, email: ${invitation.email}`);
      
      // Check if the invitation has expired
      const now = new Date();
      const isExpired = now > invitation.expiresAt;
      console.log(`Invitation expiry check: now=${now.toISOString()}, expiresAt=${invitation.expiresAt}, isExpired=${isExpired}`);
      
      if (isExpired) {
        console.log(`Accept invitation error: Invitation has expired (expired at ${invitation.expiresAt})`);
        return res.status(400).json({ message: "Invitation has expired" });
      }
      
      // Check if the invitation has already been accepted
      if (invitation.isAccepted) {
        console.log(`Accept invitation error: Invitation has already been accepted`);
        return res.status(400).json({ message: "Invitation has already been accepted" });
      }
      
      // Check if the current user's email matches the invitation email
      if (req.user.email !== invitation.email) {
        console.log(`Accept invitation error: Email mismatch. Invitation for ${invitation.email}, but user is ${req.user.email}`);
        return res.status(403).json({ message: "This invitation is for a different email address" });
      }
      
      console.log(`Invitation validation passed, adding user ${req.user.id} to project ${invitation.projectId} with role ${invitation.role}`);
      
      try {
        // Check if this is a system-wide invitation (null projectId) or project-specific
        const isSystemInvite = invitation.projectId === null;
        
        if (isSystemInvite) {
          // This is a system-wide invitation for a role like "admin" or "user"
          console.log(`Processing system invitation for user ${req.user.id} with role ${invitation.role}`);
          
          // Update the user's role in the system
          await storage.updateUser(req.user.id, { role: invitation.role });
          console.log(`User role updated to ${invitation.role}`);
          
          // Mark the invitation as accepted
          const updatedInvitation = await storage.updateInvitation(invitation.id, { isAccepted: true });
          console.log(`System invitation marked as accepted: ${JSON.stringify(updatedInvitation)}`);
          
          // Log activity
          await storage.logActivity({
            userId: req.user.id,
            action: "accepted_system_role",
            entityType: "system",
            entityId: invitation.id, // Use invitation ID as the entity ID
            metadata: { 
              invitationId: invitation.id,
              role: invitation.role
            }
          });
          
          res.status(200).json({ 
            message: `Successfully accepted system role: ${invitation.role}`,
            systemRole: invitation.role
          });
        } else {
          // This is a project-specific invitation
          // Add the user to the project
          const projectUser = await storage.addUserToProject({
            projectId: invitation.projectId,
            userId: req.user.id,
            role: invitation.role
          });
          
          console.log(`User successfully added to project: ${JSON.stringify(projectUser)}`);
          
          // Mark the invitation as accepted
          const updatedInvitation = await storage.updateInvitation(invitation.id, { isAccepted: true });
          console.log(`Project invitation marked as accepted: ${JSON.stringify(updatedInvitation)}`);
          
          // Log activity
          await storage.logActivity({
            userId: req.user.id,
            action: "joined_project",
            entityType: "project",
            entityId: invitation.projectId,
            metadata: { invitationId: invitation.id }
          });
          
          // Get project details to include in response
          const project = await storage.getProject(invitation.projectId);
          
          res.status(200).json({ 
            message: "Successfully joined project",
            project: project || { name: "Unknown Project" }
          });
        }
      } catch (processingError) {
        console.error(`Error processing invitation acceptance:`, processingError);
        return res.status(500).json({ 
          message: "Error adding you to the project. Please try again or contact support.",
          error: processingError.message
        });
      }
    } catch (error) {
      console.error(`Unexpected error in invitation acceptance:`, error);
      next(error);
    }
  });
  
  // Delete an invitation
  app.delete("/api/invite/:id", isAuthenticated, async (req, res, next) => {
    try {
      const invitationId = parseInt(req.params.id);
      
      // Get the invitation
      const invitation = await storage.getInvitationById(invitationId);
      
      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }
      
      // Check if the user has permission to delete the invitation
      if (req.user.role !== "admin") {
        // Check if the user is the creator of the invitation
        if (invitation.createdById !== req.user.id) {
          // Check if the user has edit access to the project
          const projectUser = await storage.getProjectUser(invitation.projectId, req.user.id);
          if (!projectUser || !["admin", "editor"].includes(projectUser.role)) {
            return res.status(403).json({ message: "You don't have permission to cancel this invitation" });
          }
        }
      }
      
      // Delete the invitation
      await storage.deleteInvitation(invitationId);
      
      // Check if this is a system-wide invitation (null projectId) or project-specific
      const isSystemInvite = invitation.projectId === null;
      
      // Log activity - different for admin invite vs project invite
      if (isSystemInvite) {
        await storage.logActivity({
          userId: req.user.id,
          action: "cancelled_system_invitation",
          entityType: "system",
          entityId: invitation.id, // Use invitation ID as the entity ID
          metadata: { inviteeEmail: invitation.email }
        });
      } else {
        await storage.logActivity({
          userId: req.user.id,
          action: "cancelled_invitation",
          entityType: "project",
          entityId: invitation.projectId,
          metadata: { inviteeEmail: invitation.email }
        });
      }
      
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  
  // Resend invitation email
  app.post("/api/invite/:id/resend", isAuthenticated, async (req, res, next) => {
    try {
      console.log("POST /api/invite/:id/resend - Starting invitation resend process");
      console.log("Request params:", req.params);
      console.log("Request body:", JSON.stringify(req.body));
      
      if (!req.user) {
        console.error("POST /api/invite/:id/resend - No authenticated user found");
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const invitationId = parseInt(req.params.id);
      console.log(`Processing resend for invitation ID: ${invitationId}`);
      
      const { appUrl } = req.body; // Get client app URL from request body
      
      // Log the client app URL if provided
      if (appUrl) {
        console.log(`Client URL provided for resending invitation: ${appUrl}`);
      } else {
        console.warn("No client URL provided for resending invitation - using default domain");
      }
      
      // Get the invitation
      console.log(`Retrieving invitation with ID: ${invitationId}`);
      const invitation = await storage.getInvitationById(invitationId);
      
      if (!invitation) {
        console.error(`Invitation with ID ${invitationId} not found`);
        return res.status(404).json({ message: "Invitation not found" });
      }
      
      console.log(`Found invitation: ${JSON.stringify(invitation)}`);
      
      // Check if the user has permission to resend the invitation
      if (req.user.role !== "admin") {
        console.log(`User role is not admin, checking specific permissions`);
        // Check if the user is the creator of the invitation
        if (invitation.createdById !== req.user.id) {
          console.log(`User ${req.user.id} is not the creator of this invitation, checking project permissions`);
          // Check if the user has edit access to the project
          const projectUser = await storage.getProjectUser(invitation.projectId, req.user.id);
          if (!projectUser || !["admin", "editor"].includes(projectUser.role)) {
            console.error(`User ${req.user.id} does not have permission to resend invitation ${invitationId}`);
            return res.status(403).json({ message: "You don't have permission to resend this invitation" });
          }
        }
      }
      
      // Get the inviter data
      console.log(`Retrieving inviter (current user) data: ${req.user.id}`);
      const inviter = await storage.getUser(req.user.id);
      
      // Check if this is a system-wide invitation (null projectId) or project-specific
      const isSystemInvite = invitation.projectId === null;
      console.log(`Invitation type: ${isSystemInvite ? 'System-wide' : 'Project-specific'}`);
      
      // If SendGrid API key is available, send the email
      let emailSent = false;
      console.log(`Attempting to resend invitation email to ${invitation.email}`);
      console.log(`API Key: SENDGRID_API_KEY ${process.env.SENDGRID_API_KEY ? 'is set' : 'is NOT set'}`);
      
      if (process.env.SENDGRID_API_KEY) {
        console.log(`SendGrid API key is available, preparing to resend invitation email`);
        try {
          if (inviter) {
            if (isSystemInvite) {
              // Import the sendSystemInvitationEmail function
              console.log(`Importing sendSystemInvitationEmail from ./utils/sendgrid`);
              const { sendSystemInvitationEmail } = await import('./utils/sendgrid');
              
              console.log(`Resending system invitation email to ${invitation.email} from "${inviter.name}"`);
              
              // Send the system invitation email
              emailSent = await sendSystemInvitationEmail(
                invitation.email,
                inviter.name,
                invitation.role,
                invitation.token,
                appUrl // Pass the client app URL (undefined if not provided)
              );
              
              if (emailSent) {
                console.log(`SUCCESS: System invitation email resent to ${invitation.email}`);
                
                // Update the invitation to record that email was sent successfully
                console.log(`Updating invitation ${invitation.id} to record successful email delivery`);
                await storage.updateInvitation(invitation.id, { emailSent: true });
                invitation.emailSent = true;
              } else {
                console.error(`ERROR: Failed to resend system invitation email to ${invitation.email}`);
              }
            } else {
              // For project-specific invitations
              console.log(`Retrieving project with ID: ${invitation.projectId}`);
              const project = await storage.getProject(invitation.projectId);
              
              if (project) {
                // Import the sendInvitationEmail function
                console.log(`Importing sendInvitationEmail from ./utils/sendgrid`);
                const { sendInvitationEmail } = await import('./utils/sendgrid');
                
                console.log(`Resending project invitation email to ${invitation.email} for project "${project.name}" from "${inviter.name}"`);
                
                // Send the invitation email with app URL (if provided)
                emailSent = await sendInvitationEmail(
                  invitation.email,
                  inviter.name,
                  project.name,
                  invitation.role,
                  invitation.token,
                  appUrl // Pass the client app URL (undefined if not provided)
                );
                
                if (emailSent) {
                  console.log(`SUCCESS: Project invitation email resent to ${invitation.email}`);
                  
                  // Update the invitation to record that email was sent successfully
                  console.log(`Updating invitation ${invitation.id} to record successful email delivery`);
                  await storage.updateInvitation(invitation.id, { emailSent: true });
                  invitation.emailSent = true;
                } else {
                  console.error(`ERROR: Failed to resend project invitation email to ${invitation.email}`);
                }
              } else {
                console.error(`Cannot resend invitation email: Project ${invitation.projectId} not found`);
              }
            }
          } else {
            console.error(`Cannot resend invitation email: Inviter with ID ${req.user.id} not found`);
          }
        } catch (emailError) {
          console.error('Error resending invitation email:', emailError);
          console.error('Error details:', emailError instanceof Error ? emailError.message : String(emailError));
          if (emailError instanceof Error && emailError.stack) {
            console.error('Stack trace:', emailError.stack);
          }
        }
      } else {
        console.warn(`SendGrid API key is not available, unable to resend invitation email to ${invitation.email}`);
      }
      
      // Log activity - different for admin invite vs project invite
      console.log(`Logging invitation resend activity`);
      if (isSystemInvite) {
        console.log(`Logging system-wide invitation resend activity`);
        await storage.logActivity({
          userId: req.user.id,
          action: "resent_system_invitation_email",
          entityType: "system",
          entityId: invitation.id, // Use invitation ID as the entity ID
          metadata: { inviteeEmail: invitation.email, emailSent }
        });
      } else {
        console.log(`Logging project-specific invitation resend activity`);
        await storage.logActivity({
          userId: req.user.id,
          action: "resent_invitation_email",
          entityType: "project",
          entityId: invitation.projectId,
          metadata: { inviteeEmail: invitation.email, emailSent }
        });
      }
      
      // Prepare the response
      const responseData = { 
        success: true, 
        emailSent, 
        invitation: {
          ...invitation,
          emailSent
        }
      };
      
      console.log(`Resend invitation response data:`, JSON.stringify(responseData));
      
      // Return the success response
      console.log(`Sending 200 response with resend data`);
      return res.status(200).json(responseData);
    } catch (error) {
      console.error("Error resending invitation:", error);
      console.error("Error details:", error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error("Error stack trace:", error.stack);
      }
      next(error);
    }
  });

  // Get team members for a project
  app.get("/api/projects/:projectId/members", hasProjectAccess, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      console.log("Getting team members for project", projectId);
      
      // Get all project users for this project using the storage interface
      const projectUsers = await storage.getProjectUsers(projectId);
      
      console.log("Project users:", projectUsers);
      
      // Get user details for each project user
      const teamMembers = await Promise.all(
        projectUsers.map(async (projectUser) => {
          const user = await storage.getUser(projectUser.userId);
          
          console.log("Project user ID:", projectUser.userId, "User:", user);
          
          if (!user) return null;
          
          // Remove password from user object
          const { password, ...userWithoutPassword } = user;
          
          return {
            ...projectUser,
            user: userWithoutPassword,
          };
        })
      );
      
      // Filter out any null values
      const validTeamMembers = teamMembers.filter(member => member !== null);
      
      console.log("Valid team members:", validTeamMembers);
      
      res.json(validTeamMembers);
    } catch (error) {
      console.error("Error getting team members:", error);
      next(error);
    }
  });
  
  // Get pending invitations for a project
  app.get("/api/projects/:projectId/invitations", hasProjectAccess, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      // Get all invitations for this project using the storage interface
      const pendingInvitations = await storage.getInvitationsByProject(projectId);
      
      // Get creator details for each invitation
      const invitationsWithCreators = await Promise.all(
        pendingInvitations.map(async (invitation) => {
          const creator = await storage.getUser(invitation.createdById);
          
          if (!creator) return invitation;
          
          // Remove password from creator object
          const { password, ...creatorWithoutPassword } = creator;
          
          return {
            ...invitation,
            creator: creatorWithoutPassword,
          };
        })
      );
      
      res.json(invitationsWithCreators);
    } catch (error) {
      next(error);
    }
  });

  // Get all comments for a project
  app.get("/api/projects/:projectId/comments", hasProjectAccess, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      // Get all files for this project
      const files = await storage.getFilesByProject(projectId);
      
      if (!files || files.length === 0) {
        return res.json([]);
      }
      
      // Get all comments for all files in project
      const allComments = [];
      
      for (const file of files) {
        // Get unified comments (includes both regular and public comments)
        const fileComments = await storage.getUnifiedCommentsByFileV2(file.id);
        
        if (fileComments && fileComments.length > 0) {
          // Add file info to each comment and strip creatorToken for security
          const commentsWithFile = fileComments.map((comment) => {
            const { creatorToken, ...sanitizedComment } = comment;
            return {
              ...sanitizedComment,
              file: {
                id: file.id,
                filename: file.filename,
                fileType: file.fileType
              }
            };
          });
          
          allComments.push(...commentsWithFile);
        }
      }
      
      // Sort comments by date (newest first)
      const sortedComments = allComments.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      res.json(sortedComments);
    } catch (error) {
      next(error);
    }
  });

  // Add a debug test page for project creation
  app.get("/test-project", (req, res) => {
    res.sendFile(path.resolve("./test-project.html"));
  });
  
  // Add a test route to check session/auth status
  app.get("/api/auth-test", (req, res) => {
    res.json({
      isAuthenticated: req.isAuthenticated(),
      session: req.session,
      user: req.user || null
    });
  });

  const httpServer = createServer(app);

  return httpServer;
}
