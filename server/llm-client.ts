import path from "path";
import fs from "fs";
import https from "https";
import http from "http";

const LLAMA_API_URL = process.env.LLAMA_API_URL || "";

const MODELS_DIR = path.resolve(
  process.env.LLAMA_MODELS_DIR || path.join(process.cwd(), "models", "llama")
);

const MODEL_NAME =
  process.env.LLAMA_MODEL || "llama-3.2-1b-instruct.Q4_K_M.gguf";

const MODEL_URLS: Record<string, string> = {
  "llama-3.2-1b-instruct.Q4_K_M.gguf":
    "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
  "llama-3.2-3b-instruct.Q4_K_M.gguf":
    "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
  "qwen2.5-1.5b-instruct.Q4_K_M.gguf":
    "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
  "qwen2.5-3b-instruct.Q4_K_M.gguf":
    "https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf",
};

const GENERATION_TIMEOUT_MS = parseInt(
  process.env.LLAMA_GENERATION_TIMEOUT_MS || "600000",
  10
);

export interface LLMRequestOptions {
  maxTokens?: number;
  temperature?: number;
}

export function isRemoteMode(): boolean {
  return !!LLAMA_API_URL;
}

export function getModelName(): string {
  return MODEL_NAME;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

async function remotePrompt(
  prompt: string,
  opts: LLMRequestOptions,
  label: string
): Promise<string> {
  const baseUrl = LLAMA_API_URL.replace(/\/+$/, "");
  const url = `${baseUrl}/v1/chat/completions`;

  const body = JSON.stringify({
    messages: [{ role: "user", content: prompt }],
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.3,
    stream: false,
  });

  const result = await withTimeout(
    new Promise<string>((resolve, reject) => {
      const mod = url.startsWith("https") ? https : http;
      const req = mod.request(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      }, (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(
              new Error(`LLM API returned ${res.statusCode}: ${data.slice(0, 500)}`)
            );
          }
          try {
            const json = JSON.parse(data);
            const content =
              json?.choices?.[0]?.message?.content ??
              json?.choices?.[0]?.text ??
              "";
            resolve(String(content));
          } catch (e: any) {
            reject(new Error(`Failed to parse LLM API response: ${e.message}`));
          }
        });
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    }),
    GENERATION_TIMEOUT_MS,
    label
  );

  return result;
}

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
  if (fs.existsSync(target) && fs.statSync(target).size > 100_000_000)
    return target;
  if (!MODEL_URLS[name]) throw new Error(`Unknown llama model: ${name}`);

  const inflight = downloadPromises.get(name);
  if (inflight) return inflight;

  const promise = (async () => {
    console.log(
      `[LLM] Downloading model ${name} (this may take a few minutes)...`
    );
    await downloadFile(MODEL_URLS[name], target);
    console.log(`[LLM] Model ${name} ready at ${target}`);
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

async function getLocalSession(): Promise<any> {
  if (cachedSession && cachedSession.modelName === MODEL_NAME) {
    return cachedSession.session;
  }
  if (modelLoadPromise) return modelLoadPromise;

  modelLoadPromise = (async () => {
    const modelFile = await ensureModel(MODEL_NAME);
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
    cachedSession = { session, modelName: MODEL_NAME };
    return session;
  })();

  try {
    return await modelLoadPromise;
  } finally {
    modelLoadPromise = null;
  }
}

function resetLocalSession(session: any): void {
  if (typeof session.resetChatHistory === "function") {
    session.resetChatHistory();
  } else if (typeof session.setChatHistory === "function") {
    session.setChatHistory([]);
  }
}

async function localPrompt(
  prompt: string,
  opts: LLMRequestOptions,
  label: string
): Promise<string> {
  const session = await getLocalSession();
  resetLocalSession(session);
  const response = await withTimeout(
    session.prompt(prompt, {
      maxTokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.3,
    }),
    GENERATION_TIMEOUT_MS,
    label
  );
  return String(response);
}

let jobChain: Promise<void> = Promise.resolve();

export function prompt(
  text: string,
  opts: LLMRequestOptions,
  label: string
): Promise<string> {
  if (isRemoteMode()) {
    return remotePrompt(text, opts, label);
  }
  return localPrompt(text, opts, label);
}

export function enqueueJob(fn: () => Promise<void>): Promise<void> {
  if (isRemoteMode()) {
    return fn();
  }
  const next = jobChain.then(fn);
  jobChain = next.catch(() => {});
  return next;
}

export function clearSession(): void {
  cachedSession = null;
}

export function logBackend(): void {
  if (isRemoteMode()) {
    console.log(`[LLM] Using remote API: ${LLAMA_API_URL}`);
  } else {
    console.log(`[LLM] Using local model: ${MODEL_NAME}`);
  }
}
