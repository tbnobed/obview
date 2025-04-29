import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, generateToken, hashPassword } from "./auth";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { z } from "zod";
import { 
  insertProjectSchema,
  insertCommentSchema,
  insertFileSchema,
  insertProjectUserSchema,
  insertApprovalSchema
} from "@shared/schema";

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

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
    fileSize: 50 * 1024 * 1024, // 50MB limit
  }
});

// Middleware to check authentication
function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  console.log("Auth check - isAuthenticated:", req.isAuthenticated());
  console.log("Auth check - session:", req.session);
  console.log("Auth check - user:", req.user);
  
  if (req.isAuthenticated()) {
    console.log("User is authenticated, proceeding");
    return next();
  }
  console.log("Authentication failed, returning 401");
  res.status(401).json({ message: "Unauthorized" });
}

// Middleware to check if user is admin
function isAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user.role === "admin") {
    return next();
  }
  res.status(403).json({ message: "Forbidden" });
}

// Middleware to check if user has access to a project
async function hasProjectAccess(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }

    // Admin has access to all projects
    if (req.user.role === "admin") {
      return next();
    }

    // Check if user is a member of the project
    const projectUser = await storage.getProjectUser(projectId, req.user.id);
    if (!projectUser) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  } catch (error) {
    next(error);
  }
}

