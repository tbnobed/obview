// Load environment configuration for the application

// Helper to determine the appropriate domain based on environment
// This is only a fallback - client should send their actual domain with each request
function getDomain(): string {
  // First priority: Explicitly configured APP_URL
  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }
  
  // Default: Development environment
  const devPort = process.env.PORT || 5000;
  return `http://localhost:${devPort}`;
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
  databaseUrl: process.env.DATABASE_URL,

  // Video encoding configuration
  video: {
    // Main quality H.264 encoding settings
    main: {
      crf: parseInt(process.env.VIDEO_MAIN_CRF || '22', 10),
      preset: process.env.VIDEO_MAIN_PRESET || 'veryfast',
      profile: process.env.VIDEO_MAIN_PROFILE || 'high',
      level: process.env.VIDEO_MAIN_LEVEL || '3.1',
      audioBitrate: process.env.VIDEO_MAIN_AUDIO_BITRATE || '128k',
      audioSampleRate: parseInt(process.env.VIDEO_MAIN_AUDIO_RATE || '48000', 10)
    },
    // Scrub version H.264 encoding settings
    scrub: {
      crf: parseInt(process.env.VIDEO_SCRUB_CRF || '28', 10),
      preset: process.env.VIDEO_SCRUB_PRESET || 'ultrafast',
      fps: parseInt(process.env.VIDEO_SCRUB_FPS || '15', 10),
      scale: process.env.VIDEO_SCRUB_SCALE || '-2:180',
      disableAudio: process.env.VIDEO_SCRUB_AUDIO !== 'true' // Default to no audio
    }
  }
};