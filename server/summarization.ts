import { storage } from "./storage";
import { prompt, enqueueJob, clearSession, getModelName, logBackend, isRemoteMode } from "./llm-client";

const SUMMARIZATION_ENABLED =
  (process.env.SUMMARIZATION_ENABLED || "true").toLowerCase() !== "false";

const LOCAL_MAX_CHARS = 16000;
const REMOTE_MAX_CHARS = 80000;

function buildPrompt(transcript: string): string {
  const MAX_CHARS = isRemoteMode() ? REMOTE_MAX_CHARS : LOCAL_MAX_CHARS;
  const text =
    transcript.length > MAX_CHARS
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
    const p = buildPrompt(transcript.text);
    console.log(`[Summarization] Generating summary for file ${fileId}...`);
    const t0 = Date.now();
    const response = await prompt(
      p,
      { maxTokens: 512, temperature: 0.3 },
      `Summary generation for file ${fileId}`
    );
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[Summarization] File ${fileId} summary generated in ${elapsed}s`);

    await storage.updateTranscript(transcript.id, {
      summary: response.trim(),
      summaryStatus: "completed",
      summaryError: null,
      summaryModel: getModelName(),
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
    clearSession();
  }
}

export function summarizeForFile(fileId: number): Promise<void> {
  if (!SUMMARIZATION_ENABLED) {
    console.log(`[Summarization] Disabled — skipping file ${fileId}`);
    return Promise.resolve();
  }
  console.log(`[Summarization] Enqueuing job for file ${fileId}`);
  return enqueueJob(() => runSummarizationJob(fileId));
}

export async function resumePendingSummarizations(): Promise<void> {
  if (!SUMMARIZATION_ENABLED) return;
  logBackend();
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
