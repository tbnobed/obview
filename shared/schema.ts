import { pgTable, text, serial, integer, bigint, boolean, timestamp, json, uuid, primaryKey, doublePrecision } from "drizzle-orm/pg-core";
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
  // Soft account disable: NULL = active, NOT NULL = deactivated. A deactivated
  // user keeps all their content but cannot log in (blocked in the passport
  // local strategy) and has any existing session invalidated on next request
  // (deserializeUser). Reversible by an admin clearing this back to NULL.
  deactivatedAt: timestamp("deactivated_at"),
  // SHA-256 hash (hex) of a personal API token used by external integrations
  // (e.g. the Premiere panel) for bearer auth. NULL = no token issued. The
  // plaintext is shown to the user once at generation and never stored.
  apiToken: text("api_token"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users)
  .omit({ id: true, createdAt: true, deactivatedAt: true, apiToken: true });

// FOLDER SCHEMA
export const folders = pgTable("folders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").default("#6366f1"), // Hex color for folder
  isGlobal: boolean("is_global").notNull().default(false), // Global folders are visible to all users; only admins can create/edit/delete them
  // Subfolders within a project: when projectId is set this folder lives inside
  // that project; parentFolderId nests the folder under another folder.
  // Existing top-level "project container" folders keep both as NULL.
  projectId: integer("project_id"),
  parentFolderId: integer("parent_folder_id"),
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete: NULL = live, NOT NULL = trashed
});

export const insertFolderSchema = createInsertSchema(folders)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    name: z.string().min(1).max(50, "Folder name must be 50 characters or less"),
    description: z.string().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color").optional(),
    isGlobal: z.boolean().optional(),
  });

// PROJECT SCHEMA
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("in_progress"), // "in_progress", "in_review", "approved"
  folderId: integer("folder_id").references(() => folders.id, { onDelete: "set null" }), // Optional folder assignment - sets to null if folder deleted
  createdById: integer("created_by_id").notNull(),
  // Optional admin/owner-uploaded poster image. Stored as a path relative
  // to UPLOAD_DIR (or an absolute path on disk). When NULL the project
  // card falls back to the latest video's sprite preview.
  customThumbnailPath: text("custom_thumbnail_path"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete: NULL = live, NOT NULL = trashed (admins can restore from trash)
});

export const insertProjectSchema = createInsertSchema(projects)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    name: z.string().min(1).max(30, "Project name must be 30 characters or less"),
    folderId: z.number().nullable().optional()
  });

// FILE SCHEMA
export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  // SHARED stack key: every version of a file carries the SAME `filename`,
  // which is how versions are grouped into a stack. Because it never differs
  // across versions, it can't tell you which version you're looking at.
  // `originalFilename` captures the ACTUAL name of the file uploaded for THIS
  // specific version (e.g. "Rough V4.mp4"), so the UI can show the right name
  // per selected version. Nullable: rows created before this column existed
  // (and any path that doesn't capture it) fall back to `filename`.
  originalFilename: text("original_filename"),
  fileType: text("file_type").notNull(), // "video", "audio", "image"
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  filePath: text("file_path").notNull(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  // Optional sub-folder within the project. NULL = file lives at the project root.
  folderId: integer("folder_id"),
  uploadedById: integer("uploaded_by_id").notNull().references(() => users.id),
  version: integer("version").notNull().default(1),
  isLatestVersion: boolean("is_latest_version").notNull().default(true),
  isAvailable: boolean("is_available").notNull().default(true), // Track if file is physically available
  shareToken: text("share_token"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Soft delete: NULL = live, NOT NULL = trashed. A nightly job
  // (server/index.ts) purges files older than FILE_TRASH_RETENTION_DAYS
  // (default 7) by unlinking from disk + DELETE row.
  deletedAt: timestamp("deleted_at"),
  // Directed review loop. `reviewStatus` reflects the file's current
  // position in the editor<->reviewer ping-pong:
  //   'needs_review'      - newly uploaded; awaiting reviewer action
  //   'changes_requested' - a reviewer asked for changes; uploader must respond
  //   'approved'          - at least one non-uploader signed off
  // `requestedChangesById` is set when a reviewer clicks "Request Changes"
  // and cleared when the uploader posts a new version. The new version's
  // upload route reads the OLD latest version's `requestedChangesById` to
  // know who to email when the editor responds.
  reviewStatus: text("review_status").notNull().default("needs_review"),
  requestedChangesById: integer("requested_changes_by_id").references(() => users.id),
  // For share-link reviewers (no user account): the email address to
  // notify when the editor uploads a new version. Set by the public
  // request-changes route, cleared on approve. Only consulted when
  // requestedChangesById is NULL.
  requestedChangesByEmail: text("requested_changes_by_email"),
});

export const insertFileSchema = createInsertSchema(files)
  .omit({ id: true, createdAt: true, deletedAt: true, reviewStatus: true, requestedChangesById: true, requestedChangesByEmail: true });

