import { pgTable, text, serial, integer, bigint, boolean, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// USER SCHEMA
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("viewer"), // "admin", "editor", "viewer"
  themePreference: text("theme_preference").default("system"), // "light", "dark", "system"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users)
  .omit({ id: true, createdAt: true });

// FOLDER SCHEMA
export const folders = pgTable("folders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").default("#6366f1"), // Hex color for folder
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFolderSchema = createInsertSchema(folders)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    name: z.string().min(1).max(50, "Folder name must be 50 characters or less"),
    description: z.string().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color").optional()
  });

// PROJECT SCHEMA
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("in_progress"), // "in_progress", "in_review", "approved"
  folderId: integer("folder_id").references(() => folders.id, { onDelete: "set null" }), // Optional folder assignment - sets to null if folder deleted
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    name: z.string().min(1).max(20, "Project name must be 20 characters or less"),
    folderId: z.number().nullable().optional()
  });

// FILE SCHEMA
export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  fileType: text("file_type").notNull(), // "video", "audio", "image"
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  filePath: text("file_path").notNull(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  uploadedById: integer("uploaded_by_id").notNull().references(() => users.id),
  version: integer("version").notNull().default(1),
  isLatestVersion: boolean("is_latest_version").notNull().default(true),
  isAvailable: boolean("is_available").notNull().default(true), // Track if file is physically available
  shareToken: text("share_token"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFileSchema = createInsertSchema(files)
  .omit({ id: true, createdAt: true });

// COMMENT SCHEMA
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  fileId: integer("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  parentId: integer("parent_id"), // For comment replies (null if top-level)
  timestamp: integer("timestamp"), // For timestamped video comments (seconds)
  isResolved: boolean("is_resolved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCommentSchema = createInsertSchema(comments)
  .omit({ id: true, createdAt: true });

// PUBLIC COMMENT SCHEMA (for anonymous comments on shared files)
export const publicComments = pgTable("public_comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  fileId: integer("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  parentId: integer("parent_id"), // For comment replies (null if top-level)
  timestamp: integer("timestamp"), // For timestamped video comments (seconds)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPublicCommentSchema = createInsertSchema(publicComments)
  .omit({ id: true, createdAt: true })
  .extend({
    displayName: z.string().min(2, "Name must be at least 2 characters").max(40, "Name must be 40 characters or less"),
    content: z.string().min(1, "Comment cannot be empty").max(1000, "Comment must be 1000 characters or less"),
    timestamp: z.number().min(0).optional(),
    parentId: z.number().optional()
  });

// PROJECT USER SCHEMA (for permissions)
export const projectUsers = pgTable("project_users", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("viewer"), // "editor", "viewer"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProjectUserSchema = createInsertSchema(projectUsers)
  .omit({ id: true, createdAt: true });

// ACTIVITY LOG SCHEMA
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(), // "create", "update", "delete", "approve", "comment", etc.
  entityType: text("entity_type").notNull(), // "project", "file", "comment", "user", etc.
  entityId: integer("entity_id").notNull(),
  userId: integer("user_id").notNull(),
  metadata: json("metadata"), // Additional details about the action
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs)
  .omit({ id: true, createdAt: true });

// INVITATION SCHEMA
export const invitations = pgTable("invitations", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("viewer"),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  isAccepted: boolean("is_accepted").notNull().default(false),
  emailSent: boolean("email_sent").notNull().default(false),
  createdById: integer("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInvitationSchema = createInsertSchema(invitations)
  .omit({ id: true, createdAt: true });

// APPROVAL SCHEMA
export const approvals = pgTable("approvals", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  status: text("status").notNull(), // "approved", "requested_changes"
  feedback: text("feedback"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertApprovalSchema = createInsertSchema(approvals)
  .omit({ id: true, createdAt: true });

// PASSWORD RESET SCHEMA
export const passwordResets = pgTable("password_resets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  isUsed: boolean("is_used").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPasswordResetSchema = createInsertSchema(passwordResets)
  .omit({ id: true, createdAt: true });

// VIDEO PROCESSING SCHEMA
export const videoProcessing = pgTable("video_processing", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // "pending", "processing", "completed", "failed"
  qualities: json("qualities").$type<Array<{resolution: string, path: string, size: number, bitrate: string}>>(),
  scrubVersionPath: text("scrub_version_path"),
  thumbnailSpritePath: text("thumbnail_sprite_path"),
  spriteMetadata: json("sprite_metadata").$type<{cols: number, rows: number, thumbnailWidth: number, thumbnailHeight: number, interval: number, thumbnailCount: number, duration: number}>(),
  duration: integer("duration"), // video duration in seconds
  frameRate: integer("frame_rate"), // frames per second
  errorMessage: text("error_message"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVideoProcessingSchema = createInsertSchema(videoProcessing)
  .omit({ id: true, createdAt: true });

// Type definitions
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Folder = typeof folders.$inferSelect;
export type InsertFolder = z.infer<typeof insertFolderSchema>;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type PasswordReset = typeof passwordResets.$inferSelect;
export type InsertPasswordReset = z.infer<typeof insertPasswordResetSchema>;

export type File = typeof files.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;

export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

export type PublicComment = typeof publicComments.$inferSelect;
export type InsertPublicComment = z.infer<typeof insertPublicCommentSchema>;

// Unified comment type for merging authenticated and public comments
export type UnifiedComment = {
  id: number;
  content: string;
  fileId: number;
  timestamp: number | null;
  isResolved?: boolean;
  createdAt: Date;
  isPublic: boolean;
  authorName: string;
  user?: {
    id: number;
    name: string;
    username: string;
  };
  parentId?: number | null;
};

export type ProjectUser = typeof projectUsers.$inferSelect;
export type InsertProjectUser = z.infer<typeof insertProjectUserSchema>;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;

export type Approval = typeof approvals.$inferSelect;
export type InsertApproval = z.infer<typeof insertApprovalSchema>;

export type VideoProcessing = typeof videoProcessing.$inferSelect;
export type InsertVideoProcessing = z.infer<typeof insertVideoProcessingSchema>;
