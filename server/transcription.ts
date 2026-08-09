import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import https from "https";
import os from "os";
import { storage } from "./storage";
import {
  workerConfigured,
  workerTranscribeAsync,
  pollWorkerJob,
  WorkerHttpError,
  WorkerUnavailableError,
  WorkerJobInFlightError,
} from "./ai-worker-client";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  avgLogprob?: number | null;
  noSpeechProb?: number | null;
  /** Diarization label (e.g. "SPEAKER_00"); null when not diarized. */
  speaker?: string | null;
}

// Diarization is on by default when the worker supports it (fail-soft on the
// worker: a diarization error never discards a good transcript).
const TRANSCRIPTION_DIARIZE =
  (process.env.TRANSCRIPTION_DIARIZE || "true").toLowerCase() !== "false";

/** "SPEAKER_00" -> "Speaker 1". Non-standard labels pass through as-is. */
export function formatSpeakerLabel(raw: string): string {
  const m = /^SPEAKER_(\d+)$/i.exec(raw);
  if (m) return `Speaker ${parseInt(m[1], 10) + 1}`;
  return raw;
}

const MODEL_NAME = process.env.WHISPER_MODEL || "base.en";
const WHISPER_BIN = process.env.WHISPER_BIN || "whisper-cpp";
const WHISPER_THREADS = process.env.WHISPER_THREADS || "4";
const TRANSCRIPTION_ENABLED =
  (process.env.TRANSCRIPTION_ENABLED || "true").toLowerCase() !== "false";

const MODELS_DIR = path.resolve(
  process.env.WHISPER_MODELS_DIR || path.join(process.cwd(), "models")
);

const MODEL_URLS: Record<string, string> = {
  "tiny.en":
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
  "tiny":
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
  "base.en":
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
  "base":
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
  "small.en":
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
  "small":
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
};

function modelPath(name: string) {
  return path.join(MODELS_DIR, `ggml-${name}.bin`);
}

const downloadPromises = new Map<string, Promise<string>>();

async function ensureModel(name: string): Promise<string> {
  const target = modelPath(name);
  if (fs.existsSync(target) && fs.statSync(target).size > 1_000_000) return target;
  if (!MODEL_URLS[name]) throw new Error(`Unknown whisper model: ${name}`);

  const inflight = downloadPromises.get(name);
  if (inflight) return inflight;

  const promise = (async () => {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
    const url = MODEL_URLS[name];
    console.log(`[Transcription] Downloading model ${name} from ${url}`);
    const tmp = `${target}.downloading`;

    await new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(tmp);
      const handle = (resUrl: string, redirects = 0) => {
        https.get(resUrl, (response) => {
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            if (redirects > 5) return reject(new Error("Too many redirects"));
            response.resume();
            return handle(response.headers.location, redirects + 1);
          }
          if (response.statusCode !== 200) {
            return reject(
              new Error(`Model download failed: HTTP ${response.statusCode}`)
            );
          }
          response.pipe(file);
          file.on("finish", () => file.close(() => resolve()));
        }).on("error", (err) => {
          fs.unlink(tmp, () => reject(err));
        });
      };
      handle(url);
    });

    fs.renameSync(tmp, target);
    console.log(`[Transcription] Model ${name} ready at ${target}`);
    return target;
  })();

  downloadPromises.set(name, promise);
  try {
    return await promise;
  } finally {
    downloadPromises.delete(name);
  }
}

function runCmd(
  cmd: string,
  args: string[],
  opts: { onStderr?: (s: string) => void } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      opts.onStderr?.(s);
    });
    proc.on("error", reject);
    proc.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

async function extractWav(inputPath: string, outPath: string) {
  const res = await runCmd("ffmpeg", [
    "-y",
    "-i", inputPath,
    "-ar", "16000",
    "-ac", "1",
    "-c:a", "pcm_s16le",
    outPath,
  ]);
  if (res.code !== 0 || !fs.existsSync(outPath)) {
    throw new Error(`ffmpeg WAV extraction failed: ${res.stderr.slice(-500)}`);
  }
}

