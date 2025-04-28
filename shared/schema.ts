import { pgTable, text, serial, integer, boolean, timestamp, json } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users)
  .omit({ id: true, createdAt: true });

// PROJECT SCHEMA
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("in_progress"), // "in_progress", "in_review", "approved"
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects)
  .omit({ id: true, createdAt: true, updatedAt: true });

// FILE SCHEMA
export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  fileType: text("file_type").notNull(), // "video", "audio", "image"
  fileSize: integer("file_size").notNull(),
  filePath: text("file_path").notNull(),
  projectId: integer("project_id").notNull(),
  uploadedById: integer("uploaded_by_id").notNull(),
  version: integer("version").notNull().default(1),
  isLatestVersion: boolean("is_latest_version").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFileSchema = createInsertSchema(files)
  .omit({ id: true, createdAt: true });

// COMMENT SCHEMA
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  fileId: integer("file_id").notNull(),
  userId: integer("user_id").notNull(),
  parentId: integer("parent_id"), // For comment replies (null if top-level)
  timestamp: integer("timestamp"), // For timestamped video comments (seconds)
  isResolved: boolean("is_resolved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCommentSchema = createInsertSchema(comments)
  .omit({ id: true, createdAt: true });

// PROJECT USER SCHEMA (for permissions)
export const projectUsers = pgTable("project_users", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  userId: integer("user_id").notNull(),
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
  projectId: integer("project_id"),
  role: text("role").notNull().default("viewer"),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  isAccepted: boolean("is_accepted").notNull().default(false),
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInvitationSchema = createInsertSchema(invitations)
  .omit({ id: true, createdAt: true });

// APPROVAL SCHEMA
export const approvals = pgTable("approvals", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").notNull(),
  userId: integer("user_id").notNull(),
  status: text("status").notNull(), // "approved", "requested_changes"
  feedback: text("feedback"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertApprovalSchema = createInsertSchema(approvals)
  .omit({ id: true, createdAt: true });

// Type definitions
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type File = typeof files.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;

export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

export type ProjectUser = typeof projectUsers.$inferSelect;
export type InsertProjectUser = z.infer<typeof insertProjectUserSchema>;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;

export type Approval = typeof approvals.$inferSelect;
export type InsertApproval = z.infer<typeof insertApprovalSchema>;
