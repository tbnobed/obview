import { storage } from "./storage";
import { prompt, enqueueJob, clearSession, getModelName, logBackend, isRemoteMode } from "./llm-client";

const CHAPTERS_ENABLED =
  (process.env.CHAPTERS_ENABLED || process.env.SUMMARIZATION_ENABLED || "true").toLowerCase() !== "false";


function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function condensedTimeline(
  segments: Array<{ start: number; end: number; text: string }>
): string {
  const lastSeg = segments[segments.length - 1];
  const totalSec = lastSeg ? lastSeg.end : 0;
  const windowSec = totalSec > 1800 ? 120 : totalSec > 600 ? 60 : 30;
  const windows: Map<number, string[]> = new Map();
  for (const seg of segments) {
    const bucket = Math.floor(seg.start / windowSec) * windowSec;
    if (!windows.has(bucket)) windows.set(bucket, []);
    windows.get(bucket)!.push(seg.text.trim());
  }
  const lines: string[] = [];
  for (const [sec, texts] of [...windows.entries()].sort((a, b) => a[0] - b[0])) {
    const combined = texts.join(" ");
    const snippet = combined.length > 200 ? combined.slice(0, 200) + "..." : combined;
    lines.push(`[${formatTimestamp(sec)}] ${snippet}`);
  }
  return lines.join("\n");
}

function buildChaptersPrompt(
  segments: Array<{ start: number; end: number; text: string }>
): string {
  const lastSeg = segments[segments.length - 1];
  const totalDuration = lastSeg ? formatTimestamp(lastSeg.end) : "unknown";
  const totalSeconds = lastSeg ? Math.round(lastSeg.end) : 0;
  const timeline = condensedTimeline(segments);
  // Aim for sparse, quality-driven moments instead of wall-to-wall chapters.
  // ~1 moment per 60–120s on shorter media, capped at 10 for hour-long clips
  // so the list stays scannable.
  const target =
    totalSeconds < 120 ? "3-5"
    : totalSeconds < 600 ? "4-7"
    : totalSeconds < 1800 ? "5-8"
    : "6-10";

  return [
    `Below is a condensed timeline of a ${totalDuration} video (${totalSeconds} seconds total). Each line shows the timestamp and a summary of what is being said at that point.`,
    "",
    timeline,
    "",
    `Task: Identify the ${target} most notable KEY MOMENTS in this video — points a reviewer would actually want to jump to. Examples: a decision is made, a topic visibly shifts, a notable claim is stated, a question is asked, an action item appears, an emotional peak, a turning point.`,
    "",
    "Rules:",
    "- Quality over coverage. Skip filler. Do NOT segment the entire video.",
    "- Do NOT emit one moment per second or per minute on a fixed grid.",
    "- Each moment must come from a real event in the timeline above.",
    "- Spread moments across the video; avoid clustering several within the same 30 seconds.",
    "- If the content does not contain notable moments, return fewer rather than padding.",
    "",
    "Output ONLY a JSON array. No markdown, no explanation.",
    'Each element: {"start": <seconds as integer>, "title": "<2-6 word label>", "summary": "<1 sentence on why this moment matters>"}',
    "",
    "JSON array:",
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
  // Key moments are sparse highlights — do NOT force the first one to 0:00.

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

  // Same speech-quality gate as summarization — prevents the LLM from
  // inventing chapters ("Step 1, Step 2, Step 3...") when the audio is
  // actually silence or music.
  const { assessSpeechQuality } = await import("./speech-quality");
  const quality = assessSpeechQuality(transcript.segments);
  if (!quality.hasSpeech) {
    console.log(
      `[Chapters] Skipping file ${fileId}: ${quality.reason}`
    );
    await storage.updateTranscript(transcript.id, {
      chaptersStatus: "failed",
      chaptersError: quality.reason,
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
    console.log(`[Chapters] Generating chapters for file ${fileId} (prompt ${promptLen} chars, ${isRemoteMode() ? "remote" : "local"})...`);

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