// Probe a media file with ffprobe and return whether it has at least one
// audio stream. Returns true on probe failure so we don't block legit work
// when ffprobe is missing — the spark will still surface a real error.
// This guards the "muxer cannot find any audio stream" wall of text the
// spark spits out when you hand it a video shot with the mic muted: we'd
// rather show "no audio stream — nothing to transcribe".
async function hasAudioStream(inputPath: string): Promise<boolean | null> {
  try {
    const res = await runCmd("ffprobe", [
      "-v", "error",
      "-select_streams", "a",
      "-show_entries", "stream=codec_type",
      "-of", "csv=p=0",
      inputPath,
    ]);
    if (res.code !== 0) return null; // probe failed — let the spark try
    return res.stdout.trim().length > 0;
  } catch {
    return null;
  }
}

export async function isTranscriptionAvailable(): Promise<boolean> {
  if (!TRANSCRIPTION_ENABLED) return false;
  try {
    const res = await runCmd(WHISPER_BIN, ["--help"]);
    return res.code === 0 || /usage:/i.test(res.stderr + res.stdout);
  } catch {
    return false;
  }
}

interface RunOptions {
  fileId: number;
  inputPath: string;
  fileType?: string; // 'video' | 'audio' | ...
  modelName?: string;
}

// In-process FIFO serializer for the spark worker. The spark holds a
// process-wide threading.Lock around its faster-whisper pipeline and
// returns HTTP 429 to anyone who arrives while it's busy. Rather than
// surface 429s to users (or retry blindly), we chain all spark calls
// onto a single Promise so concurrent transcribeFile() invocations
// queue cleanly and run one at a time.
//
// NOTE: with the async job API the spark queues internally, so the
// in-process FIFO is no longer required. Kept commented for reference
// in case we ever need client-side serialization again.
// let sparkChain: Promise<any> = Promise.resolve();

/**
 * Transcribe a media file. Updates the transcripts table as it progresses.
 * Safe to call from a fire-and-forget background context.
 */
