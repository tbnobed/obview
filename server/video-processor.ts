import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { config } from './utils/config.js';

export interface VideoProcessingOptions {
  inputPath: string;
  outputDir: string;
  filename: string;
}

export interface ProcessedVideoResult {
  qualities: VideoQuality[];
  scrubVersion: string;
  thumbnailSprite: string;
  spriteMetadata: any;
  duration: number;
  frameRate: number;
  mediaInfo: any;
}

interface VideoQuality {
  resolution: string;
  path: string;
  size: number;
  bitrate: string;
}

export class VideoProcessor {
  // Single optimized quality for efficient processing and storage
  private static readonly QUALITIES = [
    { name: '720p', width: 1280, height: 720, bitrate: '2500k' }
  ];

  /**
   * Process video to generate multiple quality levels and scrubbing optimizations
   */
  static async processVideo(options: VideoProcessingOptions): Promise<ProcessedVideoResult> {
    const { inputPath, outputDir, filename } = options;
    
    console.log(`[VideoProcessor] Starting processing for: ${filename}`);
    
    // Create output directory structure
    const qualitiesDir = path.join(outputDir, 'qualities');
    const scrubDir = path.join(outputDir, 'scrub');
    const thumbsDir = path.join(outputDir, 'thumbnails');
    
    await fs.mkdir(qualitiesDir, { recursive: true });
    await fs.mkdir(scrubDir, { recursive: true });
    await fs.mkdir(thumbsDir, { recursive: true });
    
    // Get video metadata. We also capture the full ffprobe JSON once here so
    // it can be persisted alongside the processing record — the MediaInfo
    // dialog reads it from the DB instead of re-running ffprobe each open.
    let mediaInfo: any = null;
    try {
      mediaInfo = await this.probeFull(inputPath);
    } catch (err) {
      console.warn(`[VideoProcessor] probeFull failed (non-fatal):`, err);
    }
    const metadata = await this.getVideoMetadata(inputPath);
    console.log(`[VideoProcessor] Video metadata:`, metadata);
    
    // Process single 720p quality for optimal resource usage
    const qualityPromises = this.QUALITIES.map(quality => 
      this.generateQuality(inputPath, qualitiesDir, filename, quality, metadata)
    );
    
    // Generate I-frame only version for smooth scrubbing
    const scrubPromise = this.generateScrubVersion(inputPath, scrubDir, filename);
    
    // Generate sprite for hover scrubbing
    const spritePromise = this.generateThumbnailSprite(inputPath, thumbsDir, filename, metadata);
    
    // Execute all processing in parallel
    const [qualities, scrubVersion, spriteResult] = await Promise.all([
      Promise.all(qualityPromises),
      scrubPromise,
      spritePromise
    ]);
    
    const validQualities = qualities.filter(q => q !== null) as VideoQuality[];

    // If every quality variant failed, surface the underlying FFmpeg error
    // instead of silently completing with no playable renditions (which
    // leaves the UI stuck on "Processing" forever).
    if (validQualities.length === 0 && this.QUALITIES.length > 0) {
      const detail = (this as any)._lastQualityError || "no quality renditions produced";
      (this as any)._lastQualityError = undefined;
      throw new Error(`Quality encoding failed: ${detail}`);
    }

    console.log(`[VideoProcessor] Processing completed for: ${filename}`);

    return {
      qualities: validQualities,
      scrubVersion,
      thumbnailSprite: spriteResult.path,
      spriteMetadata: spriteResult.metadata,
      duration: metadata.duration,
      frameRate: metadata.frameRate,
      mediaInfo,
    };
  }