// Middleware to check if user has edit access to a project
async function hasProjectEditAccess(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.isAuthenticated()) {
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

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication
  setupAuth(app);
  
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
            const logLines = logContent.split('\n').filter(line => line.trim());
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
          from: req.query.from as string || 'noreply@sendgrid.net',
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
      
      // Don't allow updating password through this endpoint
      const { password, ...updateData } = req.body;
      
      const updatedUser = await storage.updateUser(userId, updateData);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Remove password from response
      const { password: pwd, ...userWithoutPassword } = updatedUser;
      
      res.json(userWithoutPassword);
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

  // ===== PROJECT ROUTES =====
  // Get all projects (accessible to user)
  app.get("/api/projects", isAuthenticated, async (req, res, next) => {
    try {
      let projects;
      
      // Admins can see all projects
      if (req.user.role === "admin") {
        projects = await storage.getAllProjects();
      } else {
        projects = await storage.getProjectsByUser(req.user.id);
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
      
      // Make sure createdById exists in the request
      const projectData = {
        ...req.body,
        createdById: req.body.createdById || req.user.id,
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

  // Delete a project
  app.delete("/api/projects/:projectId", hasProjectEditAccess, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Log activity before deleting
      await storage.logActivity({
        action: "delete",
        entityType: "project",
        entityId: projectId,
        userId: req.user.id,
        metadata: { projectName: project.name },
      });
      
      const success = await storage.deleteProject(projectId);
      
      if (!success) {
        return res.status(404).json({ message: "Project not found" });
      }
      
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
  // Get files for a project
  app.get("/api/projects/:projectId/files", hasProjectAccess, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const files = await storage.getFilesByProject(projectId);
      
      res.json(files);
    } catch (error) {
      next(error);
    }
  });

  // Upload a file to a project (support both endpoints for compatibility)
  app.post(["/api/projects/:projectId/files", "/api/projects/:projectId/upload"], hasProjectEditAccess, upload.single('file'), async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
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
      const similarFiles = existingFiles.filter(f => f.filename === req.file!.originalname);
      
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
      
      // Create file record in storage
      const file = await storage.createFile({
        filename: req.file.originalname,
        fileType,
        fileSize: req.file.size,
        filePath: req.file.path,
        projectId,
        uploadedById: req.user.id,
        version,
        isLatestVersion: true
      });
      
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
      
      res.status(201).json(file);
    } catch (error) {
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
      
      // Check if user has access to the project
      if (req.user.role !== "admin") {
        const projectUser = await storage.getProjectUser(file.projectId, req.user.id);
        if (!projectUser) {
          return res.status(403).json({ message: "You don't have access to this file" });
        }
      }
      
      res.json(file);
    } catch (error) {
      next(error);
    }
  });

  // Serve file content
  app.get("/api/files/:fileId/content", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const file = await storage.getFile(fileId);
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Check if user has access to the project
      if (req.user.role !== "admin") {
        const projectUser = await storage.getProjectUser(file.projectId, req.user.id);
        if (!projectUser) {
          return res.status(403).json({ message: "You don't have access to this file" });
        }
      }
      
      // Send the file
      res.sendFile(file.filePath, { root: '/' });
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
      
      // Delete file record
      const success = await storage.deleteFile(fileId);
      
      if (!success) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Delete the actual file from disk (in a real app, handle errors properly)
      try {
        await fs.unlink(file.filePath);
      } catch (err) {
        console.error(`Failed to delete file ${file.filePath}:`, err);
      }
      
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  // ===== COMMENT ROUTES =====
  // Get comments for a file
  app.get("/api/files/:fileId/comments", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const file = await storage.getFile(fileId);
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Check if user has access to the project
      if (req.user.role !== "admin") {
        const projectUser = await storage.getProjectUser(file.projectId, req.user.id);
        if (!projectUser) {
          return res.status(403).json({ message: "You don't have access to this file" });
        }
      }
      
      const comments = await storage.getCommentsByFile(fileId);
      
      // Get user details for each comment
      const commentsWithUsers = await Promise.all(
        comments.map(async (comment) => {
          const user = await storage.getUser(comment.userId);
          
          if (!user) return comment;
          
          // Remove password from user object
          const { password, ...userWithoutPassword } = user;
          
          return {
            ...comment,
            user: userWithoutPassword,
          };
        })
      );
      
      res.json(commentsWithUsers);
    } catch (error) {
      next(error);
    }
  });

  // Add a comment to a file
  app.post("/api/files/:fileId/comments", isAuthenticated, async (req, res, next) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const file = await storage.getFile(fileId);
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Check if user has access to the project
      if (req.user.role !== "admin") {
        const projectUser = await storage.getProjectUser(file.projectId, req.user.id);
        if (!projectUser) {
          return res.status(403).json({ message: "You don't have access to this file" });
        }
      }
      
      // Validate comment data
      const validationResult = insertCommentSchema.safeParse({
        ...req.body,
        fileId,
        userId: req.user.id,
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid comment data", 
          errors: validationResult.error.errors 
        });
      }
      
      // If it's a reply, check if parent comment exists
      if (validationResult.data.parentId) {
        const parentComment = await storage.getComment(validationResult.data.parentId);
        if (!parentComment || parentComment.fileId !== fileId) {
          return res.status(400).json({ message: "Invalid parent comment" });
        }
      }
      
      // Create the comment
      const comment = await storage.createComment(validationResult.data);
      
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
      next(error);
    }
  });

  // Update a comment (resolve/unresolve)
  app.patch("/api/comments/:commentId", isAuthenticated, async (req, res, next) => {
    try {
      const commentId = parseInt(req.params.commentId);
      const comment = await storage.getComment(commentId);
      
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      // Check if user is the comment author or has edit access to the project
      const file = await storage.getFile(comment.fileId);
      
      if (!file) {
        return res.status(404).json({ message: "Associated file not found" });
      }
      
      let hasPermission = comment.userId === req.user.id || req.user.role === "admin";
      
      if (!hasPermission) {
        const projectUser = await storage.getProjectUser(file.projectId, req.user.id);
        hasPermission = !!projectUser && projectUser.role === "editor";
      }
      
      if (!hasPermission) {
        return res.status(403).json({ message: "You don't have permission to update this comment" });
      }
      
      // Only allow updating specific fields
      const allowedUpdates = ["isResolved"];
      const updates: Record<string, any> = {};
      
      for (const field of allowedUpdates) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }
      
      // Update the comment
      const updatedComment = await storage.updateComment(commentId, updates);
      
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
      const commentId = parseInt(req.params.commentId);
      const comment = await storage.getComment(commentId);
      
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      // Check if user is the comment author or an admin
      if (comment.userId !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({ message: "You don't have permission to delete this comment" });
      }
      
      // Log activity before deletion
      await storage.logActivity({
        action: "delete_comment",
        entityType: "comment",
        entityId: commentId,
        userId: req.user.id,
        metadata: { 
          fileId: comment.fileId,
        },
      });
      
      // Delete the comment
      const success = await storage.deleteComment(commentId);
      
      if (!success) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      res.status(204).end();
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
      
      // Check if user has access to the project
      if (req.user.role !== "admin") {
        const projectUser = await storage.getProjectUser(file.projectId, req.user.id);
        if (!projectUser) {
          return res.status(403).json({ message: "You don't have access to this file" });
        }
      }
      
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
      
      // Check if user has access to the project
      if (req.user.role !== "admin") {
        const projectUser = await storage.getProjectUser(file.projectId, req.user.id);
        if (!projectUser) {
          return res.status(403).json({ message: "You don't have access to this file" });
        }
      }
      
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
        approval = await storage.updateFile(existingApproval.id, validationResult.data);
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
      
      res.status(201).json(approvalWithUser);
    } catch (error) {
      next(error);
    }
  });

  // ===== ACTIVITY LOG ROUTES =====
  // Get activity logs for a project
  app.get("/api/projects/:projectId/activities", hasProjectAccess, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const activities = await storage.getActivitiesByProject(projectId);
      
      // Get user details for each activity
      const activitiesWithUsers = await Promise.all(
        activities.map(async (activity) => {
          const user = await storage.getUser(activity.userId);
          
          if (!user) return activity;
          
          // Remove password from user object
          const { password, ...userWithoutPassword } = user;
          
          return {
            ...activity,
            user: userWithoutPassword,
          };
        })
      );
      
      res.json(activitiesWithUsers);
    } catch (error) {
      next(error);
    }
  });
  
  // Create a new invitation
  app.post("/api/invite", isAuthenticated, async (req, res, next) => {
    try {
      const { email, projectId, role = "viewer" } = req.body;
      
      if (!email || !projectId) {
        return res.status(400).json({ message: "Email and projectId are required" });
      }
      
      const project = await storage.getProject(parseInt(projectId));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Check if user has edit access to the project
      if (req.user.role !== "admin") {
        const projectUser = await storage.getProjectUser(parseInt(projectId), req.user.id);
        if (!projectUser || !["admin", "editor"].includes(projectUser.role)) {
          return res.status(403).json({ message: "You don't have permission to invite users to this project" });
        }
      }
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      
      // If user exists and is already a member of the project, return an error
      if (existingUser) {
        const existingMember = await storage.getProjectUser(parseInt(projectId), existingUser.id);
        if (existingMember) {
          return res.status(400).json({ message: "User is already a member of this project" });
        }
      }
      
      // Check if there's already a pending invitation for this email and project
      const existingInvitations = await storage.getInvitationsByProject(parseInt(projectId));
      const alreadyInvited = existingInvitations.some(inv => inv.email === email && !inv.isAccepted);
      
      if (alreadyInvited) {
        return res.status(400).json({ message: "User has already been invited to this project" });
      }
      
      // Generate a unique token for this invitation
      const token = generateToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Invitation expires in 7 days
      
      // Create the invitation (initially with emailSent as false)
      const invitation = await storage.createInvitation({
        email,
        role,
        createdById: req.user.id,
        projectId: parseInt(projectId),
        token,
        expiresAt,
        isAccepted: false,
        emailSent: false
      });
      
      // If SendGrid API key is available, send an email
      let emailSent = false;
      console.log(`Checking SendGrid API key availability for invitation to ${email}`);
      
      if (process.env.SENDGRID_API_KEY) {
        console.log(`SendGrid API key is available, preparing to send invitation email to ${email}`);
        try {
          // Import the sendInvitationEmail function from utils/sendgrid
          const { sendInvitationEmail } = await import('./utils/sendgrid');
          
          // Get the name of the user who created the invitation
          const inviter = await storage.getUser(req.user.id);
          
          if (inviter && project) {
            console.log(`Sending invitation email to ${email} for project "${project.name}" from "${inviter.name}"`);
            
            // Send the invitation email
            emailSent = await sendInvitationEmail(
              email,
              inviter.name,
              project.name,
              role,
              token
            );
            
            if (emailSent) {
              console.log(`SUCCESS: Invitation email sent to ${email} for project ${project.name}`);
              
              // Update the invitation to record that email was sent successfully
              await storage.updateInvitation(invitation.id, { emailSent: true });
              invitation.emailSent = true;
            } else {
              console.error(`ERROR: Failed to send invitation email to ${email} for project ${project.name}`);
            }
          } else {
            console.error(`Cannot send invitation email: ${!inviter ? 'Inviter not found' : 'Project not found'}`);
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
      
      // Log activity
      await storage.logActivity({
        userId: req.user.id,
        action: "invited_user",
        entityType: "project",
        entityId: parseInt(projectId),
        metadata: { inviteeEmail: email, role, emailSent }
      });
      
      // Return the created invitation with email status
      res.status(201).json({ 
        ...invitation, 
        emailSent 
      });
    } catch (error) {
      next(error);
    }
  });
  
  // Get invitation details - Public route that doesn't require authentication
  app.get("/api/invite/:token", async (req, res, next) => {
    try {
      const { token } = req.params;
      
      // Find the invitation
      const invitation = await storage.getInvitationByToken(token);
      
      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }
      
      // Check if the invitation has expired
      if (new Date() > invitation.expiresAt) {
        return res.status(400).json({ message: "Invitation has expired" });
      }
      
      // Check if the invitation has already been accepted
      if (invitation.isAccepted) {
        return res.status(400).json({ message: "Invitation has already been accepted" });
      }
      
      // Get project and creator details to provide context in the UI
      const project = await storage.getProject(invitation.projectId);
      const creator = await storage.getUser(invitation.createdById);
      
      // Remove sensitive information
      let creatorInfo = null;
      if (creator) {
        const { password, ...creatorWithoutPassword } = creator;
        creatorInfo = creatorWithoutPassword;
      }
      
      res.json({
        ...invitation,
        project,
        creator: creatorInfo
      });
    } catch (error) {
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
        from: process.env.EMAIL_FROM || 'noreply@sendgrid.net',
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
      
      // Find the invitation
      const invitation = await storage.getInvitationByToken(token);
      
      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }
      
      // Check if the invitation has expired
      if (new Date() > invitation.expiresAt) {
        return res.status(400).json({ message: "Invitation has expired" });
      }
      
      // Check if the invitation has already been accepted
      if (invitation.isAccepted) {
        return res.status(400).json({ message: "Invitation has already been accepted" });
      }
      
      // Check if the current user's email matches the invitation email
      if (req.user.email !== invitation.email) {
        return res.status(403).json({ message: "This invitation is for a different email address" });
      }
      
      // Add the user to the project
      await storage.addUserToProject({
        projectId: invitation.projectId,
        userId: req.user.id,
        role: invitation.role
      });
      
      // Mark the invitation as accepted
      await storage.updateInvitation(invitation.id, { isAccepted: true });
      
      // Log activity
      await storage.logActivity({
        userId: req.user.id,
        action: "joined_project",
        entityType: "project",
        entityId: invitation.projectId,
        metadata: { invitationId: invitation.id }
      });
      
      res.status(200).json({ message: "Successfully joined project" });
    } catch (error) {
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
      
      // Log activity
      await storage.logActivity({
        userId: req.user.id,
        action: "cancelled_invitation",
        entityType: "project",
        entityId: invitation.projectId,
        metadata: { inviteeEmail: invitation.email }
      });
      
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  
  // Resend invitation email
  app.post("/api/invite/:id/resend", isAuthenticated, async (req, res, next) => {
    try {
      const invitationId = parseInt(req.params.id);
      
      // Get the invitation
      const invitation = await storage.getInvitationById(invitationId);
      
      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }
      
      // Check if the user has permission to resend the invitation
      if (req.user.role !== "admin") {
        // Check if the user is the creator of the invitation
        if (invitation.createdById !== req.user.id) {
          // Check if the user has edit access to the project
          const projectUser = await storage.getProjectUser(invitation.projectId, req.user.id);
          if (!projectUser || !["admin", "editor"].includes(projectUser.role)) {
            return res.status(403).json({ message: "You don't have permission to resend this invitation" });
          }
        }
      }
      
      // Get the project and user data
      const project = await storage.getProject(invitation.projectId);
      const inviter = await storage.getUser(req.user.id);
      
      // If SendGrid API key is available, send the email
      let emailSent = false;
      console.log(`Attempting to resend invitation email to ${invitation.email}`);
      
      if (process.env.SENDGRID_API_KEY) {
        try {
          // Import the sendInvitationEmail function from utils/sendgrid
          const { sendInvitationEmail } = await import('./utils/sendgrid');
          
          if (inviter && project) {
            console.log(`Resending invitation email to ${invitation.email} for project "${project.name}" from "${inviter.name}"`);
            
            // Send the invitation email
            emailSent = await sendInvitationEmail(
              invitation.email,
              inviter.name,
              project.name,
              invitation.role,
              invitation.token
            );
            
            if (emailSent) {
              console.log(`SUCCESS: Invitation email resent to ${invitation.email}`);
              
              // Update the invitation to record that email was sent successfully
              await storage.updateInvitation(invitation.id, { emailSent: true });
              invitation.emailSent = true;
            } else {
              console.error(`ERROR: Failed to resend invitation email to ${invitation.email}`);
            }
          } else {
            console.error(`Cannot resend invitation email: ${!inviter ? 'Inviter not found' : 'Project not found'}`);
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
      
      // Log activity
      await storage.logActivity({
        userId: req.user.id,
        action: "resent_invitation_email",
        entityType: "project",
        entityId: invitation.projectId,
        metadata: { inviteeEmail: invitation.email, emailSent }
      });
      
      res.status(200).json({ 
        success: true, 
        emailSent, 
        invitation: {
          ...invitation,
          emailSent
        }
      });
    } catch (error) {
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
        const fileComments = await storage.getCommentsByFile(file.id);
        
        if (fileComments && fileComments.length > 0) {
          // Enrich each comment with user and file info
          const commentsWithUserAndFile = await Promise.all(
            fileComments.map(async (comment) => {
              const user = await storage.getUser(comment.userId);
              
              // Add file info and user info (without password)
              let enrichedComment = {
                ...comment,
                file: {
                  id: file.id,
                  filename: file.filename,
                  fileType: file.fileType
                }
              };
              
              if (user) {
                const { password, ...userWithoutPassword } = user;
                enrichedComment.user = userWithoutPassword;
              }
              
              return enrichedComment;
            })
          );
          
          allComments.push(...commentsWithUserAndFile);
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
