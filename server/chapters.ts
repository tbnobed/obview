import { storage } from "./storage";
import { prompt, enqueueJob, clearSession, getModelName, logBackend, isRemoteMode } from "./llm-client";

const CHAPTERS_ENABLED =
  (process.env.CHAPTERS_ENABLED || process.env.SUMMARIZATION_ENABLED || "true").toLowerCase() !== "false";

const LOCAL_MAX_CHARS = 14000;
const REMOTE_MAX_CHARS = 80000;

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildChaptersPrompt(
  segments: Array<{ start: number; end: number; text: string }>
): string {
  const MAX_CHARS = isRemoteMode() ? REMOTE_MAX_CHARS : LOCAL_MAX_CHARS;
  let segText = "";
  for (const seg of segments) {
    const line = `[${formatTimestamp(seg.start)}] ${seg.text.trim()}\n`;
    if (segText.length + line.length > MAX_CHARS) {
      segText += "\n[...truncated]\n";
      break;
    }
    segText += line;
  }

  return [
    "You will receive the timestamped transcript of a video. Your task is to divide it into logical chapters.",
    "Each chapter marks a distinct topic, scene, or shift in the conversation.",
    "",
    "Rules:",
    "- Output ONLY a JSON array. No other text, no markdown fences, no explanation.",
    '- Each element: {"start": <seconds as number>, "title": "<short title>", "summary": "<1 sentence>"}',
    "- The first chapter MUST start at 0.",
    "- Use the timestamps from the transcript to determine where each chapter begins.",
    "- Create between 3 and 12 chapters depending on the content length and variety.",
    "- Titles should be concise (2-6 words).",
    "- Do not invent content not present in the transcript.",
    "",
    "Transcript:",
    segText,
  ].join("\n");
}

interface Chapter {
  start: number;
  title: string;
  summary?: string;
}

function repairJson(text: string): string {
  let s = text;
  s = s.replace(/,\s*([}\]])/g, "$1");
  s = s.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
  s = s.replace(/:\s*'([^']*)'/g, ': "$1"');
  s = s.replace(/\n/g, " ");
  s = s.replace(/\t/g, " ");
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x1f]/g, " ");
  return s;
}

