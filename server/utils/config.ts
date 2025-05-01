// Load environment configuration for the application

// Get the application domain URL from environment variables
export function getAppDomain(): string {
  // First check for APP_URL from .env
  if (process.env.APP_URL && process.env.APP_URL !== '${REPLIT_DOMAINS}') {
    return process.env.APP_URL;
  }
  
  // Then check for Replit domain (most reliable)
  if (process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS}`;
  }
  
  // Fallback options for Replit
  if (process.env.REPL_ID) {
    // Try to use REPLIT_SLUG and REPL_OWNER first
    if (process.env.REPLIT_SLUG && process.env.REPL_OWNER) {
      return `https://${process.env.REPLIT_SLUG}.${process.env.REPL_OWNER}.repl.co`;
    }
    
    // Then try just REPLIT_SLUG with .replit.app
    if (process.env.REPLIT_SLUG) {
      return `https://${process.env.REPLIT_SLUG}.replit.app`;
    }
    
    // Last resort with REPL_ID
    return `https://${process.env.REPL_ID}.repl.co`;
  }
  
  // Local development fallback
  return 'http://localhost:5000';
}

// Export configuration object with all settings
export const config = {
  appDomain: getAppDomain(),
  port: process.env.PORT || 5000,
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret-replace-in-production',
  emailFrom: process.env.EMAIL_FROM || 'alerts@obedtv.com',
  environment: process.env.NODE_ENV || 'development',
  sendgridSandbox: process.env.SENDGRID_SANDBOX === 'true',
  databaseUrl: process.env.DATABASE_URL
};