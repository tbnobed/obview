import {
  users,
  projects,
  files,
  comments,
  projectUsers,
  activityLogs,
  invitations,
  approvals,
  type User,
  type InsertUser,
  type Project,
  type InsertProject,
  type File,
  type InsertFile,
  type Comment,
  type InsertComment,
  type ProjectUser,
  type InsertProjectUser,
  type ActivityLog,
  type InsertActivityLog,
  type Invitation,
  type InsertInvitation,
  type Approval,
  type InsertApproval
} from "@shared/schema";
import createMemoryStore from "memorystore";
import session from "express-session";

const MemoryStore = createMemoryStore(session);

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

  // Invitations
  createInvitation(invitation: InsertInvitation): Promise<Invitation>;
  getInvitationByToken(token: string): Promise<Invitation | undefined>;
  updateInvitation(id: number, data: Partial<Invitation>): Promise<Invitation | undefined>;

  // Approvals
  createApproval(approval: InsertApproval): Promise<Approval>;
  getApprovalsByFile(fileId: number): Promise<Approval[]>;
  getApprovalByUserAndFile(userId: number, fileId: number): Promise<Approval | undefined>;

  // Session store
  sessionStore: session.SessionStore;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private projects: Map<number, Project>;
  private files: Map<number, File>;
  private comments: Map<number, Comment>;
  private projectUsers: Map<number, ProjectUser>;
  private activityLogs: Map<number, ActivityLog>;
  private invitations: Map<number, Invitation>;
  private approvals: Map<number, Approval>;
  sessionStore: session.SessionStore;

  currentUserId: number;
  currentProjectId: number;
  currentFileId: number;
  currentCommentId: number;
  currentProjectUserId: number;
  currentActivityLogId: number;
  currentInvitationId: number;
  currentApprovalId: number;

  constructor() {
    this.users = new Map();
    this.projects = new Map();
    this.files = new Map();
    this.comments = new Map();
    this.projectUsers = new Map();
    this.activityLogs = new Map();
    this.invitations = new Map();
    this.approvals = new Map();
    
    this.currentUserId = 1;
    this.currentProjectId = 1;
    this.currentFileId = 1;
    this.currentCommentId = 1;
    this.currentProjectUserId = 1;
    this.currentActivityLogId = 1;
    this.currentInvitationId = 1;
    this.currentApprovalId = 1;

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

  async getInvitationByToken(token: string): Promise<Invitation | undefined> {
    return Array.from(this.invitations.values()).find(
      (invitation) => invitation.token === token
    );
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
}

export const storage = new MemStorage();