function parseChaptersResponse(raw: string): Chapter[] {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  const bracketStart = text.indexOf("[");
  const bracketEnd = text.lastIndexOf("]");
  if (bracketStart >= 0 && bracketEnd > bracketStart) {
    text = text.slice(bracketStart, bracketEnd + 1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    const repaired = repairJson(text);
    try {
      parsed = JSON.parse(repaired);
    } catch {
      const objects = text.match(/\{[^{}]+\}/g);
      if (objects && objects.length > 0) {
        try {
          parsed = JSON.parse("[" + objects.join(",") + "]");
        } catch {
          const repairedObjects = objects.map((o) => repairJson(o));
          try {
            parsed = JSON.parse("[" + repairedObjects.join(",") + "]");
          } catch (e4: any) {
            throw new Error(
              `Failed to parse chapters JSON: ${e4.message}\nRaw output (first 500 chars): ${raw.slice(0, 500)}`
            );
          }
        }
      } else {
        throw new Error(
          `Failed to parse chapters JSON — no objects found\nRaw output (first 500 chars): ${raw.slice(0, 500)}`
        );
      }
    }
  }

  if (!Array.isArray(parsed)) {
    parsed = [parsed];
  }
  if (parsed.length === 0) {
    throw new Error("LLM returned empty chapters");
  }

  const chapters: Chapter[] = [];
  for (const item of parsed) {
    const start =
      typeof item.start === "number"
        ? item.start
        : typeof item.start === "string"
          ? parseFloat(item.start)
          : NaN;
    if (isNaN(start) || typeof item.title !== "string") continue;
    chapters.push({
      start: Math.max(0, start),
      title: item.title.trim(),
      summary: typeof item.summary === "string" ? item.summary.trim() : undefined,
    });
  }

  if (chapters.length === 0) {
    throw new Error("No valid chapters parsed from LLM output");
  }

  chapters.sort((a, b) => a.start - b.start);
  if (chapters[0].start !== 0) chapters[0].start = 0;

  return chapters;
}

async function runChaptersJob(fileId: number): Promise<void> {
  const transcript = await storage.getTranscript(fileId);
  if (!transcript || transcript.status !== "completed") {
    console.log(`[Chapters] Skipping file ${fileId}: no completed transcript`);
    return;
  }

  if (!transcript.segments?.length) {
    console.log(`[Chapters] File ${fileId}: transcript has no segments, marking failed`);
    await storage.updateTranscript(transcript.id, {
      chaptersStatus: "failed",
      chaptersError: "Transcript has no timed segments to generate chapters from",
    } as any);
    return;
  }

  await storage.updateTranscript(transcript.id, {
    chaptersStatus: "processing",
    chaptersError: null,
  } as any);

  try {
    const basePrompt = buildChaptersPrompt(transcript.segments);
    const promptLen = basePrompt.length;
    const maxChars = isRemoteMode() ? REMOTE_MAX_CHARS : LOCAL_MAX_CHARS;
    console.log(`[Chapters] Generating chapters for file ${fileId} (prompt ${promptLen} chars, limit ${maxChars}, ${isRemoteMode() ? "remote" : "local"})...`);

    let chapters: Chapter[] | null = null;
    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const t0 = Date.now();
      const response = await prompt(
        attempt === 1
          ? basePrompt
          : basePrompt +
            '\n\nIMPORTANT: Your previous response was not valid JSON. Output ONLY a raw JSON array with no extra text. Example: [{"start":0,"title":"Intro","summary":"Opening"}]',
        { maxTokens: isRemoteMode() ? 2048 : 1024, temperature: attempt === 1 ? 0.2 : 0.1 },
        `Chapters generation for file ${fileId} (attempt ${attempt})`
      );
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[Chapters] File ${fileId} attempt ${attempt} completed in ${elapsed}s`);

      try {
        chapters = parseChaptersResponse(response);
        console.log(`[Chapters] File ${fileId}: ${chapters.length} chapters parsed`);
        break;
      } catch (parseErr: any) {
        console.warn(`[Chapters] File ${fileId} attempt ${attempt} parse failed: ${parseErr.message}`);
        if (attempt === MAX_ATTEMPTS) throw parseErr;
      }
    }

    await storage.updateTranscript(transcript.id, {
      chapters,
      chaptersStatus: "completed",
      chaptersError: null,
      chaptersModel: getModelName(),
      chaptersProcessedAt: new Date(),
    } as any);
  } catch (err: any) {
    console.error(`[Chapters] Failed for file ${fileId}:`, err);
    await storage
      .updateTranscript(transcript.id, {
        chaptersStatus: "failed",
        chaptersError: err?.message || "Unknown chapters error",
      } as any)
      .catch(() => {});
    clearSession();
  }
}

export function generateChaptersForFile(fileId: number): Promise<void> {
  if (!CHAPTERS_ENABLED) {
    console.log(`[Chapters] Disabled — skipping file ${fileId}`);
    return Promise.resolve();
  }
  console.log(`[Chapters] Enqueuing job for file ${fileId}`);
  return enqueueJob(() => runChaptersJob(fileId));
}

export async function resumePendingChapters(): Promise<void> {
  if (!CHAPTERS_ENABLED) return;
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
          isNotNull(transcripts.segments),
          or(
            eq(transcripts.chaptersStatus, "pending"),
            eq(transcripts.chaptersStatus, "processing")
          )
        )
      );
    if (stuck.length === 0) return;
    console.log(
      `[Chapters] Resuming ${stuck.length} interrupted chapter generation job(s)`
    );
    for (const t of stuck) {
      generateChaptersForFile(t.fileId).catch((err) =>
        console.error(`[Chapters] Resume failed for file ${t.fileId}:`, err)
      );
    }
  } catch (err) {
    console.error("[Chapters] Failed to query stuck jobs on startup:", err);
  }
}
