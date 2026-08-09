/**
 * Thin typed client for the Obviu Spark AI worker (see spark/service.py).
 *
 * The worker is reachable from the app over the private 200Gb DAC link
 * (default http://192.168.100.1:7681). All endpoints are unauthenticated
 * because the DAC subnet is point-to-point and not routable; do not expose
 * the worker on a public interface.
 *
 * The base URL is taken from TRANSCRIBE_WORKER_URL (preferred — points at
 * whichever GPU worker runs whisper/diarization, e.g. the local L4 worker),
 * falling back to the legacy SPARK_AI_URL, then SPARK_DIAG_URL stripped of
 * any path so the existing diagnostics env can double-duty.
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
  /** Run pyannote speaker diarization and label segments with speakers. */
  diarize?: boolean;
  num_speakers?: number | null;
  min_speakers?: number | null;
  max_speakers?: number | null;
}

/** Worker-side diarization outcome. Fail-soft: `ok:false` still ships a transcript. */
export interface SparkDiarizationInfo {
  requested: boolean;
  model: string;
  device: string;
  ok?: boolean;
  error?: string;
  speakers?: string[];
  speakerCount?: number;
  turnCount?: number;
  diarizeMs?: number;
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
  diarization?: SparkDiarizationInfo;
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
      /** Diarization label (e.g. "SPEAKER_00"); null/absent when not diarized or no overlap. */
      speaker?: string | null;
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
  // TRANSCRIBE_WORKER_URL is the preferred name: it points at whichever GPU
  // worker runs whisper/diarization (the local L4 worker on obtv-ai, or the
  // DGX Spark). SPARK_AI_URL is kept as a legacy alias from when the Spark
  // was the only worker.
  const preferred = process.env.TRANSCRIBE_WORKER_URL?.trim();
  if (preferred) return preferred.replace(/\/$/, "");
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

// All spark requests are now short-lived under the async job API:
// submission returns 202 in ~ms, every poll is a sub-second JSON read.
// We no longer hold a single fetch open across the full transcribe
// duration, so the previous custom undici Agent (with 0 timeouts and
// 30s TCP keepalive) is no longer needed — and importing `undici`
// dynamically broke production where it isn't bundled. We use Node's
// global fetch with a per-request AbortController for timeout.

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

// ===== Async job API =====
//
// The sync POST /transcribe holds an HTTP connection open for the entire
// duration of the compute (10+ minutes on CPU; even on GPU it can be a
// minute or two). That's fragile across Docker NAT (conntrack drops idle
// connections after ~10min) and undici's default 5min headers/body
// timeout. The async API submits a job, returns a jobId immediately,
// and lets us poll with short-lived requests that never time out.

export type SparkJobStatus = "queued" | "running" | "completed" | "failed";

export interface SparkJobSnapshot {
  jobId: string;
  status: SparkJobStatus;
  submittedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  request: {
    path: string;
    model: string;
    language: string | null;
    vad_filter: boolean;
    word_timestamps: boolean;
    beam_size: number;
    save: boolean;
  } | null;
  result: SparkTranscribeResult | null;
  error: { status: number; detail: any } | null;
}

export async function sparkSubmitJob(
  req: SparkTranscribeRequest,
): Promise<SparkJobSnapshot> {
  const base = baseUrl();
  if (!base) throw new SparkUnavailableError("SPARK_AI_URL/SPARK_DIAG_URL not set");
  return fetchJson<SparkJobSnapshot>(
    `${base}/transcribe/jobs`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    },
    30_000, // submission is instant; 30s is plenty
  );
}

/**
 * Thrown when polling gives up but the job is still in-flight on the spark
 * (e.g. our deadline elapsed, or repeated network failures). Distinct from
 * SparkHttpError (the spark itself reported a terminal failure) so callers
 * can keep the jobId on record and resume polling later instead of marking
 * the transcript as a hard failure.
 */
export class SparkJobInFlightError extends Error {
  constructor(public readonly jobId: string, message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "SparkJobInFlightError";
  }
}

