import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, InsertUser } from "@shared/schema";
import crypto from "crypto";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function generateToken(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'obviu-secret',
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username) || 
                    await storage.getUserByEmail(username);
                    
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "Invalid username or password" });
        }
        
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/register", async (req, res, next) => {
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
        userId: user.id,
        metadata: { username: user.username },
      });

      // Log the user in
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(userResponse);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) return next(err);
      
      if (!user) {
        return res.status(401).json({ 
          message: info?.message || "Authentication failed" 
        });
      }
      
      req.login(user, (err) => {
        if (err) return next(err);
        
        // Remove sensitive data before returning
        const userResponse = { ...user };
        delete userResponse.password;
        
        res.status(200).json(userResponse);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    // Remove sensitive data before returning
    const userResponse = { ...req.user };
    delete userResponse.password;
    
    res.json(userResponse);
  });

  app.post("/api/invite", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      
      const { email, projectId, role } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      
      // Check if user with email already exists
      const existingUser = await storage.getUserByEmail(email);
      
      // Generate a token
      const token = generateToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 1 week expiration
      
      // Create invitation
      const invitation = await storage.createInvitation({
        email,
        projectId: projectId || null,
        role: role || "viewer",
        token,
        expiresAt,
        isAccepted: false,
        createdById: req.user.id,
      });
      
      // In a real app, we would send an email here
      // For now, just return the invitation
      res.status(201).json({
        invitationId: invitation.id,
        token: invitation.token,
        email: invitation.email,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/accept-invitation/:token", async (req, res, next) => {
    try {
      const { token } = req.params;
      
      if (!token) {
        return res.status(400).json({ message: "Token is required" });
      }
      
      // Find invitation by token
      const invitation = await storage.getInvitationByToken(token);
      
      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }
      
      if (invitation.isAccepted) {
        return res.status(400).json({ message: "Invitation already accepted" });
      }
      
      if (invitation.expiresAt < new Date()) {
        return res.status(400).json({ message: "Invitation expired" });
      }
      
      // Mark invitation as accepted
      await storage.updateInvitation(invitation.id, { isAccepted: true });
      
      // Return the invitation data to be used for account creation/project access
      res.status(200).json({
        email: invitation.email,
        projectId: invitation.projectId,
        role: invitation.role,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/reset-password-request", async (req, res, next) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      
      // Find user by email
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        // Don't reveal if email exists or not for security
        return res.status(200).json({ 
          message: "If an account with that email exists, a reset link has been sent." 
        });
      }

      // Generate a token
      const token = generateToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiration
      
      try {
        // Store the token and user ID in the database
        await storage.createPasswordReset({
          userId: user.id,
          token,
          expiresAt,
          isUsed: false
        });

        // Import the sendPasswordResetEmail function
        const { sendPasswordResetEmail } = await import('./utils/sendgrid');
        
        // Send the password reset email
        const emailSent = await sendPasswordResetEmail(
          email,
          token,
          user.id,
          req.headers.origin as string || undefined // Pass client origin if available
        );
        
        if (emailSent) {
          console.log(`Password reset email sent to ${email}`);
        } else {
          console.error(`Failed to send password reset email to ${email}`);
          // Even if email fails, don't reveal this to the client for security
        }
      } catch (emailError) {
        console.error('Error sending password reset email:', emailError);
        // Don't expose email errors to client
      }
      
      // Always return success response even if email fails
      // This prevents user enumeration attacks
      res.status(200).json({
        message: "If an account with that email exists, a reset link has been sent."
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/reset-password", async (req, res, next) => {
    try {
      const { token, password, userId } = req.body;
      
      if (!token || !password || !userId) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Find the password reset record by token
      const passwordReset = await storage.getPasswordResetByToken(token);
      
      if (!passwordReset) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }
      
      // Verify token belongs to the user and is not expired or used
      if (
        passwordReset.userId !== parseInt(userId) ||
        passwordReset.isUsed ||
        passwordReset.expiresAt < new Date()
      ) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }
      
      // Find user by ID
      const user = await storage.getUser(parseInt(userId));
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Update password
      const hashedPassword = await hashPassword(password);
      await storage.updateUser(user.id, { password: hashedPassword });
      
      // Mark token as used
      await storage.updatePasswordReset(passwordReset.id, { isUsed: true });
      
      // Respond with success
      res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
      next(error);
    }
  });
  
  // Endpoint to validate a reset token without consuming it
  app.get("/api/validate-reset-token/:token/:userId", async (req, res) => {
    try {
      const { token, userId } = req.params;
      
      if (!token || !userId) {
        return res.status(400).json({ valid: false, message: "Missing required parameters" });
      }
      
      // Find the password reset record by token
      const passwordReset = await storage.getPasswordResetByToken(token);
      
      if (!passwordReset) {
        return res.status(200).json({ valid: false, message: "Invalid or expired reset token" });
      }
      
      // Verify token belongs to the user and is not expired or used
      if (
        passwordReset.userId !== parseInt(userId) ||
        passwordReset.isUsed ||
        passwordReset.expiresAt < new Date()
      ) {
        return res.status(200).json({ valid: false, message: "Invalid or expired reset token" });
      }
      
      return res.status(200).json({ valid: true });
      
    } catch (error) {
      console.error('Error validating reset token:', error);
      return res.status(500).json({ valid: false, message: "Server error" });
    }
  });
}