  /**
   * Get video metadata using FFprobe (secure implementation)
   */
  private static async getVideoMetadata(inputPath: string) {
    try {
      const stdout = await this.executeFFprobe([
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        inputPath
      ]);
      
      const metadata = JSON.parse(stdout);
      const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
      
      if (!videoStream) {
        throw new Error('No video stream found');
      }
      
      return {
        duration: parseFloat(metadata.format.duration || '0'),
        frameRate: this.parseFrameRate(videoStream.r_frame_rate || '30/1'), // Safe fraction parsing
        width: videoStream.width,
        height: videoStream.height,
        bitrate: metadata.format.bit_rate ? parseInt(metadata.format.bit_rate) : 0
      };
    } catch (error) {
      console.error('[VideoProcessor] Error getting metadata:', error);
      throw error;
    }
  }

  /**
   * Safely parse frame rate fraction (e.g., "30000/1001" -> 29.97)
   */
  private static parseFrameRate(frameRateStr: string): number {
    try {
      if (frameRateStr.includes('/')) {
        const [numerator, denominator] = frameRateStr.split('/').map(Number);
        if (denominator && !isNaN(numerator) && !isNaN(denominator)) {
          return numerator / denominator;
        }
      }
      const directParse = parseFloat(frameRateStr);
      return isNaN(directParse) ? 30 : directParse; // Default to 30fps
    } catch {
      return 30; // Safe fallback
    }
  }

