// Load environment configuration for the application

// Helper to determine the appropriate domain based on environment
function getDomain(): string {
  // Always use obview.io as the domain - no matter what environment we're in
  // This ensures invitation URLs always work for recipients
  return 'https://obview.io';
}

// Export configuration object with all settings
export const config = {
  // Application domain for URLs in emails and absolute references
  appDomain: getDomain(),
  
  // Server configuration
  port: parseInt(process.env.PORT || '5000', 10),
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret-replace-in-production',
  
  // Email configuration
  emailFrom: process.env.EMAIL_FROM || 'alerts@obedtv.com',
  sendgridSandbox: process.env.SENDGRID_SANDBOX === 'true',
  
  // Environment and database
  environment: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDocker: process.env.IS_DOCKER === 'true',
  databaseUrl: process.env.DATABASE_URL
};