export async function transcribeFile(opts: RunOptions): Promise<void> {
  const { fileId, inputPath } = opts;
  // modelName here is the *requested* model. The spark may override (e.g.
  // serve large-v3-turbo regardless), so we record the spark's reported
  // model name on completion. Default lets callers omit it.
  const requestedModel = opts.modelName || process.env.SPARK_WHISPER_MODEL || undefined;

  if (!TRANSCRIPTION_ENABLED) {
    console.log(`[Transcription] Disabled. Skipping file ${fileId}.`);
    return;
  }

  // Upsert pending row
  let record = await storage.getTranscript(fileId);
  if (!record) {
    record = await storage.createTranscript({
      fileId,
      status: "pending",
      modelName: requestedModel ? `spark:${requestedModel}` : "spark",
    } as any);
  } else {
    await storage.updateTranscript(record.id, {
      status: "pending",
      modelName: requestedModel ? `spark:${requestedModel}` : "spark",
      errorMessage: null as any,
    });
  }

  try {
    if (!workerConfigured()) {
      throw new Error(
        "Spark transcription worker is not configured (set SPARK_AI_URL or SPARK_DIAG_URL)."
      );
    }

    // Translate the file's stored path into a path relative to the
    // uploads root. The spark mounts the same volume at its
    // OBVIU_MOUNT_ROOT, so the relative path is identical on both sides.
    const uploadsRoot = process.env.UPLOAD_DIR
      ? path.resolve(process.env.UPLOAD_DIR)
      : path.join(process.cwd(), "uploads");
    const absStored = path.isAbsolute(inputPath)
      ? inputPath
      : path.join(uploadsRoot, inputPath);
    const rel = path.relative(uploadsRoot, path.resolve(absStored));
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(
        `file path is not inside uploads root (uploadsRoot=${uploadsRoot}, stored=${inputPath})`
      );
    }
    const sparkRelPath = rel.split(path.sep).join("/");

    // Pre-flight: refuse to ship audio-less files to the spark. Without
    // this guard the spark's ffmpeg step prints a 4KB stderr dump
    // ("Output file does not contain any stream") that we'd surface
    // verbatim in the UI. Mark the transcript failed with a short,
    // human-readable reason so the Transcript tab shows something useful
    // and skip the round-trip entirely.
    if (fs.existsSync(absStored)) {
      const audio = await hasAudioStream(absStored);
      if (audio === false) {
        const message = "No audio stream in this file — nothing to transcribe.";
        console.log(`[Transcription] File ${fileId}: ${message}`);
        await storage.updateTranscript(record.id, {
          status: "failed",
          errorMessage: message,
          sparkJobId: null,
        } as any);
        return;
      }
    }

    await storage.updateTranscript(record.id, { status: "processing" });

    // Async API: submit a job, persist the jobId, then poll. Short-lived
    // polls survive NAT/proxy idle timeouts that would kill a single
    // long-held HTTP connection. The spark serializes jobs internally,
    // so we no longer need our own in-process FIFO.
    console.log(`[Transcription] Submitting file ${fileId} to spark (${sparkRelPath})`);
    const t0 = Date.now();
    const result = await workerTranscribeAsync(
      {
        path: sparkRelPath,
        model: requestedModel,
        language: null,
        vad_filter: true,
        word_timestamps: true,
        beam_size: 5,
        save: true,
        diarize: TRANSCRIPTION_DIARIZE,
      },
      {
        onJobId: async (jobId) => {
          await storage.updateTranscript(record!.id, { sparkJobId: jobId } as any);
          console.log(`[Transcription] File ${fileId} accepted as spark job ${jobId}`);
        },
      },
    );
    console.log(
      `[Transcription] Spark returned for file ${fileId} in ${Date.now() - t0}ms ` +
      `(model=${result.model}, device=${result.device}, computeType=${result.computeType})`
    );

    // Diarization is fail-soft on the worker: log the outcome loudly either way.
    if (TRANSCRIPTION_DIARIZE) {
      const d = result.diarization;
      if (!d) {
        console.warn(
          `[Transcription] File ${fileId}: diarization requested but the worker ` +
            `returned no diarization info — worker likely predates v0.2.0.`
        );
      } else if (d.ok) {
        console.log(
          `[Transcription] File ${fileId}: diarization found ${d.speakerCount} speaker(s) ` +
            `in ${d.diarizeMs}ms (${d.model})`
        );
      } else {
        console.warn(
          `[Transcription] File ${fileId}: diarization failed — ${d.error}. ` +
            `Transcript saved without speaker labels.`
        );
      }
    }

    const segments: TranscriptSegment[] = (result.result.segments || [])
      .map((seg) => ({
        start: typeof seg.start === "number" ? seg.start : 0,
        end: typeof seg.end === "number" ? seg.end : 0,
        text: (seg.text || "").trim(),
        avgLogprob: typeof seg.avgLogprob === "number" ? seg.avgLogprob : null,
        noSpeechProb: typeof seg.noSpeechProb === "number" ? seg.noSpeechProb : null,
        speaker: typeof seg.speaker === "string" ? seg.speaker : null,
      }))
      .filter((s) => s.text.length > 0);

    const fullText =
      result.result.text?.trim() || segments.map((s) => s.text).join(" ");
    const detectedLanguage = result.result.language || null;

    await storage.updateTranscript(record.id, {
      status: "completed",
      segments,
      text: fullText,
      language: detectedLanguage,
      modelName: `spark:${result.model}`,
      processedAt: new Date(),
      // Job is done — drop the registry pointer so we don't re-poll on restart.
      sparkJobId: null,
    } as any);

    console.log(
      `[Transcription] Completed file ${fileId}: ${segments.length} segments, ${fullText.length} chars`
    );

    // Detect music-only / silent / hallucinated transcripts before
    // burning LLM cycles on synopsis + chapters.
    const { assessSpeechQuality } = await import("./speech-quality");
    const quality = assessSpeechQuality(segments);
    if (!quality.hasSpeech) {
      console.log(
        `[Transcription] File ${fileId}: speech-quality gate failed — ${quality.reason} ` +
          `(words=${quality.metrics.wordCount}, avgNoSpeech=${quality.metrics.avgNoSpeechProb}, ` +
          `avgLogprob=${quality.metrics.avgLogprob}, repetition=${quality.metrics.repetitionRatio.toFixed(2)})`
      );
      await storage.updateTranscript(record.id, {
        summaryStatus: "failed",
        summaryError: quality.reason,
        chaptersStatus: "failed",
        chaptersError: quality.reason,
      } as any);
      return;
    }

    // Auto-trigger summarization and chapters (fire-and-forget)
    import("./summarization")
      .then((m) => m.summarizeForFile(fileId))
      .catch((e) => console.error(`[Summarization] Auto-trigger failed for ${fileId}:`, e));
    import("./chapters")
      .then((m) => m.generateChaptersForFile(fileId))
      .catch((e) => console.error(`[Chapters] Auto-trigger failed for ${fileId}:`, e));
  } catch (err: any) {
    // Distinguish "we lost contact with the spark / our poll deadline elapsed"
    // (job may still be running on the GPU) from "spark told us the job
    // failed" (truly terminal). Only the latter clears sparkJobId.
    if (err instanceof WorkerJobInFlightError) {
      const message =
        `Lost contact with spark while job ${err.jobId} was still running. ` +
        `Spark may still be working on it; you can retry to resume polling. ` +
        `(${err.message})`;
      console.warn(`[Transcription] In-flight loss for file ${fileId}: ${err.message}`);
      await storage
        .updateTranscript(record.id, {
          // Keep status = processing; keep sparkJobId for resume.
          status: "processing",
          errorMessage: message,
        } as any)
        .catch(() => {});
      return;
    }

    let message = err?.message || "Unknown transcription error";
    if (err instanceof WorkerHttpError) {
      message = `Spark worker rejected request (HTTP ${err.status}): ${
        typeof err.detail === "string" ? err.detail : err.message
      }`;
    } else if (err instanceof WorkerUnavailableError) {
      message = `Spark worker unreachable: ${err.message}`;
    }
    console.error(`[Transcription] Failed for file ${fileId}:`, err);
    await storage
      .updateTranscript(record.id, {
        status: "failed",
        errorMessage: message,
        sparkJobId: null,
      } as any)
      .catch(() => {});
  }
}

