// Load environment configuration for the application

// Export configuration object with all settings
export const config = {
  // Use APP_URL directly without checking for template placeholder characters
  appDomain: process.env.APP_URL || 'https://obview.io',
  
  port: process.env.PORT || 5000,
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret-replace-in-production',
  emailFrom: process.env.EMAIL_FROM || 'alerts@obedtv.com',
  environment: process.env.NODE_ENV || 'development',
  sendgridSandbox: process.env.SENDGRID_SANDBOX === 'true',
  databaseUrl: process.env.DATABASE_URL
};