// COMMENT SCHEMA
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  fileId: integer("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  parentId: integer("parent_id"), // For comment replies (null if top-level)
  // Seconds into the media, stored as double precision so a comment lands
  // on the exact frame the user paused on — not the rounded second.
  timestamp: doublePrecision("timestamp"),
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
  // Seconds into the media; doublePrecision so frame-accurate timestamps
  // survive the round-trip (was integer, which rounded to whole seconds).
  timestamp: doublePrecision("timestamp"),
  creatorToken: text("creator_token"), // For tracking comment ownership (nullable for existing records)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPublicCommentSchema = createInsertSchema(publicComments)
  .omit({ id: true, createdAt: true })
  .extend({
    displayName: z.string().min(2, "Name must be at least 2 characters").max(40, "Name must be 40 characters or less"),
    content: z.string().min(1, "Comment cannot be empty").max(1000, "Comment must be 1000 characters or less"),
    timestamp: z.number().min(0).optional(),
    parentId: z.number().optional(),
    creatorToken: z.string().min(1, "Creator token is required").optional()
  });

// UNIFIED COMMENT SCHEMA (replacement for comments + publicComments with UUID)
export const commentsUnified = pgTable("comments_unified", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  fileId: integer("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id), // Nullable for public comments
  isPublic: boolean("is_public").notNull().default(false),
  authorName: text("author_name").notNull(), // Display name for both auth and public users
  authorEmail: text("author_email"), // Optional email for public users
  creatorToken: text("creator_token"), // For public comment deletion
  parentId: text("parent_id").references((): any => commentsUnified.id), // Self-reference with UUID
  content: text("content").notNull(),
  // Seconds into the media. doublePrecision so we preserve frame accuracy
  // (e.g. 12.5417s on a 24fps clip) instead of rounding to whole seconds
  // like the original integer column did.
  timestamp: doublePrecision("timestamp"),
  // Optional in/out range (Frame.io / Premiere style). When both are set the
  // comment refers to a span (e.g. "this section drags") rather than a single
  // moment. `timestamp` is still populated (= inPoint) so existing code paths
  // that key off a single time keep working. Stored doublePrecision for the
  // same frame-accuracy reason as `timestamp`.
  inPoint: doublePrecision("in_point"),
  outPoint: doublePrecision("out_point"),
  annotations: text("annotations"), // JSON string of drawing annotations on frame
  isResolved: boolean("is_resolved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCommentsUnifiedSchema = createInsertSchema(commentsUnified)
  .omit({ id: true, createdAt: true })
  .extend({
    authorName: z.string().min(2, "Name must be at least 2 characters").max(40, "Name must be 40 characters or less"),
    content: z.string().min(1, "Comment cannot be empty").max(1000, "Comment must be 1000 characters or less"),
    authorEmail: z.string().email("Invalid email format").optional(),
    timestamp: z.number().min(0).optional().nullable().transform(val => val === null ? undefined : val),
    inPoint: z.number().min(0).optional().nullable().transform(val => val === null ? undefined : val),
    outPoint: z.number().min(0).optional().nullable().transform(val => val === null ? undefined : val),
    parentId: z.string().uuid().optional().nullable().transform(val => val || undefined),
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

// RECENT PROJECTS — tracks the last time each user opened each project so
// the sidebar can surface their personal "Recent" list across devices.
export const recentProjects = pgTable("recent_projects", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.projectId] }),
}));

export type RecentProject = typeof recentProjects.$inferSelect;

// ACTIVITY LOG SCHEMA
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(), // "create", "update", "delete", "approve", "comment", etc.
  entityType: text("entity_type").notNull(), // "project", "file", "comment", "user", etc.
  entityId: integer("entity_id").notNull(),
  // Nullable for unauthenticated actors (public share-link review actions
  // and reviewer uploads). Identity is preserved in `metadata` instead.
  userId: integer("user_id"),
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
  // Full ffprobe JSON (format + streams) captured at processing time so the
  // MediaInfo dialog can render rich technical details without re-running
  // ffprobe on every open.
  mediaInfo: json("media_info").$type<any>(),
  duration: integer("duration"), // video duration in seconds
  frameRate: integer("frame_rate"), // frames per second
  errorMessage: text("error_message"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVideoProcessingSchema = createInsertSchema(videoProcessing)
  .omit({ id: true, createdAt: true });

// TRANSCRIPTS SCHEMA
export const transcripts = pgTable("transcripts", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // "pending", "processing", "completed", "failed"
  language: text("language"),
  modelName: text("model_name"),
  segments: json("segments").$type<Array<{ start: number; end: number; text: string; avgLogprob?: number | null; noSpeechProb?: number | null }>>(),
  text: text("text"),
  errorMessage: text("error_message"),
  processedAt: timestamp("processed_at"),
  summary: text("summary"),
  summaryStatus: text("summary_status").default("pending"), // "pending", "processing", "completed", "failed"
  summaryError: text("summary_error"),
  summaryModel: text("summary_model"),
  summaryProcessedAt: timestamp("summary_processed_at"),
  // ID of the in-flight job on the spark worker (null when not using async API
  // or when the job has terminated and been reaped). Used to resume polling
  // across app restarts so transcripts don't get stuck in 'processing'.
  sparkJobId: text("spark_job_id"),
  chapters: json("chapters").$type<Array<{ start: number; title: string; summary?: string }>>(),
  chaptersStatus: text("chapters_status").default("pending"),
  chaptersError: text("chapters_error"),
  chaptersModel: text("chapters_model"),
  chaptersProcessedAt: timestamp("chapters_processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTranscriptSchema = createInsertSchema(transcripts)
  .omit({ id: true, createdAt: true, updatedAt: true });

// COMMENT REACTIONS SCHEMA
export const commentReactions = pgTable("comment_reactions", {
  id: serial("id").primaryKey(),
  commentId: text("comment_id").notNull().references(() => commentsUnified.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id), // Nullable for public reactions
  creatorToken: text("creator_token"), // For public user reactions
  reactionType: text("reaction_type").notNull(), // "👍", "❤️", "👏", "🎉", "😮", "😢", "😡"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCommentReactionSchema = createInsertSchema(commentReactions)
  .omit({ id: true, createdAt: true })
  .extend({
    reactionType: z.enum(["👍", "❤️", "👏", "🎉", "😮", "😢", "😡"]),
  });

// SHARE LINKS SCHEMA - project/folder/file share links with per-link settings
export const shareLinks = pgTable("share_links", {
  id: text("id").primaryKey(), // UUID
  token: text("token").notNull().unique(),
  scopeType: text("scope_type").notNull(), // "project" | "folder" | "file"
  scopeId: integer("scope_id").notNull(),
  name: text("name"),
  // Optional per-link social-preview image (Open Graph). When set, the share
  // link's link-preview card uses this image instead of the auto-derived
  // file/project thumbnail. Uploaded via the dedicated thumbnail endpoint.
  customThumbnailPath: text("custom_thumbnail_path"),
  passwordHash: text("password_hash"),
  expiresAt: timestamp("expires_at"),
  allowDownloads: boolean("allow_downloads").notNull().default(false),
  allowComments: boolean("allow_comments").notNull().default(true),
  allowUploads: boolean("allow_uploads").notNull().default(false),
  requireEmail: boolean("require_email").notNull().default(false),
  watermarkEnabled: boolean("watermark_enabled").notNull().default(false),
  watermarkText: text("watermark_text"),
  revokedAt: timestamp("revoked_at"),
  createdById: integer("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertShareLinkSchema = createInsertSchema(shareLinks)
  .omit({ id: true, token: true, passwordHash: true, createdAt: true, revokedAt: true })
  .extend({
    scopeType: z.enum(["project", "folder", "file"]),
    name: z.string().max(80).optional().nullable(),
    password: z.string().min(1).max(200).optional().nullable(),
    expiresAt: z.union([z.string(), z.date()]).optional().nullable(),
    allowDownloads: z.boolean().optional(),
    allowComments: z.boolean().optional(),
    allowUploads: z.boolean().optional(),
    requireEmail: z.boolean().optional(),
    watermarkEnabled: z.boolean().optional(),
    watermarkText: z.string().max(120).optional().nullable(),
  });

export const updateShareLinkSchema = z.object({
  name: z.string().max(80).optional().nullable(),
  password: z.string().min(1).max(200).optional().nullable(), // empty string = clear
  clearPassword: z.boolean().optional(),
  expiresAt: z.union([z.string(), z.date(), z.null()]).optional(),
  allowDownloads: z.boolean().optional(),
  allowComments: z.boolean().optional(),
  allowUploads: z.boolean().optional(),
  requireEmail: z.boolean().optional(),
  watermarkEnabled: z.boolean().optional(),
  watermarkText: z.string().max(120).optional().nullable(),
});

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

export type CommentUnified = typeof commentsUnified.$inferSelect;
export type InsertCommentUnified = z.infer<typeof insertCommentsUnifiedSchema>;

// Unified comment type for merging authenticated and public comments (LEGACY - to be replaced)
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

// New unified comment API response type with UUID IDs and stable structure
export type GlobalComment = {
  id: string; // UUID
  parentId: string | null; // UUID reference 
  fileId: number;
  content: string;
  isPublic: boolean;
  timestamp: number | null;
  isResolved: boolean;
  createdAt: Date;
  author: {
    id?: number; // Present for authenticated users
    name: string;
  };
  canDelete: boolean; // Server-computed based on ownership/permissions
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

export type CommentReaction = typeof commentReactions.$inferSelect;

export type ShareLink = typeof shareLinks.$inferSelect;
export type InsertShareLink = z.infer<typeof insertShareLinkSchema>;
export type UpdateShareLink = z.infer<typeof updateShareLinkSchema>;
export type InsertCommentReaction = z.infer<typeof insertCommentReactionSchema>;