export async function sparkGetJob(jobId: string): Promise<SparkJobSnapshot> {
  const base = baseUrl();
  if (!base) throw new SparkUnavailableError("SPARK_AI_URL/SPARK_DIAG_URL not set");
  return fetchJson<SparkJobSnapshot>(
    `${base}/transcribe/jobs/${encodeURIComponent(jobId)}`,
    { method: "GET" },
    15_000,
  );
}

/**
 * Submit a transcription job and poll until it terminates.
 *
 * Per-poll requests are short-lived so they survive NAT/proxy idle
 * timeouts. The whole call still blocks the caller's promise until the
 * job is done, so transcribeFile()'s shape is preserved.
 *
 * If onJobId is provided, it's invoked synchronously the moment the
 * spark accepts the submission — the caller can persist the jobId
 * before the long wait so an app restart can resume polling.
 */
export async function sparkTranscribeAsync(
  req: SparkTranscribeRequest,
  opts: {
    pollIntervalMs?: number;
    overallTimeoutMs?: number;
    onJobId?: (jobId: string) => void | Promise<void>;
  } = {},
): Promise<SparkTranscribeResult> {
  const pollIntervalMs = opts.pollIntervalMs ?? 5_000;
  const overallTimeoutMs = opts.overallTimeoutMs ?? 4 * 60 * 60 * 1000; // 4h hard cap

  const submitted = await sparkSubmitJob(req);
  if (opts.onJobId) await opts.onJobId(submitted.jobId);

  return pollSparkJob(submitted.jobId, { pollIntervalMs, overallTimeoutMs });
}

/** Poll an existing jobId to completion. Used both for fresh submissions and restart-resume. */
export async function pollSparkJob(
  jobId: string,
  opts: { pollIntervalMs?: number; overallTimeoutMs?: number } = {},
): Promise<SparkTranscribeResult> {
  const pollIntervalMs = opts.pollIntervalMs ?? 5_000;
  const overallTimeoutMs = opts.overallTimeoutMs ?? 4 * 60 * 60 * 1000;
  const deadline = Date.now() + overallTimeoutMs;

  // Network-level retry tolerance. Network errors do NOT kill the poll —
  // the job is running on the spark independently of our connection. We
  // keep retrying until the overall deadline. Only a 404 (spark forgot
  // the job) or an explicit terminal status from the spark stops us.
  let lastPollError: unknown = null;

  while (Date.now() < deadline) {
    let snap: SparkJobSnapshot;
    try {
      snap = await sparkGetJob(jobId);
      lastPollError = null;
    } catch (e) {
      lastPollError = e;
      if (e instanceof SparkHttpError && e.status === 404) {
        // The spark genuinely lost the job (registry pruned or worker
        // restarted). The job is gone — surface as in-flight-lost so the
        // caller can decide whether to resubmit, but don't pretend the
        // job failed on the GPU.
        throw new SparkJobInFlightError(
          jobId,
          `spark forgot job ${jobId} (registry pruned or worker restarted)`,
          e,
        );
      }
      // Transient: keep polling silently. Job is unaffected.
      await sleep(pollIntervalMs);
      continue;
    }

    if (snap.status === "completed") {
      if (!snap.result) {
        throw new SparkHttpError(`spark job ${jobId} completed without result`, 500, snap);
      }
      return snap.result;
    }
    if (snap.status === "failed") {
      const status = snap.error?.status ?? 500;
      const detail = snap.error?.detail ?? "unknown error";
      throw new SparkHttpError(
        `spark job ${jobId} failed: HTTP ${status} - ${
          typeof detail === "string" ? detail : JSON.stringify(detail)
        }`,
        status,
        detail,
      );
    }
    await sleep(pollIntervalMs);
  }
  // Deadline elapsed but the job may still be running. Surface as in-flight
  // so transcription.ts keeps sparkJobId for later resumption.
  throw new SparkJobInFlightError(
    jobId,
    `spark job ${jobId} did not complete within ${overallTimeoutMs}ms (still in-flight)` +
      (lastPollError ? `; last poll error: ${(lastPollError as Error)?.message ?? lastPollError}` : ""),
    lastPollError ?? undefined,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
