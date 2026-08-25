// Load environment configuration for the application

import { execSync } from 'child_process';
import { filterUsableGpuIndices } from './work-scheduler.js';

// Detect whether the local ffmpeg has the h264_nvenc encoder compiled in
// AND can actually open an NVENC session (i.e. there's a usable NVIDIA GPU
// reachable from this process). We run this once at module load so the
// answer is cached for the rest of the process. Two probes are needed
// because `-encoders` only tells us the binary supports NVENC; on a host
// with no GPU (or no driver, or no permissions) the encoder is listed but
// any attempted encode fails immediately. The second probe forces ffmpeg
// to actually initialise an NVENC session against /dev/null, which is
// fast (<200ms) and gives us a definitive yes/no.
// Returns { ok, reason } so the startup log can explain *why* NVENC was
// rejected ('ffmpeg_missing' | 'encoder_missing' | 'nvenc_init_failed').
function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getNvencGpuIndices(): number[] {
  const configured = process.env.VIDEO_NVENC_GPUS || process.env.VIDEO_NVENC_GPU || '0';
  const indices = configured
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value >= 0);
  const uniqueIndices = Array.from(new Set(indices));
  return uniqueIndices.length > 0 ? uniqueIndices : [0];
}

function detectNvenc(gpuIndex: number): { ok: boolean; reason?: string } {
  let encoders: string;
  try {
    encoders = execSync('ffmpeg -hide_banner -encoders 2>/dev/null', {
      encoding: 'utf8',
      timeout: 2000,
    });
  } catch {
    return { ok: false, reason: 'ffmpeg_missing' };
  }
  if (!/h264_nvenc/.test(encoders)) return { ok: false, reason: 'encoder_missing' };
  try {
    execSync(
      // 256x256 — comfortably above T4's NVENC minimum frame dimension
      // (~145x49). 64x64 is rejected by Turing+ NVENC with
      // "Frame Dimension less than the minimum supported value".
      'ffmpeg -hide_banner -loglevel error -f lavfi -i color=size=256x256:duration=0.1 ' +
        `-c:v h264_nvenc -gpu ${gpuIndex} -f null - 2>&1`,
      { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'ignore', 'ignore'] }
    );
    return { ok: true };
  } catch {
    return { ok: false, reason: 'nvenc_init_failed' };
  }
}

// VIDEO_USE_NVENC: 'true' requests NVENC, 'false' forces it off, and anything
// else auto-detects. Every configured GPU is probed before it enters the
// scheduler so one unavailable card cannot turn half the work into slow CPU
// retries. When none pass, the complete pipeline stays on libx264.
function resolveNvenc(): { useNvenc: boolean; gpuIndices: number[] } {
  const explicit = (process.env.VIDEO_USE_NVENC || '').toLowerCase();
  const configuredGpuIndices = getNvencGpuIndices();
  if (explicit === 'false' || explicit === '0') {
    console.log('[Video] NVENC: forced OFF via VIDEO_USE_NVENC=false — using libx264');
    return { useNvenc: false, gpuIndices: configuredGpuIndices };
  }

  const failures = new Map<number, string>();
  const usableGpuIndices = filterUsableGpuIndices(configuredGpuIndices, (gpuIndex) => {
    const result = detectNvenc(gpuIndex);
    if (!result.ok) failures.set(gpuIndex, result.reason || 'unknown');
    return result.ok;
  });

  for (const [gpuIndex, reason] of Array.from(failures.entries())) {
    console.warn(`[Video] NVENC GPU ${gpuIndex} unavailable (${reason}) — excluded from scheduler`);
  }

  if (usableGpuIndices.length === 0) {
    console.log('[Video] NVENC unavailable on all configured GPUs — using libx264');
    return { useNvenc: false, gpuIndices: configuredGpuIndices };
  }

  const mode = explicit === 'true' || explicit === '1' ? 'requested' : 'auto-detected';
  console.log(
    `[Video] NVENC ${mode}: using h264_nvenc on validated GPUs ${usableGpuIndices.join(', ')}`,
  );
  return { useNvenc: true, gpuIndices: usableGpuIndices };
}

const resolvedNvenc = resolveNvenc();

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
    processingConcurrency: parsePositiveInt(process.env.VIDEO_PROCESSING_CONCURRENCY, 1),
    // GPU encoding toggle. When true, generateQuality / generateScrubVersion
    // use NVIDIA NVENC (h264_nvenc) instead of libx264. Falls back to libx264
    // automatically if the NVENC encode fails (unsupported input codec, no
    // GPU access, etc.) so a misconfigured host can never block uploads.
    useNvenc: resolvedNvenc.useNvenc,
    // NVENC quality knobs. Presets are p1 (fastest) → p7 (slowest/best).
    // p4 is the balanced "medium" equivalent. CQ 23 ≈ libx264 CRF 23.
    nvenc: {
      gpuIndices: resolvedNvenc.gpuIndices,
      concurrencyPerGpu: parsePositiveInt(process.env.VIDEO_NVENC_CONCURRENCY_PER_GPU, 1),
      mainPreset: process.env.VIDEO_NVENC_MAIN_PRESET || 'p4',
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