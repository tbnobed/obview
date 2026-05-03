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
    // GPU encoding toggle. When true, generateQuality / generateScrubVersion
    // use NVIDIA NVENC (h264_nvenc) instead of libx264. Falls back to libx264
    // automatically if the NVENC encode fails (unsupported input codec, no
    // GPU access, etc.) so a misconfigured host can never block uploads.
    useNvenc: process.env.VIDEO_USE_NVENC === 'true',
    // NVENC quality knobs. Presets are p1 (fastest) → p7 (slowest/best).
    // p4 is the balanced "medium" equivalent. CQ 23 ≈ libx264 CRF 23.
    nvenc: {
      mainPreset: process.env.VIDEO_NVENC_MAIN_PRESET || 'p4',
      mainTune: process.env.VIDEO_NVENC_MAIN_TUNE || 'hq',
      mainCq: process.env.VIDEO_NVENC_MAIN_CQ || '23',
      scrubPreset: process.env.VIDEO_NVENC_SCRUB_PRESET || 'p1',
      scrubCq: process.env.VIDEO_NVENC_SCRUB_CQ || '28',
    },
    // Main quality H.264 encoding settings
    main: {
      crf: parseInt(process.env.VIDEO_MAIN_CRF || '24', 10),
      preset: process.env.VIDEO_MAIN_PRESET || 'medium',
      profile: process.env.VIDEO_MAIN_PROFILE || 'high',
      level: process.env.VIDEO_MAIN_LEVEL || '3.1',
      audioBitrate: process.env.VIDEO_MAIN_AUDIO_BITRATE || '128k',
      audioSampleRate: parseInt(process.env.VIDEO_MAIN_AUDIO_RATE || '48000', 10)
    },
    // Scrub version H.264 encoding settings
    scrub: {
      crf: parseInt(process.env.VIDEO_SCRUB_CRF || '28', 10),
      preset: process.env.VIDEO_SCRUB_PRESET || 'ultrafast',
      profile: process.env.VIDEO_SCRUB_PROFILE || 'high',
      level: process.env.VIDEO_SCRUB_LEVEL || '3.1',
      fps: parseInt(process.env.VIDEO_SCRUB_FPS || '15', 10),
      scale: process.env.VIDEO_SCRUB_SCALE || '-2:180',
      disableAudio: process.env.VIDEO_SCRUB_DISABLE_AUDIO !== 'false' // Default to disable audio
    },
    // FFmpeg processing timeout settings (in milliseconds)
    timeouts: {
      // Quality version generation timeout (default: 60 minutes for large files)
      quality: parseInt(process.env.VIDEO_TIMEOUT_QUALITY || '3600000', 10),
      // Scrub version generation timeout (default: 30 minutes)
      scrub: parseInt(process.env.VIDEO_TIMEOUT_SCRUB || '1800000', 10),
      // Thumbnail sprite generation timeout (default: 10 minutes)
      sprite: parseInt(process.env.VIDEO_TIMEOUT_SPRITE || '600000', 10),
      // Metadata extraction timeout (default: 5 minutes)
      metadata: parseInt(process.env.VIDEO_TIMEOUT_METADATA || '300000', 10)
    }
  }
};