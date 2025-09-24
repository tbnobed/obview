import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

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
    
    // Get video metadata
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
    
    console.log(`[VideoProcessor] Processing completed for: ${filename}`);
    
    return {
      qualities: qualities.filter(q => q !== null) as VideoQuality[],
      scrubVersion,
      thumbnailSprite: spriteResult.path,
      spriteMetadata: spriteResult.metadata,
      duration: metadata.duration,
      frameRate: metadata.frameRate
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
   * Execute FFprobe command safely
   */
  private static executeFFprobe(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      ffprobe.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      ffprobe.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`FFprobe failed with code ${code}: ${stderr}`));
        }
      });
      
      ffprobe.on('error', (error) => {
        reject(new Error(`FFprobe spawn error: ${error.message}`));
      });
    });
  }

  /**
   * Execute FFmpeg command safely
   */
  private static executeFFmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let stderr = '';
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
        }
      });
      
      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg spawn error: ${error.message}`));
      });
    });
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
      
      // Skip if input resolution is lower than target
      if (metadata.width < quality.width || metadata.height < quality.height) {
        console.log(`[VideoProcessor] Skipping ${quality.name} - input resolution too low`);
        return null;
      }
      
      // FFmpeg arguments for high-quality encoding optimized for web
      const args = [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'medium', // Balance between speed and compression
        '-crf', '23', // High quality
        '-maxrate', quality.bitrate,
        '-bufsize', `${parseInt(quality.bitrate) * 2}k`,
        '-vf', `scale=${quality.width}:${quality.height}:force_original_aspect_ratio=decrease,pad=${quality.width}:${quality.height}:(ow-iw)/2:(oh-ih)/2`,
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart', // Enable progressive download
        '-f', 'mp4',
        '-y', // Overwrite output
        outputPath
      ];
      
      console.log(`[VideoProcessor] Generating ${quality.name}...`);
      await this.executeFFmpeg(args);
      
      // Get file size
      const stats = await fs.stat(outputPath);
      
      return {
        resolution: quality.name,
        path: outputPath,
        size: stats.size,
        bitrate: quality.bitrate
      };
    } catch (error) {
      console.error(`[VideoProcessor] Error generating ${quality.name}:`, error);
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
      
      // Generate I-frame only version for instant seeking - balanced quality/size, no audio
      const args = [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'fast', // Slightly better quality than ultrafast
        '-crf', '32', // Better quality while still compressed
        '-g', '1', // I-frame only (keyframe interval = 1)
        '-keyint_min', '1',
        '-sc_threshold', '0',
        '-vf', 'scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2', // 360p for better clarity
        '-an', // No audio at all
        '-movflags', '+faststart',
        '-f', 'mp4',
        '-y',
        outputPath
      ];
      
      console.log(`[VideoProcessor] Generating scrub version...`);
      await this.executeFFmpeg(args);
      
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
      
      // Calculate thumbnail intervals (every 5 seconds)
      const interval = 5; // seconds
      const thumbnailCount = Math.min(Math.floor(metadata.duration / interval), 100); // Max 100 thumbnails
      const cols = Math.ceil(Math.sqrt(thumbnailCount));
      const rows = Math.ceil(thumbnailCount / cols);
      
      // Generate sprite with thumbnails
      const args = [
        '-i', inputPath,
        '-vf', [
          `fps=1/${interval}`,
          'scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2',
          `tile=${cols}x${rows}`
        ].join(','),
        '-frames:v', '1',
        '-f', 'image2',
        '-y',
        outputPath
      ];
      
      console.log(`[VideoProcessor] Generating thumbnail sprite...`);
      await this.executeFFmpeg(args);
      
      // Create sprite metadata
      const spriteInfo = {
        cols,
        rows,
        thumbnailWidth: 160,
        thumbnailHeight: 90,
        interval,
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