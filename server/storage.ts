import {
  users,
  projects,
  files,
  comments,
  publicComments,
  projectUsers,
  activityLogs,
  invitations,
  approvals,
  passwordResets,
  type User,
  type InsertUser,
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
  type InsertPasswordReset
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

  // Project management
  getProject(id: number): Promise<Project | undefined>;
  getAllProjects(): Promise<Project[]>;
  getProjectsByUser(userId: number): Promise<Project[]>;
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

  // Comment management
  getComment(id: number): Promise<Comment | undefined>;
  getCommentsByFile(fileId: number): Promise<Comment[]>;
  getCommentReplies(commentId: number): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;
  updateComment(id: number, data: Partial<InsertComment>): Promise<Comment | undefined>;
  deleteComment(id: number): Promise<boolean>;

  // Public comment management
  getPublicCommentsByFile(fileId: number): Promise<PublicComment[]>;
  createPublicComment(publicComment: InsertPublicComment): Promise<PublicComment>;
  getUnifiedCommentsByFile(fileId: number): Promise<UnifiedComment[]>;
  getFileByShareToken(token: string): Promise<File | undefined>;

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
  private projects: Map<number, Project>;
  private files: Map<number, File>;
  private comments: Map<number, Comment>;
  private publicComments: Map<number, PublicComment>;
  private projectUsers: Map<number, ProjectUser>;
  private activityLogs: Map<number, ActivityLog>;
  private invitations: Map<number, Invitation>;
  private approvals: Map<number, Approval>;
  private passwordResets: Map<number, PasswordReset>;
  sessionStore: any; // Using any to avoid type issues

  currentUserId: number;
  currentProjectId: number;
  currentFileId: number;
  currentCommentId: number;
  currentPublicCommentId: number;
  currentProjectUserId: number;
  currentActivityLogId: number;
  currentInvitationId: number;
  currentApprovalId: number;
  currentPasswordResetId: number;

  constructor() {
    this.users = new Map();
    this.projects = new Map();
    this.files = new Map();
    this.comments = new Map();
    this.publicComments = new Map();
    this.projectUsers = new Map();
    this.activityLogs = new Map();
    this.invitations = new Map();
    this.approvals = new Map();
    this.passwordResets = new Map();
    
    this.currentUserId = 1;
    this.currentProjectId = 1;
    this.currentFileId = 1;
    this.currentCommentId = 1;
    this.currentPublicCommentId = 1;
    this.currentProjectUserId = 1;
    this.currentActivityLogId = 1;
    this.currentInvitationId = 1;
    this.currentApprovalId = 1;
    this.currentPasswordResetId = 1;

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
    return Array.from(this.comments.values()).filter(
      (comment) => comment.fileId === fileId
    );
  }

  async getCommentReplies(commentId: number): Promise<Comment[]> {
    return Array.from(this.comments.values()).filter(
      (comment) => comment.parentId === commentId
    );
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
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
  async getPublicCommentsByFile(fileId: number): Promise<PublicComment[]> {
    return Array.from(this.publicComments.values()).filter(
      (comment) => comment.fileId === fileId
    );
  }

  async createPublicComment(insertPublicComment: InsertPublicComment): Promise<PublicComment> {
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
      authorName: comment.displayName
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
}

export class DatabaseStorage implements IStorage {
  sessionStore: any; // Using any here to avoid type issues

  constructor() {
    // Use memory store initially, will switch to PostgresSessionStore when pool is ready
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // 24 hours
    });
    
    // Configure session store once the pool is available
    const initSessionStore = () => {
      if (!pool) {
        console.log('Database pool not yet available, will retry session store initialization in 1 second');
        setTimeout(initSessionStore, 1000);
        return;
      }
      
      try {
        console.log('Initializing PostgreSQL session store');
        this.sessionStore = new PostgresSessionStore({ 
          pool, 
          createTableIfMissing: true,
          tableName: 'pg_session',
          pruneSessionInterval: 60
        });
        console.log('PostgreSQL session store initialized successfully');
      } catch (error) {
        console.error('Failed to initialize PostgreSQL session store:', error);
        console.log('Continuing with memory session store as fallback');
      }
    };
    
    // Start the session store initialization process
    setTimeout(initSessionStore, 1000);
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

    return userProjects.map(up => up.project);
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

  // Comment methods
  async getComment(id: number): Promise<Comment | undefined> {
    const [comment] = await db.select().from(comments).where(eq(comments.id, id));
    return comment;
  }

  async getCommentsByFile(fileId: number): Promise<Comment[]> {
    return await db.select().from(comments).where(eq(comments.fileId, fileId));
  }

  async getCommentReplies(commentId: number): Promise<Comment[]> {
    return await db
      .select()
      .from(comments)
      .where(eq(comments.parentId, commentId));
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const [comment] = await db.insert(comments).values(insertComment).returning();
    return comment;
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
}

// Use the database storage implementation
export const storage = new DatabaseStorage();
