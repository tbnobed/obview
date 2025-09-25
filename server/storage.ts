import {
  users,
  projects,
  folders,
  files,
  comments,
  publicComments,
  projectUsers,
  activityLogs,
  invitations,
  approvals,
  passwordResets,
  videoProcessing,
  type User,
  type InsertUser,
  type Folder,
  type InsertFolder,
  type Project,
  type InsertProject,
  type File,
  type InsertFile,
  type Comment,
  type InsertComment,
  type PublicComment,
  type InsertPublicComment,
  type UnifiedComment,
  type ProjectUser,
  type InsertProjectUser,
  type ActivityLog,
  type InsertActivityLog,
  type Invitation,
  type InsertInvitation,
  type Approval,
  type InsertApproval,
  type PasswordReset,
  type InsertPasswordReset,
  type VideoProcessing,
  type InsertVideoProcessing
} from "@shared/schema";
import createMemoryStore from "memorystore";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { eq, and, desc } from "drizzle-orm";
import { db, pool } from "./db";

const MemoryStore = createMemoryStore(session);
const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User management
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;

  // Folder management
  getFolder(id: number): Promise<Folder | undefined>;
  getAllFolders(): Promise<Folder[]>;
  getFoldersByUser(userId: number): Promise<Folder[]>;
  createFolder(folder: InsertFolder): Promise<Folder>;
  updateFolder(id: number, data: Partial<InsertFolder>): Promise<Folder | undefined>;
  deleteFolder(id: number): Promise<boolean>;

  // Project management
  getProject(id: number): Promise<Project | undefined>;
  getAllProjects(): Promise<Project[]>;
  getProjectsByUser(userId: number): Promise<Project[]>;
  getProjectsByFolder(folderId: number): Promise<Project[]>;
  getAllProjectsWithLatestVideo(): Promise<(Project & { latestVideoFile?: File })[]>;
  getProjectsByUserWithLatestVideo(userId: number): Promise<(Project & { latestVideoFile?: File })[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: number): Promise<boolean>;

  // File management
  getFile(id: number): Promise<File | undefined>;
  getFilesByProject(projectId: number): Promise<File[]>;
  getAllFiles(): Promise<File[]>;
  createFile(file: InsertFile): Promise<File>;
  updateFile(id: number, data: Partial<InsertFile>): Promise<File | undefined>;
  deleteFile(id: number): Promise<boolean>;
  
  // Video processing management
  createVideoProcessing(processing: InsertVideoProcessing): Promise<VideoProcessing>;
  getVideoProcessing(fileId: number): Promise<VideoProcessing | undefined>;
  updateVideoProcessing(id: number, data: Partial<InsertVideoProcessing>): Promise<VideoProcessing | undefined>;

  // Comment management
  getComment(id: number): Promise<Comment | undefined>;
  getCommentsByFile(fileId: number): Promise<Comment[]>;
  getCommentReplies(commentId: number): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;
  updateComment(id: number, data: Partial<InsertComment>): Promise<Comment | undefined>;
  deleteComment(id: number): Promise<boolean>;

  // Public comment management
  getPublicComment(id: number): Promise<PublicComment | undefined>;
  getPublicCommentsByFile(fileId: number): Promise<PublicComment[]>;
  createPublicComment(publicComment: InsertPublicComment): Promise<PublicComment>;
  deletePublicComment(id: number): Promise<boolean>;
  getUnifiedCommentsByFile(fileId: number): Promise<UnifiedComment[]>;
  getFileByShareToken(token: string): Promise<File | undefined>;
  getFileWithProjectByShareToken(token: string): Promise<(File & { projectName: string }) | undefined>;

  // Project user management
  getProjectUser(projectId: number, userId: number): Promise<ProjectUser | undefined>;
  getProjectUsers(projectId: number): Promise<ProjectUser[]>;
  getUserProjects(userId: number): Promise<ProjectUser[]>;
  addUserToProject(projectUser: InsertProjectUser): Promise<ProjectUser>;
  updateProjectUserRole(id: number, role: string): Promise<ProjectUser | undefined>;
  removeUserFromProject(projectId: number, userId: number): Promise<boolean>;

  // Activity logging
  logActivity(activity: InsertActivityLog): Promise<ActivityLog>;
  getActivitiesByProject(projectId: number): Promise<ActivityLog[]>;
  getActivitiesByUser(userId: number): Promise<ActivityLog[]>;
  getAllActivities(): Promise<ActivityLog[]>;

  // Invitations
  createInvitation(invitation: InsertInvitation): Promise<Invitation>;
  getInvitationById(id: number): Promise<Invitation | undefined>;
  getInvitationByToken(token: string): Promise<Invitation | undefined>;
  getInvitationsByProject(projectId: number): Promise<Invitation[]>;
  updateInvitation(id: number, data: Partial<Invitation>): Promise<Invitation | undefined>;
  deleteInvitation(id: number): Promise<boolean>;

  // Approvals
  createApproval(approval: InsertApproval): Promise<Approval>;
  getApprovalsByFile(fileId: number): Promise<Approval[]>;
  getApprovalByUserAndFile(userId: number, fileId: number): Promise<Approval | undefined>;
  updateApproval(id: number, data: Partial<InsertApproval>): Promise<Approval | undefined>;
  
  // Password Reset
  createPasswordReset(passwordReset: InsertPasswordReset): Promise<PasswordReset>;
  getPasswordResetByToken(token: string): Promise<PasswordReset | undefined>;
  getPasswordResetsByUser(userId: number): Promise<PasswordReset[]>;
  updatePasswordReset(id: number, data: Partial<PasswordReset>): Promise<PasswordReset | undefined>;

  // Session store
  sessionStore: any; // Using any to avoid type issues
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private folders: Map<number, Folder>;
  private projects: Map<number, Project>;
  private files: Map<number, File>;
  private comments: Map<number, Comment>;
  private publicComments: Map<number, PublicComment>;
  private projectUsers: Map<number, ProjectUser>;
  private activityLogs: Map<number, ActivityLog>;
  private invitations: Map<number, Invitation>;
  private approvals: Map<number, Approval>;
  private passwordResets: Map<number, PasswordReset>;
  private videoProcessing: Map<number, VideoProcessing>;
  sessionStore: any; // Using any to avoid type issues

  currentUserId: number;
  currentFolderId: number;
  currentProjectId: number;
  currentFileId: number;
  currentCommentId: number;
  currentPublicCommentId: number;
  currentProjectUserId: number;
  currentActivityLogId: number;
  currentInvitationId: number;
  currentApprovalId: number;
  currentPasswordResetId: number;
  currentVideoProcessingId: number;

  constructor() {
    this.users = new Map();
    this.folders = new Map();
    this.projects = new Map();
    this.files = new Map();
    this.comments = new Map();
    this.publicComments = new Map();
    this.projectUsers = new Map();
    this.activityLogs = new Map();
    this.invitations = new Map();
    this.approvals = new Map();
    this.passwordResets = new Map();
    this.videoProcessing = new Map();
    
    this.currentUserId = 1;
    this.currentFolderId = 1;
    this.currentProjectId = 1;
    this.currentFileId = 1;
    this.currentCommentId = 1;
    this.currentPublicCommentId = 1;
    this.currentProjectUserId = 1;
    this.currentActivityLogId = 1;
    this.currentInvitationId = 1;
    this.currentApprovalId = 1;
    this.currentPasswordResetId = 1;
    this.currentVideoProcessingId = 1;

    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const now = new Date();
    const user: User = { 
      ...insertUser, 
      id,
      createdAt: now
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser: User = { ...user, ...data };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async deleteUser(id: number): Promise<boolean> {
    return this.users.delete(id);
  }

  // Folder methods
  async getFolder(id: number): Promise<Folder | undefined> {
    return this.folders.get(id);
  }

  async getAllFolders(): Promise<Folder[]> {
    return Array.from(this.folders.values());
  }

  async getFoldersByUser(userId: number): Promise<Folder[]> {
    return Array.from(this.folders.values()).filter(
      (folder) => folder.createdById === userId
    );
  }

  async createFolder(insertFolder: InsertFolder): Promise<Folder> {
    const id = this.currentFolderId++;
    const now = new Date();
    const folder: Folder = {
      ...insertFolder,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.folders.set(id, folder);
    return folder;
  }

  async updateFolder(id: number, data: Partial<InsertFolder>): Promise<Folder | undefined> {
    const folder = this.folders.get(id);
    if (!folder) return undefined;
    
    const updatedFolder: Folder = { 
      ...folder, 
      ...data,
      updatedAt: new Date()
    };
    this.folders.set(id, updatedFolder);
    return updatedFolder;
  }

  async deleteFolder(id: number): Promise<boolean> {
    return this.folders.delete(id);
  }

  // Project methods
  async getProject(id: number): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async getAllProjects(): Promise<Project[]> {
    return Array.from(this.projects.values());
  }

  async getProjectsByUser(userId: number): Promise<Project[]> {
    const userProjectRoles = Array.from(this.projectUsers.values()).filter(
      (pu) => pu.userId === userId
    );
    
    return userProjectRoles.map(
      (pu) => this.projects.get(pu.projectId)!
    ).filter(Boolean);
  }

  async getProjectsByFolder(folderId: number): Promise<Project[]> {
    return Array.from(this.projects.values()).filter(
      (project) => project.folderId === folderId
    );
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = this.currentProjectId++;
    const now = new Date();
    const project: Project = {
      ...insertProject,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.projects.set(id, project);
    return project;
  }

  async updateProject(id: number, data: Partial<InsertProject>): Promise<Project | undefined> {
    const project = this.projects.get(id);
    if (!project) return undefined;
    
    const updatedProject: Project = { 
      ...project, 
      ...data,
      updatedAt: new Date()
    };
    this.projects.set(id, updatedProject);
    return updatedProject;
  }

  async deleteProject(id: number): Promise<boolean> {
    return this.projects.delete(id);
  }

  async getAllProjectsWithLatestVideo(): Promise<(Project & { latestVideoFile?: File })[]> {
    const allProjects = Array.from(this.projects.values());
    return allProjects.map(project => {
      const projectFiles = Array.from(this.files.values()).filter(
        file => file.projectId === project.id && file.fileType === 'video'
      );
      const latestVideoFile = projectFiles.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
      
      return {
        ...project,
        latestVideoFile
      };
    });
  }

  async getProjectsByUserWithLatestVideo(userId: number): Promise<(Project & { latestVideoFile?: File })[]> {
    const userProjectRoles = Array.from(this.projectUsers.values()).filter(
      (pu) => pu.userId === userId
    );
    
    const userProjects = userProjectRoles.map(
      (pu) => this.projects.get(pu.projectId)!
    ).filter(Boolean);

    return userProjects.map(project => {
      const projectFiles = Array.from(this.files.values()).filter(
        file => file.projectId === project.id && file.fileType === 'video'
      );
      const latestVideoFile = projectFiles.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
      
      return {
        ...project,
        latestVideoFile
      };
    });
  }

  // File methods
  async getFile(id: number): Promise<File | undefined> {
    return this.files.get(id);
  }

  async getFilesByProject(projectId: number): Promise<File[]> {
    return Array.from(this.files.values()).filter(
      (file) => file.projectId === projectId
    );
  }
  
  async getAllFiles(): Promise<File[]> {
    return Array.from(this.files.values());
  }

  async createFile(insertFile: InsertFile): Promise<File> {
    const id = this.currentFileId++;
    const now = new Date();
    const file: File = {
      ...insertFile,
      id,
      createdAt: now
    };
    this.files.set(id, file);
    return file;
  }

  async updateFile(id: number, data: Partial<InsertFile>): Promise<File | undefined> {
    const file = this.files.get(id);
    if (!file) return undefined;
    
    const updatedFile: File = { ...file, ...data };
    this.files.set(id, updatedFile);
    return updatedFile;
  }

  async deleteFile(id: number): Promise<boolean> {
    return this.files.delete(id);
  }

  // Comment methods
  async getComment(id: number): Promise<Comment | undefined> {
    return this.comments.get(id);
  }

  async getCommentsByFile(fileId: number): Promise<Comment[]> {
    const rawComments = Array.from(this.comments.values()).filter(
      (comment) => comment.fileId === fileId
    );
    
    // Sanitize comments to break cycles and fix corrupt data (same as DatabaseStorage)
    return this.sanitizeMemStorageComments(rawComments);
  }

  // MemStorage version of comment sanitization
  private sanitizeMemStorageComments(comments: Comment[]): Comment[] {
    const sanitized: Comment[] = [];
    const commentMap = new Map<number, Comment>();
    
    // First pass: build map and fix self-parenting
    for (const comment of comments) {
      let sanitizedComment = { ...comment };
      
      // Fix self-parenting
      if (sanitizedComment.parentId === sanitizedComment.id) {
        console.warn(`MemStorage: Breaking self-parenting cycle for comment ${sanitizedComment.id}`);
        sanitizedComment.parentId = null;
      }
      
      commentMap.set(sanitizedComment.id, sanitizedComment);
    }
    
    // Second pass: detect cycles using ancestor walking
    for (const comment of commentMap.values()) {
      if (comment.parentId && this.detectMemStorageCommentCycle(comment, commentMap)) {
        console.warn(`MemStorage: Breaking cycle detected for comment ${comment.id}`);
        comment.parentId = null;
      }
      sanitized.push(comment);
    }
    
    return sanitized;
  }

  // MemStorage cycle detection for reading
  private detectMemStorageCommentCycle(comment: Comment, commentMap: Map<number, Comment>): boolean {
    const visited = new Set<number>();
    let current = comment;
    
    while (current.parentId) {
      if (visited.has(current.id)) {
        return true; // Cycle detected
      }
      visited.add(current.id);
      
      const parent = commentMap.get(current.parentId);
      if (!parent) {
        // Parent doesn't exist, break chain
        console.warn(`MemStorage: Parent ${current.parentId} not found for comment ${current.id}`);
        break;
      }
      
      current = parent;
      
      // Depth limit safety
      if (visited.size > 50) {
        console.warn(`MemStorage: Max depth exceeded, breaking chain for comment ${comment.id}`);
        return true;
      }
    }
    
    return false;
  }

  async getCommentReplies(commentId: number): Promise<Comment[]> {
    return Array.from(this.comments.values()).filter(
      (comment) => comment.parentId === commentId
    );
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    // Same validation as DatabaseStorage for consistency
    if (insertComment.parentId !== undefined && insertComment.parentId !== null) {
      // 1. Check if parent exists in either regular comments or public comments
      const parentRegularComment = this.comments.get(insertComment.parentId);
      const parentPublicComment = this.publicComments.get(insertComment.parentId);
      
      const parentComment = parentRegularComment || parentPublicComment;
      if (!parentComment) {
        throw new Error("Parent comment does not exist");
      }
      
      // 2. Ensure parent belongs to the same file
      if (parentComment.fileId !== insertComment.fileId) {
        throw new Error("Parent comment must belong to the same file");
      }
      
      // 3. Check for cycles by walking up the parent chain
      if (this.wouldCreateCommentCycle(insertComment.parentId)) {
        throw new Error("Creating this comment would create a cycle in the comment thread");
      }
    }
    
    const id = this.currentCommentId++;
    const now = new Date();
    const comment: Comment = {
      ...insertComment,
      id,
      createdAt: now
    };
    this.comments.set(id, comment);
    return comment;
  }

  // Helper for MemStorage cycle detection
  private wouldCreateCommentCycle(parentId: number): boolean {
    const visited = new Set<number>();
    let currentId = parentId;
    
    while (currentId) {
      if (visited.has(currentId)) {
        return true; // Cycle detected
      }
      visited.add(currentId);
      
      const parent = this.comments.get(currentId);
      if (!parent || !parent.parentId) {
        break; // Reached root or non-existent parent
      }
      
      currentId = parent.parentId;
      
      // Safety depth limit
      if (visited.size > 50) {
        console.warn(`MemStorage: Max depth exceeded during cycle check, assuming cycle`);
        return true;
      }
    }
    
    return false;
  }

  async updateComment(id: number, data: Partial<InsertComment>): Promise<Comment | undefined> {
    const comment = this.comments.get(id);
    if (!comment) return undefined;
    
    const updatedComment: Comment = { ...comment, ...data };
    this.comments.set(id, updatedComment);
    return updatedComment;
  }

  async deleteComment(id: number): Promise<boolean> {
    return this.comments.delete(id);
  }

  // Public Comment methods
  async getPublicComment(id: number): Promise<PublicComment | undefined> {
    return this.publicComments.get(id);
  }

  async getPublicCommentsByFile(fileId: number): Promise<PublicComment[]> {
    const rawComments = Array.from(this.publicComments.values()).filter(
      (comment) => comment.fileId === fileId
    );
    
    // Sanitize public comments to break cycles and fix corrupt data (same as DatabaseStorage)
    return this.sanitizeMemStoragePublicComments(rawComments);
  }

  // MemStorage version of public comment sanitization
  private sanitizeMemStoragePublicComments(comments: PublicComment[]): PublicComment[] {
    const sanitized: PublicComment[] = [];
    const commentMap = new Map<number, PublicComment>();
    
    // First pass: build map and fix self-parenting
    for (const comment of comments) {
      let sanitizedComment = { ...comment };
      
      // Fix self-parenting
      if (sanitizedComment.parentId === sanitizedComment.id) {
        console.warn(`MemStorage: Breaking self-parenting cycle for public comment ${sanitizedComment.id}`);
        sanitizedComment.parentId = null;
      }
      
      commentMap.set(sanitizedComment.id, sanitizedComment);
    }
    
    // Second pass: detect cycles using ancestor walking
    for (const comment of commentMap.values()) {
      if (comment.parentId && this.detectMemStoragePublicCommentCycle(comment, commentMap)) {
        console.warn(`MemStorage: Breaking cycle detected for public comment ${comment.id}`);
        comment.parentId = null;
      }
      sanitized.push(comment);
    }
    
    return sanitized;
  }

  // MemStorage public comment cycle detection for reading
  private detectMemStoragePublicCommentCycle(comment: PublicComment, commentMap: Map<number, PublicComment>): boolean {
    const visited = new Set<number>();
    let current = comment;
    
    while (current.parentId) {
      if (visited.has(current.id)) {
        return true; // Cycle detected
      }
      visited.add(current.id);
      
      const parent = commentMap.get(current.parentId);
      if (!parent) {
        // Parent doesn't exist, break chain
        console.warn(`MemStorage: Public comment parent ${current.parentId} not found for comment ${current.id}`);
        break;
      }
      
      current = parent;
      
      // Depth limit safety
      if (visited.size > 50) {
        console.warn(`MemStorage: Max depth exceeded for public comment, breaking chain for comment ${comment.id}`);
        return true;
      }
    }
    
    return false;
  }

  async createPublicComment(insertPublicComment: InsertPublicComment): Promise<PublicComment> {
    // Same validation as DatabaseStorage for consistency
    if (insertPublicComment.parentId !== undefined && insertPublicComment.parentId !== null) {
      // 1. Check if parent exists
      const parentComment = this.publicComments.get(insertPublicComment.parentId);
      if (!parentComment) {
        throw new Error("Parent comment does not exist");
      }
      
      // 2. Ensure parent belongs to the same file
      if (parentComment.fileId !== insertPublicComment.fileId) {
        throw new Error("Parent comment must belong to the same file");
      }
      
      // 3. Check for cycles by walking up the parent chain
      if (this.wouldCreatePublicCommentCycle(insertPublicComment.parentId)) {
        throw new Error("Creating this comment would create a cycle in the comment thread");
      }
    }
    
    const id = this.currentPublicCommentId++;
    const now = new Date();
    const publicComment: PublicComment = {
      ...insertPublicComment,
      id,
      createdAt: now
    };
    this.publicComments.set(id, publicComment);
    return publicComment;
  }

  // Helper for MemStorage public comment cycle detection
  private wouldCreatePublicCommentCycle(parentId: number): boolean {
    const visited = new Set<number>();
    let currentId = parentId;
    
    while (currentId) {
      if (visited.has(currentId)) {
        return true; // Cycle detected
      }
      visited.add(currentId);
      
      const parent = this.publicComments.get(currentId);
      if (!parent || !parent.parentId) {
        break; // Reached root or non-existent parent
      }
      
      currentId = parent.parentId;
      
      // Safety depth limit
      if (visited.size > 50) {
        console.warn(`MemStorage: Max depth exceeded during public comment cycle check, assuming cycle`);
        return true;
      }
    }
    
    return false;
  }

  async deletePublicComment(id: number): Promise<boolean> {
    return this.publicComments.delete(id);
  }

  async getUnifiedCommentsByFile(fileId: number): Promise<UnifiedComment[]> {
    const regularComments = await this.getCommentsByFile(fileId);
    const publicComments = await this.getPublicCommentsByFile(fileId);
    
    // Convert regular comments to unified format
    const unifiedRegularComments: UnifiedComment[] = await Promise.all(
      regularComments.map(async (comment) => {
        const user = await this.getUser(comment.userId);
        return {
          id: comment.id,
          content: comment.content,
          fileId: comment.fileId,
          timestamp: comment.timestamp,
          isResolved: comment.isResolved,
          createdAt: comment.createdAt,
          isPublic: false,
          authorName: user?.name || 'Unknown User',
          user: user ? {
            id: user.id,
            name: user.name,
            username: user.username
          } : undefined,
          parentId: comment.parentId
        };
      })
    );
    
    // Convert public comments to unified format
    const unifiedPublicComments: UnifiedComment[] = publicComments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      fileId: comment.fileId,
      timestamp: comment.timestamp,
      createdAt: comment.createdAt,
      isPublic: true,
      authorName: comment.displayName,
      parentId: comment.parentId
    }));
    
    // Merge and sort by creation date and timestamp
    const allComments = [...unifiedRegularComments, ...unifiedPublicComments];
    return allComments.sort((a, b) => {
      // First sort by creation date
      const dateComparison = a.createdAt.getTime() - b.createdAt.getTime();
      if (dateComparison !== 0) return dateComparison;
      
      // Then by timestamp if available
      if (a.timestamp && b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      return 0;
    });
  }

  async getFileByShareToken(token: string): Promise<File | undefined> {
    return Array.from(this.files.values()).find(
      (file) => file.shareToken === token
    );
  }

  async getFileWithProjectByShareToken(token: string): Promise<(File & { projectName: string }) | undefined> {
    const file = Array.from(this.files.values()).find(
      (file) => file.shareToken === token
    );
    
    if (!file) {
      return undefined;
    }
    
    const project = Array.from(this.projects.values()).find(
      (project) => project.id === file.projectId
    );
    
    if (!project) {
      return undefined;
    }
    
    return {
      ...file,
      projectName: project.name
    };
  }

  // Project User methods
  async getProjectUser(projectId: number, userId: number): Promise<ProjectUser | undefined> {
    return Array.from(this.projectUsers.values()).find(
      (pu) => pu.projectId === projectId && pu.userId === userId
    );
  }

  async getProjectUsers(projectId: number): Promise<ProjectUser[]> {
    return Array.from(this.projectUsers.values()).filter(
      (pu) => pu.projectId === projectId
    );
  }

  async getUserProjects(userId: number): Promise<ProjectUser[]> {
    return Array.from(this.projectUsers.values()).filter(
      (pu) => pu.userId === userId
    );
  }

  async addUserToProject(insertProjectUser: InsertProjectUser): Promise<ProjectUser> {
    const id = this.currentProjectUserId++;
    const now = new Date();
    const projectUser: ProjectUser = {
      ...insertProjectUser,
      id,
      createdAt: now
    };
    this.projectUsers.set(id, projectUser);
    return projectUser;
  }

  async updateProjectUserRole(id: number, role: string): Promise<ProjectUser | undefined> {
    const projectUser = this.projectUsers.get(id);
    if (!projectUser) return undefined;
    
    const updatedProjectUser: ProjectUser = { ...projectUser, role };
    this.projectUsers.set(id, updatedProjectUser);
    return updatedProjectUser;
  }

  async removeUserFromProject(projectId: number, userId: number): Promise<boolean> {
    const projectUser = Array.from(this.projectUsers.values()).find(
      (pu) => pu.projectId === projectId && pu.userId === userId
    );
    
    if (!projectUser) return false;
    return this.projectUsers.delete(projectUser.id);
  }

  // Activity Log methods
  async logActivity(insertActivityLog: InsertActivityLog): Promise<ActivityLog> {
    const id = this.currentActivityLogId++;
    const now = new Date();
    const activityLog: ActivityLog = {
      ...insertActivityLog,
      id,
      createdAt: now
    };
    this.activityLogs.set(id, activityLog);
    return activityLog;
  }

  async getActivitiesByProject(projectId: number): Promise<ActivityLog[]> {
    return Array.from(this.activityLogs.values())
      .filter(log => log.entityType === 'project' && log.entityId === projectId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getActivitiesByUser(userId: number): Promise<ActivityLog[]> {
    return Array.from(this.activityLogs.values())
      .filter(log => log.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  async getAllActivities(): Promise<ActivityLog[]> {
    return Array.from(this.activityLogs.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Invitation methods
  async createInvitation(insertInvitation: InsertInvitation): Promise<Invitation> {
    const id = this.currentInvitationId++;
    const now = new Date();
    const invitation: Invitation = {
      ...insertInvitation,
      id,
      createdAt: now
    };
    this.invitations.set(id, invitation);
    return invitation;
  }

  async getInvitationById(id: number): Promise<Invitation | undefined> {
    return this.invitations.get(id);
  }

  async getInvitationByToken(token: string): Promise<Invitation | undefined> {
    return Array.from(this.invitations.values()).find(
      (invitation) => invitation.token === token
    );
  }
  
  async getInvitationsByProject(projectId: number): Promise<Invitation[]> {
    return Array.from(this.invitations.values()).filter(
      (invitation) => invitation.projectId === projectId && invitation.isAccepted === false
    );
  }
  
  async getAllInvitations(): Promise<Invitation[]> {
    return Array.from(this.invitations.values());
  }
  
  async deleteInvitation(id: number): Promise<boolean> {
    return this.invitations.delete(id);
  }

  async updateInvitation(id: number, data: Partial<Invitation>): Promise<Invitation | undefined> {
    const invitation = this.invitations.get(id);
    if (!invitation) return undefined;
    
    const updatedInvitation: Invitation = { ...invitation, ...data };
    this.invitations.set(id, updatedInvitation);
    return updatedInvitation;
  }

  // Approval methods
  async createApproval(insertApproval: InsertApproval): Promise<Approval> {
    const id = this.currentApprovalId++;
    const now = new Date();
    const approval: Approval = {
      ...insertApproval,
      id,
      createdAt: now
    };
    this.approvals.set(id, approval);
    return approval;
  }

  async getApprovalsByFile(fileId: number): Promise<Approval[]> {
    return Array.from(this.approvals.values())
      .filter(approval => approval.fileId === fileId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getApprovalByUserAndFile(userId: number, fileId: number): Promise<Approval | undefined> {
    return Array.from(this.approvals.values()).find(
      (approval) => approval.userId === userId && approval.fileId === fileId
    );
  }
  
  async updateApproval(id: number, data: Partial<InsertApproval>): Promise<Approval | undefined> {
    const approval = this.approvals.get(id);
    if (!approval) return undefined;
    
    const updatedApproval: Approval = { ...approval, ...data };
    this.approvals.set(id, updatedApproval);
    return updatedApproval;
  }

  // Password Reset methods
  async createPasswordReset(insertPasswordReset: InsertPasswordReset): Promise<PasswordReset> {
    const id = this.currentPasswordResetId++;
    const now = new Date();
    const passwordReset: PasswordReset = {
      ...insertPasswordReset,
      id,
      createdAt: now
    };
    this.passwordResets.set(id, passwordReset);
    return passwordReset;
  }

  async getPasswordResetByToken(token: string): Promise<PasswordReset | undefined> {
    return Array.from(this.passwordResets.values()).find(
      (reset) => reset.token === token && !reset.isUsed
    );
  }

  async getPasswordResetsByUser(userId: number): Promise<PasswordReset[]> {
    return Array.from(this.passwordResets.values()).filter(
      (reset) => reset.userId === userId
    );
  }

  async updatePasswordReset(id: number, data: Partial<PasswordReset>): Promise<PasswordReset | undefined> {
    const passwordReset = this.passwordResets.get(id);
    if (!passwordReset) return undefined;
    
    const updatedReset: PasswordReset = { ...passwordReset, ...data };
    this.passwordResets.set(id, updatedReset);
    return updatedReset;
  }

  // Video processing methods
  async createVideoProcessing(processing: InsertVideoProcessing): Promise<VideoProcessing> {
    const id = this.currentVideoProcessingId++;
    const created: VideoProcessing = {
      ...processing,
      id,
      createdAt: new Date(),
    };
    this.videoProcessing.set(id, created);
    return created;
  }

  async getVideoProcessing(fileId: number): Promise<VideoProcessing | undefined> {
    return Array.from(this.videoProcessing.values()).find(p => p.fileId === fileId);
  }

  async updateVideoProcessing(id: number, data: Partial<InsertVideoProcessing>): Promise<VideoProcessing | undefined> {
    const existing = this.videoProcessing.get(id);
    if (!existing) return undefined;
    
    const updated: VideoProcessing = { ...existing, ...data };
    this.videoProcessing.set(id, updated);
    return updated;
  }
}

export class DatabaseStorage implements IStorage {
  sessionStore: any; // Using any to avoid type issues

  constructor() {
    // Session store initialization moved to auth.ts for proper persistence
    this.sessionStore = new PostgresSessionStore({
      pool
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async deleteUser(id: number): Promise<boolean> {
    const result = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning({ deletedId: users.id });
    return result.length > 0;
  }

  // Folder methods
  async getFolder(id: number): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(eq(folders.id, id));
    return folder;
  }

  async getAllFolders(): Promise<Folder[]> {
    return await db.select().from(folders);
  }

  async getFoldersByUser(userId: number): Promise<Folder[]> {
    return await db
      .select()
      .from(folders)
      .where(eq(folders.createdById, userId));
  }

  async createFolder(insertFolder: InsertFolder): Promise<Folder> {
    const [folder] = await db.insert(folders).values(insertFolder).returning();
    return folder;
  }

  async updateFolder(id: number, data: Partial<InsertFolder>): Promise<Folder | undefined> {
    const [updatedFolder] = await db
      .update(folders)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(folders.id, id))
      .returning();
    return updatedFolder;
  }

  async deleteFolder(id: number): Promise<boolean> {
    const result = await db
      .delete(folders)
      .where(eq(folders.id, id))
      .returning({ deletedId: folders.id });
    return result.length > 0;
  }

  // Project methods
  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async getAllProjects(): Promise<Project[]> {
    return await db.select().from(projects);
  }

  async getProjectsByUser(userId: number): Promise<Project[]> {
    const userProjects = await db
      .select({
        project: projects
      })
      .from(projectUsers)
      .where(eq(projectUsers.userId, userId))
      .innerJoin(projects, eq(projectUsers.projectId, projects.id));

    return userProjects.map((up: { project: Project }) => up.project);
  }

  async getProjectsByFolder(folderId: number): Promise<Project[]> {
    return await db
      .select()
      .from(projects)
      .where(eq(projects.folderId, folderId));
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(insertProject).returning();
    return project;
  }

  async updateProject(id: number, data: Partial<InsertProject>): Promise<Project | undefined> {
    const [updatedProject] = await db
      .update(projects)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(projects.id, id))
      .returning();
    return updatedProject;
  }

  async deleteProject(id: number): Promise<boolean> {
    const result = await db
      .delete(projects)
      .where(eq(projects.id, id))
      .returning({ deletedId: projects.id });
    return result.length > 0;
  }

  async getAllProjectsWithLatestVideo(): Promise<(Project & { latestVideoFile?: File })[]> {
    const allProjects = await db.select().from(projects);
    
    const projectsWithVideo = await Promise.all(allProjects.map(async (project) => {
      const latestVideoFiles = await db
        .select()
        .from(files)
        .where(and(eq(files.projectId, project.id), eq(files.fileType, 'video')))
        .orderBy(desc(files.createdAt))
        .limit(1);
      
      return {
        ...project,
        latestVideoFile: latestVideoFiles[0] || undefined
      };
    }));
    
    return projectsWithVideo;
  }

  async getProjectsByUserWithLatestVideo(userId: number): Promise<(Project & { latestVideoFile?: File })[]> {
    const userProjects = await db
      .select({
        project: projects
      })
      .from(projectUsers)
      .where(eq(projectUsers.userId, userId))
      .innerJoin(projects, eq(projectUsers.projectId, projects.id));

    const projectsWithVideo = await Promise.all(userProjects.map(async (up) => {
      const latestVideoFiles = await db
        .select()
        .from(files)
        .where(and(eq(files.projectId, up.project.id), eq(files.fileType, 'video')))
        .orderBy(desc(files.createdAt))
        .limit(1);
      
      return {
        ...up.project,
        latestVideoFile: latestVideoFiles[0] || undefined
      };
    }));
    
    return projectsWithVideo;
  }

  // File methods
  async getFile(id: number): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, id));
    return file;
  }

  async getFilesByProject(projectId: number): Promise<File[]> {
    return await db.select().from(files).where(eq(files.projectId, projectId));
  }
  
  async getAllFiles(): Promise<File[]> {
    return await db.select().from(files);
  }

  async createFile(insertFile: InsertFile): Promise<File> {
    const [file] = await db.insert(files).values(insertFile).returning();
    return file;
  }

  async updateFile(id: number, data: Partial<InsertFile>): Promise<File | undefined> {
    const [updatedFile] = await db
      .update(files)
      .set(data)
      .where(eq(files.id, id))
      .returning();
    return updatedFile;
  }

  async deleteFile(id: number): Promise<boolean> {
    const result = await db
      .delete(files)
      .where(eq(files.id, id))
      .returning({ deletedId: files.id });
    return result.length > 0;
  }

  // Video processing methods
  async createVideoProcessing(processing: InsertVideoProcessing): Promise<VideoProcessing> {
    const [created] = await db.insert(videoProcessing).values(processing).returning();
    return created;
  }

  async getVideoProcessing(fileId: number): Promise<VideoProcessing | undefined> {
    const [processing] = await db
      .select()
      .from(videoProcessing)
      .where(eq(videoProcessing.fileId, fileId));
    return processing;
  }

  async updateVideoProcessing(id: number, data: Partial<InsertVideoProcessing>): Promise<VideoProcessing | undefined> {
    const [updated] = await db
      .update(videoProcessing)
      .set(data)
      .where(eq(videoProcessing.id, id))
      .returning();
    return updated;
  }

  // Comment methods
  async getComment(id: number): Promise<Comment | undefined> {
    const [comment] = await db.select().from(comments).where(eq(comments.id, id));
    return comment;
  }

  async getCommentsByFile(fileId: number): Promise<Comment[]> {
    const rawComments = await db.select().from(comments).where(eq(comments.fileId, fileId));
    
    // Sanitize comments to break cycles and fix corrupt data
    return await this.sanitizeComments(rawComments);
  }

  // Helper method to sanitize comments and break cycles
  private async sanitizeComments(comments: Comment[]): Promise<Comment[]> {
    const sanitized: Comment[] = [];
    const commentMap = new Map<number, Comment>();
    
    // First pass: build map and fix self-parenting
    for (const comment of comments) {
      let sanitizedComment = { ...comment };
      
      // Fix self-parenting
      if (sanitizedComment.parentId === sanitizedComment.id) {
        console.warn(`Backend: Breaking self-parenting cycle for comment ${sanitizedComment.id}`);
        sanitizedComment.parentId = null;
      }
      
      commentMap.set(sanitizedComment.id, sanitizedComment);
    }
    
    // Second pass: detect cycles using cross-table aware ancestor walking
    for (const comment of commentMap.values()) {
      if (comment.parentId && await this.detectCommentCycleAcrossTables(comment, comment.fileId)) {
        console.warn(`Backend: Breaking cycle detected for comment ${comment.id}`);
        comment.parentId = null;
      }
      sanitized.push(comment);
    }
    
    return sanitized;
  }

  // Cross-table cycle detection that checks both regular and public comments
  private async detectCommentCycleAcrossTables(comment: Comment | PublicComment, fileId: number): Promise<boolean> {
    const visited = new Set<number>();
    let currentId = comment.parentId;
    
    while (currentId) {
      if (visited.has(currentId)) {
        return true; // Cycle detected
      }
      visited.add(currentId);
      
      // Look for parent in both regular and public comments
      const [parentRegular] = await db.select().from(comments).where(eq(comments.id, currentId)).limit(1);
      const [parentPublic] = await db.select().from(publicComments).where(eq(publicComments.id, currentId)).limit(1);
      
      const parent = parentRegular || parentPublic;
      if (!parent) {
        // Parent doesn't exist in either table, this is valid (could be due to deletion)
        break;
      }
      
      // Ensure parent belongs to same file
      if (parent.fileId !== fileId) {
        break;
      }
      
      currentId = parent.parentId;
      
      // Depth limit safety
      if (visited.size > 50) {
        console.warn(`Backend: Max depth exceeded, breaking chain for comment ${comment.id}`);
        return true;
      }
    }
    
    return false;
  }

  // Detect cycles by walking up parent chain (legacy method for backward compatibility)
  private detectCommentCycle(comment: Comment, commentMap: Map<number, Comment>): boolean {
    const visited = new Set<number>();
    let current = comment;
    
    while (current.parentId) {
      if (visited.has(current.id)) {
        return true; // Cycle detected
      }
      visited.add(current.id);
      
      const parent = commentMap.get(current.parentId);
      if (!parent) {
        // Parent doesn't exist, break chain
        console.warn(`Backend: Parent ${current.parentId} not found for comment ${current.id}`);
        break;
      }
      
      current = parent;
      
      // Depth limit safety
      if (visited.size > 50) {
        console.warn(`Backend: Max depth exceeded, breaking chain for comment ${comment.id}`);
        return true;
      }
    }
    
    return false;
  }

  // Helper method to sanitize public comments and break cycles
  private async sanitizePublicComments(comments: PublicComment[]): Promise<PublicComment[]> {
    const sanitized: PublicComment[] = [];
    const commentMap = new Map<number, PublicComment>();
    
    // First pass: build map and fix self-parenting
    for (const comment of comments) {
      let sanitizedComment = { ...comment };
      
      // Fix self-parenting
      if (sanitizedComment.parentId === sanitizedComment.id) {
        console.warn(`Backend: Breaking self-parenting cycle for public comment ${sanitizedComment.id}`);
        sanitizedComment.parentId = null;
      }
      
      commentMap.set(sanitizedComment.id, sanitizedComment);
    }
    
    // Second pass: detect cycles using cross-table aware ancestor walking
    for (const comment of commentMap.values()) {
      if (comment.parentId && await this.detectCommentCycleAcrossTables(comment, comment.fileId)) {
        console.warn(`Backend: Breaking cycle detected for public comment ${comment.id}`);
        comment.parentId = null;
      }
      sanitized.push(comment);
    }
    
    return sanitized;
  }

  // Detect cycles by walking up parent chain for public comments
  private detectPublicCommentCycle(comment: PublicComment, commentMap: Map<number, PublicComment>): boolean {
    const visited = new Set<number>();
    let current = comment;
    
    while (current.parentId) {
      if (visited.has(current.id)) {
        return true; // Cycle detected
      }
      visited.add(current.id);
      
      const parent = commentMap.get(current.parentId);
      if (!parent) {
        // Parent doesn't exist, break chain
        console.warn(`Backend: Public comment parent ${current.parentId} not found for comment ${current.id}`);
        break;
      }
      
      current = parent;
      
      // Depth limit safety
      if (visited.size > 50) {
        console.warn(`Backend: Max depth exceeded for public comment, breaking chain for comment ${comment.id}`);
        return true;
      }
    }
    
    return false;
  }

  async getCommentReplies(commentId: number): Promise<Comment[]> {
    return await db
      .select()
      .from(comments)
      .where(eq(comments.parentId, commentId));
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    // Comprehensive validation before creating comment
    if (insertComment.parentId !== undefined && insertComment.parentId !== null) {
      // 1. Check if parent exists in either regular comments or public comments
      const [parentRegularComment] = await db.select().from(comments).where(eq(comments.id, insertComment.parentId)).limit(1);
      const [parentPublicComment] = await db.select().from(publicComments).where(eq(publicComments.id, insertComment.parentId)).limit(1);
      
      const parentComment = parentRegularComment || parentPublicComment;
      if (!parentComment) {
        throw new Error("Parent comment does not exist");
      }
      
      // 2. Ensure parent belongs to the same file
      if (parentComment.fileId !== insertComment.fileId) {
        throw new Error("Parent comment must belong to the same file");
      }
      
      // 3. Prevent immediate self-parenting (can't happen during creation, but safety check)
      // (Self-parenting with new ID is impossible, but this validates the logic)
      
      // 4. Check for cycles by walking up the parent chain
      const existingComments = await db.select().from(comments).where(eq(comments.fileId, insertComment.fileId));
      const commentMap = new Map<number, Comment>();
      existingComments.forEach(c => commentMap.set(c.id, c));
      
      // Simulate adding our new comment to check for cycles
      if (this.wouldCreateCycle(insertComment.parentId, commentMap)) {
        throw new Error("Creating this comment would create a cycle in the comment thread");
      }
    }
    
    const [comment] = await db.insert(comments).values(insertComment).returning();
    return comment;
  }

  // Helper to check if adding a comment with parentId would create a cycle
  private wouldCreateCycle(parentId: number, commentMap: Map<number, Comment>): boolean {
    const visited = new Set<number>();
    let currentId = parentId;
    
    while (currentId) {
      if (visited.has(currentId)) {
        return true; // Cycle detected
      }
      visited.add(currentId);
      
      const parent = commentMap.get(currentId);
      if (!parent || !parent.parentId) {
        break; // Reached root or non-existent parent
      }
      
      currentId = parent.parentId;
      
      // Safety depth limit
      if (visited.size > 50) {
        console.warn(`Backend: Max depth exceeded during cycle check, assuming cycle`);
        return true;
      }
    }
    
    return false;
  }

  async updateComment(id: number, data: Partial<InsertComment>): Promise<Comment | undefined> {
    const [updatedComment] = await db
      .update(comments)
      .set(data)
      .where(eq(comments.id, id))
      .returning();
    return updatedComment;
  }

  async deleteComment(id: number): Promise<boolean> {
    const result = await db
      .delete(comments)
      .where(eq(comments.id, id))
      .returning({ deletedId: comments.id });
    return result.length > 0;
  }

  // Project User methods
  async getProjectUser(projectId: number, userId: number): Promise<ProjectUser | undefined> {
    const [projectUser] = await db
      .select()
      .from(projectUsers)
      .where(
        and(
          eq(projectUsers.projectId, projectId),
          eq(projectUsers.userId, userId)
        )
      );
    return projectUser;
  }

  async getProjectUsers(projectId: number): Promise<ProjectUser[]> {
    return await db
      .select()
      .from(projectUsers)
      .where(eq(projectUsers.projectId, projectId));
  }

  async getUserProjects(userId: number): Promise<ProjectUser[]> {
    return await db
      .select()
      .from(projectUsers)
      .where(eq(projectUsers.userId, userId));
  }

  async addUserToProject(insertProjectUser: InsertProjectUser): Promise<ProjectUser> {
    const [projectUser] = await db
      .insert(projectUsers)
      .values(insertProjectUser)
      .returning();
    return projectUser;
  }

  async updateProjectUserRole(id: number, role: string): Promise<ProjectUser | undefined> {
    const [updatedProjectUser] = await db
      .update(projectUsers)
      .set({ role })
      .where(eq(projectUsers.id, id))
      .returning();
    return updatedProjectUser;
  }

  async removeUserFromProject(projectId: number, userId: number): Promise<boolean> {
    const result = await db
      .delete(projectUsers)
      .where(
        and(
          eq(projectUsers.projectId, projectId),
          eq(projectUsers.userId, userId)
        )
      )
      .returning({ id: projectUsers.id });
    return result.length > 0;
  }

  // Activity Log methods
  async logActivity(insertActivityLog: InsertActivityLog): Promise<ActivityLog> {
    const [activity] = await db
      .insert(activityLogs)
      .values(insertActivityLog)
      .returning();
    return activity;
  }

  async getActivitiesByProject(projectId: number): Promise<ActivityLog[]> {
    return await db
      .select()
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.entityType, 'project'),
          eq(activityLogs.entityId, projectId)
        )
      )
      .orderBy(desc(activityLogs.createdAt));
  }

  async getActivitiesByUser(userId: number): Promise<ActivityLog[]> {
    return await db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.userId, userId))
      .orderBy(desc(activityLogs.createdAt));
  }
  
  async getAllActivities(): Promise<ActivityLog[]> {
    return await db
      .select()
      .from(activityLogs)
      .orderBy(desc(activityLogs.createdAt));
  }

  // Invitation methods
  async createInvitation(insertInvitation: InsertInvitation): Promise<Invitation> {
    const [invitation] = await db
      .insert(invitations)
      .values(insertInvitation)
      .returning();
    return invitation;
  }

  async getInvitationById(id: number): Promise<Invitation | undefined> {
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, id));
    return invitation;
  }

  async getInvitationByToken(token: string): Promise<Invitation | undefined> {
    try {
      console.log(`Database getInvitationByToken: Looking up invitation with token: ${token}`);
      
      if (!token || typeof token !== 'string' || token.trim() === '') {
        console.log('Invalid token format provided:', token);
        return undefined;
      }
      
      const [invitation] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.token, token.trim()));
      
      console.log(`Database query result:`, invitation ? `Found invitation ID: ${invitation.id}` : 'No matching invitation found');
      
      return invitation;
    } catch (error) {
      console.error('Error in getInvitationByToken:', error);
      throw error;
    }
  }
  
  async getInvitationsByProject(projectId: number): Promise<Invitation[]> {
    return await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.projectId, projectId),
          eq(invitations.isAccepted, false)
        )
      );
  }
  
  async getAllInvitations(): Promise<Invitation[]> {
    return await db
      .select()
      .from(invitations);
  }
  
  async deleteInvitation(id: number): Promise<boolean> {
    const result = await db
      .delete(invitations)
      .where(eq(invitations.id, id))
      .returning({ deletedId: invitations.id });
    return result.length > 0;
  }

  async updateInvitation(id: number, data: Partial<Invitation>): Promise<Invitation | undefined> {
    const [updatedInvitation] = await db
      .update(invitations)
      .set(data)
      .where(eq(invitations.id, id))
      .returning();
    return updatedInvitation;
  }

  // Approval methods
  async createApproval(insertApproval: InsertApproval): Promise<Approval> {
    const [approval] = await db
      .insert(approvals)
      .values(insertApproval)
      .returning();
    return approval;
  }

  async getApprovalsByFile(fileId: number): Promise<Approval[]> {
    return await db
      .select()
      .from(approvals)
      .where(eq(approvals.fileId, fileId))
      .orderBy(desc(approvals.createdAt));
  }

  async getApprovalByUserAndFile(userId: number, fileId: number): Promise<Approval | undefined> {
    const [approval] = await db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.userId, userId),
          eq(approvals.fileId, fileId)
        )
      );
    return approval;
  }
  
  async updateApproval(id: number, data: Partial<InsertApproval>): Promise<Approval | undefined> {
    const [updatedApproval] = await db
      .update(approvals)
      .set(data)
      .where(eq(approvals.id, id))
      .returning();
    return updatedApproval;
  }

  // Password Reset methods
  async createPasswordReset(insertPasswordReset: InsertPasswordReset): Promise<PasswordReset> {
    const [passwordReset] = await db
      .insert(passwordResets)
      .values(insertPasswordReset)
      .returning();
    return passwordReset;
  }

  async getPasswordResetByToken(token: string): Promise<PasswordReset | undefined> {
    const [passwordReset] = await db
      .select()
      .from(passwordResets)
      .where(
        and(
          eq(passwordResets.token, token),
          eq(passwordResets.isUsed, false)
        )
      );
    return passwordReset;
  }

  async getPasswordResetsByUser(userId: number): Promise<PasswordReset[]> {
    return await db
      .select()
      .from(passwordResets)
      .where(eq(passwordResets.userId, userId))
      .orderBy(desc(passwordResets.createdAt));
  }

  async updatePasswordReset(id: number, data: Partial<PasswordReset>): Promise<PasswordReset | undefined> {
    const [updatedPasswordReset] = await db
      .update(passwordResets)
      .set(data)
      .where(eq(passwordResets.id, id))
      .returning();
    return updatedPasswordReset;
  }

  // Public Comment methods
  async getPublicCommentsByFile(fileId: number): Promise<PublicComment[]> {
    const rawComments = await db
      .select()
      .from(publicComments)
      .where(eq(publicComments.fileId, fileId))
      .orderBy(desc(publicComments.createdAt));
    
    // Sanitize public comments to break cycles and fix corrupt data
    return await this.sanitizePublicComments(rawComments);
  }

  async createPublicComment(insertPublicComment: InsertPublicComment): Promise<PublicComment> {
    // Comprehensive validation before creating public comment
    if (insertPublicComment.parentId !== undefined && insertPublicComment.parentId !== null) {
      // 1. Check if parent exists in either public comments or regular comments
      const [parentPublicComment] = await db.select().from(publicComments).where(eq(publicComments.id, insertPublicComment.parentId)).limit(1);
      const [parentRegularComment] = await db.select().from(comments).where(eq(comments.id, insertPublicComment.parentId)).limit(1);
      
      const parentComment = parentPublicComment || parentRegularComment;
      if (!parentComment) {
        throw new Error("Parent comment does not exist");
      }
      
      // 2. Ensure parent belongs to the same file
      if (parentComment.fileId !== insertPublicComment.fileId) {
        throw new Error("Parent comment must belong to the same file");
      }
      
      // 3. Check for cycles by walking up the parent chain
      const existingComments = await db.select().from(publicComments).where(eq(publicComments.fileId, insertPublicComment.fileId));
      const commentMap = new Map<number, PublicComment>();
      existingComments.forEach(c => commentMap.set(c.id, c));
      
      // Simulate adding our new comment to check for cycles
      if (this.wouldCreatePublicCommentCycle(insertPublicComment.parentId, commentMap)) {
        throw new Error("Creating this comment would create a cycle in the comment thread");
      }
    }
    
    const [publicComment] = await db
      .insert(publicComments)
      .values(insertPublicComment)
      .returning();
    
    return publicComment;
  }

  // Helper to check if adding a public comment with parentId would create a cycle
  private wouldCreatePublicCommentCycle(parentId: number, commentMap: Map<number, PublicComment>): boolean {
    const visited = new Set<number>();
    let currentId = parentId;
    
    while (currentId) {
      if (visited.has(currentId)) {
        return true; // Cycle detected
      }
      visited.add(currentId);
      
      const parent = commentMap.get(currentId);
      if (!parent || !parent.parentId) {
        break; // Reached root or non-existent parent
      }
      
      currentId = parent.parentId;
      
      // Safety depth limit
      if (visited.size > 50) {
        console.warn(`Backend: Max depth exceeded during public comment cycle check, assuming cycle`);
        return true;
      }
    }
    
    return false;
  }

  async getPublicComment(id: number): Promise<PublicComment | undefined> {
    const [publicComment] = await db
      .select()
      .from(publicComments)
      .where(eq(publicComments.id, id));
    return publicComment;
  }

  async deletePublicComment(id: number): Promise<boolean> {
    const result = await db
      .delete(publicComments)
      .where(eq(publicComments.id, id))
      .returning({ deletedId: publicComments.id });
    return result.length > 0;
  }

  async getUnifiedCommentsByFile(fileId: number): Promise<UnifiedComment[]> {
    const regularComments = await this.getCommentsByFile(fileId); // Already sanitized
    const sanitizedPublicComments = await this.getPublicCommentsByFile(fileId); // Already sanitized
    
    // Convert regular comments to unified format
    const unifiedRegularComments: UnifiedComment[] = await Promise.all(
      regularComments.map(async (comment) => {
        const user = await this.getUser(comment.userId);
        return {
          id: comment.id,
          content: comment.content,
          fileId: comment.fileId,
          timestamp: comment.timestamp,
          isResolved: comment.isResolved,
          createdAt: comment.createdAt,
          isPublic: false,
          authorName: user?.name || 'Unknown User',
          user: user ? {
            id: user.id,
            name: user.name,
            username: user.username
          } : undefined,
          parentId: comment.parentId
        };
      })
    );

    // Convert public comments to unified format
    const unifiedPublicComments: UnifiedComment[] = sanitizedPublicComments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      fileId: comment.fileId,
      timestamp: comment.timestamp,
      isResolved: false,
      createdAt: comment.createdAt,
      isPublic: true,
      authorName: comment.displayName,
      user: undefined,
      parentId: comment.parentId
    }));

    // Combine and sort by creation date
    const allComments = [...unifiedRegularComments, ...unifiedPublicComments];
    return allComments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async getFileByShareToken(token: string): Promise<File | undefined> {
    const [file] = await db
      .select()
      .from(files)
      .where(eq(files.shareToken, token));
    return file;
  }

  async getFileWithProjectByShareToken(token: string): Promise<(File & { projectName: string }) | undefined> {
    const result = await db
      .select({
        id: files.id,
        filename: files.filename,
        fileType: files.fileType,
        fileSize: files.fileSize,
        filePath: files.filePath,
        projectId: files.projectId,
        uploadedById: files.uploadedById,
        version: files.version,
        isLatestVersion: files.isLatestVersion,
        isAvailable: files.isAvailable,
        shareToken: files.shareToken,
        createdAt: files.createdAt,
        projectName: projects.name
      })
      .from(files)
      .innerJoin(projects, eq(files.projectId, projects.id))
      .where(eq(files.shareToken, token));
    
    return result[0];
  }
}

// Use the database storage implementation
export const storage = new DatabaseStorage();
