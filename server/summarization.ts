import path from "path";
import fs from "fs";
import https from "https";
import { storage } from "./storage";

const SUMMARIZATION_ENABLED =
  (process.env.SUMMARIZATION_ENABLED || "true").toLowerCase() !== "false";

const MODELS_DIR = path.resolve(
  process.env.LLAMA_MODELS_DIR || path.join(process.cwd(), "models", "llama")
);

const MODEL_NAME = process.env.LLAMA_MODEL || "llama-3.2-1b-instruct.Q4_K_M.gguf";

const MODEL_URLS: Record<string, string> = {
  "llama-3.2-1b-instruct.Q4_K_M.gguf":
    "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
  "llama-3.2-3b-instruct.Q4_K_M.gguf":
    "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
  "qwen2.5-1.5b-instruct.Q4_K_M.gguf":
    "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
};

const downloadPromises = new Map<string, Promise<string>>();

function modelPath(name: string) {
  return path.join(MODELS_DIR, name);
}

async function downloadFile(url: string, dest: string): Promise<void> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  await new Promise<void>((resolve, reject) => {
    const file = fs.createWriteStream(tmp);
    const req = (u: string) =>
      https
        .get(u, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            return req(res.headers.location);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`Download failed ${res.statusCode}`));
          }
          res.pipe(file);
          file.on("finish", () => file.close(() => resolve()));
        })
        .on("error", reject);
    req(url);
  });
  fs.renameSync(tmp, dest);
}

async function ensureModel(name: string): Promise<string> {
  const target = modelPath(name);
  if (fs.existsSync(target) && fs.statSync(target).size > 100_000_000) return target;
  if (!MODEL_URLS[name]) throw new Error(`Unknown llama model: ${name}`);

  const inflight = downloadPromises.get(name);
  if (inflight) return inflight;

  const promise = (async () => {
    console.log(`[Summarization] Downloading model ${name} (this may take a few minutes)...`);
    await downloadFile(MODEL_URLS[name], target);
    console.log(`[Summarization] Model ${name} ready at ${target}`);
    return target;
  })();
  downloadPromises.set(name, promise);
  try {
    return await promise;
  } finally {
    downloadPromises.delete(name);
  }
}

let cachedSession: { session: any; modelName: string } | null = null;
let modelLoadPromise: Promise<any> | null = null;

// Serialize all summarization jobs in this process — sharing one chat
// session/context between concurrent prompt() calls is unsafe.
let jobChain: Promise<void> = Promise.resolve();

async function getSession(modelName: string): Promise<any> {
  if (cachedSession && cachedSession.modelName === modelName) {
    return cachedSession.session;
  }
  if (modelLoadPromise) return modelLoadPromise;

  modelLoadPromise = (async () => {
    const modelFile = await ensureModel(modelName);
    const { getLlama, LlamaChatSession } = await import("node-llama-cpp");
    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath: modelFile });
    const context = await model.createContext({
      contextSize: 8192,
      threads: parseInt(process.env.LLAMA_THREADS || "4", 10),
    });
    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
    });
    cachedSession = { session, modelName };
    return session;
  })();

  try {
    return await modelLoadPromise;
  } finally {
    modelLoadPromise = null;
  }
}

const GENERATION_TIMEOUT_MS = parseInt(
  process.env.LLAMA_GENERATION_TIMEOUT_MS || "600000",
  10
); // 10 minutes default

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function buildPrompt(transcript: string): string {
  // Keep prompt compact; clip very long transcripts at ~16k chars
  const MAX_CHARS = 16000;
  const text = transcript.length > MAX_CHARS
    ? transcript.slice(0, MAX_CHARS) + "\n[...truncated]"
    : transcript;

  return [
    "You will receive the transcript of a video. Write a concise synopsis of what the video is about.",
    "Format your response as:",
    "1. A single-sentence headline summary.",
    "2. A 2-4 sentence overview describing the main topic, key points, and tone.",
    "3. A bulleted list of 3-6 key moments or topics covered.",
    "Respond with plain text only. Do not invent details that are not in the transcript.",
    "",
    "Transcript:",
    text,
  ].join("\n");
}

