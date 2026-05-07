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

// Parse a [H:MM:SS] or [MM:SS] string back to seconds. Returns NaN if not a
// valid timecode — the caller drops the moment in that case.
function parseTimestampString(s: string): number {
  const m = s.trim().match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (!m) return NaN;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  const c = m[3] != null ? parseInt(m[3], 10) : NaN;
  if (!isNaN(c)) return a * 3600 + b * 60 + c; // H:MM:SS
  return a * 60 + b;                            // MM:SS
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
    const snippet = combined.length > 220 ? combined.slice(0, 220) + "..." : combined;
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
  const target =
    totalSeconds < 120 ? "3-5"
    : totalSeconds < 600 ? "4-7"
    : totalSeconds < 1800 ? "5-8"
    : "6-10";
  // Show 3-4 timestamps from across the video as exemplars so the model
  // anchors on the real timecode strings instead of inventing integers.
  const exampleTimestamps: string[] = [];
  if (lastSeg) {
    const buckets = [0.1, 0.4, 0.7, 0.95];
    for (const f of buckets) {
      const t = Math.floor(lastSeg.end * f);
      const seg = segments.find((s) => s.start >= t) || segments[segments.length - 1];
      exampleTimestamps.push(formatTimestamp(Math.floor(seg.start)));
    }
  }

  return [
    `Below is a condensed timeline of a video that is ${totalDuration} long. Each line begins with a bracketed timecode like [${exampleTimestamps[0] || "0:00"}] showing where in the video that text occurs.`,
    "",
    timeline,
    "",
    `Task: Pick the ${target} most notable KEY MOMENTS across the ENTIRE ${totalDuration} of this video — points a reviewer would want to jump to (decisions, topic shifts, notable claims, questions, action items, turning points).`,
    "",
    "CRITICAL — timestamp format:",
    `- The "timestamp" field MUST be a string in the EXACT format shown in brackets above (e.g. "${exampleTimestamps[1] || "12:34"}", "${exampleTimestamps[2] || "27:05"}").`,
    `- DO NOT output bare integers. "14" is wrong. "14:00" or "0:14" is right — they mean different things.`,
    `- Copy the timestamp string verbatim from the [brackets] in the timeline above.`,
    `- The video is ${totalDuration} long; your timestamps must span that range, not cluster at the start.`,
    "",
    "Other rules:",
    "- Quality over coverage. Skip filler. If the content has fewer notable moments, return fewer.",
    "- Spread moments across the whole video; do not return everything from the first few minutes.",
    `- Suggested anchor points across the video: ${exampleTimestamps.join(", ")}. Your moments do not have to match these exactly, but they should be distributed similarly across the duration.`,
    "",
    "Output ONLY a JSON array. No markdown, no explanation.",
    'Element shape: {"timestamp": "<MM:SS or H:MM:SS>", "title": "<2-6 word label>", "summary": "<1 sentence on why this moment matters>"}',
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
    // Prefer the new "timestamp" string field. Fall back to "start" if the
    // model emits the old shape — but if it's a small integer (< 1000) and
    // looks like minutes-as-int (the bug that produced the 0:24 screenshot),
    // we bail rather than render garbage.
    let start = NaN;
    if (typeof item.timestamp === "string") {
      start = parseTimestampString(item.timestamp);
    } else if (typeof item.start === "string") {
      start = /^\d+:\d{2}/.test(item.start.trim())
        ? parseTimestampString(item.start)
        : parseFloat(item.start);
    } else if (typeof item.start === "number") {
      start = item.start;
    }
    if (isNaN(start) || typeof item.title !== "string") continue;
    chapters.push({
      start: Math.max(0, Math.round(start)),
      title: item.title.trim(),
      summary: typeof item.summary === "string" ? item.summary.trim() : undefined,
    });
  }

  if (chapters.length === 0) {
    throw new Error("No valid chapters parsed from LLM output");
  }

  chapters.sort((a, b) => a.start - b.start);
  return chapters;
}

// Heuristic: if every moment lands in the first ~5% of the video AND the
// video is longer than 2 minutes, the model almost certainly emitted minutes
// as bare integers ({"start": 14} meant 14:00, not 0:14). Don't ship that.
function looksLikeMinutesAsIntegers(
  chapters: Chapter[],
  totalSeconds: number
): boolean {
  if (chapters.length < 3 || totalSeconds < 120) return false;
  const maxStart = chapters[chapters.length - 1].start;
  if (maxStart >= totalSeconds * 0.2) return false;
  // All starts are small integers AND would plausibly fit the video if scaled by 60
  return chapters.every((c) => c.start < 60) && maxStart * 60 < totalSeconds * 1.1;
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
    const totalSeconds = Math.round(
      transcript.segments[transcript.segments.length - 1].end
    );
    console.log(`[Chapters] Generating key moments for file ${fileId} (prompt ${promptLen} chars, ${isRemoteMode() ? "remote" : "local"})...`);

    let chapters: Chapter[] | null = null;
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const t0 = Date.now();
      // Different retry instruction depending on what failed last time.
      let extra = "";
      if (attempt === 2) {
        extra = '\n\nIMPORTANT: Your previous response was not valid JSON. Output ONLY a raw JSON array with no extra text. Example: [{"timestamp":"12:34","title":"Topic shift","summary":"Speaker pivots to ..."}]';
      } else if (attempt === 3) {
        extra = `\n\nIMPORTANT: Your previous response had bad timestamps (clustered at the start, or bare integers). The video is ${formatTimestamp(totalSeconds)} long. Every "timestamp" must be a "MM:SS" or "H:MM:SS" string copied from the [brackets] in the timeline above. They must span the whole ${formatTimestamp(totalSeconds)} duration.`;
      }
      const response = await prompt(
        basePrompt + extra,
        { maxTokens: isRemoteMode() ? 2048 : 1024, temperature: attempt === 1 ? 0.2 : 0.1 },
        `Key moments generation for file ${fileId} (attempt ${attempt})`
      );
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[Chapters] File ${fileId} attempt ${attempt} completed in ${elapsed}s`);

      try {
        const parsed = parseChaptersResponse(response);
        if (looksLikeMinutesAsIntegers(parsed, totalSeconds)) {
          console.warn(
            `[Chapters] File ${fileId} attempt ${attempt}: rejecting — moments look like minutes-as-integers (max start ${parsed[parsed.length - 1].start}s vs duration ${totalSeconds}s)`
          );
          if (attempt === MAX_ATTEMPTS) {
            throw new Error("Model returned timestamps that don't span the video duration");
          }
          continue;
        }
        // Drop any moments that fall outside the video duration.
        chapters = parsed.filter((c) => c.start <= totalSeconds + 5);
        if (chapters.length === 0) {
          if (attempt === MAX_ATTEMPTS) throw new Error("All returned timestamps were outside the video duration");
          continue;
        }
        console.log(`[Chapters] File ${fileId}: ${chapters.length} key moments parsed (range ${formatTimestamp(chapters[0].start)} → ${formatTimestamp(chapters[chapters.length - 1].start)})`);
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