function parseTimestamp(ts?: string): number | null {
  if (!ts) return null;
  // Format: HH:MM:SS,mmm or HH:MM:SS.mmm
  const m = /(\d+):(\d+):(\d+)[.,](\d+)/.exec(ts);
  if (!m) return null;
  return (
    parseInt(m[1]) * 3600 +
    parseInt(m[2]) * 60 +
    parseInt(m[3]) +
    parseInt(m[4]) / 1000
  );
}

function pad(n: number, width = 2) {
  return String(n).padStart(width, "0");
}

function formatVttTimestamp(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

function formatSrtTimestamp(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function segmentsToVtt(segments: TranscriptSegment[]): string {
  let out = "WEBVTT\n\n";
  segments.forEach((seg, i) => {
    out += `${i + 1}\n`;
    out += `${formatVttTimestamp(seg.start)} --> ${formatVttTimestamp(seg.end)}\n`;
    // WebVTT voice tag carries the speaker; players render it natively.
    out += seg.speaker
      ? `<v ${formatSpeakerLabel(seg.speaker)}>${seg.text}\n\n`
      : `${seg.text}\n\n`;
  });
  return out;
}

export function segmentsToSrt(segments: TranscriptSegment[]): string {
  let out = "";
  segments.forEach((seg, i) => {
    out += `${i + 1}\n`;
    out += `${formatSrtTimestamp(seg.start)} --> ${formatSrtTimestamp(seg.end)}\n`;
    out += seg.speaker
      ? `${formatSpeakerLabel(seg.speaker)}: ${seg.text}\n\n`
      : `${seg.text}\n\n`;
  });
  return out;
}