async function runSummarizationJob(fileId: number): Promise<void> {
  const transcript = await storage.getTranscript(fileId);
  if (!transcript || transcript.status !== "completed" || !transcript.text) {
    console.log(`[Summarization] Skipping file ${fileId}: no completed transcript`);
    return;
  }

  if (!transcript.text.trim()) {
    await storage.updateTranscript(transcript.id, {
      summaryStatus: "failed",
      summaryError: "Transcript is empty",
    } as any);
    return;
  }

  await storage.updateTranscript(transcript.id, {
    summaryStatus: "processing",
    summaryError: null,
  } as any);

  try {
    const session = await getSession(MODEL_NAME);
    // Reset chat history so each file gets a clean context window.
    if (typeof session.resetChatHistory === "function") {
      session.resetChatHistory();
    } else if (typeof session.setChatHistory === "function") {
      session.setChatHistory([]);
    }

    const prompt = buildPrompt(transcript.text);
    console.log(`[Summarization] Generating summary for file ${fileId}...`);
    const t0 = Date.now();
    const response = await withTimeout(
      session.prompt(prompt, { maxTokens: 512, temperature: 0.3 }),
      GENERATION_TIMEOUT_MS,
      `Summary generation for file ${fileId}`
    );
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[Summarization] File ${fileId} summary generated in ${elapsed}s`);

    await storage.updateTranscript(transcript.id, {
      summary: String(response).trim(),
      summaryStatus: "completed",
      summaryError: null,
      summaryModel: MODEL_NAME,
      summaryProcessedAt: new Date(),
    } as any);
  } catch (err: any) {
    console.error(`[Summarization] Failed for file ${fileId}:`, err);
    await storage
      .updateTranscript(transcript.id, {
        summaryStatus: "failed",
        summaryError: err?.message || "Unknown summarization error",
      } as any)
      .catch(() => {});
    // On hard failure, drop cached session so next run rebuilds the context
    // (defensive — corrupted native state could otherwise persist).
    cachedSession = null;
  }
}

export function summarizeForFile(fileId: number): Promise<void> {
  if (!SUMMARIZATION_ENABLED) {
    console.log(`[Summarization] Disabled — skipping file ${fileId}`);
    return Promise.resolve();
  }
  console.log(`[Summarization] Enqueuing job for file ${fileId}`);
  // Chain onto the global job queue so concurrent calls don't share a session.
  const next = jobChain.then(() => runSummarizationJob(fileId));
  jobChain = next.catch(() => {});
  return next;
}

/**
 * Re-queue any transcripts whose summarization was interrupted by a server
 * restart (status stuck at pending/processing). Without this, the client
 * polls forever because nothing in the new process owns the job.
 */
export async function resumePendingSummarizations(): Promise<void> {
  if (!SUMMARIZATION_ENABLED) return;
  try {
    const { db } = await import("./db");
    const { transcripts } = await import("@shared/schema");
    const { or, eq, and, isNotNull } = await import("drizzle-orm");
    const stuck = await db
      .select()
      .from(transcripts)
      .where(
        and(
          eq(transcripts.status, "completed"),
          isNotNull(transcripts.text),
          or(
            eq(transcripts.summaryStatus, "pending"),
            eq(transcripts.summaryStatus, "processing")
          )
        )
      );
    if (stuck.length === 0) return;
    console.log(
      `[Summarization] Resuming ${stuck.length} interrupted summarization job(s)`
    );
    for (const t of stuck) {
      summarizeForFile(t.fileId).catch((err) =>
        console.error(`[Summarization] Resume failed for file ${t.fileId}:`, err)
      );
    }
  } catch (err) {
    console.error("[Summarization] Failed to query stuck jobs on startup:", err);
  }
}