  /**
   * Execute FFprobe command safely with timeout
   */
  private static executeFFprobe(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      let isTimeout = false;
      
      // Set up timeout for metadata extraction
      const timeout = setTimeout(() => {
        isTimeout = true;
        ffprobe.kill('SIGKILL');
        reject(new Error(`FFprobe timeout after ${config.video.timeouts.metadata}ms`));
      }, config.video.timeouts.metadata);
      
      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      ffprobe.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      ffprobe.on('close', (code) => {
        clearTimeout(timeout);
        if (isTimeout) return; // Already handled by timeout
        
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`FFprobe failed with code ${code}: ${stderr}`));
        }
      });
      
      ffprobe.on('error', (error) => {
        clearTimeout(timeout);
        if (isTimeout) return; // Already handled by timeout
        reject(new Error(`FFprobe spawn error: ${error.message}`));
      });
    });
  }

  /**
   * Execute FFmpeg command safely with timeout
   */
  private static executeFFmpeg(args: string[], timeoutMs: number = config.video.timeouts.quality): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let stderr = '';
      let isTimeout = false;
      
      // Set up timeout
      const timeout = setTimeout(() => {
        isTimeout = true;
        ffmpeg.kill('SIGKILL');
        reject(new Error(`FFmpeg timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      ffmpeg.on('close', (code) => {
        clearTimeout(timeout);
        if (isTimeout) return; // Already handled by timeout
        
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
        }
      });
      
      ffmpeg.on('error', (error) => {
        clearTimeout(timeout);
        if (isTimeout) return; // Already handled by timeout
        reject(new Error(`FFmpeg spawn error: ${error.message}`));
      });
    });
  }

  /**
   * Run ffprobe and return the full parsed JSON (format + streams).
   * Used by the MediaInfo dialog so the UI can show a deep, MediaInfo-style
   * breakdown without us having to persist every probe field in the DB.
   */
  static async probeFull(inputPath: string): Promise<any> {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-show_chapters',
      inputPath,
    ];
    const output = await this.executeFFprobe(args);
    return JSON.parse(output);
  }

  /**
   * Generate a specific quality version
   */
  private static async generateQuality(
    inputPath: string, 
    outputDir: string, 
    filename: string,
    quality: typeof VideoProcessor.QUALITIES[0],
    metadata: any
  ): Promise<VideoQuality | null> {
    try {
      const outputPath = path.join(outputDir, `${filename}_${quality.name}.mp4`);

      // If input is smaller than the target resolution we used to skip the
      // quality entirely, which left the file with zero playable renditions
      // and the UI stuck on "Processing" forever. Instead, encode at the
      // input's native resolution: same H.264 streaming-optimised output,
      // just no upscaling. force_original_aspect_ratio=decrease already
      // handles the downscale case and is a no-op when the source is smaller.
      const targetW = Math.min(quality.width, metadata.width);
      const targetH = Math.min(quality.height, metadata.height);
      // FFmpeg requires even dimensions for yuv420p
      const evenW = targetW - (targetW % 2);
      const evenH = targetH - (targetH % 2);

      // CPU (libx264) args — used as fallback and when VIDEO_USE_NVENC is off.
      const cpuArgs = [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '26',
        '-profile:v', 'main',
        '-level', '3.1',
        '-pix_fmt', 'yuv420p',
        // Cap at target with no upscaling, then round both dimensions to even
        // (libx264 + yuv420p requires even width/height).
        '-vf', `scale=${evenW}:${evenH}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
        '-maxrate', quality.bitrate,
        '-bufsize', `${parseInt(quality.bitrate) * 1.5}k`,
        '-c:a', 'aac',
        '-b:a', '96k',
        '-ar', '44100',
        '-movflags', '+faststart',
        '-threads', '0',
        '-f', 'mp4',
        '-y',
        outputPath
      ];

      // GPU (h264_nvenc) args — CPU decode → CPU scale (with even-dim
      // safety) → NVENC encode on the GPU. We deliberately do NOT use
      // `-hwaccel cuda -hwaccel_output_format cuda + scale_cuda` because:
      //   1. NVDEC can't decode every codec we accept (ProRes, DNxHD,
      //      VP9 profile 2, 10-bit HEVC, etc.) — when it can't, the
      //      whole pipeline aborts before encode even starts.
      //   2. scale_cuda doesn't auto-round to even dimensions, so a
      //      portrait or non-16:9 source can produce e.g. 405x720 which
      //      NVENC rejects (NV12 requires even width and height).
      // CPU decode + GPU encode still puts the expensive work on the
      // T4 (Test 4 measured ~2x realtime on a 1280x720 source) while
      // accepting any input codec/aspect.
      const gpuArgs = [
        '-i', inputPath,
        '-c:v', 'h264_nvenc',
        '-preset', config.video.nvenc.mainPreset,
        '-rc', 'vbr',
        '-cq', config.video.nvenc.mainCq,
        '-profile:v', 'main',
        // Match the libx264 path's even-dimension guarantee.
        '-vf', `scale=${evenW}:${evenH}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
        '-b:v', quality.bitrate,
        '-maxrate', quality.bitrate,
        '-bufsize', `${parseInt(quality.bitrate) * 1.5}k`,
        '-c:a', 'aac',
        '-b:a', '96k',
        '-ar', '44100',
        '-movflags', '+faststart',
        '-f', 'mp4',
        '-y',
        outputPath
      ];

      if (config.video.useNvenc) {
        try {
          console.log(`[VideoProcessor] Generating ${quality.name} via NVENC...`);
          await this.executeFFmpeg(gpuArgs, config.video.timeouts.quality);
        } catch (gpuErr: any) {
          console.warn(`[VideoProcessor] NVENC encode failed for ${quality.name}, falling back to libx264:`, gpuErr?.message || gpuErr);
          await this.executeFFmpeg(cpuArgs, config.video.timeouts.quality);
        }
      } else {
        console.log(`[VideoProcessor] Generating ${quality.name} via libx264...`);
        await this.executeFFmpeg(cpuArgs, config.video.timeouts.quality);
      }
      
      // Get file size
      const stats = await fs.stat(outputPath);
      
      return {
        resolution: quality.name,
        path: outputPath,
        size: stats.size,
        bitrate: quality.bitrate
      };
    } catch (error: any) {
      const msg = error?.message || String(error);
      console.error(`[VideoProcessor] Error generating ${quality.name}:`, msg);
      // Tag the error so processVideo() can surface it instead of silently dropping.
      (this as any)._lastQualityError = `${quality.name}: ${msg}`;
      return null;
    }
  }

  /**
   * Generate I-frame only version for smooth scrubbing
   * Every frame is a keyframe, allowing instant seeking
   */
  private static async generateScrubVersion(
    inputPath: string,
    outputDir: string,
    filename: string
  ): Promise<string> {
    try {
      const outputPath = path.join(outputDir, `${filename}_scrub.mp4`);
      
      // CPU (libx264) all-intra args.
      const cpuArgs = [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', config.video.scrub.preset,
        '-crf', config.video.scrub.crf.toString(),
        '-pix_fmt', 'yuv420p',
        '-profile:v', config.video.scrub.profile,
        '-level', config.video.scrub.level,
        '-r', config.video.scrub.fps.toString(),
        '-g', '1', // I-frame only (every frame is a keyframe)
        '-keyint_min', '1',
        '-sc_threshold', '0',
        '-vf', `scale=${config.video.scrub.scale}`,
        ...(config.video.scrub.disableAudio ? ['-an'] : []),
        '-movflags', '+faststart',
        '-f', 'mp4',
        '-y',
        outputPath
      ];

      // GPU (h264_nvenc) all-intra args. NVENC honours -g 1 + -forced-idr 1 to
      // force every frame to an IDR keyframe, giving the same instant-seek
      // behaviour as libx264's I-frame-only output.
      // CPU decode → CPU scale → GPU encode (see generateQuality for the
      // full rationale). Same trade-off applies here — works for any
      // input codec/aspect, encode still runs on the T4.
      const gpuArgs = [
        '-i', inputPath,
        '-c:v', 'h264_nvenc',
        '-preset', config.video.nvenc.scrubPreset,
        '-rc', 'vbr',
        '-cq', config.video.nvenc.scrubCq,
        '-profile:v', config.video.scrub.profile,
        '-r', config.video.scrub.fps.toString(),
        '-g', '1',
        '-forced-idr', '1',
        '-no-scenecut', '1',
        '-vf', `scale=${config.video.scrub.scale},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
        ...(config.video.scrub.disableAudio ? ['-an'] : []),
        '-movflags', '+faststart',
        '-f', 'mp4',
        '-y',
        outputPath
      ];

      if (config.video.useNvenc) {
        try {
          console.log(`[VideoProcessor] Generating scrub version via NVENC...`);
          await this.executeFFmpeg(gpuArgs, config.video.timeouts.scrub);
        } catch (gpuErr: any) {
          console.warn(`[VideoProcessor] NVENC scrub encode failed, falling back to libx264:`, gpuErr?.message || gpuErr);
          await this.executeFFmpeg(cpuArgs, config.video.timeouts.scrub);
        }
      } else {
        console.log(`[VideoProcessor] Generating scrub version via libx264...`);
        await this.executeFFmpeg(cpuArgs, config.video.timeouts.scrub);
      }
      
      return outputPath;
    } catch (error) {
      console.error('[VideoProcessor] Error generating scrub version:', error);
      throw error;
    }
  }

  /**
   * Generate thumbnail sprite for hover previews
   * Creates a grid of thumbnails at regular intervals
   */
  private static async generateThumbnailSprite(
    inputPath: string,
    outputDir: string,
    filename: string,
    metadata: any
  ): Promise<{ path: string; metadata: any }> {
    try {
      const outputPath = path.join(outputDir, `${filename}_sprite.jpg`);
      const spriteJsonPath = path.join(outputDir, `${filename}_sprite.json`);
      
      // Adaptive interval generation to cover entire video duration
      const maxThumbnails = 225; // 15x15 grid for reasonable sprite size
      const baseInterval = 0.5; // Preferred 0.5 seconds for smooth scrubbing
      
      // Calculate adaptive interval to ensure full video coverage
      const totalThumbnailsAtBaseInterval = Math.ceil(metadata.duration / baseInterval);
      const effectiveInterval = totalThumbnailsAtBaseInterval > maxThumbnails 
        ? metadata.duration / maxThumbnails 
        : baseInterval;
      
      const thumbnailCount = Math.ceil(metadata.duration / effectiveInterval);
      let cols = Math.ceil(Math.sqrt(thumbnailCount));
      let rows = Math.ceil(thumbnailCount / cols);

      // Aspect-aware cell size. Previously we forced every cell to 800x450
      // landscape and padded portrait/square videos with black bars, which
      // looked terrible for vertical (social) content. Now: fit each cell
      // into a 480x480 bounding box at the source's native aspect ratio,
      // round to even dimensions for libx264/yuv420p safety.
      const maxEdge = 480;
      const srcW = Math.max(1, metadata.width || 16);
      const srcH = Math.max(1, metadata.height || 9);
      const aspect = srcW / srcH;
      let cellW: number;
      let cellH: number;
      if (aspect >= 1) {
        cellW = maxEdge;
        cellH = Math.round(maxEdge / aspect);
      } else {
        cellH = maxEdge;
        cellW = Math.round(maxEdge * aspect);
      }
      cellW = Math.max(2, cellW - (cellW % 2));
      cellH = Math.max(2, cellH - (cellH % 2));

      console.log(`[VideoProcessor] Sprite generation: ${metadata.duration}s video, ${effectiveInterval.toFixed(2)}s intervals, ${thumbnailCount} thumbnails (${cols}x${rows} grid), cell ${cellW}x${cellH}`);

      // Parallel keyframe-seek extraction. The previous single-pass
      // approach (`-i input -vf fps=1/N,scale,tile`) forced ffmpeg to
      // decode every frame of the source from byte 0 just to keep
      // 1-in-N. On a 7+ GB / 55-min H.264 source this took >10 min and
      // tripped the timeout. Putting `-ss <ts>` BEFORE `-i` lets the
      // input demuxer seek directly to the nearest keyframe (near-
      // instant), so each thumbnail extraction is ~100–500ms regardless
      // of source length. We then tile the small JPEGs in a final pass.
      console.log(`[VideoProcessor] Generating thumbnail sprite (parallel)...`);
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `obviu-sprite-`));
      try {
        const scaleFilter = `scale=${cellW}:${cellH}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
        // Cap concurrency so we don't spawn 225 ffmpeg processes at once.
        // 4 is comfortable on a single CPU and leaves headroom for the
        // NVENC encodes that may still be running in parallel.
        const concurrency = 4;
        let nextIndex = 0;
        const frameStart = effectiveInterval / 2; // sample mid-interval
        const failures: Array<{ idx: number; err: string }> = [];

        // Clamp once: handles videos shorter than the 0.05s tail margin
        // (e.g. a tiny intro clip) without producing negative -ss values
        // that would either fail the extraction or trigger undefined
        // seek behavior in ffmpeg.
        const safeEnd = Math.max(0, (metadata.duration || 0) - 0.05);

        const worker = async () => {
          while (true) {
            const i = nextIndex++;
            if (i >= thumbnailCount) return;
            const ts = Math.max(0, Math.min(safeEnd, frameStart + i * effectiveInterval));
            const framePath = path.join(tmpDir, `f_${String(i).padStart(4, "0")}.jpg`);
            const args = [
              "-hide_banner", "-loglevel", "error",
              "-ss", ts.toFixed(3),
              "-i", inputPath,
              "-frames:v", "1",
              "-an", "-sn",
              "-vf", scaleFilter,
              "-q:v", "3",
              "-f", "image2",
              "-y",
              framePath,
            ];
            try {
              // Per-frame timeout: 30s is generous for a keyframe seek
              // even on slow disks. If a single frame stalls we just
              // drop it and move on instead of failing the whole sprite.
              await this.executeFFmpeg(args, 30_000);
            } catch (e: any) {
              failures.push({ idx: i, err: e?.message || String(e) });
            }
          }
        };

        await Promise.all(Array.from({ length: concurrency }, () => worker()));

        if (failures.length > 0) {
          console.warn(
            `[VideoProcessor] Sprite: ${failures.length}/${thumbnailCount} frame extractions failed (continuing). First: ${failures[0].err.slice(0, 200)}`,
          );
        }

        // Renumber successful frames into a contiguous 0..N-1 sequence
        // before the tile pass. ffmpeg's image2 sequential demuxer stops
        // at the first gap, so if any extraction failed in the middle we
        // would silently truncate the sprite (or fail entirely if frame 0
        // was missing). Renaming closes any gaps and lets tile run on
        // exactly the frames we actually have.
        const extracted = (await fs.readdir(tmpDir))
          .filter((n) => /^f_\d{4}\.jpg$/.test(n))
          .sort();
        if (extracted.length === 0) {
          throw new Error("Sprite generation produced zero usable frames");
        }
        for (let i = 0; i < extracted.length; i++) {
          const target = `s_${String(i).padStart(4, "0")}.jpg`;
          if (extracted[i] !== target) {
            await fs.rename(
              path.join(tmpDir, extracted[i]),
              path.join(tmpDir, target),
            );
          } else {
            // Source already happens to have the contiguous name we want
            // (extremely rare but possible if extracted[0] === "f_0000")
            // — copy under the new prefix so the tile glob picks it up.
            await fs.copyFile(
              path.join(tmpDir, extracted[i]),
              path.join(tmpDir, target),
            );
          }
        }

        // Update grid dims if frames went missing so the tile output isn't
        // mostly empty cells. We keep the wider dimension and shrink the
        // other to fit the actual frame count.
        const actualCount = extracted.length;
        const tileCols = Math.min(cols, actualCount);
        const tileRows = Math.ceil(actualCount / tileCols);

        // Final tile pass over the small per-frame JPEGs. This re-encodes
        // a few hundred small images into one mosaic — fast (sub-second
        // on this size of input) regardless of source video length.
        const tileArgs = [
          "-hide_banner", "-loglevel", "error",
          "-framerate", "1",
          "-i", path.join(tmpDir, "s_%04d.jpg"),
          "-vf", `tile=${tileCols}x${tileRows}`,
          "-frames:v", "1",
          "-q:v", "1",
          "-f", "image2",
          "-y",
          outputPath,
        ];
        await this.executeFFmpeg(tileArgs, config.video.timeouts.sprite);

        // Reflect the final grid in the metadata returned to the caller
        // so the client lays out the preview window correctly when the
        // grid had to be shrunk due to extraction failures.
        cols = tileCols;
        rows = tileRows;
      } finally {
        // Always clean up tmp frames, even on failure, so we don't leak
        // hundreds of MB of intermediate JPEGs into /tmp.
        fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }

      // Create sprite metadata. thumbnailWidth/Height now reflect the actual
      // cell aspect so the client can size the preview window correctly.
      const spriteInfo = {
        cols,
        rows,
        thumbnailWidth: cellW,
        thumbnailHeight: cellH,
        interval: effectiveInterval,
        thumbnailCount,
        duration: metadata.duration
      };
      
      await fs.writeFile(spriteJsonPath, JSON.stringify(spriteInfo, null, 2));
      console.log(`[VideoProcessor] Sprite metadata saved to: ${spriteJsonPath}`);
      
      return {
        path: outputPath,
        metadata: spriteInfo
      };
    } catch (error) {
      console.error('[VideoProcessor] Error generating thumbnail sprite:', error);
      throw error;
    }
  }

  /**
   * Check if FFmpeg is available
   */
  static async checkFFmpegAvailability(): Promise<boolean> {
    try {
      await this.executeFFmpeg(['-version']);
      return true;
    } catch (error) {
      console.error('[VideoProcessor] FFmpeg not available:', error);
      return false;
    }
  }

  /**
   * Clean up processed files
   */
  static async cleanupProcessedFiles(outputDir: string): Promise<void> {
    try {
      if (existsSync(outputDir)) {
        await fs.rm(outputDir, { recursive: true, force: true });
        console.log(`[VideoProcessor] Cleaned up: ${outputDir}`);
      }
    } catch (error) {
      console.error('[VideoProcessor] Error cleaning up:', error);
    }
  }
}