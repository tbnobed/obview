import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, InsertUser } from "@shared/schema";
import crypto from "crypto";
import { pool, db } from "./db";
import connectPg from "connect-pg-simple";
import { z } from "zod";

declare global {
  namespace Express {
    interface User extends SelectUser {}
    interface Request {
      user: SelectUser;
    }
  }
}

const scryptAsync = promisify(scrypt);

const registrationSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9_.-]+$/),
  password: z.string().min(8).max(256),
  email: z.string().trim().email().max(254),
  name: z.string().trim().min(1).max(120),
  invitationToken: z.string().trim().min(32).max(256).optional(),
});

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

function toSafeUser(user: SelectUser) {
  const { password, apiToken, ...safeUser } = user;
  return safeUser;
}

export function generateToken(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// Personal API token for external integrations (e.g. the Premiere panel).
// Format: `obv_` + 40 hex chars. The plaintext is shown to the user once at
// generation; only its SHA-256 hash is persisted (users.apiToken).
export function generateApiToken(): string {
  return `obv_${crypto.randomBytes(20).toString('hex')}`;
}

export function hashApiToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Bearer/session auth for API routes consumed by external clients. Accepts
// either an existing Passport session (cookie) OR an `Authorization: Bearer
// <token>` header. On success sets req.user (password stripped) and calls
// next(); otherwise responds 401. Deactivated accounts are rejected.
export async function apiAuth(req: any, res: any, next: any) {
  try {
    // Session path: passport.session() already populated req.user.
    if (req.isAuthenticated?.() && req.user) {
      return next();
    }

    const header: string | undefined = req.headers?.authorization;
    if (header && header.startsWith("Bearer ")) {
      const token = header.slice("Bearer ".length).trim();
      if (token) {
        const tokenHash = hashApiToken(token);
        // Two bearer sources: a per-login api_session (the panel's sign-in) or a
        // user's single personal token (Settings → API Access). Check sessions
        // first since that's the primary path.
        const user =
          (await storage.getUserByApiSessionToken(tokenHash)) ||
          (await storage.getUserByApiTokenHash(tokenHash));
        if (user && !user.deactivatedAt) {
          const safeUser = toSafeUser(user);
          req.user = safeUser as SelectUser;
          return next();
        }
      }
    }

    return res.status(401).json({ message: "Authentication required" });
  } catch (err) {
    return next(err);
  }
}

export function setupAuth(app: Express) {
  // Create session store - create dedicated pool for sessions
  let sessionStore;
  
  try {
    // Use the database connection for session storage
    const PgStore = connectPg(session);
    sessionStore = new PgStore({
      conString: process.env.DATABASE_URL,
      tableName: 'session',
      createTableIfMissing: true
    });
    console.log('Using PostgreSQL session store with connection string');
  } catch (error) {
    console.error('Failed to create PostgreSQL session store:', error);
    console.log('Falling back to memory session store');
    sessionStore = undefined; // Use default memory store
  }

  // Optional cookie domain (e.g. ".obviu.io") so the session is shared
  // across every subdomain — needed for short-link hosts like t.obviu.io
  // to see the user as logged in and skip the public review page. Leave
  // SESSION_COOKIE_DOMAIN unset in dev / replit preview so the cookie
  // stays host-only.
  const cookieDomain = process.env.SESSION_COOKIE_DOMAIN?.trim() || undefined;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters");
  }

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    ...(sessionStore && { store: sessionStore }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: 'lax',
      ...(cookieDomain && { domain: cookieDomain })
    },
    rolling: true
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

        // Deactivated accounts keep all their content but cannot sign in.
        if (user.deactivatedAt) {
          return done(null, false, { message: "This account has been deactivated. Contact an administrator." });
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
      // Remove password from user object for security. A user deactivated
      // mid-session is treated as logged out so the block takes effect on
      // their next request, not just at next login.
      if (user && !user.deactivatedAt) {
        done(null, toSafeUser(user) as any);
      } else {
        done(null, null);
      }
    } catch (err) {
      done(err);
    }
  });

  const registrationAttempts = new Map<string, { count: number; resetAt: number }>();
  const allowRegistrationAttempt = (ip: string): boolean => {
    const now = Date.now();
    if (registrationAttempts.size > 1_000) {
      registrationAttempts.forEach((attempt, key) => {
        if (attempt.resetAt <= now) registrationAttempts.delete(key);
      });
    }
    const current = registrationAttempts.get(ip);
    if (!current || current.resetAt <= now) {
      registrationAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
      return true;
    }
    current.count += 1;
    return current.count <= 10;
  };

  app.post("/api/register", async (req, res, next) => {
    try {
      const requestIp = (req.ip || req.socket.remoteAddress || "unknown").slice(0, 128);
      if (!allowRegistrationAttempt(requestIp)) {
        return res.status(429).json({ message: "Too many registration attempts. Try again later." });
      }

      const parsed = registrationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid registration details" });
      }
      const { username, password, email, name, invitationToken } = parsed.data;

      // Registration is closed by default. A valid invitation is always
      // accepted; intentionally opening public signup requires an explicit
      // server-side opt-in rather than a client-only build flag.
      let invitation = null;
      if (invitationToken) {
        invitation = await storage.getInvitationByToken(invitationToken);
        const invalidInvitation =
          !invitation ||
          invitation.isAccepted ||
          invitation.expiresAt <= new Date() ||
          invitation.email.trim().toLowerCase() !== email.toLowerCase();
        if (invalidInvitation) {
          return res.status(403).json({ message: "Invalid or expired invitation" });
        }
      } else if (process.env.ALLOW_PUBLIC_REGISTRATION !== "true") {
        return res.status(403).json({ message: "Registration is invitation-only" });
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
        // Never accept a role from an unauthenticated request. Invitation
        // roles are applied only by the authenticated invitation-accept route.
        role: "viewer",
        themePreference: "system", // Default theme preference
      });

      const userResponse = toSafeUser(user);

      // Log activity
      await storage.logActivity({
        action: "create",
        entityType: "user",
        entityId: user.id,
        userId: user.id,
        metadata: {
          username: user.username,
          source: invitation ? "invitation" : "public_registration",
          invitationId: invitation?.id ?? null,
          ipAddress: requestIp,
          userAgent: String(req.get("user-agent") || "").slice(0, 512),
        },
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

  // Explicitly retire the legacy unauthenticated acceptance endpoint. Keeping
  // a JSON rejection prevents the Vite SPA fallback from returning HTTP 200.
  app.all("/api/accept-invitation/:token", (_req, res) => {
    res.status(410).json({ message: "This invitation endpoint is no longer available" });
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: unknown, user: SelectUser | false, info?: { message?: string }) => {
      if (err) return next(err);
      
      if (!user) {
        return res.status(401).json({ 
          message: info?.message || "Authentication failed" 
        });
      }
      
      // Expire any legacy host-only `connect.sid` cookie left over from
      // before SESSION_COOKIE_DOMAIN was set. Without this, browsers
      // that already had a host-only cookie keep sending it alongside
      // the new domain-scoped cookie, the server picks the stale one,
      // and the user has to log in twice. clearCookie with no Domain
      // targets the host-only variant only — the new domain-scoped
      // cookie set by req.login below has a different scope and is
      // not affected.
      res.clearCookie("connect.sid", { path: "/" });

      // Regenerate session to prevent fixation attacks
      req.session.regenerate((err) => {
        if (err) return next(err);
        
        req.login(user, (err) => {
          if (err) return next(err);
          
          // Explicitly save the session before responding
          req.session.save((err) => {
            if (err) return next(err);
            
            const userResponse = toSafeUser(user);
            
            // Ensure themePreference field exists
            if (userResponse.themePreference === undefined) {
              userResponse.themePreference = "system";
            }
            
            res.status(200).json(userResponse);
          });
        });
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
    
    const userResponse = toSafeUser(req.user);
    
    // Ensure themePreference field exists
    if (userResponse.themePreference === undefined) {
      userResponse.themePreference = "system";
    }
    
    res.json(userResponse);
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
