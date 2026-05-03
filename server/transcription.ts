import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import https from "https";
import os from "os";
import { storage } from "./storage";
import {
  sparkConfigured,
  sparkTranscribe,
  SparkHttpError,
  SparkUnavailableError,
} from "./spark-client";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
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
let sparkChain: Promise<any> = Promise.resolve();
function runOnSpark<T>(fileId: number, fn: () => Promise<T>): Promise<T> {
  const next = sparkChain.then(
    () => fn(),
    () => fn(), // don't let a previous failure poison the queue
  );
  // Keep the chain alive even if a caller never awaits.
  sparkChain = next.catch(() => undefined);
  next.then(
    () => console.log(`[Transcription] Spark slot released for file ${fileId}`),
    () => console.log(`[Transcription] Spark slot released for file ${fileId} (errored)`),
  );
  return next;
}

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
    if (!sparkConfigured()) {
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

    await storage.updateTranscript(record.id, { status: "processing" });

    // The spark worker is single-job (returns HTTP 429 when busy). Serialize
    // all transcription requests against it through an in-process FIFO so
    // concurrent uploads + regenerates queue cleanly instead of failing.
    console.log(`[Transcription] Queued file ${fileId} for spark (${sparkRelPath})`);
    const t0 = Date.now();
    const result = await runOnSpark(fileId, () =>
      sparkTranscribe({
        path: sparkRelPath,
        model: requestedModel,
        language: null,
        vad_filter: true,
        word_timestamps: true,
        beam_size: 5,
        save: true,
      })
    );
    console.log(
      `[Transcription] Spark returned for file ${fileId} in ${Date.now() - t0}ms ` +
      `(model=${result.model}, device=${result.device}, computeType=${result.computeType})`
    );

    const segments: TranscriptSegment[] = (result.result.segments || [])
      .map((seg) => ({
        start: typeof seg.start === "number" ? seg.start : 0,
        end: typeof seg.end === "number" ? seg.end : 0,
        text: (seg.text || "").trim(),
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
    } as any);

    console.log(
      `[Transcription] Completed file ${fileId}: ${segments.length} segments, ${fullText.length} chars`
    );

    // Auto-trigger summarization (fire-and-forget)
    import("./summarization")
      .then((m) => m.summarizeForFile(fileId))
      .catch((e) => console.error(`[Summarization] Auto-trigger failed for ${fileId}:`, e));
  } catch (err: any) {
    let message = err?.message || "Unknown transcription error";
    if (err instanceof SparkHttpError) {
      message = `Spark worker rejected request (HTTP ${err.status}): ${
        typeof err.detail === "string" ? err.detail : err.message
      }`;
    } else if (err instanceof SparkUnavailableError) {
      message = `Spark worker unreachable: ${err.message}`;
    }
    console.error(`[Transcription] Failed for file ${fileId}:`, err);
    await storage
      .updateTranscript(record.id, {
        status: "failed",
        errorMessage: message,
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
    out += `${seg.text}\n\n`;
  });
  return out;
}

export function segmentsToSrt(segments: TranscriptSegment[]): string {
  let out = "";
  segments.forEach((seg, i) => {
    out += `${i + 1}\n`;
    out += `${formatSrtTimestamp(seg.start)} --> ${formatSrtTimestamp(seg.end)}\n`;
    out += `${seg.text}\n\n`;
  });
  return out;
}
