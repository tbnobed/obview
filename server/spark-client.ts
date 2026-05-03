/**
 * Thin typed client for the Obviu Spark AI worker (see spark/service.py).
 *
 * The worker is reachable from the app over the private 200Gb DAC link
 * (default http://192.168.100.1:7681). All endpoints are unauthenticated
 * because the DAC subnet is point-to-point and not routable; do not expose
 * the worker on a public interface.
 *
 * The base URL is taken from SPARK_AI_URL (preferred), falling back to
 * SPARK_DIAG_URL stripped of any path so the existing diagnostics env can
 * double-duty without a second secret.
 */

export interface SparkTranscribeRequest {
  /** Path relative to the spark's OBVIU_MOUNT_ROOT (i.e. just the basename for top-level uploads). */
  path: string;
  model?: string;
  language?: string | null;
  vad_filter?: boolean;
  word_timestamps?: boolean;
  beam_size?: number;
  /** Persist the result JSON to <mount>/transcripts/<basename>.json. Default true. */
  save?: boolean;
}

export interface SparkTranscribeResult {
  ok: true;
  path: string;
  absPath: string;
  model: string;
  device: string;
  computeType: string;
  modelLoadMs: number;
  transcribeMs: number;
  totalMs: number;
  savedTo?: string;
  saveError?: string;
  result: {
    language: string;
    languageProbability: number | null;
    duration: number;
    segments: Array<{
      id: number;
      start: number;
      end: number;
      text: string;
      avgLogprob: number | null;
      noSpeechProb: number | null;
      words?: Array<{
        start: number | null;
        end: number | null;
        word: string;
        probability: number | null;
      }>;
    }>;
    text: string;
  };
}

export class SparkUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SparkUnavailableError";
  }
}

/**
 * Thrown for non-2xx responses from the spark worker. Preserves the upstream
 * HTTP status so the admin route can map it back to the caller (e.g. 429
 * busy stays 429, 404 file-not-found stays 404, 503 model-load-failed stays
 * 503). Only network/timeout failures bubble up as SparkUnavailableError.
 */
export class SparkHttpError extends Error {
  status: number;
  detail: any;
  constructor(message: string, status: number, detail: any) {
    super(message);
    this.name = "SparkHttpError";
    this.status = status;
    this.detail = detail;
  }
}

function baseUrl(): string | null {
  const explicit = process.env.SPARK_AI_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const diag = process.env.SPARK_DIAG_URL?.trim();
  if (diag) {
    try {
      const u = new URL(diag);
      return `${u.protocol}//${u.host}`;
    } catch {
      return null;
    }
  }
  return null;
}

export function sparkConfigured(): boolean {
  return baseUrl() !== null;
}

async function fetchJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) {
      const detail = body && typeof body === "object" && "detail" in body ? body.detail : body;
      throw new SparkHttpError(
        `spark ${init.method ?? "GET"} ${url} failed: HTTP ${res.status} - ${
          typeof detail === "string" ? detail : JSON.stringify(detail)
        }`,
        res.status,
        detail,
      );
    }
    return body as T;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new SparkUnavailableError(`spark request timed out after ${timeoutMs}ms: ${url}`);
    }
    if (e instanceof SparkUnavailableError || e instanceof SparkHttpError) throw e;
    throw new SparkUnavailableError(`spark request error: ${e?.message ?? String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function sparkHealth(): Promise<any> {
  const base = baseUrl();
  if (!base) throw new SparkUnavailableError("SPARK_AI_URL/SPARK_DIAG_URL not set");
  return fetchJson(`${base}/health`, { method: "GET" }, 5000);
}

export async function sparkTranscribeStatus(): Promise<any> {
  const base = baseUrl();
  if (!base) throw new SparkUnavailableError("SPARK_AI_URL/SPARK_DIAG_URL not set");
  return fetchJson(`${base}/transcribe/status`, { method: "GET" }, 5000);
}

export async function sparkTranscribe(
  req: SparkTranscribeRequest,
  opts: { timeoutMs?: number } = {},
): Promise<SparkTranscribeResult> {
  const base = baseUrl();
  if (!base) throw new SparkUnavailableError("SPARK_AI_URL/SPARK_DIAG_URL not set");
  // Default to 2h to match the spark's TRANSCRIBE_TIMEOUT_SEC. Override per call.
  const timeoutMs = opts.timeoutMs ?? 2 * 60 * 60 * 1000;
  return fetchJson<SparkTranscribeResult>(
    `${base}/transcribe`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    },
    timeoutMs,
  );
}
